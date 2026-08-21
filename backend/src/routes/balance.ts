import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, prisma, sendError } from '../lib.js'

const router = Router()

async function getOrCreateBalance(userId: number) {
  return prisma.balance.upsert({
    where: { userId },
    create: { userId, amount: 0 },
    update: {},
    include: { transactions: { orderBy: { createdAt: 'desc' }, take: 30 } },
  })
}

// GET /api/balance
router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const balance = await getOrCreateBalance(user.id)
  response.json({ balance })
})

// POST /api/balance/topup - simulate top-up (payment gateway integration point)
router.post('/topup', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const amount = Number(request.body.amount)
  if (!amount || amount <= 0 || amount > 100000) {
    sendError(response, 400, 'invalid_amount', 'Amount must be between 0.01 and 100000')
    return
  }

  const balance = await prisma.balance.upsert({
    where: { userId: user.id },
    create: { userId: user.id, amount: 0 },
    update: {},
  })

  const updated = await prisma.$transaction(async (tx) => {
    await tx.balanceTransaction.create({
      data: { balanceId: balance.id, type: 'topup', amount, comment: 'Manual top-up' },
    })
    return tx.balance.update({
      where: { id: balance.id },
      data: { amount: { increment: amount } },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 30 } },
    })
  })

  await prisma.userActivityLog.create({
    data: { userId: user.id, action: 'balance_topup', meta: JSON.stringify({ amount }) },
  })

  response.json({ balance: updated })
})

export default router
