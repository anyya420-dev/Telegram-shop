import { randomInt } from 'node:crypto'
import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, normalizeQuantity, prisma, sendError } from '../lib.js'

const router = Router()
const DEFAULT_CASINO_CREDITS = Math.max(0, Number(process.env.CASINO_WELCOME_CREDITS ?? 1000) || 1000)

async function getOrCreateCasinoBalance(userId: number) {
  return prisma.casinoBalance.upsert({
    where: { userId },
    create: { userId, credits: DEFAULT_CASINO_CREDITS },
    update: {},
  })
}

function mapRound(round: {
  id: number
  game: string
  betAmount: number
  targetValue: number
  outcomeValue: number
  payoutAmount: number
  netChange: number
  isWin: boolean
  createdAt: Date
}) {
  return {
    id: round.id,
    game: round.game,
    betAmount: round.betAmount,
    targetValue: round.targetValue,
    outcomeValue: round.outcomeValue,
    payoutAmount: round.payoutAmount,
    netChange: round.netChange,
    isWin: round.isWin,
    createdAt: round.createdAt,
    comment:
      round.betAmount > 0 && round.targetValue > 0 && round.outcomeValue > 0
        ? `Dice roll: bet=${round.betAmount}, target=${round.targetValue}, dice=${round.outcomeValue}`
        : round.isWin
          ? 'Legacy casino win'
          : 'Legacy casino loss',
  }
}

router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const balance = await getOrCreateCasinoBalance(user.id)
  const history = await prisma.casinoRound.findMany({
    where: { casinoBalanceId: balance.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  response.json({
    balance: { id: balance.id, userId: balance.userId, credits: balance.credits },
    history: history.map(mapRound),
  })
})

// Casino game: Dice Roll
// Bet on a target 1-6; if dice matches, win 5x. Otherwise lose bet.
// POST /api/casino/spin
router.post('/spin', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const bet = Number(request.body.bet)
  const target = Number(request.body.target)

  if (!bet || bet <= 0 || bet > 10000) {
    sendError(response, 400, 'invalid_bet', 'Bet must be between 0.01 and 10000')
    return
  }

  if (!Number.isInteger(target) || target < 1 || target > 6) {
    sendError(response, 400, 'invalid_target', 'Target must be an integer 1-6')
    return
  }

  const balance = await getOrCreateCasinoBalance(user.id)

  if (balance.credits < bet) {
    sendError(response, 400, 'insufficient_balance', 'Insufficient balance')
    return
  }

  const dice = randomInt(1, 7)
  const win = dice === target
  const payout = win ? normalizeQuantity(bet * 5) : 0
  const netChange = win ? normalizeQuantity(payout - bet) : -bet

  const updated = await prisma.$transaction(async (tx) => {
    await tx.casinoRound.create({
      data: {
        casinoBalanceId: balance.id,
        game: 'dice',
        betAmount: bet,
        targetValue: target,
        outcomeValue: dice,
        payoutAmount: payout,
        netChange,
        isWin: win,
      },
    })
    return tx.casinoBalance.update({
      where: { id: balance.id },
      data: { credits: { increment: netChange } },
    })
  })

  await prisma.userActivityLog.create({
    data: {
      userId: user.id,
      action: 'casino_spin',
      meta: JSON.stringify({ bet, target, dice, win, payout }),
    },
  })

  response.json({ dice, target, win, bet, payout, balance: { amount: updated.credits, credits: updated.credits } })
})

// GET /api/casino/history
router.get('/history', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const balance = await prisma.casinoBalance.findUnique({ where: { userId: user.id } })
  if (!balance) {
    response.json({ history: [] })
    return
  }

  const history = await prisma.casinoRound.findMany({
    where: { casinoBalanceId: balance.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  response.json({ history: history.map(mapRound) })
})

export default router
