import { Router } from 'express'
import {
  authRateLimiter,
  buildCartResponse,
  getAuthorizedUser,
  isAllowedQuantity,
  normalizeQuantity,
  parsePositiveInt,
  prisma,
  sendError,
} from '../lib.js'
import { notifyOrderStatusChange } from '../services/notifier.js'

const router = Router()

class CheckoutConflictError extends Error {}

const ORDER_INCLUDE = {
  items: true,
  city: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  deliveryOption: true,
  discount: true,
}

// GET /api/orders - history
router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  response.json({ orders })
})

// GET /api/orders/:id - single order
router.get('/:id', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: ORDER_INCLUDE,
  })

  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }

  response.json({ order })
})

// POST /api/orders - checkout (create order from cart)
router.post('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  if (!user.selectedCityId) {
    sendError(response, 400, 'city_not_selected', 'Please select a city before placing an order')
    return
  }

  const comment = typeof request.body.comment === 'string' ? request.body.comment.trim() : undefined
  const discountCode = typeof request.body.discountCode === 'string' ? request.body.discountCode.trim().toUpperCase() : null
  const deliveryOptionId = parsePositiveInt(request.body.deliveryOptionId) ?? null

  const cart = await prisma.cart.findUnique({
    where: { userId: user.id },
    include: {
      items: {
        include: {
          productCity: { include: { product: true } },
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
    if (!isAllowedQuantity(item.quantity, pc.minimumQuantity, pc.quantityStep, pc.maximumQuantity)) {
      sendError(response, 422, 'quantity_invalid', `Quantity for "${pc.product.name}" no longer matches product rules`)
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

  // Resolve delivery option
  let deliveryFee = 0
  if (deliveryOptionId) {
    const opt = await prisma.deliveryOption.findFirst({ where: { id: deliveryOptionId, isActive: true } })
    if (opt) deliveryFee = opt.price
  }

  // Resolve discount code
  let discountAmount = 0
  let discountId: number | null = null
  let discountUsageLimit: number | null = null
  if (discountCode) {
    const discount = await prisma.discount.findFirst({ where: { code: discountCode, isActive: true } })
    if (discount) {
      const now = new Date()
      const expired = discount.expiresAt && discount.expiresAt < now
      const exhausted = discount.usageLimit !== null && discount.usedCount >= discount.usageLimit
      const tooSmall = subtotal < discount.minOrderAmount
      if (!expired && !exhausted && !tooSmall) {
        discountAmount =
          discount.type === 'percent'
            ? normalizeQuantity((subtotal * discount.value) / 100)
            : Math.min(discount.value, subtotal)
        discountId = discount.id
        discountUsageLimit = discount.usageLimit
      }
    }
  }

  const total = normalizeQuantity(Math.max(0, subtotal - discountAmount + deliveryFee))

  // Create order and clear cart in a transaction
  let order
  try {
    order = await prisma.$transaction(async (tx) => {
      // Reserve stock atomically to avoid concurrent checkout underflow.
      for (const item of cart.items) {
        const result = await tx.productCity.updateMany({
          where: {
            id: item.productCityId,
            isAvailable: true,
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        })

        if (result.count !== 1) {
          throw new CheckoutConflictError(`Insufficient stock for "${item.productCity.product.name}"`)
        }
      }

      // Increment discount usage when a code is attached.
      if (discountId) {
        if (discountUsageLimit === null) {
          await tx.discount.update({
            where: { id: discountId },
            data: { usedCount: { increment: 1 } },
          })
        } else {
          const discountResult = await tx.discount.updateMany({
            where: {
              id: discountId,
              isActive: true,
              usageLimit: discountUsageLimit,
              usedCount: { lt: discountUsageLimit },
            },
            data: { usedCount: { increment: 1 } },
          })

          if (discountResult.count !== 1) {
            throw new CheckoutConflictError('Discount code is no longer available')
          }
        }
      }

      const newOrder = await tx.order.create({
        data: {
          userId: user.id,
          cityId: user.selectedCityId!,
          status: 'pending',
          subtotal,
          discountAmount,
          deliveryFee,
          total,
          comment: comment || null,
          deliveryOptionId,
          discountId,
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
        include: ORDER_INCLUDE,
      })

      // Record initial status history
      await tx.orderStatusHistory.create({
        data: { orderId: newOrder.id, status: 'pending', comment: 'Order placed' },
      })

      // Clear cart items
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } })

      return newOrder
    })
  } catch (error) {
    if (error instanceof CheckoutConflictError) {
      sendError(response, 409, 'checkout_conflict', error.message)
      return
    }
    throw error
  }

  await prisma.userActivityLog.create({
    data: { userId: user.id, action: 'order_placed', meta: JSON.stringify({ orderId: order.id, total }) },
  })

  const cartResponse = await buildCartResponse(user.id)
  response.json({ order, cart: cartResponse.cart, recommended: cartResponse.recommended })
})

// POST /api/orders/:id/cancel - cancel an order (user-facing, only pending/confirmed)
router.post('/:id/cancel', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id } })
  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }

  if (!['pending', 'confirmed'].includes(order.status)) {
    sendError(response, 400, 'cannot_cancel', 'Only pending or confirmed orders can be cancelled')
    return
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderStatusHistory.create({
      data: { orderId, status: 'cancelled', comment: 'Cancelled by customer' },
    })

    // Restore stock
    const items = await tx.orderItem.findMany({ where: { orderId } })
    for (const item of items) {
      await tx.productCity.update({
        where: { id: item.productCityId },
        data: { stock: { increment: item.quantity } },
      })
    }

    return tx.order.update({
      where: { id: orderId },
      data: { status: 'cancelled', cancelledAt: new Date() },
      include: ORDER_INCLUDE,
    })
  })

  await prisma.userActivityLog.create({
    data: { userId: user.id, action: 'order_cancelled', meta: JSON.stringify({ orderId }) },
  })

  notifyOrderStatusChange(user.telegramId, orderId, 'cancelled')

  response.json({ order: updated })
})

// POST /api/orders/:id/refund-request - customer requests a refund
router.post('/:id/refund-request', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id } })
  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }

  if (!['delivered', 'cancelled'].includes(order.status)) {
    sendError(response, 400, 'cannot_refund', 'Refund can only be requested for delivered or cancelled orders')
    return
  }

  if (order.refundStatus) {
    sendError(response, 400, 'refund_already_requested', 'Refund already requested')
    return
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { refundStatus: 'requested' },
    include: ORDER_INCLUDE,
  })

  await prisma.userActivityLog.create({
    data: { userId: user.id, action: 'refund_requested', meta: JSON.stringify({ orderId }) },
  })

  response.json({ order: updated })
})

export default router
