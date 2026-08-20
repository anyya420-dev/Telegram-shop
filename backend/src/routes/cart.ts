import { Router } from 'express'
import {
  authRateLimiter,
  buildCartResponse,
  getAuthorizedUser,
  getOrCreateCart,
  isAllowedQuantity,
  parsePositiveInt,
  prisma,
  sendError,
} from '../lib.js'

const router = Router()

router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  await getOrCreateCart(user.id)
  response.json(await buildCartResponse(user.id))
})

router.post('/items', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const productCityId = parsePositiveInt(request.body.productCityId)
  const quantity = Number(request.body.quantity)

  if (!productCityId) {
    sendError(response, 400, 'product_city_required', 'productCityId must be a positive integer')
    return
  }

  const productCity = await prisma.productCity.findUnique({
    where: { id: productCityId },
  })

  if (!productCity || !productCity.isAvailable) {
    sendError(response, 404, 'product_unavailable', 'Product is unavailable')
    return
  }

  if (user.selectedCityId !== productCity.cityId) {
    sendError(response, 400, 'city_mismatch', 'Choose the same city before adding products')
    return
  }

  if (!isAllowedQuantity(quantity, productCity.minimumQuantity, productCity.quantityStep, productCity.maximumQuantity)) {
    sendError(response, 400, 'quantity_invalid', 'Quantity does not match product rules')
    return
  }

  if (quantity > productCity.stock) {
    sendError(response, 400, 'stock_exceeded', 'Requested quantity exceeds stock')
    return
  }

  const cart = await getOrCreateCart(user.id)

  await prisma.cartItem.upsert({
    where: {
      cartId_productCityId: {
        cartId: cart.id,
        productCityId,
      },
    },
    create: {
      cartId: cart.id,
      productCityId,
      quantity,
    },
    update: {
      quantity,
    },
  })

  response.json(await buildCartResponse(user.id))
})

router.patch('/items/:itemId', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const itemId = parsePositiveInt(request.params.itemId)
  const quantity = Number(request.body.quantity)

  if (!itemId) {
    sendError(response, 400, 'cart_item_required', 'itemId must be a positive integer')
    return
  }

  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: {
      cart: true,
      productCity: true,
    },
  })

  if (!item || item.cart.userId !== user.id) {
    sendError(response, 404, 'cart_item_not_found', 'Cart item not found')
    return
  }

  if (!isAllowedQuantity(quantity, item.productCity.minimumQuantity, item.productCity.quantityStep, item.productCity.maximumQuantity)) {
    sendError(response, 400, 'quantity_invalid', 'Quantity does not match product rules')
    return
  }

  if (quantity > item.productCity.stock) {
    sendError(response, 400, 'stock_exceeded', 'Requested quantity exceeds stock')
    return
  }

  await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  })

  response.json(await buildCartResponse(user.id))
})

router.delete('/items/:itemId', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const itemId = parsePositiveInt(request.params.itemId)

  if (!itemId) {
    sendError(response, 400, 'cart_item_required', 'itemId must be a positive integer')
    return
  }

  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: { cart: true },
  })

  if (!item || item.cart.userId !== user.id) {
    sendError(response, 404, 'cart_item_not_found', 'Cart item not found')
    return
  }

  await prisma.cartItem.delete({ where: { id: itemId } })
  response.json(await buildCartResponse(user.id))
})

export default router
