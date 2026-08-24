import { Router } from 'express'
import {
  authRateLimiter,
  createSessionToken,
  DEMO_TELEGRAM_USER,
  getOrCreateCart,
  mapCategory,
  mapCity,
  mapUser,
  prisma,
  sendError,
  verifyTelegramInitData,
} from '../lib.js'
import { seedAdminConfigForFreshInstall, isAdminTelegramId, isOwnerTelegramId, getOwnerTelegramId, normalizeTelegramId } from '../services/adminAuthService.js'
import { getActiveBotToken } from '../services/botService.js'
import { maskTelegramId } from '../services/logging.js'
import { isDemoModeEnabled } from '../services/runtimeConfig.js'

const router = Router()

router.post('/bootstrap', authRateLimiter, async (request, response) => {
  let telegramUser: { id: string; username?: string; first_name: string; last_name?: string } | null = null
  const rawInitData = (request.body as { initData?: unknown } | undefined)?.initData

  if (typeof rawInitData !== 'undefined' && typeof rawInitData !== 'string') {
    sendError(response, 400, 'invalid_request_body', 'initData must be a string')
    return
  }

  const initData = rawInitData ?? ''
  const allowDemoMode = isDemoModeEnabled()

  if (initData) {
    const botToken = await getActiveBotToken()

    if (!botToken) {
      sendError(response, 503, 'telegram_bot_token_required', 'Telegram bot token is required for Web App verification')
      return
    }

    telegramUser = verifyTelegramInitData(initData, botToken)

    if (!telegramUser) {
      sendError(response, 401, 'telegram_verification_failed', 'Telegram init data verification failed')
      return
    }
  } else if (allowDemoMode) {
    telegramUser = DEMO_TELEGRAM_USER
  } else {
    sendError(response, 401, 'telegram_init_data_required', 'Telegram init data is required')
    return
  }

  const normalizedTelegramId = normalizeTelegramId(telegramUser.id)
  if (!normalizedTelegramId) {
    sendError(response, 401, 'telegram_verification_failed', 'Telegram init data verification failed')
    return
  }

  await seedAdminConfigForFreshInstall(normalizedTelegramId)

  const user = await prisma.user.upsert({
    where: { telegramId: normalizedTelegramId },
    create: {
      telegramId: normalizedTelegramId,
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name ?? null,
      language: 'ru',
    },
    update: {
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name ?? null,
    },
    include: {
      selectedCity: true,
      balance: true,
      _count: { select: { orders: true } },
    },
  })

  await getOrCreateCart(user.id)

  const [cities, categories, isAdmin] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    isAdminTelegramId(user.telegramId),
  ])
  const isOwner = isOwnerTelegramId(user.telegramId)
  const ownerTelegramIdConfigured = Boolean(getOwnerTelegramId())

  if (isAdmin || isOwner) {
    console.info('[session/bootstrap] admin-capable user authenticated', {
      telegramIdMasked: maskTelegramId(user.telegramId),
      telegramEnvironment: Boolean(initData),
      ownerTelegramIdConfigured,
      isOwner,
      isAdmin,
    })
  } else {
    console.info('[session/bootstrap] user authenticated', {
      telegramIdMasked: maskTelegramId(user.telegramId),
      telegramEnvironment: Boolean(initData),
      ownerTelegramIdConfigured,
      isOwner: false,
      isAdmin: false,
    })
  }

  response.json({
    telegramEnvironment: Boolean(initData),
    sessionToken: createSessionToken(user.telegramId),
    isAdmin,
    isOwner,
    user: {
      ...mapUser(user),
      balance: user.balance ? user.balance.amount : 0,
      orderCount: user._count.orders,
    },
    cities: cities.map(mapCity),
    categories: categories.map(mapCategory),
  })
})

export default router
