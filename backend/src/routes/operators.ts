import { Router } from 'express'
import type { Request, Response } from 'express'
import {
  authRateLimiter,
  getTelegramInitDataBotTokens,
  normalizeQuantity,
  parsePositiveInt,
  prisma,
  sendError,
  verifyTelegramInitDataWithAnyBotToken,
} from '../lib.js'

const router = Router()

const ORDER_INCLUDE = {
  items: true,
  city: true,
  user: {
    select: {
      id: true,
      telegramId: true,
      firstName: true,
      username: true,
    },
  },
  deliveryOption: true,
  paymentMethod: true,
  discount: true,
  operator: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
}

async function getAuthorizedOperator(request: Request, response: Response) {
  const directTelegramId = request.header('x-telegram-user-id')?.trim()
  const initDataHeader = request.header('x-telegram-init-data')?.trim()
  const initDataBody = typeof request.body?.initData === 'string' ? request.body.initData.trim() : ''
  const initData = initDataHeader || initDataBody

  let telegramId = directTelegramId || ''

  if (initData) {
    const botTokens = await getTelegramInitDataBotTokens()

    if (botTokens.length === 0) {
      sendError(response, 503, 'telegram_bot_token_required', 'Telegram bot token is required for Web App verification')
      return null
    }

    const telegramUser = verifyTelegramInitDataWithAnyBotToken(initData, botTokens)
    if (!telegramUser) {
      sendError(response, 401, 'telegram_verification_failed', 'Telegram init data verification failed')
      return null
    }

    telegramId = String(telegramUser.id)
  }

  if (!telegramId) {
    sendError(response, 401, 'telegram_auth_required', 'Telegram init data or Telegram user id header is required')
    return null
  }

  const operator = await prisma.operator.findFirst({
    where: {
      telegramId,
      isActive: true,
    },
  })

  if (!operator) {
    sendError(response, 403, 'operator_access_denied', 'Operator access denied')
    return null
  }

  return operator
}

router.use(authRateLimiter)

router.get('/', async (request, response) => {
  const operator = await getAuthorizedOperator(request, response)
  if (!operator) return

  const orders = await prisma.order.findMany({
    where: {
      operatorId: operator.id,
      status: {
        notIn: ['delivered', 'cancelled'],
      },
    },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })

  response.json({ orders })
})

router.get('/pending', async (request, response) => {
  const operator = await getAuthorizedOperator(request, response)
  if (!operator) return

  const orders = await prisma.order.findMany({
    where: {
      status: 'confirmed',
      operatorId: null,
    },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })

  response.json({ orders })
})

router.post('/orders/:id/accept', async (request, response) => {
  const operator = await getAuthorizedOperator(request, response)
  if (!operator) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, operatorId: true, status: true },
  })

  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }

  if (order.status !== 'confirmed') {
    sendError(response, 400, 'order_unavailable', 'Only confirmed orders can be accepted')
    return
  }

  if (order.operatorId) {
    sendError(response, 409, 'order_already_assigned', 'Order is already assigned to an operator')
    return
  }

  const updatedCount = await prisma.order.updateMany({
    where: {
      id: orderId,
      operatorId: null,
      status: 'confirmed',
    },
    data: {
      operatorId: operator.id,
    },
  })

  if (updatedCount.count !== 1) {
    sendError(response, 409, 'order_already_assigned', 'Order is already assigned to an operator')
    return
  }

  const updated = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: ORDER_INCLUDE,
  })

  response.json({ order: updated })
})

router.patch('/orders/:id/delivery-price', async (request, response) => {
  const operator = await getAuthorizedOperator(request, response)
  if (!operator) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const deliveryPrice = typeof request.body.deliveryPrice === 'number'
    ? request.body.deliveryPrice
    : Number(request.body.deliveryPrice)

  if (!Number.isFinite(deliveryPrice) || deliveryPrice < 0) {
    sendError(response, 400, 'invalid_delivery_price', 'Delivery price must be a non-negative number')
    return
  }

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      operatorId: operator.id,
    },
    include: {
      deliveryOption: true,
    },
  })

  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }

  const normalizedDeliveryPrice = normalizeQuantity(deliveryPrice)
  const total = normalizeQuantity(Math.max(0, order.subtotal - order.discountAmount + normalizedDeliveryPrice))

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      operatorDeliveryPrice: normalizedDeliveryPrice,
      deliveryPriceConfirmed: true,
      deliveryFee: normalizedDeliveryPrice,
      total,
    },
    include: ORDER_INCLUDE,
  })

  response.json({ order: updated, message: 'Delivery price confirmed' })
})

router.get('/orders/:id', async (request, response) => {
  const operator = await getAuthorizedOperator(request, response)
  if (!operator) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      operatorId: operator.id,
    },
    include: ORDER_INCLUDE,
  })

  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }

  response.json({ order })
})

export default router
