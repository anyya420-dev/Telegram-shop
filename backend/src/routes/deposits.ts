import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, parsePositiveInt, prisma, sendError } from '../lib.js'

const router = Router()

const DEPOSIT_STATUSES = ['pending', 'confirmed', 'rejected'] as const

function sanitizeDeposit(d: {
  id: number
  userId: number
  amountUsdt: number
  network: string
  asset: string
  walletAddress: string
  txHash: string | null
  status: string
  creditedAmount: number | null
  commissionPct: number | null
  adminNote: string | null
  confirmedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: d.id,
    amountUsdt: d.amountUsdt,
    network: d.network,
    asset: d.asset,
    walletAddress: d.walletAddress,
    txHash: d.txHash,
    status: d.status,
    creditedAmount: d.creditedAmount,
    commissionPct: d.commissionPct,
    adminNote: d.adminNote,
    confirmedAt: d.confirmedAt,
    createdAt: d.createdAt,
  }
}

async function getDepositCommission() {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'deposit_commission_pct' } })
  const pct = setting ? Number(setting.value) : 0
  return Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 0
}

// GET /api/deposits - list my deposit requests
router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const deposits = await prisma.depositRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const commissionPct = await getDepositCommission()

  response.json({ deposits: deposits.map(sanitizeDeposit), commissionPct })
})

// GET /api/deposits/wallets - available deposit wallets (crypto payment methods)
router.get('/wallets', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const methods = await prisma.paymentMethod.findMany({
    where: { isEnabled: true, type: 'crypto' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })

  const commissionPct = await getDepositCommission()

  response.json({
    wallets: methods.map((m) => ({
      id: m.id,
      title: m.title,
      asset: m.asset,
      network: m.network,
      walletAddress: m.walletAddress,
      displayName: m.displayName,
      instructions: m.instructions,
      isTonConnectEnabled: m.isTonConnectEnabled,
    })),
    commissionPct,
  })
})

// POST /api/deposits - create deposit request
router.post('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const walletId = parsePositiveInt(request.body.walletId)
  const amountUsdt = Number(request.body.amountUsdt)

  if (!walletId) {
    sendError(response, 400, 'wallet_required', 'walletId is required')
    return
  }

  if (!Number.isFinite(amountUsdt) || amountUsdt < 1) {
    sendError(response, 400, 'invalid_amount', 'Minimum deposit amount is 1 USDT')
    return
  }

  const wallet = await prisma.paymentMethod.findFirst({
    where: { id: walletId, type: 'crypto', isEnabled: true },
  })

  if (!wallet || !wallet.walletAddress || !wallet.network) {
    sendError(response, 404, 'wallet_not_found', 'Deposit wallet not found')
    return
  }

  const commissionPct = await getDepositCommission()
  const creditedAmount = Number((amountUsdt * (1 - commissionPct / 100)).toFixed(2))

  const deposit = await prisma.depositRequest.create({
    data: {
      userId: user.id,
      amountUsdt,
      network: wallet.network,
      asset: wallet.asset ?? 'USDT',
      walletAddress: wallet.walletAddress,
      status: 'pending',
      commissionPct,
      creditedAmount,
    },
  })

  response.status(201).json({ deposit: sanitizeDeposit(deposit) })
})

// PATCH /api/deposits/:id/txhash - submit transaction hash
router.patch('/:id/txhash', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const depositId = parsePositiveInt(request.params.id)
  if (!depositId) {
    sendError(response, 400, 'invalid_id', 'Invalid deposit id')
    return
  }

  const deposit = await prisma.depositRequest.findFirst({
    where: { id: depositId, userId: user.id },
  })

  if (!deposit) {
    sendError(response, 404, 'not_found', 'Deposit request not found')
    return
  }

  if (deposit.status !== 'pending') {
    sendError(response, 400, 'invalid_state', 'This deposit request has already been processed')
    return
  }

  const txHash = typeof request.body.txHash === 'string' ? request.body.txHash.trim() : ''
  if (!txHash) {
    sendError(response, 400, 'tx_hash_required', 'Transaction hash is required')
    return
  }

  if (!/^[A-Za-z0-9:_/-]{10,200}$/.test(txHash)) {
    sendError(response, 400, 'invalid_tx_hash', 'Transaction hash format is invalid')
    return
  }

  const existing = await prisma.depositRequest.findFirst({
    where: { txHash, id: { not: depositId } },
    select: { id: true },
  })

  if (existing) {
    sendError(response, 409, 'tx_hash_already_used', 'This transaction hash has already been submitted')
    return
  }

  const updated = await prisma.depositRequest.update({
    where: { id: depositId },
    data: { txHash },
  })

  response.json({ deposit: sanitizeDeposit(updated) })
})

export default router
