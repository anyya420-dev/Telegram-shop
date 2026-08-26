import { Router } from 'express'
import { authRateLimiter, mapCity, mapProduct, parsePositiveInt, prisma, sendError } from '../lib.js'
import type { CookieOptions, Request, Response } from 'express'
import { notifyOrderStatusChange } from '../services/notifier.js'
import {
  createAdminSession,
  ensureBootstrapPasswordFromEnv,
  getActiveAdminSession,
  revokeAdminSession,
  verifyAdminPassword,
} from '../services/adminSession.js'

const router = Router()
const ADMIN_SESSION_COOKIE_NAME = 'tg_shop_admin_session'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const PAYMENT_TYPES = ['card', 'ton', 'crypto'] as const
const ORDER_STATUSES = ['pending', 'payment_pending', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled'] as const
const DELIVERY_TYPES = ['delivery', 'pickup'] as const

type ProductCityInput = {
  cityId: number
  stock: number
  isAvailable: boolean
  minimumQuantity: number
  quantityStep: number
  maximumQuantity: number
  unit: string
}

type ProductCityValidationResult =
  | { value: ProductCityInput }
  | { error: { code: string; message: string } }

function isOrderStatus(value: string): value is (typeof ORDER_STATUSES)[number] {
  return ORDER_STATUSES.includes(value as (typeof ORDER_STATUSES)[number])
}

function isDeliveryType(value: string): value is (typeof DELIVERY_TYPES)[number] {
  return DELIVERY_TYPES.includes(value as (typeof DELIVERY_TYPES)[number])
}

function getAdminCookieOptions() {
  const sameSite: CookieOptions['sameSite'] = IS_PRODUCTION ? 'none' : 'lax'
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite,
    path: '/api/admin',
  }
}

function parseCookie(request: Request, name: string) {
  const rawCookie = request.header('cookie') ?? ''
  if (!rawCookie) return ''
  for (const cookie of rawCookie.split(';')) {
    const [key, ...valueParts] = cookie.trim().split('=')
    if (key === name) {
      return decodeURIComponent(valueParts.join('=') || '')
    }
  }
  return ''
}

function writeAdminCookie(response: Response, token: string, expiresAt: Date) {
  response.cookie(ADMIN_SESSION_COOKIE_NAME, token, {
    ...getAdminCookieOptions(),
    expires: expiresAt,
  })
}

function clearAdminCookie(response: Response) {
  response.clearCookie(ADMIN_SESSION_COOKIE_NAME, {
    ...getAdminCookieOptions(),
  })
}

type AdminContext = { id: number | null }

function getTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getOptionalTrimmedString(value: unknown) {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || null
}

function getFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getNonNegativeNumber(value: unknown) {
  const parsed = getFiniteNumber(value)
  return parsed != null && parsed >= 0 ? parsed : null
}

function getPositiveNumber(value: unknown) {
  const parsed = getFiniteNumber(value)
  return parsed != null && parsed > 0 ? parsed : null
}

function getPositiveInteger(value: unknown) {
  const parsed = getFiniteNumber(value)
  return parsed != null && Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function validateProductCityPayload(input: unknown): ProductCityValidationResult {
  const cityId = parsePositiveInt(String((input as Record<string, unknown>)?.cityId ?? ''))
  const stock = getNonNegativeNumber((input as Record<string, unknown>)?.stock) ?? 0
  const minimumQuantity = getPositiveInteger((input as Record<string, unknown>)?.minimumQuantity) ?? 1
  const quantityStep = getPositiveInteger((input as Record<string, unknown>)?.quantityStep) ?? 1
  const maximumQuantity = getPositiveInteger((input as Record<string, unknown>)?.maximumQuantity) ?? Math.max(stock, minimumQuantity)
  const unit = getTrimmedString((input as Record<string, unknown>)?.unit) || 'pcs'
  const isAvailable = typeof (input as Record<string, unknown>)?.isAvailable === 'boolean'
    ? Boolean((input as Record<string, unknown>)?.isAvailable)
    : true

  if (!cityId) {
    return { error: { code: 'city_required', message: 'Valid city id is required' } } as const
  }
  if (maximumQuantity < minimumQuantity) {
    return { error: { code: 'quantity_invalid', message: 'Maximum quantity must be greater than or equal to minimum quantity' } } as const
  }
  if ((maximumQuantity - minimumQuantity) % quantityStep !== 0) {
    return { error: { code: 'quantity_invalid', message: 'Quantity step must match the minimum and maximum quantity range' } } as const
  }
  if (stock > 0 && minimumQuantity > stock) {
    return { error: { code: 'quantity_invalid', message: 'Minimum quantity cannot exceed stock' } } as const
  }
  if (stock > 0 && maximumQuantity > stock) {
    return { error: { code: 'quantity_invalid', message: 'Maximum quantity cannot exceed stock' } } as const
  }

  return {
    value: {
      cityId,
      stock,
      isAvailable,
      minimumQuantity,
      quantityStep,
      maximumQuantity,
      unit,
    } satisfies ProductCityInput,
  } as const
}

async function ensureCategoryExists(categoryId: number) {
  return prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } })
}

async function ensureCityIdsExist(cityIds: number[]) {
  if (cityIds.length === 0) return true
  const cities = await prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true } })
  return cities.length === cityIds.length
}

async function ensureProductExists(productId: number) {
  return prisma.product.findUnique({ where: { id: productId }, select: { id: true } })
}

async function getAdminUser(request: Request, response: Response) {
  const token = parseCookie(request, ADMIN_SESSION_COOKIE_NAME)
  const session = await getActiveAdminSession(token)
  if (!session) {
    clearAdminCookie(response)
    sendError(response, 401, 'admin_auth_required', 'Admin authentication required')
    return null
  }

  return { id: session.id } satisfies AdminContext
}

router.post('/auth/login', authRateLimiter, async (request, response) => {
  await ensureBootstrapPasswordFromEnv()

  const password = typeof request.body.password === 'string' ? request.body.password : ''
  if (!password) {
    sendError(response, 400, 'invalid_credentials', 'Administrator password is required')
    return
  }

  const result = await verifyAdminPassword(password)
  if (!result.valid) {
    if (result.reason === 'configuration_error') {
      sendError(response, 503, 'configuration_error', 'Admin password is not configured on the server')
      return
    }
    sendError(response, 401, 'invalid_credentials', 'Invalid administrator credentials')
    return
  }

  const session = await createAdminSession()
  writeAdminCookie(response, session.token, session.expiresAt)
  response.json({ ok: true })
})

router.post('/auth/logout', authRateLimiter, async (request, response) => {
  const token = parseCookie(request, ADMIN_SESSION_COOKIE_NAME)
  await revokeAdminSession(token)
  clearAdminCookie(response)
  response.json({ ok: true })
})

router.get('/auth/status', authRateLimiter, async (request, response) => {
  const token = parseCookie(request, ADMIN_SESSION_COOKIE_NAME)
  const session = await getActiveAdminSession(token)
  if (!session) {
    clearAdminCookie(response)
    sendError(response, 401, 'admin_auth_required', 'Admin authentication required')
    return
  }

  response.json({ authenticated: true })
})

// ──── Orders ────────────────────────────────────────────────────────────────

// GET /api/admin/orders
router.get('/orders', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const page = Math.max(1, Number(request.query.page) || 1)
  const limit = 30
  const status = typeof request.query.status === 'string' ? request.query.status : undefined

  const where = status ? { status } : {}

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: true,
        city: true,
        user: { select: { id: true, firstName: true, username: true, telegramId: true } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        paymentMethod: true,
        deliveryOption: true,
        discount: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ])

  response.json({ orders, total, page, pages: Math.ceil(total / limit) })
})

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const status = typeof request.body.status === 'string' ? request.body.status : ''
  if (!isOrderStatus(status)) {
    sendError(response, 400, 'invalid_status', `Status must be one of: ${ORDER_STATUSES.join(', ')}`)
    return
  }

  const comment = typeof request.body.comment === 'string' ? request.body.comment.trim() : undefined

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } })
  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderStatusHistory.create({
      data: { orderId, status, comment: comment || null },
    })
    return tx.order.update({
      where: { id: orderId },
      data: { status },
      include: {
        items: true,
        city: true,
        user: { select: { id: true, firstName: true, username: true, telegramId: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        paymentMethod: true,
        deliveryOption: true,
        discount: true,
      },
    })
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'order_status_changed',
      entity: 'order',
      entityId: orderId,
      meta: JSON.stringify({ from: order.status, to: status }),
    },
  })

  // Notify the customer via Telegram bot
  notifyOrderStatusChange(order.user.telegramId, orderId, status)

  response.json({ order: updated })
})

router.patch('/orders/:id/payment', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const action = typeof request.body.action === 'string' ? request.body.action : ''
  if (!['confirm', 'reject'].includes(action)) {
    sendError(response, 400, 'invalid_action', 'action must be confirm or reject')
    return
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }

  if (order.status !== 'payment_pending' || order.paymentStatus !== 'pending') {
    sendError(response, 400, 'invalid_payment_state', 'Order payment is not pending')
    return
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (action === 'confirm') {
      await tx.orderStatusHistory.create({
        data: { orderId, status: 'confirmed', comment: 'Payment confirmed by admin' },
      })
      return tx.order.update({
        where: { id: orderId },
        data: { status: 'confirmed', paymentStatus: 'confirmed' },
        include: {
          items: true,
          city: true,
          user: { select: { id: true, firstName: true, username: true, telegramId: true } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
          paymentMethod: true,
          deliveryOption: true,
          discount: true,
        },
      })
    }

    await tx.orderStatusHistory.create({
      data: { orderId, status: 'pending', comment: 'Payment rejected by admin' },
    })
    return tx.order.update({
      where: { id: orderId },
      data: { status: 'pending', paymentStatus: 'rejected' },
      include: {
        items: true,
        city: true,
        user: { select: { id: true, firstName: true, username: true, telegramId: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        paymentMethod: true,
        deliveryOption: true,
        discount: true,
      },
    })
  })

  response.json({ order: updated })
})

router.get('/payment-settings', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const methods = await prisma.paymentMethod.findMany({ orderBy: [{ type: 'asc' }, { id: 'asc' }] })
  response.json({ methods })
})

router.post('/payment-settings', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const type = typeof request.body.type === 'string' ? request.body.type.trim().toLowerCase() : ''
  if (!PAYMENT_TYPES.includes(type as (typeof PAYMENT_TYPES)[number])) {
    sendError(response, 400, 'invalid_type', 'type must be card, ton or crypto')
    return
  }

  const title = typeof request.body.title === 'string' ? request.body.title.trim() : ''
  if (!title) {
    sendError(response, 400, 'title_required', 'title is required')
    return
  }

  const isEnabled = typeof request.body.isEnabled === 'boolean' ? request.body.isEnabled : true
  const cardNumber = typeof request.body.cardNumber === 'string' ? request.body.cardNumber.trim() : null
  const cardholderName = typeof request.body.cardholderName === 'string' ? request.body.cardholderName.trim() : null
  const currency = typeof request.body.currency === 'string' ? request.body.currency.trim().toUpperCase() : null
  const network = typeof request.body.network === 'string' ? request.body.network.trim() : null
  const walletAddress = typeof request.body.walletAddress === 'string' ? request.body.walletAddress.trim() : null

  if (type === 'card') {
    if (!cardNumber || !currency) {
      sendError(response, 400, 'invalid_payment_settings', 'card_number and currency are required for card payments')
      return
    }
  }
  if (type === 'ton') {
    if (!walletAddress || !network) {
      sendError(response, 400, 'invalid_payment_settings', 'wallet_address and network are required for TON payments')
      return
    }
  }
  if (type === 'crypto') {
    if (!walletAddress || !network || !currency) {
      sendError(response, 400, 'invalid_payment_settings', 'currency, network and wallet_address are required for crypto payments')
      return
    }
  }

  const method = await prisma.paymentMethod.create({
    data: {
      type,
      title,
      cardNumber,
      cardholderName,
      currency,
      network,
      walletAddress,
      isEnabled,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'payment_method_created',
      entity: 'payment_method',
      entityId: method.id,
      meta: JSON.stringify({ type, title }),
    },
  })

  response.status(201).json({ method })
})

router.patch('/payment-settings/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const id = parsePositiveInt(request.params.id)
  if (!id) {
    sendError(response, 400, 'invalid_id', 'Invalid id')
    return
  }

  const existing = await prisma.paymentMethod.findUnique({ where: { id } })
  if (!existing) {
    sendError(response, 404, 'not_found', 'Payment method not found')
    return
  }

  const data: Record<string, string | boolean | null> = {}
  if (typeof request.body.title === 'string') data.title = request.body.title.trim()
  if (typeof request.body.cardNumber === 'string') data.cardNumber = request.body.cardNumber.trim()
  if (typeof request.body.cardholderName === 'string') data.cardholderName = request.body.cardholderName.trim()
  if (typeof request.body.currency === 'string') data.currency = request.body.currency.trim().toUpperCase()
  if (typeof request.body.network === 'string') data.network = request.body.network.trim()
  if (typeof request.body.walletAddress === 'string') data.walletAddress = request.body.walletAddress.trim()
  if (typeof request.body.isEnabled === 'boolean') data.isEnabled = request.body.isEnabled

  const next = { ...existing, ...data }
  if (next.type === 'card' && (!next.cardNumber || !next.currency)) {
    sendError(response, 400, 'invalid_payment_settings', 'card_number and currency are required for card payments')
    return
  }
  if (next.type === 'ton' && (!next.walletAddress || !next.network)) {
    sendError(response, 400, 'invalid_payment_settings', 'wallet_address and network are required for TON payments')
    return
  }
  if (next.type === 'crypto' && (!next.walletAddress || !next.network || !next.currency)) {
    sendError(response, 400, 'invalid_payment_settings', 'currency, network and wallet_address are required for crypto payments')
    return
  }

  const method = await prisma.paymentMethod.update({ where: { id }, data })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'payment_method_updated',
      entity: 'payment_method',
      entityId: id,
      meta: JSON.stringify(data),
    },
  })

  response.json({ method })
})

router.delete('/payment-settings/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const id = parsePositiveInt(request.params.id)
  if (!id) {
    sendError(response, 400, 'invalid_id', 'Invalid id')
    return
  }

  const method = await prisma.paymentMethod.findUnique({ where: { id } })
  if (!method) {
    sendError(response, 404, 'not_found', 'Payment method not found')
    return
  }

  await prisma.paymentMethod.delete({ where: { id } })
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'payment_method_deleted',
      entity: 'payment_method',
      entityId: id,
      meta: JSON.stringify({ type: method.type, title: method.title }),
    },
  })

  response.json({ ok: true })
})

router.patch('/payment-settings/:id/toggle', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const id = parsePositiveInt(request.params.id)
  if (!id) {
    sendError(response, 400, 'invalid_id', 'Invalid id')
    return
  }

  const method = await prisma.paymentMethod.findUnique({ where: { id } })
  if (!method) {
    sendError(response, 404, 'not_found', 'Payment method not found')
    return
  }

  const updated = await prisma.paymentMethod.update({
    where: { id },
    data: { isEnabled: !method.isEnabled },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'payment_method_toggled',
      entity: 'payment_method',
      entityId: id,
      meta: JSON.stringify({ isEnabled: updated.isEnabled }),
    },
  })

  response.json({ method: updated })
})

// PATCH /api/admin/orders/:id/refund
router.patch('/orders/:id/refund', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const orderId = parsePositiveInt(request.params.id)
  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }

  const refundStatus = typeof request.body.refundStatus === 'string' ? request.body.refundStatus : ''
  if (!['approved', 'rejected'].includes(refundStatus)) {
    sendError(response, 400, 'invalid_status', 'refundStatus must be approved or rejected')
    return
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } })
  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }
  if (!['delivered', 'cancelled'].includes(order.status)) {
    sendError(response, 400, 'cannot_refund', 'Refunds are only allowed for delivered or cancelled orders')
    return
  }
  if (!order.refundStatus || order.refundStatus !== 'requested') {
    sendError(response, 400, 'refund_not_requested', 'The customer has not requested a refund for this order')
    return
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (refundStatus === 'approved') {
      // Return balance to user
      const balance = await tx.balance.upsert({
        where: { userId: order.userId },
        create: { userId: order.userId, amount: 0 },
        update: {},
      })
      await tx.balanceTransaction.create({
        data: {
          balanceId: balance.id,
          type: 'refund',
          amount: order.total,
          comment: `Refund for order #${orderId}`,
        },
      })
      await tx.balance.update({
        where: { id: balance.id },
        data: { amount: { increment: order.total } },
      })
    }

    return tx.order.update({
      where: { id: orderId },
      data: { refundStatus, refundAt: new Date() },
    })
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: `refund_${refundStatus}`,
      entity: 'order',
      entityId: orderId,
      meta: JSON.stringify({ total: order.total }),
    },
  })

  response.json({ order: updated })
})

// ──── Products ────────────────────────────────────────────────────────────────

// GET /api/admin/products
router.get('/products', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const products = await prisma.product.findMany({
    include: { category: true, productCities: { include: { city: true } } },
    orderBy: { id: 'desc' },
  })

  response.json({ products })
})

// PATCH /api/admin/products/:id
router.patch('/products/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const productId = parsePositiveInt(request.params.id)
  if (!productId) {
    sendError(response, 400, 'invalid_id', 'Invalid product id')
    return
  }

  const existingProduct = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  })
  if (!existingProduct) {
    sendError(response, 404, 'product_not_found', 'Product not found')
    return
  }

  const { name, nameEn, description, descriptionEn, price, image, categoryId, isActive, isRecommended } = request.body

  const data: Record<string, unknown> = {}
  if (typeof name === 'string') {
    const trimmedName = getTrimmedString(name)
    if (!trimmedName) {
      sendError(response, 400, 'name_required', 'Product name is required')
      return
    }
    data.name = trimmedName
  }
  if (typeof nameEn === 'string' || nameEn === null) data.nameEn = getOptionalTrimmedString(nameEn)
  if (typeof description === 'string') data.description = description.trim()
  if (typeof descriptionEn === 'string' || descriptionEn === null) data.descriptionEn = getOptionalTrimmedString(descriptionEn)
  if (image !== undefined) {
    if (typeof image !== 'string' && image !== null) {
      sendError(response, 400, 'invalid_image', 'Invalid image value')
      return
    }
    data.image = getOptionalTrimmedString(image)
  }
  if (price !== undefined) {
    const parsedPrice = getPositiveNumber(price)
    if (parsedPrice == null) {
      sendError(response, 400, 'price_required', 'Price must be a positive number')
      return
    }
    data.price = parsedPrice
  }
  if (categoryId !== undefined) {
    const parsedCategoryId = parsePositiveInt(String(categoryId))
    if (!parsedCategoryId) {
      sendError(response, 400, 'category_required', 'Valid category id is required')
      return
    }
    const categoryExists = await ensureCategoryExists(parsedCategoryId)
    if (!categoryExists) {
      sendError(response, 404, 'category_not_found', 'Category not found')
      return
    }
    data.categoryId = parsedCategoryId
  }
  if (typeof isActive === 'boolean') data.isActive = isActive
  if (typeof isRecommended === 'boolean') data.isRecommended = isRecommended

  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid fields to update')
    return
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data,
    include: { category: true, productCities: { include: { city: true } } },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'product_updated',
      entity: 'product',
      entityId: productId,
      meta: JSON.stringify(data),
    },
  })

  response.json({ product })
})

// PATCH /api/admin/product-cities/:id - update stock / availability
router.patch('/product-cities/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const id = parsePositiveInt(request.params.id)
  if (!id) {
    sendError(response, 400, 'invalid_id', 'Invalid id')
    return
  }

  const existingProductCity = await prisma.productCity.findUnique({
    where: { id },
    include: { city: true },
  })
  if (!existingProductCity) {
    sendError(response, 404, 'product_not_found', 'Product city record not found')
    return
  }

  const { stock, isAvailable, minimumQuantity, quantityStep, maximumQuantity, unit } = request.body
  const data: Record<string, unknown> = {}
  if (stock !== undefined) {
    const parsedStock = getNonNegativeNumber(stock)
    if (parsedStock == null) {
      sendError(response, 400, 'invalid_stock', 'Stock must be zero or greater')
      return
    }
    data.stock = parsedStock
  }
  if (typeof isAvailable === 'boolean') data.isAvailable = isAvailable
  if (minimumQuantity !== undefined) {
    const parsedMinimumQuantity = getPositiveInteger(minimumQuantity)
    if (parsedMinimumQuantity == null) {
      sendError(response, 400, 'quantity_invalid', 'Minimum quantity must be a positive integer')
      return
    }
    data.minimumQuantity = parsedMinimumQuantity
  }
  if (quantityStep !== undefined) {
    const parsedQuantityStep = getPositiveInteger(quantityStep)
    if (parsedQuantityStep == null) {
      sendError(response, 400, 'quantity_invalid', 'Quantity step must be a positive integer')
      return
    }
    data.quantityStep = parsedQuantityStep
  }
  if (maximumQuantity !== undefined) {
    const parsedMaximumQuantity = getPositiveInteger(maximumQuantity)
    if (parsedMaximumQuantity == null) {
      sendError(response, 400, 'quantity_invalid', 'Maximum quantity must be a positive integer')
      return
    }
    data.maximumQuantity = parsedMaximumQuantity
  }
  if (unit !== undefined) {
    if (typeof unit !== 'string' || !unit.trim()) {
      sendError(response, 400, 'unit_required', 'Unit is required')
      return
    }
    data.unit = unit.trim()
  }

  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid fields to update')
    return
  }

  const nextStock = (data.stock as number | undefined) ?? existingProductCity.stock
  const nextMinimumQuantity = (data.minimumQuantity as number | undefined) ?? existingProductCity.minimumQuantity
  const nextQuantityStep = (data.quantityStep as number | undefined) ?? existingProductCity.quantityStep
  const nextMaximumQuantity = (data.maximumQuantity as number | undefined) ?? existingProductCity.maximumQuantity

  if (nextMaximumQuantity < nextMinimumQuantity) {
    sendError(response, 400, 'quantity_invalid', 'Maximum quantity must be greater than or equal to minimum quantity')
    return
  }
  if ((nextMaximumQuantity - nextMinimumQuantity) % nextQuantityStep !== 0) {
    sendError(response, 400, 'quantity_invalid', 'Quantity step must match the minimum and maximum quantity range')
    return
  }
  if (nextStock > 0 && nextMinimumQuantity > nextStock) {
    sendError(response, 400, 'quantity_invalid', 'Minimum quantity cannot exceed stock')
    return
  }
  if (nextStock > 0 && nextMaximumQuantity > nextStock) {
    sendError(response, 400, 'quantity_invalid', 'Maximum quantity cannot exceed stock')
    return
  }

  const pc = await prisma.productCity.update({ where: { id }, data, include: { city: true } })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'product_city_updated',
      entity: 'product_city',
      entityId: id,
      meta: JSON.stringify(data),
    },
  })

  response.json({ productCity: pc })
})

// ──── Users ────────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const page = Math.max(1, Number(request.query.page) || 1)
  const limit = 50

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      include: { selectedCity: true, balance: true, _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count(),
  ])

  response.json({
    users: users.map((user) => ({
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      selectedCityId: user.selectedCityId,
      selectedCity: user.selectedCity ? mapCity(user.selectedCity) : null,
      language: user.language,
      balance: user.balance?.amount ?? null,
      orderCount: user._count.orders,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  })
})

// ──── Discounts ────────────────────────────────────────────────────────────────

// GET /api/admin/discounts
router.get('/discounts', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const discounts = await prisma.discount.findMany({ orderBy: { createdAt: 'desc' } })
  response.json({ discounts })
})

// POST /api/admin/discounts
router.post('/discounts', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const { code, type, value, minOrderAmount, usageLimit, isActive, expiresAt } = request.body

  if (!code || typeof code !== 'string') {
    sendError(response, 400, 'code_required', 'code is required')
    return
  }

  if (!['percent', 'fixed'].includes(type)) {
    sendError(response, 400, 'invalid_type', 'type must be percent or fixed')
    return
  }

  if (typeof value !== 'number' || value <= 0) {
    sendError(response, 400, 'invalid_value', 'value must be a positive number')
    return
  }

  const discount = await prisma.discount.create({
    data: {
      code: code.trim().toUpperCase(),
      type,
      value,
      minOrderAmount: minOrderAmount ?? 0,
      usageLimit: usageLimit ?? null,
      isActive: isActive ?? true,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'discount_created',
      entity: 'discount',
      entityId: discount.id,
      meta: JSON.stringify({ code: discount.code }),
    },
  })

  response.json({ discount })
})

// PATCH /api/admin/discounts/:id
router.patch('/discounts/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const id = parsePositiveInt(request.params.id)
  if (!id) {
    sendError(response, 400, 'invalid_id', 'Invalid id')
    return
  }

  const { isActive, usageLimit, expiresAt } = request.body
  const data: Record<string, unknown> = {}
  if (typeof isActive === 'boolean') data.isActive = isActive
  if (typeof usageLimit === 'number') data.usageLimit = usageLimit
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null

  const discount = await prisma.discount.update({ where: { id }, data })
  response.json({ discount })
})

// ──── Delivery Options ────────────────────────────────────────────────────────────────

// GET /api/admin/delivery-options
router.get('/delivery-options', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const options = await prisma.deliveryOption.findMany({ orderBy: { sortOrder: 'asc' } })
  response.json({ options })
})

// POST /api/admin/delivery-options
router.post('/delivery-options', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const { name, nameEn, type, price, isActive, sortOrder } = request.body
  const trimmedName = getTrimmedString(name)
  if (!trimmedName) {
    sendError(response, 400, 'name_required', 'name is required')
    return
  }
  if (type !== undefined && !isDeliveryType(type)) {
    sendError(response, 400, 'invalid_type', 'type must be delivery or pickup')
    return
  }
  if (price !== undefined && getNonNegativeNumber(price) == null) {
    sendError(response, 400, 'invalid_price', 'price must be zero or greater')
    return
  }

  const option = await prisma.deliveryOption.create({
    data: {
      name: trimmedName,
      nameEn: getOptionalTrimmedString(nameEn),
      type: type ?? 'delivery',
      price: getNonNegativeNumber(price) ?? 0,
      isActive: isActive ?? true,
      sortOrder: getFiniteNumber(sortOrder) ?? 0,
    },
  })

  response.json({ option })
})

// PATCH /api/admin/delivery-options/:id
router.patch('/delivery-options/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const id = parsePositiveInt(request.params.id)
  if (!id) {
    sendError(response, 400, 'invalid_id', 'Invalid id')
    return
  }

  const existingOption = await prisma.deliveryOption.findUnique({ where: { id }, select: { id: true } })
  if (!existingOption) {
    sendError(response, 404, 'delivery_option_not_found', 'Delivery option not found')
    return
  }

  const { name, nameEn, type, price, isActive, sortOrder } = request.body
  const data: Record<string, unknown> = {}
  if (typeof name === 'string') {
    const trimmedName = getTrimmedString(name)
    if (!trimmedName) {
      sendError(response, 400, 'name_required', 'name is required')
      return
    }
    data.name = trimmedName
  }
  if (typeof nameEn === 'string' || nameEn === null) data.nameEn = getOptionalTrimmedString(nameEn)
  if (type !== undefined) {
    if (!isDeliveryType(type)) {
      sendError(response, 400, 'invalid_type', 'type must be delivery or pickup')
      return
    }
    data.type = type
  }
  if (price !== undefined) {
    const parsedPrice = getNonNegativeNumber(price)
    if (parsedPrice == null) {
      sendError(response, 400, 'invalid_price', 'price must be zero or greater')
      return
    }
    data.price = parsedPrice
  }
  if (typeof isActive === 'boolean') data.isActive = isActive
  if (sortOrder !== undefined) {
    const parsedSortOrder = getFiniteNumber(sortOrder)
    if (parsedSortOrder == null) {
      sendError(response, 400, 'invalid_sort_order', 'Sort order must be a number')
      return
    }
    data.sortOrder = parsedSortOrder
  }

  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid fields to update')
    return
  }

  const option = await prisma.deliveryOption.update({ where: { id }, data })
  response.json({ option })
})

// ──── Support Tickets (admin) ────────────────────────────────────────────────

// GET /api/admin/support
router.get('/support', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const status = typeof request.query.status === 'string' ? request.query.status : undefined
  const where = status ? { status } : {}

  const tickets = await prisma.supportTicket.findMany({
    where,
    include: {
      user: { select: { id: true, firstName: true, username: true, telegramId: true } },
      replies: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  response.json({ tickets })
})

// POST /api/admin/support/:id/reply
router.post('/support/:id/reply', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const ticketId = parsePositiveInt(request.params.id)
  if (!ticketId) {
    sendError(response, 400, 'invalid_id', 'Invalid ticket id')
    return
  }

  const message = typeof request.body.message === 'string' ? request.body.message.trim() : ''
  if (!message) {
    sendError(response, 400, 'message_required', 'message is required')
    return
  }

  await prisma.supportTicketReply.create({ data: { ticketId, isAdmin: true, message } })

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: 'replied' },
    include: {
      user: { select: { id: true, firstName: true, username: true, telegramId: true } },
      replies: { orderBy: { createdAt: 'asc' } },
    },
  })

  response.json({ ticket: updated })
})

// ──── Audit Logs ──────────────────────────────────────────────────────────────

// GET /api/admin/audit-logs
router.get('/audit-logs', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const page = Math.max(1, Number(request.query.page) || 1)
  const limit = 50

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })

  response.json({ logs })
})

// ──── Stats ────────────────────────────────────────────────────────────────

// GET /api/admin/stats
router.get('/stats', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const [totalOrders, pendingOrders, totalUsers, totalRevenue] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: 'pending' } }),
    prisma.user.count(),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: { notIn: ['cancelled'] } },
    }),
  ])

  response.json({
    totalOrders,
    pendingOrders,
    totalUsers,
    totalRevenue: totalRevenue._sum.total ?? 0,
  })
})

// POST /api/admin/products - create a new product
router.post('/products', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const { name, nameEn, description, descriptionEn, price, image, categoryId, isActive, isRecommended, cities } = request.body
  const parsedCategoryId = parsePositiveInt(String(categoryId))

  if (!getTrimmedString(name)) {
    sendError(response, 400, 'name_required', 'Product name is required')
    return
  }
  const parsedPrice = getPositiveNumber(price)
  if (parsedPrice == null) {
    sendError(response, 400, 'price_required', 'Price must be a positive number')
    return
  }
  if (!parsedCategoryId) {
    sendError(response, 400, 'category_required', 'Valid category id is required')
    return
  }
  const categoryExists = await ensureCategoryExists(parsedCategoryId)
  if (!categoryExists) {
    sendError(response, 404, 'category_not_found', 'Category not found')
    return
  }

  const productCities: ProductCityInput[] = []
  if (cities !== undefined) {
    if (!Array.isArray(cities)) {
      sendError(response, 400, 'invalid_cities', 'Cities must be an array')
      return
    }

    const seenCityIds = new Set<number>()
    for (const cityEntry of cities) {
      const parsedCity = validateProductCityPayload(cityEntry)
      if ('error' in parsedCity) {
        sendError(response, 400, parsedCity.error.code, parsedCity.error.message)
        return
      }
      if (seenCityIds.has(parsedCity.value.cityId)) {
        sendError(response, 400, 'duplicate_city', 'Each city can only be assigned once per product')
        return
      }
      seenCityIds.add(parsedCity.value.cityId)
      productCities.push(parsedCity.value)
    }

    const citiesExist = await ensureCityIdsExist(productCities.map((entry) => entry.cityId))
    if (!citiesExist) {
      sendError(response, 404, 'city_not_found', 'One or more selected cities were not found')
      return
    }
  }

  const product = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        name: getTrimmedString(name),
        nameEn: getOptionalTrimmedString(nameEn),
        description: typeof description === 'string' ? description.trim() : '',
        descriptionEn: getOptionalTrimmedString(descriptionEn),
        price: parsedPrice,
        image: getOptionalTrimmedString(image),
        categoryId: parsedCategoryId,
        isActive: typeof isActive === 'boolean' ? isActive : true,
        isRecommended: typeof isRecommended === 'boolean' ? isRecommended : false,
      },
    })

    if (productCities.length > 0) {
      await tx.productCity.createMany({
        data: productCities.map((entry) => ({
          productId: createdProduct.id,
          cityId: entry.cityId,
          stock: entry.stock,
          isAvailable: entry.isAvailable,
          minimumQuantity: entry.minimumQuantity,
          quantityStep: entry.quantityStep,
          maximumQuantity: entry.maximumQuantity,
          unit: entry.unit,
        })),
      })
    }

    return tx.product.findUniqueOrThrow({
      where: { id: createdProduct.id },
      include: { category: true, productCities: { include: { city: true } } },
    })
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'product_created',
      entity: 'product',
      entityId: product.id,
      meta: JSON.stringify({ name: product.name, price: product.price }),
    },
  })

  response.status(201).json({ product })
})

// POST /api/admin/product-cities - add product to an additional city
router.post('/product-cities', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const productId = parsePositiveInt(String(request.body.productId))
  const cityId = parsePositiveInt(String(request.body.cityId))

  if (!productId || !cityId) {
    sendError(response, 400, 'invalid_ids', 'Valid productId and cityId are required')
    return
  }

  const [productExists, cityExists, existing] = await Promise.all([
    ensureProductExists(productId),
    prisma.city.findUnique({ where: { id: cityId }, select: { id: true } }),
    prisma.productCity.findFirst({ where: { productId, cityId } }),
  ])
  if (!productExists) {
    sendError(response, 404, 'product_not_found', 'Product not found')
    return
  }
  if (!cityExists) {
    sendError(response, 404, 'city_not_found', 'City not found')
    return
  }
  if (existing) {
    sendError(response, 409, 'already_exists', 'Product is already available in this city')
    return
  }
  const parsedCityPayload = validateProductCityPayload(request.body)
  if ('error' in parsedCityPayload) {
    sendError(response, 400, parsedCityPayload.error.code, parsedCityPayload.error.message)
    return
  }

  const { stock, isAvailable, minimumQuantity, quantityStep, maximumQuantity, unit } = parsedCityPayload.value
  const pc = await prisma.productCity.create({
    data: {
      productId,
      cityId,
      stock,
      isAvailable,
      minimumQuantity,
      quantityStep,
      maximumQuantity,
      unit,
    },
    include: { city: true },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'product_city_created',
      entity: 'product_city',
      entityId: pc.id,
      meta: JSON.stringify({ productId, cityId }),
    },
  })

  response.status(201).json({ productCity: pc })
})

// ──── Cities ────────────────────────────────────────────────────────────────

// GET /api/admin/cities
router.get('/cities', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const cities = await prisma.city.findMany({
    include: { _count: { select: { users: true, productCities: true, orders: true } } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })

  response.json({ cities: cities.map((city) => mapCity(city)) })
})

// POST /api/admin/cities
router.post('/cities', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const name = getTrimmedString(request.body.name)
  const nameEn = getOptionalTrimmedString(request.body.nameEn)
  const isActive = typeof request.body.isActive === 'boolean' ? request.body.isActive : true
  const sortOrder = getFiniteNumber(request.body.sortOrder) ?? 0

  if (!name) {
    sendError(response, 400, 'invalid_name', 'City name is required')
    return
  }

  const duplicate = await prisma.city.findUnique({ where: { name }, select: { id: true } })
  if (duplicate) {
    sendError(response, 409, 'city_exists', 'City already exists')
    return
  }

  const city = await prisma.city.create({
    data: { name, nameEn, isActive, sortOrder },
    include: { _count: { select: { users: true, productCities: true, orders: true } } },
  })

  await prisma.auditLog.create({
    data: { userId: admin.id, action: 'city_created', entity: 'city', entityId: city.id, meta: JSON.stringify({ name: city.name }) },
  })

  response.status(201).json({ city: mapCity(city) })
})

// PATCH /api/admin/cities/:id
router.patch('/cities/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const id = parsePositiveInt(request.params.id)
  if (!id) {
    sendError(response, 400, 'invalid_id', 'Invalid city id')
    return
  }

  const city = await prisma.city.findUnique({ where: { id }, select: { id: true } })
  if (!city) {
    sendError(response, 404, 'city_not_found', 'City not found')
    return
  }

  const data: Record<string, unknown> = {}
  if (typeof request.body.name === 'string') {
    const name = getTrimmedString(request.body.name)
    if (!name) {
      sendError(response, 400, 'invalid_name', 'City name is required')
      return
    }
    const duplicate = await prisma.city.findFirst({ where: { name, NOT: { id } }, select: { id: true } })
    if (duplicate) {
      sendError(response, 409, 'city_exists', 'City already exists')
      return
    }
    data.name = name
  }
  if (typeof request.body.nameEn === 'string' || request.body.nameEn === null) {
    data.nameEn = getOptionalTrimmedString(request.body.nameEn)
  }
  if (typeof request.body.isActive === 'boolean') data.isActive = request.body.isActive
  if (request.body.sortOrder !== undefined) {
    const nextSortOrder = getFiniteNumber(request.body.sortOrder)
    if (nextSortOrder == null) {
      sendError(response, 400, 'invalid_sort_order', 'Sort order must be a number')
      return
    }
    data.sortOrder = nextSortOrder
  }

  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid fields to update')
    return
  }

  const updatedCity = await prisma.city.update({
    where: { id },
    data,
    include: { _count: { select: { users: true, productCities: true, orders: true } } },
  })

  await prisma.auditLog.create({
    data: { userId: admin.id, action: 'city_updated', entity: 'city', entityId: id, meta: JSON.stringify(data) },
  })

  response.json({ city: mapCity(updatedCity) })
})

// ──── Categories ────────────────────────────────────────────────────────────

// GET /api/admin/categories
router.get('/categories', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { sortOrder: 'asc' },
  })

  response.json({ categories })
})

// POST /api/admin/categories
router.post('/categories', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const { name, nameEn, sortOrder } = request.body
  const trimmedName = getTrimmedString(name)
  if (!trimmedName) {
    sendError(response, 400, 'invalid_name', 'Category name is required')
    return
  }
  const duplicateCategory = await prisma.category.findUnique({ where: { name: trimmedName }, select: { id: true } })
  if (duplicateCategory) {
    sendError(response, 409, 'category_exists', 'Category already exists')
    return
  }

  const category = await prisma.category.create({
    data: {
      name: trimmedName,
      nameEn: getOptionalTrimmedString(nameEn),
      sortOrder: getFiniteNumber(sortOrder) ?? 0,
    },
    include: { _count: { select: { products: true } } },
  })

  await prisma.auditLog.create({
    data: { userId: admin.id, action: 'category_created', entity: 'category', entityId: category.id, meta: JSON.stringify({ name: category.name }) },
  })

  response.status(201).json({ category })
})

// PATCH /api/admin/categories/:id
router.patch('/categories/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const id = parsePositiveInt(request.params.id)
  if (!id) {
    sendError(response, 400, 'invalid_id', 'Invalid category id')
    return
  }

  const existingCategory = await prisma.category.findUnique({ where: { id }, select: { id: true } })
  if (!existingCategory) {
    sendError(response, 404, 'category_not_found', 'Category not found')
    return
  }

  const { name, nameEn, isActive, sortOrder } = request.body
  const data: Record<string, unknown> = {}
  if (typeof name === 'string') {
    const trimmedName = getTrimmedString(name)
    if (!trimmedName) {
      sendError(response, 400, 'invalid_name', 'Category name is required')
      return
    }
    const duplicateCategory = await prisma.category.findFirst({ where: { name: trimmedName, NOT: { id } }, select: { id: true } })
    if (duplicateCategory) {
      sendError(response, 409, 'category_exists', 'Category already exists')
      return
    }
    data.name = trimmedName
  }
  if (typeof nameEn === 'string' || nameEn === null) data.nameEn = getOptionalTrimmedString(nameEn)
  if (typeof isActive === 'boolean') data.isActive = isActive
  if (sortOrder !== undefined) {
    const parsedSortOrder = getFiniteNumber(sortOrder)
    if (parsedSortOrder == null) {
      sendError(response, 400, 'invalid_sort_order', 'Sort order must be a number')
      return
    }
    data.sortOrder = parsedSortOrder
  }

  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid fields to update')
    return
  }

  const category = await prisma.category.update({
    where: { id },
    data,
    include: { _count: { select: { products: true } } },
  })

  await prisma.auditLog.create({
    data: { userId: admin.id, action: 'category_updated', entity: 'category', entityId: id, meta: JSON.stringify(data) },
  })

  response.json({ category })
})

export default router
