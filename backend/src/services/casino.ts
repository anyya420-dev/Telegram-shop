import { randomInt, randomUUID } from 'node:crypto'
import type { CasinoBalance, CasinoGameConfig, CasinoReward, CasinoRewardConfig, Prisma, PrismaClient } from '@prisma/client'
import { normalizeQuantity } from '../lib.js'

export const CASINO_GAMES = ['wheel', 'slots', 'roulette', 'chest'] as const
export const CASINO_REWARD_TYPES = ['casino_credits', 'shop_discount', 'none'] as const
const DEFAULT_WELCOME_CREDITS = Math.max(0, Number(process.env.CASINO_WELCOME_CREDITS ?? 1000) || 1000)

type DbClient = Prisma.TransactionClient | PrismaClient

type RewardConfigSeed = {
  game: (typeof CASINO_GAMES)[number]
  rewardType: (typeof CASINO_REWARD_TYPES)[number]
  title: string
  resultKey?: string
  discountPercent?: number
  creditAmount?: number
  weight: number
  expiresInHours?: number
  minOrderAmount?: number
}

const DEFAULT_GAME_CONFIGS: Record<(typeof CASINO_GAMES)[number], { minBet: number; maxBet: number }> = {
  wheel: { minBet: 10, maxBet: 150 },
  slots: { minBet: 10, maxBet: 200 },
  roulette: { minBet: 10, maxBet: 300 },
  chest: { minBet: 10, maxBet: 120 },
}

const DEFAULT_REWARD_CONFIGS: RewardConfigSeed[] = [
  { game: 'wheel', rewardType: 'casino_credits', title: '50 Credits', creditAmount: 50, resultKey: 'credits_50', weight: 24 },
  { game: 'wheel', rewardType: 'casino_credits', title: '120 Credits', creditAmount: 120, resultKey: 'credits_120', weight: 14 },
  { game: 'wheel', rewardType: 'shop_discount', title: '2% OFF', discountPercent: 2, resultKey: 'discount_2', weight: 18, expiresInHours: 72 },
  { game: 'wheel', rewardType: 'shop_discount', title: '5% OFF', discountPercent: 5, resultKey: 'discount_5', weight: 14, expiresInHours: 72 },
  { game: 'wheel', rewardType: 'shop_discount', title: '7% OFF', discountPercent: 7, resultKey: 'discount_7', weight: 10, expiresInHours: 72 },
  { game: 'wheel', rewardType: 'shop_discount', title: '10% OFF', discountPercent: 10, resultKey: 'discount_10', weight: 7, expiresInHours: 72 },
  { game: 'wheel', rewardType: 'shop_discount', title: '15% OFF', discountPercent: 15, resultKey: 'discount_15', weight: 5, expiresInHours: 48 },
  { game: 'wheel', rewardType: 'shop_discount', title: '20% OFF', discountPercent: 20, resultKey: 'discount_20', weight: 3, expiresInHours: 48 },
  { game: 'wheel', rewardType: 'shop_discount', title: '25% OFF', discountPercent: 25, resultKey: 'discount_25', weight: 2, expiresInHours: 24 },
  { game: 'wheel', rewardType: 'shop_discount', title: '30% MAX OFF', discountPercent: 30, resultKey: 'discount_30', weight: 1, expiresInHours: 24 },

  { game: 'slots', rewardType: 'none', title: 'No reward', resultKey: 'mixed', weight: 48 },
  { game: 'slots', rewardType: 'casino_credits', title: 'Cherry x3', creditAmount: 45, resultKey: 'cherry', weight: 18 },
  { game: 'slots', rewardType: 'casino_credits', title: 'Lemon x3', creditAmount: 75, resultKey: 'lemon', weight: 12 },
  { game: 'slots', rewardType: 'casino_credits', title: 'Orange x3', creditAmount: 110, resultKey: 'orange', weight: 9 },
  { game: 'slots', rewardType: 'casino_credits', title: 'Bell x3', creditAmount: 180, resultKey: 'bell', weight: 5 },
  { game: 'slots', rewardType: 'shop_discount', title: 'BAR x3 — 10% OFF', discountPercent: 10, resultKey: 'bar', weight: 3, expiresInHours: 48 },
  { game: 'slots', rewardType: 'shop_discount', title: 'Golden 7 x3 — 30% MAX OFF', discountPercent: 30, resultKey: 'golden7', weight: 1, expiresInHours: 24 },

  { game: 'roulette', rewardType: 'casino_credits', title: '120 Credits', creditAmount: 120, resultKey: 'credits_120', weight: 16 },
  { game: 'roulette', rewardType: 'casino_credits', title: '240 Credits', creditAmount: 240, resultKey: 'credits_240', weight: 10 },
  { game: 'roulette', rewardType: 'shop_discount', title: '5% OFF', discountPercent: 5, resultKey: 'discount_5', weight: 7, expiresInHours: 72 },
  { game: 'roulette', rewardType: 'shop_discount', title: '10% OFF', discountPercent: 10, resultKey: 'discount_10', weight: 4, expiresInHours: 48 },
  { game: 'roulette', rewardType: 'shop_discount', title: '20% OFF', discountPercent: 20, resultKey: 'discount_20', weight: 2, expiresInHours: 24 },
  { game: 'roulette', rewardType: 'shop_discount', title: '30% MAX OFF', discountPercent: 30, resultKey: 'discount_30', weight: 1, expiresInHours: 24 },

  { game: 'chest', rewardType: 'casino_credits', title: '30 Credits', creditAmount: 30, resultKey: 'credits_30', weight: 24 },
  { game: 'chest', rewardType: 'casino_credits', title: '75 Credits', creditAmount: 75, resultKey: 'credits_75', weight: 15 },
  { game: 'chest', rewardType: 'shop_discount', title: '2% OFF', discountPercent: 2, resultKey: 'discount_2', weight: 15, expiresInHours: 72 },
  { game: 'chest', rewardType: 'shop_discount', title: '5% OFF', discountPercent: 5, resultKey: 'discount_5', weight: 11, expiresInHours: 72 },
  { game: 'chest', rewardType: 'shop_discount', title: '7% OFF', discountPercent: 7, resultKey: 'discount_7', weight: 9, expiresInHours: 72 },
  { game: 'chest', rewardType: 'shop_discount', title: '10% OFF', discountPercent: 10, resultKey: 'discount_10', weight: 6, expiresInHours: 48 },
  { game: 'chest', rewardType: 'shop_discount', title: '15% OFF', discountPercent: 15, resultKey: 'discount_15', weight: 4, expiresInHours: 48 },
  { game: 'chest', rewardType: 'shop_discount', title: '20% OFF', discountPercent: 20, resultKey: 'discount_20', weight: 2, expiresInHours: 24 },
  { game: 'chest', rewardType: 'shop_discount', title: '25% OFF', discountPercent: 25, resultKey: 'discount_25', weight: 1, expiresInHours: 24 },
  { game: 'chest', rewardType: 'shop_discount', title: '30% MAX OFF', discountPercent: 30, resultKey: 'discount_30', weight: 1, expiresInHours: 24 },
]

export function serializeReward(reward: CasinoReward | null) {
  if (!reward) return null
  return {
    id: reward.id,
    userId: reward.userId,
    game: reward.game,
    rewardType: reward.rewardType,
    status: reward.status,
    discountPercent: reward.discountPercent,
    creditAmount: reward.creditAmount,
    minOrderAmount: reward.minOrderAmount,
    createdAt: reward.createdAt,
    expiresAt: reward.expiresAt,
    usedAt: reward.usedAt,
    orderId: reward.orderId,
  }
}

export async function ensureCasinoDefaults(db: DbClient) {
  for (const [game, config] of Object.entries(DEFAULT_GAME_CONFIGS) as Array<[typeof CASINO_GAMES[number], { minBet: number; maxBet: number }]>) {
    await db.casinoGameConfig.upsert({
      where: { game },
      update: {},
      create: {
        game,
        minBet: config.minBet,
        maxBet: config.maxBet,
        spinLimit: 1,
      },
    })
  }

  for (const game of CASINO_GAMES) {
    const count = await db.casinoRewardConfig.count({ where: { game } })
    if (count === 0) {
      await db.casinoRewardConfig.createMany({
        data: DEFAULT_REWARD_CONFIGS.filter((entry) => entry.game === game).map((entry) => ({
          game: entry.game,
          rewardType: entry.rewardType,
          title: entry.title,
          resultKey: entry.resultKey ?? null,
          discountPercent: entry.discountPercent ?? null,
          creditAmount: entry.creditAmount ?? null,
          weight: entry.weight,
          isActive: true,
          expiresInHours: entry.expiresInHours ?? null,
          minOrderAmount: entry.minOrderAmount ?? null,
        })),
      })
    }
  }
}

export async function getOrCreateCasinoBalance(db: DbClient, userId: number) {
  return db.casinoBalance.upsert({
    where: { userId },
    update: {},
    create: { userId, credits: DEFAULT_WELCOME_CREDITS },
  })
}

function assertDiscount(value: number | null | undefined) {
  if (value == null) return
  if (value < 0 || value > 30) {
    throw new Error('Discount percent must be between 0 and 30')
  }
}

function pickWeightedConfig(configs: CasinoRewardConfig[]) {
  const active = configs.filter((entry) => entry.isActive && entry.weight > 0)
  const total = active.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) {
    throw new Error('No active reward configurations')
  }
  let cursor = randomInt(0, total)
  for (const config of active) {
    cursor -= config.weight
    if (cursor < 0) return config
  }
  return active[active.length - 1]
}

function buildSlotsOutcome(config: CasinoRewardConfig) {
  const symbols = ['cherry', 'lemon', 'orange', 'watermelon', 'grape', 'bell', 'bar', 'golden7']
  if (config.resultKey && symbols.includes(config.resultKey)) {
    return [config.resultKey, config.resultKey, config.resultKey]
  }
  const first = symbols[randomInt(0, symbols.length)]
  let second = symbols[randomInt(0, symbols.length)]
  let third = symbols[randomInt(0, symbols.length)]
  if (first === second && second === third) {
    second = symbols[(symbols.indexOf(first) + 1) % symbols.length]
  }
  if (first === second && second === third) {
    third = symbols[(symbols.indexOf(second) + 2) % symbols.length]
  }
  return [first, second, third]
}

function rouletteColor(number: number) {
  const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
  if (number === 0) return 'green'
  return red.has(number) ? 'red' : 'black'
}

function isRouletteWin(selection: { betType: string; value: string | null }, result: number) {
  const color = rouletteColor(result)
  switch (selection.betType) {
    case 'number':
      return selection.value === String(result)
    case 'red':
    case 'black':
      return color === selection.betType
    case 'odd':
      return result !== 0 && result % 2 === 1
    case 'even':
      return result !== 0 && result % 2 === 0
    case 'low':
      return result >= 1 && result <= 18
    case 'high':
      return result >= 19 && result <= 36
    default:
      return false
  }
}

async function createDiscountReward(tx: Prisma.TransactionClient, userId: number, game: string, config: CasinoRewardConfig) {
  assertDiscount(config.discountPercent)
  return tx.casinoReward.create({
    data: {
      userId,
      game,
      rewardType: 'shop_discount',
      status: 'available',
      discountPercent: config.discountPercent,
      creditAmount: null,
      minOrderAmount: config.minOrderAmount ?? null,
      expiresAt: config.expiresInHours ? new Date(Date.now() + config.expiresInHours * 60 * 60 * 1000) : null,
    },
  })
}

type PlayInput = {
  game: (typeof CASINO_GAMES)[number]
  userId: number
  requestId?: string
  bet: number
  selection?: Record<string, unknown>
}

export async function playCasinoGame(tx: Prisma.TransactionClient, input: PlayInput) {
  await ensureCasinoDefaults(tx)
  const requestId = (typeof input.requestId === 'string' && input.requestId.trim()) || randomUUID()
  const existingRound = await tx.casinoRound.findUnique({ where: { requestId } })
  if (existingRound) {
    throw Object.assign(new Error('Duplicate round request'), { status: 409, code: 'duplicate_round' })
  }

  const gameConfig = await tx.casinoGameConfig.findUnique({ where: { game: input.game } })
  if (!gameConfig || !gameConfig.isEnabled) {
    throw Object.assign(new Error('Game is unavailable'), { status: 400, code: 'game_disabled' })
  }

  const bet = normalizeQuantity(input.bet)
  if (!Number.isFinite(bet) || bet < gameConfig.minBet || bet > gameConfig.maxBet) {
    throw Object.assign(new Error('Bet out of allowed range'), { status: 400, code: 'invalid_bet' })
  }

  const balance = await getOrCreateCasinoBalance(tx, input.userId)
  const updateBalance = await tx.casinoBalance.updateMany({
    where: { id: balance.id, credits: { gte: bet } },
    data: { credits: { decrement: bet }, lifetimeSpent: { increment: bet } },
  })
  if (updateBalance.count !== 1) {
    throw Object.assign(new Error('Insufficient casino credits'), { status: 400, code: 'insufficient_casino_credits' })
  }

  const rewardConfigs = await tx.casinoRewardConfig.findMany({
    where: { game: input.game, isActive: true },
    orderBy: [{ weight: 'desc' }, { id: 'asc' }],
  })

  let rewardConfig: CasinoRewardConfig | null = null
  let outcomeValue: string | null = null
  let targetValue: string | null = null
  let metadata: Record<string, unknown> = {}

  if (input.game === 'roulette') {
    const betType = typeof input.selection?.betType === 'string' ? input.selection.betType : ''
    const rawValue = input.selection?.value
    const value = typeof rawValue === 'string' ? rawValue : rawValue == null ? null : String(rawValue)
    const allowedBetTypes = new Set(['number', 'red', 'black', 'odd', 'even', 'low', 'high'])
    if (!allowedBetTypes.has(betType)) {
      throw Object.assign(new Error('Invalid roulette bet type'), { status: 400, code: 'invalid_bet_type' })
    }
    if (betType === 'number') {
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36) {
        throw Object.assign(new Error('Invalid roulette number'), { status: 400, code: 'invalid_bet_value' })
      }
    }
    const result = randomInt(0, 37)
    targetValue = betType === 'number' ? String(value) : betType
    outcomeValue = String(result)
    metadata = { color: rouletteColor(result) }
    if (isRouletteWin({ betType, value }, result)) {
      rewardConfig = pickWeightedConfig(rewardConfigs.filter((entry) => entry.rewardType !== 'none'))
    }
  } else {
    rewardConfig = pickWeightedConfig(rewardConfigs)
    if (input.game === 'wheel') {
      outcomeValue = rewardConfig.resultKey ?? rewardConfig.title
    } else if (input.game === 'slots') {
      const symbols = buildSlotsOutcome(rewardConfig)
      outcomeValue = symbols.join('|')
      metadata = { symbols }
    } else if (input.game === 'chest') {
      const chestIndex = Number(input.selection?.chestIndex)
      if (!Number.isInteger(chestIndex) || chestIndex < 0 || chestIndex > 5) {
        throw Object.assign(new Error('Invalid chest selection'), { status: 400, code: 'invalid_chest' })
      }
      targetValue = String(chestIndex)
      outcomeValue = rewardConfig.resultKey ?? rewardConfig.title
    }
  }

  let reward: CasinoReward | null = null
  let creditAmount = 0
  let payoutAmount = 0
  let isWin = false
  if (rewardConfig && rewardConfig.rewardType !== 'none') {
    if (rewardConfig.rewardType === 'shop_discount') {
      reward = await createDiscountReward(tx, input.userId, input.game, rewardConfig)
      isWin = true
    } else if (rewardConfig.rewardType === 'casino_credits') {
      creditAmount = normalizeQuantity(rewardConfig.creditAmount ?? 0)
      payoutAmount = creditAmount
      isWin = creditAmount > 0
    }
  }

  const netChange = normalizeQuantity(creditAmount - bet)
  const updatedBalance = await tx.casinoBalance.update({
    where: { id: balance.id },
    data: { credits: { increment: creditAmount }, lifetimeWon: { increment: creditAmount } },
  })

  const round = await tx.casinoRound.create({
    data: {
      casinoBalanceId: balance.id,
      game: input.game,
      requestId,
      status: 'completed',
      betAmount: bet,
      targetValue,
      outcomeValue,
      payoutAmount,
      netChange,
      isWin,
      rewardConfigId: rewardConfig?.id ?? null,
      rewardId: reward?.id ?? null,
      metadata: JSON.stringify(metadata),
    },
  })

  await tx.casinoCreditTransaction.create({
    data: {
      casinoBalanceId: balance.id,
      amount: netChange,
      type: input.game,
      roundId: round.id,
      reason: `${input.game} round`,
    },
  })

  return {
    round,
    reward,
    balance: updatedBalance,
    rewardConfig,
  }
}

export function formatRewardSummary(config: CasinoRewardConfig | null, reward: CasinoReward | null) {
  if (reward) {
    return {
      rewardType: reward.rewardType,
      discountPercent: reward.discountPercent,
      creditAmount: reward.creditAmount,
      title: config?.title ?? (reward.discountPercent ? `${reward.discountPercent}% OFF` : 'Reward'),
    }
  }
  if (config?.rewardType === 'casino_credits') {
    return {
      rewardType: 'casino_credits',
      discountPercent: null,
      creditAmount: config.creditAmount ?? 0,
      title: config.title,
    }
  }
  return {
    rewardType: 'none',
    discountPercent: null,
    creditAmount: 0,
    title: config?.title ?? 'No reward',
  }
}

export function serializeRound(round: {
  id: number
  game: string
  betAmount: number
  targetValue: string | null
  outcomeValue: string | null
  payoutAmount: number
  netChange: number
  isWin: boolean
  createdAt: Date
  reward?: CasinoReward | null
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
    reward: serializeReward(round.reward ?? null),
  }
}

