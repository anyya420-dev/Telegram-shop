import { Router } from 'express'
import { Prisma } from '@prisma/client'
import {
  AppRole,
  authRateLimiter,
  buildCartResponse,
  getAuthorizedUser,
  getAuthorizedUserByRole,
  isAllowedQuantity,
  normalizeRole,
  normalizeQuantity,
  parsePositiveInt,
  prisma,
  sendError,
} from '../lib.js'
import { getOrCreateCasinoBalance } from '../services/casino.js'
import { notifyOrderStatusChange } from '../services/notifier.js'

const router = Router()
const OPERATOR_ROLES: AppRole[] = ['OWNER', 'ADMIN', 'OPERATOR']

class OrderRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const ORDER_INCLUDE = {
  items: true,
  city: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  paymentMethod: true,
  deliveryOption: true,
  discount: true,
  reward: true,
  payments: {
    include: {
      paymentMethod: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
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

// GET /api/orders/operator/queue - operator/admin order panel feed
router.get('/operator/queue', authRateLimiter, async (request, response) => {
  const actor = await getAuthorizedUserByRole(request, response, OPERATOR_ROLES)
  if (!actor) return

  const actorRole = normalizeRole(actor.role)
  const where = actorRole === 'OPERATOR'
    ? {
      OR: [
        { assignedOperatorId: actor.id },
        { assignedOperatorId: null, status: 'waiting_for_delivery_price' },
      ],
    }
    : {}

  const orders = await prisma.order.findMany({
    where,
    include: {
      ...ORDER_INCLUDE,
      user: { select: { id: true, firstName: true, username: true, telegramId: true } },
      assignedOperator: { select: { id: true, firstName: true, username: true, telegramId: true, role: true, operatorStatus: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
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
  const paymentMethodId = parsePositiveInt(request.body.paymentMethodId) ?? null
  const rewardId = parsePositiveInt(request.body.rewardId) ?? null
  const requestedCasinoCreditsToUse = normalizeQuantity(Math.max(0, Number(request.body.casinoCreditsToUse) || 0))

  if (requestedCasinoCreditsToUse < 0) {
   sendError(response, 400, 'invalid_casino_credits', 'Casino credits must be zero or positive')
   return
  }

  if (discountCode && rewardId) {
   sendError(response, 400, 'discount_conflict', 'Choose either a promo code or a casino reward')
   return
  }

  let order

  try {
    order = await prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { selectedCityId: true },
      })

      if (!currentUser?.selectedCityId) {
        throw new OrderRequestError(400, 'city_not_selected', 'Please select a city before placing an order')
      }

      const cart = await tx.cart.findUnique({
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
        throw new OrderRequestError(400, 'cart_empty', 'Cart is empty')
      }

      for (const item of cart.items) {
        const productCity = item.productCity
        if (productCity.cityId !== currentUser.selectedCityId) {
          throw new OrderRequestError(400, 'city_mismatch', 'Choose the same city before placing an order')
        }
        if (!productCity.product.isActive || !productCity.isAvailable || productCity.stock <= 0) {
          throw new OrderRequestError(400, 'product_unavailable', `Product "${productCity.product.name}" is unavailable`)
        }
        if (
          !isAllowedQuantity(
            item.quantity,
            productCity.minimumQuantity,
            productCity.quantityStep,
            productCity.maximumQuantity,
          )
        ) {
          throw new OrderRequestError(400, 'quantity_invalid', `Quantity for "${productCity.product.name}" is invalid`)
        }
        if (item.quantity > productCity.stock) {
          throw new OrderRequestError(400, 'stock_exceeded', `Insufficient stock for "${productCity.product.name}"`)
        }
      }

      let deliveryFee = 0
      if (deliveryOptionId) {
        const deliveryOption = await tx.deliveryOption.findFirst({
          where: { id: deliveryOptionId, isActive: true },
        })
        if (!deliveryOption) {
          throw new OrderRequestError(400, 'delivery_option_unavailable', 'Selected delivery option is unavailable')
        }
        deliveryFee = 0
      }

      const subtotal = normalizeQuantity(
        cart.items.reduce((sum, item) => sum + item.productCity.product.price * item.quantity, 0),
      )
      const creditsSubtotal = normalizeQuantity(
        cart.items.reduce((sum, item) => {
          if (!item.productCity.product.creditsEnabled || !item.productCity.product.creditsPrice) {
            return sum
          }
          return sum + item.productCity.product.creditsPrice * item.quantity
        }, 0),
      )

      let discountAmount = 0
      let discountId: number | null = null
      let rewardDiscountAmount = 0
      let rewardRecordId: number | null = null
      if (discountCode) {
        const discount = await tx.discount.findFirst({ where: { code: discountCode, isActive: true } })
        if (!discount) {
          throw new OrderRequestError(404, 'discount_not_found', 'Discount code not found or inactive')
        }
        if (discount.expiresAt && discount.expiresAt < new Date()) {
          throw new OrderRequestError(400, 'discount_expired', 'Discount code has expired')
        }
        if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit) {
          throw new OrderRequestError(400, 'discount_exhausted', 'Discount code usage limit reached')
        }
        if (subtotal < discount.minOrderAmount) {
          throw new OrderRequestError(400, 'order_too_small', 'Order amount does not meet the discount minimum')
        }

        discountAmount =
          discount.type === 'percent'
            ? normalizeQuantity((subtotal * discount.value) / 100)
            : Math.min(discount.value, subtotal)
        discountId = discount.id
      }

      if (rewardId) {
        const reward = await tx.casinoReward.findFirst({
          where: { id: rewardId, userId: user.id },
        })
        if (!reward) {
          throw new OrderRequestError(404, 'reward_not_found', 'Reward not found')
        }
        if (reward.rewardType !== 'shop_discount') {
          throw new OrderRequestError(400, 'reward_invalid', 'Only shop discount rewards can be used at checkout')
        }
        if (reward.status !== 'available' || reward.orderId || reward.usedAt) {
          throw new OrderRequestError(400, 'reward_unavailable', 'Reward is no longer available')
        }
        if (reward.expiresAt && reward.expiresAt < new Date()) {
          await tx.casinoReward.update({
            where: { id: reward.id },
            data: { status: 'expired' },
          })
          throw new OrderRequestError(400, 'reward_expired', 'Reward has expired')
        }
        if ((reward.discountPercent ?? 0) > 30) {
          throw new OrderRequestError(400, 'reward_invalid', 'Reward discount exceeds the allowed maximum')
        }
        if (reward.minOrderAmount && subtotal < reward.minOrderAmount) {
          throw new OrderRequestError(400, 'order_too_small', 'Order amount does not meet the reward minimum')
        }
        rewardDiscountAmount = normalizeQuantity((subtotal * (reward.discountPercent ?? 0)) / 100)
        discountAmount = rewardDiscountAmount
        rewardRecordId = reward.id
      }

      let casinoCreditsToUse = 0
      if (requestedCasinoCreditsToUse > 0) {
        const allItemsAllowCredits = cart.items.every((item) => item.productCity.product.creditsEnabled && (item.productCity.product.creditsPrice ?? 0) > 0)
        if (!allItemsAllowCredits || creditsSubtotal <= 0) {
          throw new OrderRequestError(400, 'credits_unavailable_for_order', 'Casino credits are unavailable for one or more products in this order')
        }
        const minimumCreditsRequired = cart.items.reduce((max, item) => Math.max(max, item.productCity.product.minCreditsRequired ?? 0), 0)
        if (minimumCreditsRequired > 0 && requestedCasinoCreditsToUse < minimumCreditsRequired) {
          throw new OrderRequestError(400, 'credits_minimum_not_met', 'Selected products require a higher casino credits amount')
        }
        const casinoBalance = await getOrCreateCasinoBalance(tx, user.id)
        if (requestedCasinoCreditsToUse > casinoBalance.credits) {
          throw new OrderRequestError(400, 'insufficient_casino_credits', 'Insufficient casino credits balance')
        }
        casinoCreditsToUse = normalizeQuantity(Math.min(requestedCasinoCreditsToUse, creditsSubtotal))
      }

      const discountedSubtotal = normalizeQuantity(Math.max(0, subtotal - discountAmount))
      const creditsCashValue =
        casinoCreditsToUse > 0 && creditsSubtotal > 0
          ? normalizeQuantity(Math.min(discountedSubtotal, discountedSubtotal * (casinoCreditsToUse / creditsSubtotal)))
          : 0
      const total = normalizeQuantity(Math.max(0, discountedSubtotal - creditsCashValue + deliveryFee))

      let paymentMethod: Awaited<ReturnType<typeof tx.paymentMethod.findFirst>> = null
      if (total > 0) {
        if (!paymentMethodId) {
          throw new OrderRequestError(400, 'payment_method_required', 'Payment method is required')
        }
        paymentMethod = await tx.paymentMethod.findFirst({ where: { id: paymentMethodId, isEnabled: true } })
        if (!paymentMethod) {
          throw new OrderRequestError(400, 'payment_method_unavailable', 'Selected payment method is unavailable')
        }
      }

      if (discountId) {
        await tx.discount.update({
          where: { id: discountId },
          data: { usedCount: { increment: 1 } },
        })
      }

      for (const item of cart.items) {
        const updatedProductCity = await tx.productCity.updateMany({
          where: {
            id: item.productCityId,
            cityId: currentUser.selectedCityId,
            isAvailable: true,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        })

        if (updatedProductCity.count !== 1) {
          throw new OrderRequestError(400, 'stock_exceeded', `Insufficient stock for "${item.productCity.product.name}"`)
        }
      }

      const newOrder = await tx.order.create({
        data: {
          userId: user.id,
          cityId: currentUser.selectedCityId,
          status: total > 0 ? 'waiting_for_delivery_price' : 'confirmed',
          subtotal,
          discountAmount,
          deliveryFee,
          deliveryPrice: total > 0 ? null : 0,
          total,
          comment: comment || null,
          paymentStatus: total > 0 ? 'blocked_delivery_price' : 'confirmed',
          paymentMethodId,
          deliveryOptionId,
          discountId,
          casinoCreditsUsed: casinoCreditsToUse,
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
      })

      if (rewardRecordId) {
        await tx.casinoReward.update({
          where: { id: rewardRecordId },
          data: { status: 'used', usedAt: new Date(), orderId: newOrder.id },
        })
      }

      if (casinoCreditsToUse > 0) {
        const casinoBalance = await getOrCreateCasinoBalance(tx, user.id)
        const updatedBalance = await tx.casinoBalance.updateMany({
          where: { id: casinoBalance.id, credits: { gte: casinoCreditsToUse } },
          data: {
            credits: { decrement: casinoCreditsToUse },
            lifetimeSpent: { increment: casinoCreditsToUse },
          },
        })
        if (updatedBalance.count !== 1) {
          throw new OrderRequestError(400, 'insufficient_casino_credits', 'Insufficient casino credits balance')
        }
        await tx.casinoCreditTransaction.create({
          data: {
            casinoBalanceId: casinoBalance.id,
            amount: -casinoCreditsToUse,
            type: 'order_purchase',
            orderId: newOrder.id,
            reason: 'Casino credits applied to order',
          },
        })
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          status: total > 0 ? 'waiting_for_delivery_price' : 'confirmed',
          comment: total > 0
            ? 'Order placed and waiting for operator delivery pricing'
            : 'Order paid with casino credits',
        },
      })

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } })

      return tx.order.findUniqueOrThrow({
        where: { id: newOrder.id },
        include: ORDER_INCLUDE,
      })
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  } catch (error) {
    if (error instanceof OrderRequestError) {
      sendError(response, error.status, error.code, error.message)
      return
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      sendError(response, 409, 'order_submission_in_progress', 'Order submission is already being processed')
      return
    }

    throw error
  }

  await prisma.userActivityLog.create({
    data: { userId: user.id, action: 'order_placed', meta: JSON.stringify({ orderId: order.id, total: order.total }) },
  })

  const cartResponse = await buildCartResponse(user.id)
  response.json({ order, cart: cartResponse.cart, recommended: cartResponse.recommended })
})

// PATCH /api/orders/:id/delivery-price - operator/admin confirms delivery price
router.patch('/:id/delivery-price', authRateLimiter, async (request, response) => {
  const actor = await getAuthorizedUserByRole(request, response, OPERATOR_ROLES)
  if (!actor) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const deliveryPrice = normalizeQuantity(Number(request.body.deliveryPrice))
  if (!Number.isFinite(deliveryPrice) || deliveryPrice < 0) {
    sendError(response, 400, 'invalid_delivery_price', 'Delivery price must be zero or positive')
    return
  }
  const reason = typeof request.body.reason === 'string' ? request.body.reason.trim() : ''
  if (!reason) {
    sendError(response, 400, 'delivery_price_reason_required', 'Reason is required')
    return
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { user: true },
      })
      if (!order) {
        throw new OrderRequestError(404, 'not_found', 'Order not found')
      }
      if (order.status === 'cancelled') {
        throw new OrderRequestError(400, 'invalid_order_status', 'Cancelled order cannot be updated')
      }
      if (order.paymentStatus === 'paid') {
        throw new OrderRequestError(400, 'invalid_order_status', 'Paid order cannot be updated')
      }

      const actorRole = normalizeRole(actor.role)
      if (actorRole === 'OPERATOR' && order.assignedOperatorId && order.assignedOperatorId !== actor.id) {
        throw new OrderRequestError(403, 'forbidden', 'Order is assigned to another operator')
      }

      const baseOrderTotal = normalizeQuantity(
        Math.max(
          0,
          order.total - (order.deliveryPrice ?? order.deliveryFee ?? 0),
        ),
      )
      const recalculatedTotal = normalizeQuantity(baseOrderTotal + deliveryPrice)

      const assignedOperatorId = actorRole === 'OPERATOR'
        ? (order.assignedOperatorId ?? actor.id)
        : order.assignedOperatorId

      await tx.deliveryPriceAudit.create({
        data: {
          orderId,
          actorUserId: actor.id,
          previousPrice: order.deliveryPrice,
          newPrice: deliveryPrice,
          reason,
        },
      })

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: 'ready_for_payment',
          comment: `Delivery price confirmed: ${deliveryPrice} USDT. ${reason}`,
        },
      })

      const nextOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          assignedOperatorId,
          deliveryFee: deliveryPrice,
          deliveryPrice,
          deliveryPriceReason: reason,
          deliveryPriceConfirmedAt: new Date(),
          deliveryPriceConfirmedById: actor.id,
          total: recalculatedTotal,
          status: 'ready_for_payment',
          paymentStatus: 'pending',
        },
        include: ORDER_INCLUDE,
      })

      return { order, nextOrder }
    })

    notifyOrderStatusChange(updated.order.user.telegramId, orderId, 'ready_for_payment')
    response.json({ order: updated.nextOrder })
  } catch (error) {
    if (error instanceof OrderRequestError) {
      sendError(response, error.status, error.code, error.message)
      return
    }

    throw error
  }
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

  if (!['waiting_for_delivery_price', 'ready_for_payment', 'pending', 'confirmed', 'payment_pending'].includes(order.status)) {
    sendError(response, 400, 'cannot_cancel', 'Only unpaid orders can be cancelled')
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

    const reward = await tx.casinoReward.findFirst({ where: { orderId } })
    if (reward) {
      await tx.casinoReward.update({
        where: { id: reward.id },
        data: { status: 'available', usedAt: null, orderId: null },
      })
    }
    if (order.casinoCreditsUsed > 0) {
      const casinoBalance = await getOrCreateCasinoBalance(tx, user.id)
      await tx.casinoBalance.update({
        where: { id: casinoBalance.id },
        data: { credits: { increment: order.casinoCreditsUsed } },
      })
      await tx.casinoCreditTransaction.create({
        data: {
          casinoBalanceId: casinoBalance.id,
          amount: order.casinoCreditsUsed,
          type: 'order_refund',
          orderId,
          reason: 'Cancelled order credit refund',
        },
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

// POST /api/orders/:id/mark-paid - customer reports manual payment
router.post('/:id/mark-paid', authRateLimiter, async (request, response) => {
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

  const payment = await prisma.payment.findFirst({
    where: { orderId, order: { userId: user.id } },
    orderBy: { createdAt: 'desc' },
  })

  if (!order.paymentMethodId || !payment) {
    sendError(response, 400, 'payment_method_missing', 'Payment is not initialized for this order')
    return
  }

  const method = await prisma.paymentMethod.findUnique({ where: { id: order.paymentMethodId } })
  if (!method || method.type !== 'crypto') {
    sendError(response, 400, 'invalid_payment_type', 'Manual payment confirmation is only available for crypto payments')
    return
  }

  if (!['ready_for_payment', 'payment_pending'].includes(order.status) || !['pending', 'processing'].includes(payment.status)) {
    sendError(response, 400, 'invalid_order_status', 'Order is not eligible for manual payment confirmation')
    return
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'processing' },
    })
    await tx.orderStatusHistory.create({
      data: { orderId, status: 'payment_pending', comment: 'Customer requested manual crypto payment review' },
    })

    return tx.order.update({
      where: { id: orderId },
      data: { status: 'payment_pending', paymentStatus: 'processing' },
      include: ORDER_INCLUDE,
    })
  })

  response.json({ order: updated })
})

export default router
