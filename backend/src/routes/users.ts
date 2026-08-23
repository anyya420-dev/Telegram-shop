import { Router } from 'express'
import {
  authRateLimiter,
  getAuthorizedUser,
  getOrCreateCart,
  isLanguage,
  mapUser,
  parsePositiveInt,
  prisma,
  sendError,
} from '../lib.js'

const router = Router()

router.get('/me', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      selectedCity: true,
      balance: true,
      _count: { select: { orders: true } },
    },
  })

  if (!fullUser) {
    sendError(response, 404, 'user_not_found', 'User not found')
    return
  }

  response.json({
    user: {
      ...mapUser(fullUser),
      balance: fullUser.balance ? fullUser.balance.amount : 0,
      orderCount: fullUser._count.orders,
    },
  })
})

router.patch('/city', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const cityId = parsePositiveInt(request.body.cityId)

  if (!cityId) {
    sendError(response, 400, 'city_required', 'cityId must be a positive integer')
    return
  }

  const city = await prisma.city.findFirst({ where: { id: cityId, isActive: true } })

  if (!city) {
    sendError(response, 404, 'city_not_found', 'City not found')
    return
  }

  const cart = await getOrCreateCart(user.id)
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })

  const updatedUser = await prisma.user.update({
    where: { telegramId: user.telegramId },
    data: { selectedCityId: cityId },
    include: { selectedCity: true },
  })

  response.json({ user: mapUser(updatedUser) })
})

router.patch('/language', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const language = request.body.language

  if (!isLanguage(language)) {
    sendError(response, 400, 'request_failed', 'language must be ru or en')
    return
  }

  const updatedUser = await prisma.user.update({
    where: { telegramId: user.telegramId },
    data: { language },
    include: { selectedCity: true },
  })

  response.json({ user: mapUser(updatedUser) })
})

export default router
