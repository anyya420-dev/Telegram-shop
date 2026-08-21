import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, normalizeQuantity, prisma, sendError } from '../lib.js'

const router = Router()

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

  let balance = await prisma.balance.findUnique({ where: { userId: user.id } })
  if (!balance) {
    balance = await prisma.balance.create({ data: { userId: user.id, amount: 0 } })
  }

  if (balance.amount < bet) {
    sendError(response, 400, 'insufficient_balance', 'Insufficient balance')
    return
  }

  const dice = Math.floor(Math.random() * 6) + 1
  const win = dice === target
  const payout = win ? normalizeQuantity(bet * 5) : 0
  const netChange = win ? normalizeQuantity(payout - bet) : -bet

  const updated = await prisma.$transaction(async (tx) => {
    await tx.balanceTransaction.create({
      data: {
        balanceId: balance!.id,
        type: win ? 'casino_win' : 'casino_loss',
        amount: netChange,
        comment: `Dice roll: bet=${bet}, target=${target}, dice=${dice}`,
      },
    })
    return tx.balance.update({
      where: { id: balance!.id },
      data: { amount: { increment: netChange } },
    })
  })

  await prisma.userActivityLog.create({
    data: {
      userId: user.id,
      action: 'casino_spin',
      meta: JSON.stringify({ bet, target, dice, win, payout }),
    },
  })

  response.json({ dice, target, win, bet, payout, balance: updated })
})

// GET /api/casino/history
router.get('/history', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const balance = await prisma.balance.findUnique({ where: { userId: user.id } })
  if (!balance) {
    response.json({ history: [] })
    return
  }

  const history = await prisma.balanceTransaction.findMany({
    where: {
      balanceId: balance.id,
      type: { in: ['casino_win', 'casino_loss'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  response.json({ history })
})

export default router
