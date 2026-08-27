import { randomInt, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, prisma, sendError } from '../lib.js'
import {
  CASINO_GAMES,
  ensureCasinoDefaults,
  formatRewardSummary,
  getOrCreateCasinoBalance,
  playCasinoGame,
  serializeReward,
  serializeRound,
} from '../services/casino.js'

const router = Router()

router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  await ensureCasinoDefaults(prisma)
  const [balance, rounds, rewards, games] = await Promise.all([
    getOrCreateCasinoBalance(prisma, user.id),
    prisma.casinoRound.findMany({
      where: { casinoBalance: { userId: user.id } },
      include: { reward: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.casinoReward.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.casinoGameConfig.findMany({ orderBy: { game: 'asc' } }),
  ])

  response.json({
    balance: {
      id: balance.id,
      userId: balance.userId,
      credits: balance.credits,
      lifetimeWon: balance.lifetimeWon,
      lifetimeSpent: balance.lifetimeSpent,
    },
    history: rounds.map((round) => serializeRound(round)),
    rewards: rewards.map(serializeReward),
    games,
  })
})

router.get('/history', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const rounds = await prisma.casinoRound.findMany({
    where: { casinoBalance: { userId: user.id } },
    include: { reward: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  response.json({ history: rounds.map((round) => serializeRound(round)) })
})

router.post('/spin', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  try {
    const bet = Number(request.body.bet)
    const target = Number(request.body.target)
    if (!Number.isFinite(bet) || bet <= 0 || !Number.isInteger(target) || target < 1 || target > 6) {
      sendError(response, 400, 'invalid_bet', 'Invalid bet or target')
      return
    }
    const result = await prisma.$transaction(async (tx) => {
      const balance = await getOrCreateCasinoBalance(tx, user.id)
      const updated = await tx.casinoBalance.updateMany({
        where: { id: balance.id, credits: { gte: bet } },
        data: { credits: { decrement: bet }, lifetimeSpent: { increment: bet } },
      })
      if (updated.count !== 1) {
        throw Object.assign(new Error('Insufficient casino credits'), { status: 400, code: 'insufficient_casino_credits' })
      }
      const dice = randomInt(1, 7)
      const win = dice === target
      const payout = win ? bet * 5 : 0
      const nextBalance = await tx.casinoBalance.update({
        where: { id: balance.id },
        data: { credits: { increment: payout }, lifetimeWon: { increment: payout } },
      })
      const round = await tx.casinoRound.create({
        data: {
          casinoBalanceId: balance.id,
          game: 'wheel',
          requestId: `u${user.id}:${typeof request.body.requestId === 'string' ? request.body.requestId : randomUUID()}`,
          status: 'completed',
          betAmount: bet,
          targetValue: String(target),
          outcomeValue: String(dice),
          payoutAmount: payout,
          netChange: payout - bet,
          isWin: win,
          metadata: JSON.stringify({ legacy: true }),
        },
      })
      await tx.casinoCreditTransaction.create({
        data: {
          casinoBalanceId: balance.id,
          amount: payout - bet,
          type: win ? 'legacy_win' : 'legacy_loss',
          roundId: round.id,
          reason: 'Legacy compatibility spin',
        },
      })
      return { balance: nextBalance, round, dice, win, payout }
    })

    response.json({
      dice: result.dice,
      target,
      win: result.round.isWin,
      bet: result.round.betAmount,
      payout: result.round.payoutAmount,
      balance: {
        amount: result.balance.credits,
        credits: result.balance.credits,
      },
      round: serializeRound({ ...result.round, reward: null }),
    })
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 400
    const code = typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : 'casino_request_failed'
    sendError(response, status, code, error instanceof Error ? error.message : 'Casino request failed')
  }
})

router.post('/:game/play', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const game = typeof request.params.game === 'string' ? request.params.game : ''
  if (!CASINO_GAMES.includes(game as (typeof CASINO_GAMES)[number])) {
    sendError(response, 404, 'game_not_found', 'Casino game not found')
    return
  }

  try {
    const result = await prisma.$transaction((tx) =>
      playCasinoGame(tx, {
        game: game as (typeof CASINO_GAMES)[number],
        userId: user.id,
        requestId: typeof request.body.requestId === 'string' ? request.body.requestId : undefined,
        bet: Number(request.body.bet),
        selection:
          request.body && typeof request.body === 'object' ? request.body : undefined,
      }),
    )

    response.json({
      round: serializeRound({ ...result.round, reward: result.reward }),
      reward: formatRewardSummary(result.rewardConfig ?? null, result.reward),
      balance: {
        credits: result.balance.credits,
        lifetimeWon: result.balance.lifetimeWon,
        lifetimeSpent: result.balance.lifetimeSpent,
      },
    })
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 400
    const code = typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : 'casino_request_failed'
    sendError(response, status, code, error instanceof Error ? error.message : 'Casino request failed')
  }
})

export default router
