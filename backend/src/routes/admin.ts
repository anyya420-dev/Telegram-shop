import { Router } from 'express'
import { authRateLimiter, mapProduct, parsePositiveInt, prisma, sendError } from '../lib.js'
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

async function getAdminUser(request: Request, response: Response) {
  const token = parseCookie(request, ADMIN_SESSION_COOKIE_NAME)
  const session = await getActiveAdminSession(token)
  if (!session) {
    clearAdminCookie(response)
    sendError(response, 401, 'admin_auth_required', 'Admin authentication required')
    return null
  }

  return { id: null } satisfies AdminContext
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
  const validStatuses = ['pending', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled']
  if (!validStatuses.includes(status)) {
    sendError(response, 400, 'invalid_status', `Status must be one of: ${validStatuses.join(', ')}`)
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

  const { name, nameEn, description, descriptionEn, price, isActive, isRecommended } = request.body

  const data: Record<string, unknown> = {}
  if (typeof name === 'string') data.name = name
  if (typeof nameEn === 'string') data.nameEn = nameEn
  if (typeof description === 'string') data.description = description
  if (typeof descriptionEn === 'string') data.descriptionEn = descriptionEn
  if (typeof price === 'number' && price > 0) data.price = price
  if (typeof isActive === 'boolean') data.isActive = isActive
  if (typeof isRecommended === 'boolean') data.isRecommended = isRecommended

  const product = await prisma.product.update({
    where: { id: productId },
    data,
    include: { category: true },
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

  const { stock, isAvailable, minimumQuantity, quantityStep, maximumQuantity } = request.body
  const data: Record<string, unknown> = {}
  if (typeof stock === 'number' && stock >= 0) data.stock = stock
  if (typeof isAvailable === 'boolean') data.isAvailable = isAvailable
  if (typeof minimumQuantity === 'number') data.minimumQuantity = minimumQuantity
  if (typeof quantityStep === 'number') data.quantityStep = quantityStep
  if (typeof maximumQuantity === 'number') data.maximumQuantity = maximumQuantity

  const pc = await prisma.productCity.update({ where: { id }, data })

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
      include: { selectedCity: true, balance: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count(),
  ])

  response.json({ users, total, page, pages: Math.ceil(total / limit) })
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
  if (!name || typeof name !== 'string') {
    sendError(response, 400, 'name_required', 'name is required')
    return
  }

  const option = await prisma.deliveryOption.create({
    data: {
      name,
      nameEn: nameEn ?? null,
      type: type ?? 'delivery',
      price: typeof price === 'number' ? price : 0,
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
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

  const { name, nameEn, type, price, isActive, sortOrder } = request.body
  const data: Record<string, unknown> = {}
  if (typeof name === 'string') data.name = name
  if (typeof nameEn === 'string') data.nameEn = nameEn
  if (typeof type === 'string') data.type = type
  if (typeof price === 'number') data.price = price
  if (typeof isActive === 'boolean') data.isActive = isActive
  if (typeof sortOrder === 'number') data.sortOrder = sortOrder

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

export default router
