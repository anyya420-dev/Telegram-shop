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
