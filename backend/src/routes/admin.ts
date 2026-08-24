import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { authRateLimiter, mapProduct, parsePositiveInt, prisma, sendError, verifySessionToken } from '../lib.js'
import type { Request, Response } from 'express'
import { notifyOrderStatusChange } from '../services/notifier.js'
import { encryptToken, decryptToken, validateBotToken, getBotStatus } from '../services/botService.js'
import { maskTelegramId } from '../services/logging.js'
import {
  createAdminSession,
  ensureOwnerAdministratorRecord,
  getAuthorizedAdminSession,
  hasAdminPasswordConfigured,
  isAdminTelegramId,
  isOwnerTelegramId,
  listAdministratorIds,
  normalizeTelegramId,
  revokeAdminSession,
  setAdminPassword,
  verifyAdminPassword,
} from '../services/adminAuthService.js'
import { getRuntimeConfigStatus, getRuntimeConfigSummary, getRuntimeEnvironmentLabel } from '../services/runtimeConfig.js'
import rateLimit from 'express-rate-limit'

const router = Router()

const botRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'too_many_requests', message: 'Too many requests, please try again later' },
})

function getAdminSessionToken(request: Request) {
  return request.header('x-admin-token') ?? request.header('x-admin-session') ?? ''
}

type AdminContext = {
  user: { id: number; telegramId: string }
  administrator: { id: number; telegramId: string }
}

async function getAdminUser(request: Request, response: Response, options?: { requireAdminSession?: boolean }): Promise<AdminContext | null> {
  const authorization = request.header('authorization') ?? request.header('x-session-token') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization
  const telegramId = verifySessionToken(token)

  if (!telegramId) {
    sendError(response, 401, 'unauthorized', 'Unauthorized')
    return null
  }

  const isAdmin = await isAdminTelegramId(telegramId)
  if (!isAdmin) {
    sendError(response, 403, 'forbidden', 'Admin access required')
    return null
  }

  const [user, administrator] = await Promise.all([
    prisma.user.findUnique({ where: { telegramId } }),
    prisma.administrator.findUnique({ where: { telegramId } }),
  ])

  if (!user) {
    sendError(response, 403, 'forbidden', 'Admin access required')
    return null
  }

  let resolvedAdministrator = administrator
  if (!resolvedAdministrator && isOwnerTelegramId(telegramId)) {
    resolvedAdministrator = await ensureOwnerAdministratorRecord(telegramId)
    if (resolvedAdministrator) {
      console.info('[admin-auth] restored missing OWNER administrator record', {
        telegramIdMasked: maskTelegramId(telegramId),
      })
    }
  }

  if (!resolvedAdministrator) {
    sendError(response, 403, 'forbidden', 'Admin access required')
    return null
  }

  if (options?.requireAdminSession !== false) {
    const adminToken = getAdminSessionToken(request)
    const session = await getAuthorizedAdminSession(adminToken)
    if (!session || session.admin.telegramId !== telegramId) {
      sendError(response, 401, 'admin_auth_required', 'Admin authentication required')
      return null
    }
  }

  return { user, administrator: resolvedAdministrator }
}

function meetsMinimumPasswordLength(password: string) {
  return password.length >= 8
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

async function getAdminSettingsPayload() {
  const [administrators, botStatus, passwordConfigured] = await Promise.all([
    listAdministratorIds(),
    getBotStatus(),
    hasAdminPasswordConfigured(),
  ])

  return {
    administrators,
    passwordConfigured,
    bot: {
      ...botStatus,
      tokenMasked: botStatus.connected ? '••••••••••••••••••••••••:••••••••••' : null,
    },
  }
}

router.post('/auth/login', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response, { requireAdminSession: false })
  if (!admin) return

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

  const session = await createAdminSession(admin.administrator.id)
  console.info('[admin-auth] admin session created', {
    isOwner: isOwnerTelegramId(admin.user.telegramId),
  })

  response.json({
    adminToken: session.token,
    expiresAt: session.expiresAt.toISOString(),
    settings: await getAdminSettingsPayload(),
  })
})

router.post('/auth/logout', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const token = getAdminSessionToken(request)
  if (token) {
    await revokeAdminSession(token)
  }

  response.json({ ok: true })
})

router.get('/auth/status', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  response.json({ authenticated: true })
})

router.get('/diagnostics/auth', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const ownerMatch = isOwnerTelegramId(admin.user.telegramId)
  if (!ownerMatch) {
    sendError(response, 403, 'forbidden', 'Owner diagnostics only')
    return
  }

  const runtime = getRuntimeConfigStatus()
  const telegramIdRecognized = await isAdminTelegramId(admin.user.telegramId)

  response.json({
    telegramSessionValid: true,
    telegramIdRecognized,
    ownerConfigured: runtime.ownerTelegramIdConfigured,
    ownerMatch,
    administratorRecordExists: Boolean(admin.administrator?.id),
    adminPasswordConfigured: runtime.adminPasswordConfigured,
    databaseConfigured: runtime.databaseConfigured,
    botTokenEncryptionKeyConfigured: runtime.botTokenEncryptionKeyConfigured,
    runtimeConfigSummary: getRuntimeConfigSummary(),
    adminSessionValid: true,
    environment: getRuntimeEnvironmentLabel(),
  })
})

router.get('/diagnostics/runtime', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return
  if (!isOwnerTelegramId(admin.user.telegramId)) {
    sendError(response, 403, 'forbidden', 'Owner diagnostics only')
    return
  }

  const runtime = getRuntimeConfigStatus()
  response.json({
    ownerConfigured: runtime.ownerTelegramIdConfigured,
    adminPasswordConfigured: runtime.adminPasswordConfigured,
    databaseConfigured: runtime.databaseConfigured,
    botTokenEncryptionKeyConfigured: runtime.botTokenEncryptionKeyConfigured,
    runtimeConfigSummary: getRuntimeConfigSummary(),
    environment: getRuntimeEnvironmentLabel(),
  })
})

router.get('/settings', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  response.json(await getAdminSettingsPayload())
})

router.post('/settings/password', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const currentPassword = typeof request.body.currentPassword === 'string' ? request.body.currentPassword : ''
  const newPassword = typeof request.body.newPassword === 'string' ? request.body.newPassword : ''

  if (!newPassword || !meetsMinimumPasswordLength(newPassword)) {
    sendError(response, 400, 'weak_password', 'Password must contain at least 8 characters')
    return
  }

  const passwordConfigured = await hasAdminPasswordConfigured()
  if (passwordConfigured) {
    const result = await verifyAdminPassword(currentPassword)
    if (!result.valid) {
      sendError(response, 401, 'invalid_credentials', 'Current password is invalid')
      return
    }
  }

  await setAdminPassword(newPassword, admin.administrator.id)

  await prisma.adminSession.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: new Date() },
  })

  const newSession = await createAdminSession(admin.administrator.id)

  response.json({
    saved: true,
    adminToken: newSession.token,
    expiresAt: newSession.expiresAt.toISOString(),
  })
})

router.post('/settings/administrators', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const telegramId = normalizeTelegramId(request.body.telegramId)
  if (!telegramId) {
    sendError(response, 400, 'invalid_telegram_id', 'Telegram ID must contain only digits')
    return
  }

  await prisma.administrator.upsert({
    where: { telegramId },
    create: { telegramId },
    update: {},
  })

  response.json({ administrators: await listAdministratorIds() })
})

router.patch('/settings/administrators/:telegramId', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const currentId = normalizeTelegramId(request.params.telegramId)
  const nextId = normalizeTelegramId(request.body.telegramId)

  if (!currentId || !nextId) {
    sendError(response, 400, 'invalid_telegram_id', 'Telegram ID must contain only digits')
    return
  }

  if (isOwnerTelegramId(currentId)) {
    sendError(response, 403, 'forbidden', 'Cannot modify OWNER administrator ID')
    return
  }

  const existing = await prisma.administrator.findUnique({ where: { telegramId: currentId } })
  if (!existing) {
    sendError(response, 404, 'admin_not_found', 'Administrator not found')
    return
  }

  const conflict = await prisma.administrator.findUnique({ where: { telegramId: nextId } })
  if (conflict && conflict.id !== existing.id) {
    sendError(response, 409, 'admin_exists', 'Administrator with this Telegram ID already exists')
    return
  }

  await prisma.administrator.update({
    where: { id: existing.id },
    data: { telegramId: nextId },
  })

  await prisma.adminSession.updateMany({
    where: { adminId: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  response.json({ administrators: await listAdministratorIds() })
})

router.delete('/settings/administrators/:telegramId', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const telegramId = normalizeTelegramId(request.params.telegramId)
  if (!telegramId) {
    sendError(response, 400, 'invalid_telegram_id', 'Telegram ID must be numeric')
    return
  }

  if (isOwnerTelegramId(telegramId)) {
    sendError(response, 403, 'forbidden', 'Cannot delete OWNER administrator')
    return
  }

  const administrators = await prisma.administrator.findMany({ orderBy: { createdAt: 'asc' } })
  if (administrators.length <= 1) {
    sendError(response, 400, 'last_admin_forbidden', 'At least one administrator must remain')
    return
  }

  const target = administrators.find((item) => item.telegramId === telegramId)
  if (!target) {
    sendError(response, 404, 'admin_not_found', 'Administrator not found')
    return
  }

  await prisma.administrator.delete({ where: { id: target.id } })

  response.json({ administrators: await listAdministratorIds() })
})

// ──── Orders ────────────────────────────────────────────────────────────────

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
      userId: admin.user.id,
      action: 'order_status_changed',
      entity: 'order',
      entityId: orderId,
      meta: JSON.stringify({ from: order.status, to: status }),
    },
  })

  notifyOrderStatusChange(order.user.telegramId, orderId, status)

  response.json({ order: updated })
})

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
      userId: admin.user.id,
      action: `refund_${refundStatus}`,
      entity: 'order',
      entityId: orderId,
      meta: JSON.stringify({ total: order.total }),
    },
  })

  response.json({ order: updated })
})

router.get('/products', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const products = await prisma.product.findMany({
    include: { category: true, productCities: { include: { city: true } } },
    orderBy: { id: 'desc' },
  })

  response.json({ products })
})

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
      userId: admin.user.id,
      action: 'product_updated',
      entity: 'product',
      entityId: productId,
      meta: JSON.stringify(data),
    },
  })

  response.json({ product })
})

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
      userId: admin.user.id,
      action: 'product_city_updated',
      entity: 'product_city',
      entityId: id,
      meta: JSON.stringify(data),
    },
  })

  response.json({ productCity: pc })
})

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

router.get('/discounts', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const discounts = await prisma.discount.findMany({ orderBy: { createdAt: 'desc' } })
  response.json({ discounts })
})

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
      userId: admin.user.id,
      action: 'discount_created',
      entity: 'discount',
      entityId: discount.id,
      meta: JSON.stringify({ code: discount.code }),
    },
  })

  response.json({ discount })
})

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

router.get('/delivery-options', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const options = await prisma.deliveryOption.findMany({ orderBy: { sortOrder: 'asc' } })
  response.json({ options })
})

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

router.get('/bot', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const status = await getBotStatus()
  response.json({
    ...status,
    tokenMasked: status.connected ? '••••••••••••••••••••••••:••••••••••' : null,
  })
})

router.post('/bot/connect', botRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const token = typeof request.body.token === 'string' ? request.body.token.trim() : ''

  if (!token) {
    sendError(response, 400, 'token_required', 'Bot token is required')
    return
  }

  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
    sendError(response, 400, 'invalid_token_format', 'Invalid Telegram bot token format')
    return
  }

  const botInfo = await validateBotToken(token)
  if (!botInfo) {
    sendError(response, 400, 'invalid_bot_token', 'Invalid Telegram bot token')
    return
  }

  const encryptedToken = encryptToken(token)

  await prisma.botConfig.updateMany({ where: { enabled: true }, data: { enabled: false } })

  await prisma.botConfig.create({
    data: {
      botId: String(botInfo.id),
      botUsername: botInfo.username,
      botFirstName: botInfo.firstName,
      encryptedToken,
      enabled: true,
      lastValidatedAt: new Date(),
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.user.id,
      action: 'bot_connected',
      entity: 'bot_config',
      meta: JSON.stringify({ botUsername: botInfo.username }),
    },
  })

  response.json({
    connected: true,
    bot: { id: botInfo.id, username: botInfo.username, firstName: botInfo.firstName },
    tokenMasked: '••••••••••••••••••••••••:••••••••••',
    lastValidatedAt: new Date().toISOString(),
  })
})

router.post('/bot/test', botRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const config = await prisma.botConfig.findFirst({
    where: { enabled: true },
    orderBy: { id: 'desc' },
  })

  if (!config) {
    sendError(response, 400, 'no_bot_configured', 'No bot is currently configured')
    return
  }

  let token: string
  try {
    token = decryptToken(config.encryptedToken)
  } catch {
    sendError(response, 500, 'decryption_error', 'Unable to read bot configuration')
    return
  }

  const botInfo = await validateBotToken(token)

  if (!botInfo) {
    await prisma.auditLog.create({
      data: {
        userId: admin.user.id,
        action: 'bot_test_failed',
        entity: 'bot_config',
        meta: JSON.stringify({ botUsername: config.botUsername }),
      },
    })
    sendError(response, 502, 'connection_failed', 'Unable to connect to Telegram bot')
    return
  }

  await prisma.botConfig.update({
    where: { id: config.id },
    data: { lastValidatedAt: new Date() },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.user.id,
      action: 'bot_test_success',
      entity: 'bot_config',
      meta: JSON.stringify({ botUsername: botInfo.username }),
    },
  })

  response.json({
    connected: true,
    bot: { id: botInfo.id, username: botInfo.username, firstName: botInfo.firstName },
    tokenMasked: '••••••••••••••••••••••••:••••••••••',
    lastValidatedAt: new Date().toISOString(),
  })
})

router.post('/bot/change', botRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const token = typeof request.body.token === 'string' ? request.body.token.trim() : ''

  if (!token) {
    sendError(response, 400, 'token_required', 'Bot token is required')
    return
  }

  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
    sendError(response, 400, 'invalid_token_format', 'Invalid Telegram bot token format')
    return
  }

  const botInfo = await validateBotToken(token)
  if (!botInfo) {
    sendError(response, 400, 'invalid_bot_token', 'Invalid Telegram bot token – existing bot unchanged')
    return
  }

  const encryptedToken = encryptToken(token)

  await prisma.botConfig.updateMany({ where: { enabled: true }, data: { enabled: false } })

  await prisma.botConfig.create({
    data: {
      botId: String(botInfo.id),
      botUsername: botInfo.username,
      botFirstName: botInfo.firstName,
      encryptedToken,
      enabled: true,
      lastValidatedAt: new Date(),
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.user.id,
      action: 'bot_token_changed',
      entity: 'bot_config',
      meta: JSON.stringify({ botUsername: botInfo.username }),
    },
  })

  response.json({
    connected: true,
    bot: { id: botInfo.id, username: botInfo.username, firstName: botInfo.firstName },
    tokenMasked: '••••••••••••••••••••••••:••••••••••',
    lastValidatedAt: new Date().toISOString(),
  })
})

router.post('/bot/disconnect', botRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const config = await prisma.botConfig.findFirst({
    where: { enabled: true },
    orderBy: { id: 'desc' },
  })

  if (!config) {
    sendError(response, 400, 'no_bot_configured', 'No bot is currently configured')
    return
  }

  await prisma.botConfig.update({ where: { id: config.id }, data: { enabled: false } })

  await prisma.auditLog.create({
    data: {
      userId: admin.user.id,
      action: 'bot_disconnected',
      entity: 'bot_config',
      meta: JSON.stringify({ botUsername: config.botUsername }),
    },
  })

  response.json({ connected: false, bot: null, tokenMasked: null })
})

// ── Cities ──────────────────────────────────────────────────────────────────

router.get('/cities', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const cities = await prisma.city.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  response.json({ cities })
})

router.post('/cities', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const { name, nameEn, sortOrder, isActive } = request.body
  if (typeof name !== 'string' || !name.trim()) {
    sendError(response, 400, 'invalid_name', 'City name is required')
    return
  }

  if (sortOrder !== undefined && !isWholeNumber(sortOrder)) {
    sendError(response, 400, 'invalid_sort_order', 'sortOrder must be an integer')
    return
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    sendError(response, 400, 'invalid_active_flag', 'isActive must be a boolean')
    return
  }

  try {
    const city = await prisma.city.create({
      data: {
        name: name.trim(),
        nameEn: typeof nameEn === 'string' ? nameEn.trim() || null : null,
        sortOrder: isWholeNumber(sortOrder) ? sortOrder : 0,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    })

    await prisma.auditLog.create({
      data: { userId: admin.user.id, action: 'city_created', entity: 'city', entityId: city.id, meta: JSON.stringify({ name: city.name, isActive: city.isActive }) },
    })

    response.status(201).json({ city })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      sendError(response, 409, 'city_exists', 'City with this name already exists')
      return
    }

    throw error
  }
})

router.patch('/cities/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const cityId = parsePositiveInt(request.params.id)
  if (!cityId) {
    sendError(response, 400, 'invalid_id', 'Invalid city id')
    return
  }

  const { name, nameEn, isActive, sortOrder } = request.body
  const data: Record<string, unknown> = {}
  if (typeof name === 'string' && name.trim()) data.name = name.trim()
  if (typeof nameEn === 'string') data.nameEn = nameEn.trim() || null
  if (typeof isActive === 'boolean') data.isActive = isActive
  if (sortOrder !== undefined) {
    if (!isWholeNumber(sortOrder)) {
      sendError(response, 400, 'invalid_sort_order', 'sortOrder must be an integer')
      return
    }
    data.sortOrder = sortOrder
  }

  try {
    const city = await prisma.city.update({ where: { id: cityId }, data })

    await prisma.auditLog.create({
      data: { userId: admin.user.id, action: 'city_updated', entity: 'city', entityId: cityId, meta: JSON.stringify(data) },
    })

    response.json({ city })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      sendError(response, 409, 'city_exists', 'City with this name already exists')
      return
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      sendError(response, 404, 'city_not_found', 'City not found')
      return
    }

    throw error
  }
})

router.delete('/cities/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const cityId = parsePositiveInt(request.params.id)
  if (!cityId) {
    sendError(response, 400, 'invalid_id', 'Invalid city id')
    return
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findUnique({ where: { id: cityId } })
      if (!city) {
        return { kind: 'missing' } as const
      }

      const [orderCount, productCityCount, selectedUserCount] = await Promise.all([
        tx.order.count({ where: { cityId } }),
        tx.productCity.count({ where: { cityId } }),
        tx.user.count({ where: { selectedCityId: cityId } }),
      ])

      const usage = { orderCount, productCityCount, selectedUserCount }
      const hasReferences = usage.orderCount > 0 || usage.productCityCount > 0 || usage.selectedUserCount > 0

      if (hasReferences) {
        const updatedCity = await tx.city.update({ where: { id: cityId }, data: { isActive: false } })
        return { kind: 'deactivated', city: updatedCity, usage } as const
      }

      await tx.city.delete({ where: { id: cityId } })
      return { kind: 'deleted' } as const
    })

    if (result.kind === 'missing') {
      sendError(response, 404, 'city_not_found', 'City not found')
      return
    }

    if (result.kind === 'deactivated') {
      await prisma.auditLog.create({
        data: { userId: admin.user.id, action: 'city_deactivated', entity: 'city', entityId: cityId, meta: JSON.stringify({ reason: 'has_references', ...result.usage }) },
      })
      response.json({ city: result.city, deactivated: true, usage: result.usage })
      return
    }

    await prisma.auditLog.create({
      data: { userId: admin.user.id, action: 'city_deleted', entity: 'city', entityId: cityId },
    })

    response.json({ ok: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      sendError(response, 404, 'city_not_found', 'City not found')
      return
    }

    throw error
  }
})

// ── Categories ───────────────────────────────────────────────────────────────

router.get('/categories', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  response.json({ categories })
})

router.post('/categories', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const { name, nameEn, sortOrder } = request.body
  if (typeof name !== 'string' || !name.trim()) {
    sendError(response, 400, 'invalid_name', 'Category name is required')
    return
  }

  const category = await prisma.category.create({
    data: {
      name: name.trim(),
      nameEn: typeof nameEn === 'string' ? nameEn.trim() || null : null,
      sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      isActive: true,
    },
  })

  await prisma.auditLog.create({
    data: { userId: admin.user.id, action: 'category_created', entity: 'category', entityId: category.id, meta: JSON.stringify({ name: category.name }) },
  })

  response.status(201).json({ category })
})

router.patch('/categories/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const categoryId = parsePositiveInt(request.params.id)
  if (!categoryId) {
    sendError(response, 400, 'invalid_id', 'Invalid category id')
    return
  }

  const { name, nameEn, isActive, sortOrder } = request.body
  const data: Record<string, unknown> = {}
  if (typeof name === 'string' && name.trim()) data.name = name.trim()
  if (typeof nameEn === 'string') data.nameEn = nameEn.trim() || null
  if (typeof isActive === 'boolean') data.isActive = isActive
  if (typeof sortOrder === 'number') data.sortOrder = sortOrder

  const category = await prisma.category.update({ where: { id: categoryId }, data })

  await prisma.auditLog.create({
    data: { userId: admin.user.id, action: 'category_updated', entity: 'category', entityId: categoryId, meta: JSON.stringify(data) },
  })

  response.json({ category })
})

router.delete('/categories/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const categoryId = parsePositiveInt(request.params.id)
  if (!categoryId) {
    sendError(response, 400, 'invalid_id', 'Invalid category id')
    return
  }

  const productCount = await prisma.product.count({ where: { categoryId } })
  if (productCount > 0) {
    const category = await prisma.category.update({ where: { id: categoryId }, data: { isActive: false } })
    await prisma.auditLog.create({
      data: { userId: admin.user.id, action: 'category_deactivated', entity: 'category', entityId: categoryId, meta: JSON.stringify({ reason: 'has_products' }) },
    })
    response.json({ category, deactivated: true })
    return
  }

  await prisma.category.delete({ where: { id: categoryId } })
  await prisma.auditLog.create({
    data: { userId: admin.user.id, action: 'category_deleted', entity: 'category', entityId: categoryId },
  })

  response.json({ ok: true })
})

// ── Products (create / delete) ───────────────────────────────────────────────

router.post('/products', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const { name, nameEn, description, descriptionEn, price, categoryId, image, isActive, isRecommended } = request.body

  if (typeof name !== 'string' || !name.trim()) {
    sendError(response, 400, 'invalid_name', 'Product name is required')
    return
  }
  if (typeof description !== 'string' || !description.trim()) {
    sendError(response, 400, 'invalid_description', 'Product description is required')
    return
  }
  if (typeof price !== 'number' || price <= 0) {
    sendError(response, 400, 'invalid_price', 'Valid price is required')
    return
  }
  const catId = typeof categoryId === 'number' && Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null
  if (!catId) {
    sendError(response, 400, 'invalid_category', 'Valid category id is required')
    return
  }

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      nameEn: typeof nameEn === 'string' ? nameEn.trim() || null : null,
      description: description.trim(),
      descriptionEn: typeof descriptionEn === 'string' ? descriptionEn.trim() || null : null,
      price,
      categoryId: catId,
      image: typeof image === 'string' ? image.trim() || null : null,
      isActive: typeof isActive === 'boolean' ? isActive : true,
      isRecommended: typeof isRecommended === 'boolean' ? isRecommended : false,
    },
    include: { category: true },
  })

  await prisma.auditLog.create({
    data: { userId: admin.user.id, action: 'product_created', entity: 'product', entityId: product.id, meta: JSON.stringify({ name: product.name }) },
  })

  response.status(201).json({ product })
})

router.delete('/products/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const productId = parsePositiveInt(request.params.id)
  if (!productId) {
    sendError(response, 400, 'invalid_id', 'Invalid product id')
    return
  }

  const orderItemCount = await prisma.orderItem.count({ where: { productCity: { productId } } })
  if (orderItemCount > 0) {
    const product = await prisma.product.update({ where: { id: productId }, data: { isActive: false } })
    await prisma.auditLog.create({
      data: { userId: admin.user.id, action: 'product_deactivated', entity: 'product', entityId: productId, meta: JSON.stringify({ reason: 'has_orders' }) },
    })
    response.json({ product, deactivated: true })
    return
  }

  await prisma.product.delete({ where: { id: productId } })
  await prisma.auditLog.create({
    data: { userId: admin.user.id, action: 'product_deleted', entity: 'product', entityId: productId },
  })

  response.json({ ok: true })
})

export default router
