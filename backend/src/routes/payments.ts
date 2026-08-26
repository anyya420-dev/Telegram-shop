import { Router } from 'express'
import {
  authRateLimiter,
  getAuthorizedUser,
  parsePositiveInt,
  prisma,
  sendError,
} from '../lib.js'
import {
  createOrRefreshOrderPayment,
  expirePaymentIfNeeded,
  getJsonMetadata,
  getStripeWebhookSecret,
  readStripeSignature,
  sanitizePayment,
  sanitizePaymentMethod,
  verifyStripeWebhookSignature,
} from '../services/payments.js'

const router = Router()

const PAYMENT_INCLUDE = {
  paymentMethod: true,
  order: {
    include: {
      user: { select: { id: true, telegramId: true, firstName: true, username: true } },
      city: true,
      items: true,
      paymentMethod: true,
    },
  },
}

router.get('/methods', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const methods = await prisma.paymentMethod.findMany({
    where: { isEnabled: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })

  response.json({ methods: methods.map(sanitizePaymentMethod) })
})

router.post('/orders/:orderId/session', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const orderId = parsePositiveInt(request.params.orderId)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: { deliveryOption: true },
  })
  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }
  if (!order.paymentMethodId) {
    sendError(response, 400, 'payment_method_missing', 'Payment method is not set for this order')
    return
  }
  if (order.paymentStatus === 'paid') {
    sendError(response, 400, 'payment_already_paid', 'Order is already paid')
    return
  }
  if (!order.deliveryPriceConfirmed && order.deliveryOption?.type === 'delivery') {
    sendError(response, 400, 'delivery_price_required', 'Delivery price must be confirmed before payment')
    return
  }

  const method = await prisma.paymentMethod.findFirst({
    where: { id: order.paymentMethodId, isEnabled: true },
  })
  if (!method) {
    sendError(response, 400, 'payment_method_unavailable', 'Selected payment method is unavailable')
    return
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await createOrRefreshOrderPayment(tx, order, method)
      const withMethod = await tx.payment.findUniqueOrThrow({
        where: { id: created.id },
        include: { paymentMethod: true },
      })
      return expirePaymentIfNeeded(tx, withMethod)
    })

    response.status(201).json({ payment: sanitizePayment(payment) })
  } catch (error) {
    sendError(
      response,
      503,
      'payment_provider_unavailable',
      error instanceof Error ? error.message : 'Payment provider is unavailable',
    )
  }
})

router.get('/:paymentId', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const paymentId = parsePositiveInt(request.params.paymentId)
  if (!paymentId) {
    sendError(response, 400, 'invalid_id', 'Invalid payment id')
    return
  }

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, order: { userId: user.id } },
    include: { paymentMethod: true },
  })
  if (!payment) {
    sendError(response, 404, 'not_found', 'Payment not found')
    return
  }

  const nextPayment = await expirePaymentIfNeeded(prisma, payment)
  const withMethod = nextPayment.id === payment.id && nextPayment.status === payment.status
    ? payment
    : await prisma.payment.findUniqueOrThrow({ where: { id: nextPayment.id }, include: { paymentMethod: true } })

  response.json({ payment: sanitizePayment(withMethod) })
})

router.post('/:paymentId/crypto/submit', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const paymentId = parsePositiveInt(request.params.paymentId)
  if (!paymentId) {
    sendError(response, 400, 'invalid_id', 'Invalid payment id')
    return
  }

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, order: { userId: user.id } },
    include: { paymentMethod: true },
  })
  if (!payment) {
    sendError(response, 404, 'not_found', 'Payment not found')
    return
  }
  if (payment.paymentMethod.type !== 'crypto') {
    sendError(response, 400, 'invalid_payment_type', 'This endpoint only supports crypto payments')
    return
  }

  const current = await expirePaymentIfNeeded(prisma, payment)
  if (current.status === 'expired') {
    sendError(response, 400, 'payment_expired', 'Payment has expired')
    return
  }
  if (!['pending', 'processing'].includes(current.status)) {
    sendError(response, 400, 'invalid_payment_state', 'Payment cannot be updated in the current state')
    return
  }

  const transactionHash = typeof request.body.transactionHash === 'string' ? request.body.transactionHash.trim() : ''
  const senderAddress = typeof request.body.senderAddress === 'string' ? request.body.senderAddress.trim() : ''
  const tonConnectBoc = typeof request.body.tonConnectBoc === 'string' ? request.body.tonConnectBoc.trim() : ''
  if (!transactionHash && !tonConnectBoc) {
    sendError(response, 400, 'transaction_reference_required', 'A transaction hash or TON Connect payload is required')
    return
  }
  if (transactionHash && !/^[A-Za-z0-9:_-]{16,200}$/.test(transactionHash)) {
    sendError(response, 400, 'invalid_transaction_hash', 'Transaction hash format is invalid')
    return
  }
  if (transactionHash) {
    const existing = await prisma.payment.findFirst({
      where: { transactionHash, id: { not: payment.id } },
      select: { id: true },
    })
    if (existing) {
      sendError(response, 409, 'transaction_already_used', 'Transaction hash has already been used')
      return
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'processing',
        transactionHash: transactionHash || payment.transactionHash,
        senderAddress: senderAddress || payment.senderAddress,
        metadata: JSON.stringify({
          ...(getJsonMetadata(payment.metadata) ?? {}),
          tonConnectBoc: tonConnectBoc || undefined,
          submittedByCustomerAt: new Date().toISOString(),
        }),
      },
      include: { paymentMethod: true },
    })

    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'processing', status: 'payment_pending' },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.orderId,
        status: 'payment_pending',
        comment: 'Customer submitted crypto payment for verification',
      },
    })

    return nextPayment
  })

  response.json({ payment: sanitizePayment(updated) })
})

router.post('/webhooks/stripe', authRateLimiter, async (request, response) => {
  const payload = (request as { rawBody?: Buffer }).rawBody
  if (!payload) {
    sendError(response, 400, 'invalid_payload', 'Webhook payload is missing')
    return
  }

  const signature = readStripeSignature(request)
  const mode = request.query.mode === 'live' ? 'live' : 'test'
  const secret = getStripeWebhookSecret(mode)
  if (!secret) {
    sendError(response, 503, 'webhook_secret_missing', 'Webhook secret is not configured')
    return
  }
  if (!verifyStripeWebhookSignature(payload, signature, secret)) {
    sendError(response, 400, 'invalid_signature', 'Invalid webhook signature')
    return
  }

  const event = JSON.parse(payload.toString('utf8')) as {
    type?: string
    data?: { object?: { id?: string; payment_intent?: string; metadata?: { paymentId?: string } } }
  }

  const object = event.data?.object
  const paymentId = parsePositiveInt(object?.metadata?.paymentId)
  if (!paymentId) {
    sendError(response, 400, 'invalid_payment_reference', 'Webhook payment reference is missing')
    return
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) {
    sendError(response, 404, 'not_found', 'Payment not found')
    return
  }

  if (event.type === 'checkout.session.completed') {
    if (payment.status === 'paid') {
      response.json({ ok: true, duplicated: true })
      return
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'paid',
          paidAt: new Date(),
          providerSessionId: object?.id ?? payment.providerSessionId,
          providerPaymentId: object?.payment_intent ?? payment.providerPaymentId,
        },
      })
      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'paid', status: 'processing' },
      })
      await tx.orderStatusHistory.create({
        data: { orderId: payment.orderId, status: 'processing', comment: 'Stripe payment verified' },
      })
    })

    response.json({ ok: true })
    return
  }

  if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
    if (!['paid', 'refunded'].includes(payment.status)) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: event.type === 'checkout.session.expired' ? 'expired' : 'failed',
          failureReason: event.type,
          providerSessionId: object?.id ?? payment.providerSessionId,
          providerPaymentId: object?.payment_intent ?? payment.providerPaymentId,
        },
      })
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: event.type === 'checkout.session.expired' ? 'expired' : 'failed' },
      })
    }

    response.json({ ok: true })
    return
  }

  response.json({ ok: true, ignored: true })
})

export default router
