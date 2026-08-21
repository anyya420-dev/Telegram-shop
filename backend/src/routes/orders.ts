import { Router } from 'express'
import {
  authRateLimiter,
  buildCartResponse,
  getAuthorizedUser,
  normalizeQuantity,
  prisma,
  sendError,
} from '../lib.js'

const router = Router()

// GET /api/orders - history
router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    include: {
      items: true,
      city: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  response.json({ orders })
})

// POST /api/orders - checkout (create order from cart)
router.post('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  if (!user.selectedCityId) {
    sendError(response, 400, 'city_not_selected', 'Please select a city before placing an order')
    return
  }

  const comment = typeof request.body.comment === 'string' ? request.body.comment.trim() : undefined

  const cart = await prisma.cart.findUnique({
    where: { userId: user.id },
    include: {
      items: {
        include: {
          productCity: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  })

  if (!cart || cart.items.length === 0) {
    sendError(response, 400, 'cart_empty', 'Cart is empty')
    return
  }

  // Verify all items are still available and in stock
  for (const item of cart.items) {
    const pc = item.productCity

    if (!pc.isAvailable) {
      sendError(response, 400, 'product_unavailable', `Product "${pc.product.name}" is no longer available`)
      return
    }

    if (item.quantity > pc.stock) {
      sendError(response, 400, 'stock_exceeded', `Insufficient stock for "${pc.product.name}"`)
      return
    }
  }

  const subtotal = normalizeQuantity(
    cart.items.reduce((sum, item) => sum + item.productCity.product.price * item.quantity, 0),
  )

  // Create order and clear cart in a transaction
  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        userId: user.id,
        cityId: user.selectedCityId!,
        status: 'pending',
        subtotal,
        total: subtotal,
        comment: comment || null,
        items: {
          create: cart.items.map((item) => ({
            productCityId: item.productCityId,
            productName: item.productCity.product.name,
            productImage: item.productCity.product.image,
            unit: item.productCity.unit,
            quantity: item.quantity,
            price: item.productCity.product.price,
            lineTotal: normalizeQuantity(item.productCity.product.price * item.quantity),
          })),
        },
      },
      include: {
        items: true,
        city: true,
      },
    })

    // Reduce stock for each item
    for (const item of cart.items) {
      await tx.productCity.update({
        where: { id: item.productCityId },
        data: { stock: { decrement: item.quantity } },
      })
    }

    // Clear cart items
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } })

    return newOrder
  })

  const cartResponse = await buildCartResponse(user.id)

  response.json({ order, cart: cartResponse.cart, recommended: cartResponse.recommended })
})

export default router
