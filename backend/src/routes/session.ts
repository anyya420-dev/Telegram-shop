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
import { seedAdminConfigForFreshInstall, isAdminTelegramId } from '../services/adminAuthService.js'
import { getActiveBotToken } from '../services/botService.js'

const router = Router()

router.post('/bootstrap', authRateLimiter, async (request, response) => {
  let telegramUser: { id: string; username?: string; first_name: string; last_name?: string } | null = null
  const initData = String(request.body.initData ?? '')
  const allowDemoMode = process.env.ALLOW_DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production'

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

  await seedAdminConfigForFreshInstall(String(telegramUser.id))

  const user = await prisma.user.upsert({
    where: { telegramId: String(telegramUser.id) },
    create: {
      telegramId: String(telegramUser.id),
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
    },
  })

  await getOrCreateCart(user.id)

  const [cities, categories, isAdmin] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    isAdminTelegramId(user.telegramId),
  ])

  response.json({
    telegramEnvironment: Boolean(initData),
    sessionToken: createSessionToken(user.telegramId),
    isAdmin,
    user: mapUser(user),
    cities: cities.map(mapCity),
    categories: categories.map(mapCategory),
  })
})

export default router
