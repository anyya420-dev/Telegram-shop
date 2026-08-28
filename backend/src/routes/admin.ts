import { Router } from 'express'
import { Prisma } from '@prisma/client'
import {
  authRateLimiter,
  mapCity,
  mapProduct,
  normalizeSupportedUnit,
  parsePositiveInt,
  prisma,
  sendError,
} from '../lib.js'
import type { CookieOptions, Request, Response } from 'express'
import { notifyOrderStatusChange } from '../services/notifier.js'
import {
  createAdminSession,
  ensureAdminPasswordFromEnv,
  generateAdminPassword,
  getActiveAdminSession,
  revokeAdminSessionsByAccountId,
  revokeAdminSession,
  rotateAdminAccountPassword,
  rotateOwnerPassword,
  verifyAdminAccountPassword,
  verifyAdminPassword,
} from '../services/adminSession.js'
import {
  parsePaymentMethodInput,
  sanitizePayment,
  sanitizePaymentMethod,
} from '../services/payments.js'
import { assignPickupStoragesForPaidOrder } from '../services/pickupStorage.js'
import { ensureCasinoDefaults, getOrCreateCasinoBalance, serializeReward } from '../services/casino.js'

const router = Router()
const ADMIN_SESSION_COOKIE_NAME = 'tg_shop_admin_session'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const PAYMENT_TYPES = ['card', 'crypto'] as const
const ORDER_STATUSES = ['pending', 'payment_pending', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled'] as const
const DELIVERY_TYPES = ['delivery', 'pickup'] as const

class DepositModerationError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'DepositModerationError'
    this.status = status
    this.code = code
  }
}

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

type PickupStorageInput = {
  productId: number
  productCityId: number
  variantKey: string | null
  quantity: number
  unit: string
  photoUrl: string | null
  address: string
  instructions: string | null
  isActive: boolean
}

type PickupStorageValidationResult =
  | { value: PickupStorageInput }
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

// Permission keys for granular access control
export const ALL_PERMISSIONS = [
  'orders', 'products', 'categories', 'cities', 'users', 'balance',
  'payments', 'deposits', 'casino', 'pickup', 'delivery', 'statistics',
  'settings', 'bots', 'operators',
] as const

export type PermissionKey = (typeof ALL_PERMISSIONS)[number]

type AdminContext = {
  id: number
  sessionId: number
  accountId: number
  role: string
  username: string
  permissions: PermissionKey[]
}

function hasPermission(admin: AdminContext, key: PermissionKey) {
  // Owner and admin have all permissions; operators only have what's granted
  if (admin.role === 'owner' || admin.role === 'admin') return true
  return admin.permissions.includes(key)
}

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

function normalizeDecimal(value: number) {
  return Number(value.toFixed(3))
}

function getPositiveQuantity(value: unknown) {
  const parsed = getPositiveNumber(value)
  return parsed == null ? null : normalizeDecimal(parsed)
}

function getNonNegativeQuantity(value: unknown) {
  const parsed = getNonNegativeNumber(value)
  return parsed == null ? null : normalizeDecimal(parsed)
}

function matchesQuantityStep(quantity: number, minimum: number, step: number) {
  const distance = normalizeDecimal((quantity - minimum) / step)
  return Math.abs(distance - Math.round(distance)) < 0.0001
}

function validateProductCityPayload(input: unknown): ProductCityValidationResult {
  const cityId = parsePositiveInt(String((input as Record<string, unknown>)?.cityId ?? ''))
  const stock = getNonNegativeQuantity((input as Record<string, unknown>)?.stock) ?? 0
  const minimumQuantity = getPositiveQuantity((input as Record<string, unknown>)?.minimumQuantity) ?? 1
  const quantityStep = getPositiveQuantity((input as Record<string, unknown>)?.quantityStep) ?? 1
  const maximumQuantity = getPositiveQuantity((input as Record<string, unknown>)?.maximumQuantity) ?? Math.max(stock, minimumQuantity)
  const unit = normalizeSupportedUnit((input as Record<string, unknown>)?.unit) ?? 'шт'
  const isAvailable = typeof (input as Record<string, unknown>)?.isAvailable === 'boolean'
    ? Boolean((input as Record<string, unknown>)?.isAvailable)
    : true

  if (!cityId) {
    return { error: { code: 'city_required', message: 'Valid city id is required' } } as const
  }
  if (maximumQuantity < minimumQuantity) {
    return { error: { code: 'quantity_invalid', message: 'Maximum quantity must be greater than or equal to minimum quantity' } } as const
  }
  if (!matchesQuantityStep(maximumQuantity, minimumQuantity, quantityStep)) {
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

function parsePickupStoragePayload(input: Record<string, unknown>, defaults?: Partial<PickupStorageInput>): PickupStorageValidationResult {
  const productId = parsePositiveInt(String(input.productId ?? defaults?.productId ?? ''))
  const productCityId = parsePositiveInt(String(input.productCityId ?? defaults?.productCityId ?? ''))
  const quantity = getPositiveQuantity(input.quantity ?? defaults?.quantity)
  const unit = normalizeSupportedUnit(input.unit ?? defaults?.unit)
  const addressInput = input.address ?? defaults?.address
  const address = typeof addressInput === 'string' ? addressInput.trim() : ''

  if (!productId) {
    return { error: { code: 'product_required', message: 'Valid product id is required' } } as const
  }
  if (!productCityId) {
    return { error: { code: 'product_city_required', message: 'Valid product city id is required' } } as const
  }
  if (quantity == null) {
    return { error: { code: 'quantity_invalid', message: 'Quantity must be a positive number' } } as const
  }
  if (!unit) {
    return { error: { code: 'unit_invalid', message: 'Unit must be one of: шт, кг, г, oz' } } as const
  }
  if (!address) {
    return { error: { code: 'address_required', message: 'Pickup address is required' } } as const
  }

  return {
    value: {
      productId,
      productCityId,
      quantity,
      unit,
      address,
      variantKey: typeof input.variantKey === 'string'
        ? (input.variantKey.trim() || null)
        : (defaults?.variantKey ?? null),
      photoUrl: typeof input.photoUrl === 'string'
        ? (input.photoUrl.trim() || null)
        : (defaults?.photoUrl ?? null),
      instructions: typeof input.instructions === 'string'
        ? (input.instructions.trim() || null)
        : (defaults?.instructions ?? null),
      isActive: typeof input.isActive === 'boolean' ? input.isActive : (defaults?.isActive ?? true),
    } satisfies PickupStorageInput,
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

function isOwner(admin: AdminContext) {
  return admin.role === 'owner'
}

async function getAdminUser(request: Request, response: Response, options?: { requireOwner?: boolean }) {
  const token = parseCookie(request, ADMIN_SESSION_COOKIE_NAME)
  const session = await getActiveAdminSession(token)
  if (!session) {
    clearAdminCookie(response)
    sendError(response, 401, 'admin_auth_required', 'Admin authentication required')
    return null
  }

  const adminAccount = session.adminAccount
  if (!adminAccount) {
    clearAdminCookie(response)
    sendError(response, 401, 'admin_auth_required', 'Admin authentication required')
    return null
  }

  function parsePermissions(raw: string | undefined | null): PermissionKey[] {
    try {
      const parsed = JSON.parse(raw ?? '[]')
      if (!Array.isArray(parsed)) return []
      return parsed.filter((p): p is PermissionKey => (ALL_PERMISSIONS as readonly string[]).includes(p))
    } catch {
      return []
    }
  }

  const admin = {
    id: adminAccount.id,
    sessionId: session.id,
    accountId: adminAccount.id,
    role: adminAccount.role,
    username: adminAccount.username,
    permissions: parsePermissions((adminAccount as { permissions?: string | null }).permissions),
  } satisfies AdminContext

  if (options?.requireOwner && !isOwner(admin)) {
    sendError(response, 403, 'owner_access_required', 'Owner access required')
    return null
  }

  return admin
}

function sanitizeTelegramBot(bot: {
  id: number
  token: string
  botId: string
  username: string
  firstName: string
  isActive: boolean
  webAppUrl: string | null
  menuText: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: bot.id,
    botId: bot.botId,
    username: bot.username,
    firstName: bot.firstName,
    isActive: bot.isActive,
    webAppUrl: bot.webAppUrl,
    menuText: bot.menuText,
    maskedToken: `*****${bot.token.slice(-4)}`,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
  }
}

router.post('/auth/login', authRateLimiter, async (request, response) => {
  await ensureAdminPasswordFromEnv()

  const password = typeof request.body.password === 'string' ? request.body.password : ''
  const mode = request.body?.mode === 'owner' ? 'owner' : 'admin'
  if (!password) {
    sendError(response, 400, 'invalid_credentials', 'Administrator password is required')
    return
  }

  const result = await verifyAdminPassword(password, mode)
  if (!result.valid) {
    if (result.reason === 'configuration_error') {
      sendError(response, 503, 'configuration_error', 'Admin password is not configured on the server')
      return
    }
    sendError(response, 401, 'invalid_credentials', 'Invalid administrator credentials')
    return
  }

  const session = await createAdminSession(result.account.id)
  writeAdminCookie(response, session.token, session.expiresAt)
  response.json({ ok: true, role: result.account.role, username: result.account.username })
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

  response.json({
    authenticated: true,
    role: session.adminAccount?.role ?? 'admin',
    username: session.adminAccount?.username ?? null,
  })
})

router.post('/auth/change-password', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const currentPassword = getTrimmedString(request.body.currentPassword)
  const nextPassword = getTrimmedString(request.body.newPassword)
  const target = request.body.target === 'owner' ? 'owner' : 'self'

  if (!currentPassword || !nextPassword || nextPassword.length < 10) {
    sendError(response, 400, 'invalid_password', 'Current password and a strong new password are required')
    return
  }

  const currentValid = await verifyAdminAccountPassword(admin.accountId, currentPassword)
  if (!currentValid) {
    sendError(response, 401, 'invalid_credentials', 'Current password is invalid')
    return
  }

  if (target === 'owner') {
    if (!isOwner(admin)) {
      sendError(response, 403, 'owner_access_required', 'Owner access required')
      return
    }
    await rotateOwnerPassword(nextPassword)
    await revokeAdminSessionsByAccountId(admin.accountId)
  } else {
    await rotateAdminAccountPassword(admin.accountId, nextPassword)
    await revokeAdminSessionsByAccountId(admin.accountId)
  }

  clearAdminCookie(response)
  response.json({ ok: true })
})

function sanitizeAdminAccount(account: {
  id: number
  username: string
  telegramId?: string | null
  role: string
  permissions?: string | null
  isActive: boolean
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  let parsedPermissions: string[] = []
  try {
    const p = JSON.parse(account.permissions ?? '[]')
    if (Array.isArray(p)) parsedPermissions = p.filter((x): x is string => typeof x === 'string')
  } catch { /* empty */ }
  return {
    id: account.id,
    username: account.username,
    telegramId: account.telegramId ?? null,
    role: account.role,
    permissions: parsedPermissions,
    isActive: account.isActive,
    deletedAt: account.deletedAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}

router.get('/administrators', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response, { requireOwner: true })
  if (!admin) return

  const administrators = await prisma.adminAccount.findMany({
    where: { deletedAt: null },
    orderBy: [{ role: 'desc' }, { id: 'asc' }],
  })

  response.json({ administrators: administrators.map(sanitizeAdminAccount) })
})

router.post('/administrators', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response, { requireOwner: true })
  if (!admin) return

  const usernameInput = getTrimmedString(request.body.username).toLowerCase()
  const username = usernameInput || `admin_${Date.now()}`
  if (!/^[a-z0-9_]{3,40}$/.test(username)) {
    sendError(response, 400, 'invalid_username', 'Username must contain only letters, numbers, and underscores')
    return
  }

  const telegramIdInput = getTrimmedString(request.body.telegramId) || null
  const roleInput = getTrimmedString(request.body.role)
  const role = ['admin', 'operator'].includes(roleInput) ? roleInput : 'admin'

  // Validate and normalize permissions
  const permissionsInput: PermissionKey[] = []
  if (Array.isArray(request.body.permissions)) {
    for (const p of request.body.permissions) {
      if (typeof p === 'string' && (ALL_PERMISSIONS as readonly string[]).includes(p)) {
        permissionsInput.push(p as PermissionKey)
      }
    }
  }

  const existing = await prisma.adminAccount.findUnique({ where: { username } })
  if (existing && !existing.deletedAt) {
    sendError(response, 409, 'admin_exists', 'Administrator username already exists')
    return
  }

  const password = generateAdminPassword()
  let refreshed
  if (existing && existing.deletedAt) {
    refreshed = await prisma.adminAccount.update({
      where: { id: existing.id },
      data: {
        deletedAt: null,
        isActive: true,
        role,
        telegramId: telegramIdInput,
        permissions: JSON.stringify(permissionsInput),
      },
    })
    await rotateAdminAccountPassword(refreshed.id, password)
    refreshed = await prisma.adminAccount.findUniqueOrThrow({ where: { id: refreshed.id } })
  } else {
    const created = await prisma.adminAccount.create({
      data: {
        username,
        role,
        telegramId: telegramIdInput,
        permissions: JSON.stringify(permissionsInput),
        passwordHash: '',
        passwordSalt: '',
        passwordAlgo: 'scrypt',
        isActive: true,
      },
    })
    await rotateAdminAccountPassword(created.id, password)
    refreshed = await prisma.adminAccount.findUniqueOrThrow({ where: { id: created.id } })
  }

  response.status(201).json({
    administrator: sanitizeAdminAccount(refreshed),
    generatedPassword: password,
  })
})

router.patch('/administrators/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response, { requireOwner: true })
  if (!admin) return

  const accountId = parsePositiveInt(request.params.id)
  if (!accountId) {
    sendError(response, 400, 'invalid_id', 'Invalid administrator id')
    return
  }

  const account = await prisma.adminAccount.findUnique({ where: { id: accountId } })
  if (!account || account.deletedAt) {
    sendError(response, 404, 'not_found', 'Administrator not found')
    return
  }
  if (account.role === 'owner') {
    sendError(response, 400, 'owner_locked', 'Owner account cannot be changed here')
    return
  }

  const usernameInput = getOptionalTrimmedString(request.body.username)
  const isActive = typeof request.body.isActive === 'boolean' ? request.body.isActive : undefined
  const data: { username?: string; isActive?: boolean; permissions?: string; telegramId?: string | null } = {}
  if (usernameInput !== undefined && usernameInput !== null) {
    const normalized = usernameInput.toLowerCase()
    if (!/^[a-z0-9_]{3,40}$/.test(normalized)) {
      sendError(response, 400, 'invalid_username', 'Username must contain only letters, numbers, and underscores')
      return
    }
    data.username = normalized
  }
  if (isActive !== undefined) data.isActive = isActive
  if (Array.isArray(request.body.permissions)) {
    const validPerms = request.body.permissions.filter(
      (p: unknown): p is PermissionKey => typeof p === 'string' && (ALL_PERMISSIONS as readonly string[]).includes(p)
    )
    data.permissions = JSON.stringify(validPerms)
  }
  if (typeof request.body.telegramId === 'string') {
    data.telegramId = request.body.telegramId.trim() || null
  } else if (request.body.telegramId === null) {
    data.telegramId = null
  }

  const updated = await prisma.adminAccount.update({
    where: { id: accountId },
    data,
  })

  if (updated.isActive === false) {
    await revokeAdminSessionsByAccountId(updated.id)
  }

  response.json({ administrator: sanitizeAdminAccount(updated) })
})

router.post('/administrators/:id/reset-password', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response, { requireOwner: true })
  if (!admin) return

  const accountId = parsePositiveInt(request.params.id)
  if (!accountId) {
    sendError(response, 400, 'invalid_id', 'Invalid administrator id')
    return
  }

  const account = await prisma.adminAccount.findUnique({ where: { id: accountId } })
  if (!account || account.deletedAt || account.role === 'owner') {
    sendError(response, 404, 'not_found', 'Administrator not found')
    return
  }

  const generatedPassword = generateAdminPassword()
  await rotateAdminAccountPassword(account.id, generatedPassword)
  await revokeAdminSessionsByAccountId(account.id)

  response.json({ ok: true, generatedPassword })
})

router.delete('/administrators/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response, { requireOwner: true })
  if (!admin) return

  const accountId = parsePositiveInt(request.params.id)
  if (!accountId) {
    sendError(response, 400, 'invalid_id', 'Invalid administrator id')
    return
  }
  const account = await prisma.adminAccount.findUnique({ where: { id: accountId } })
  if (!account || account.deletedAt || account.role === 'owner') {
    sendError(response, 404, 'not_found', 'Administrator not found')
    return
  }

  await prisma.adminAccount.update({
    where: { id: account.id },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  })
  await revokeAdminSessionsByAccountId(account.id)

  response.json({ ok: true })
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

  const payment = await prisma.payment.findFirst({
    where: { orderId, status: { in: ['pending', 'processing'] } },
    orderBy: { createdAt: 'desc' },
  })
  if (!payment) {
    sendError(response, 404, 'payment_not_found', 'Payment record not found')
    return
  }

  if (!['payment_pending', 'pending', 'processing'].includes(order.status) || !['pending', 'processing'].includes(order.paymentStatus ?? '')) {
    sendError(response, 400, 'invalid_payment_state', 'Order payment is not pending')
    return
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (action === 'confirm') {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'paid', paidAt: new Date(), failureReason: null },
      })
      await tx.orderStatusHistory.create({
        data: { orderId, status: 'processing', comment: 'Payment confirmed by admin' },
      })
      await assignPickupStoragesForPaidOrder(tx, orderId)
      return tx.order.update({
        where: { id: orderId },
        data: { status: 'processing', paymentStatus: 'paid' },
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

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'failed', failureReason: 'rejected_by_admin' },
    })
    await tx.orderStatusHistory.create({
      data: { orderId, status: 'pending', comment: 'Payment rejected by admin' },
    })
    return tx.order.update({
      where: { id: orderId },
      data: { status: 'pending', paymentStatus: 'failed' },
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

  const methods = await prisma.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  response.json({ methods: methods.map(sanitizePaymentMethod) })
})

router.post('/payment-settings', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  let data
  try {
    data = parsePaymentMethodInput(request.body as Record<string, unknown> as never)
  } catch (error) {
    sendError(response, 400, 'invalid_payment_settings', error instanceof Error ? error.message : 'Invalid payment settings')
    return
  }

  const method = await prisma.paymentMethod.create({
    data,
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'payment_method_created',
      entity: 'payment_method',
      entityId: method.id,
      meta: JSON.stringify({ type: method.type, title: method.title }),
    },
  })

  response.status(201).json({ method: sanitizePaymentMethod(method) })
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

  let data
  try {
    data = parsePaymentMethodInput(request.body as Record<string, unknown> as never, existing)
  } catch (error) {
    sendError(response, 400, 'invalid_payment_settings', error instanceof Error ? error.message : 'Invalid payment settings')
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

  response.json({ method: sanitizePaymentMethod(method) })
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

  const linkedPayments = await prisma.payment.count({ where: { paymentMethodId: id } })
  const linkedOrders = await prisma.order.count({ where: { paymentMethodId: id } })
  if (linkedPayments > 0 || linkedOrders > 0) {
    sendError(response, 400, 'payment_method_in_use', 'Disable a payment method that has payment history instead of deleting it')
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

  response.json({ method: sanitizePaymentMethod(updated) })
})

router.get('/payments', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const payments = await prisma.payment.findMany({
    include: {
      paymentMethod: true,
      order: {
        include: {
          user: { select: { id: true, telegramId: true, firstName: true, username: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  response.json({
    payments: payments.map((payment) => ({
      ...sanitizePayment(payment),
      order: {
        id: payment.order.id,
        status: payment.order.status,
        paymentStatus: payment.order.paymentStatus,
        total: payment.order.total,
        user: payment.order.user,
      },
    })),
  })
})

router.patch('/payments/:id/status', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const paymentId = parsePositiveInt(request.params.id)
  if (!paymentId) {
    sendError(response, 400, 'invalid_id', 'Invalid payment id')
    return
  }

  const status = typeof request.body.status === 'string' ? request.body.status.trim().toLowerCase() : ''
  const reason = getTrimmedString(request.body.reason)
  if (!['processing', 'paid', 'failed', 'cancelled', 'refunded'].includes(status)) {
    sendError(response, 400, 'invalid_status', 'Unsupported payment status')
    return
  }
  if (!reason) {
    sendError(response, 400, 'reason_required', 'A reason is required for manual payment status changes')
    return
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: true, paymentMethod: true },
  })
  if (!payment) {
    sendError(response, 404, 'not_found', 'Payment not found')
    return
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextPayment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status,
        paidAt: status === 'paid' ? new Date() : payment.paidAt,
        failureReason: ['failed', 'cancelled'].includes(status) ? reason : null,
      },
      include: { paymentMethod: true },
    })

    const orderStatus = status === 'paid'
      ? 'processing'
      : status === 'processing'
        ? 'payment_pending'
        : payment.order.status
    const orderPaymentStatus = status

    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        status: orderStatus,
        paymentStatus: orderPaymentStatus,
      },
    })

    if (status === 'paid') {
      await assignPickupStoragesForPaidOrder(tx, payment.orderId)
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: payment.orderId,
        status: orderStatus,
        comment: `Admin payment update: ${reason}`,
      },
    })

    await tx.auditLog.create({
      data: {
        userId: admin.id,
        action: 'payment_status_updated',
        entity: 'payment',
        entityId: paymentId,
        meta: JSON.stringify({ previousStatus: payment.status, nextStatus: status, reason }),
      },
    })

    return nextPayment
  })

  response.json({ payment: sanitizePayment(updated) })
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
          type: 'REFUND',
          amount: order.total,
          status: 'completed',
          source: 'order',
          referenceId: orderId,
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
  if (request.body.creditsEnabled !== undefined) {
    if (typeof request.body.creditsEnabled !== 'boolean') {
      sendError(response, 400, 'invalid_credits_enabled', 'Casino credits flag must be boolean')
      return
    }
    data.creditsEnabled = request.body.creditsEnabled
    if (!request.body.creditsEnabled) {
      data.creditsPrice = null
      data.minCreditsRequired = null
    }
  }
  if (request.body.creditsPrice !== undefined) {
    if (request.body.creditsPrice === null) {
      data.creditsPrice = null
    } else {
      const parsedCreditsPrice = getPositiveNumber(request.body.creditsPrice)
      if (parsedCreditsPrice == null) {
        sendError(response, 400, 'invalid_credits_price', 'Casino credits price must be a positive number')
        return
      }
      data.creditsPrice = parsedCreditsPrice
    }
  }
  if (request.body.minCreditsRequired !== undefined) {
    if (request.body.minCreditsRequired === null) {
      data.minCreditsRequired = null
    } else {
      const parsedMinCreditsRequired = getNonNegativeNumber(request.body.minCreditsRequired)
      if (parsedMinCreditsRequired == null) {
        sendError(response, 400, 'invalid_minimum_credits', 'Minimum casino credits must be zero or positive')
        return
      }
      data.minCreditsRequired = parsedMinCreditsRequired
    }
  }

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
    const parsedStock = getNonNegativeQuantity(stock)
    if (parsedStock == null) {
      sendError(response, 400, 'invalid_stock', 'Stock must be zero or greater')
      return
    }
    data.stock = parsedStock
  }
  if (typeof isAvailable === 'boolean') data.isAvailable = isAvailable
  if (minimumQuantity !== undefined) {
    const parsedMinimumQuantity = getPositiveQuantity(minimumQuantity)
    if (parsedMinimumQuantity == null) {
      sendError(response, 400, 'quantity_invalid', 'Minimum quantity must be a positive number')
      return
    }
    data.minimumQuantity = parsedMinimumQuantity
  }
  if (quantityStep !== undefined) {
    const parsedQuantityStep = getPositiveQuantity(quantityStep)
    if (parsedQuantityStep == null) {
      sendError(response, 400, 'quantity_invalid', 'Quantity step must be a positive number')
      return
    }
    data.quantityStep = parsedQuantityStep
  }
  if (maximumQuantity !== undefined) {
    const parsedMaximumQuantity = getPositiveQuantity(maximumQuantity)
    if (parsedMaximumQuantity == null) {
      sendError(response, 400, 'quantity_invalid', 'Maximum quantity must be a positive number')
      return
    }
    data.maximumQuantity = parsedMaximumQuantity
  }
  if (unit !== undefined) {
    const parsedUnit = normalizeSupportedUnit(unit)
    if (!parsedUnit) {
      sendError(response, 400, 'unit_invalid', 'Unit must be one of: шт, кг, г, oz')
      return
    }
    data.unit = parsedUnit
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
  if (!matchesQuantityStep(nextMaximumQuantity, nextMinimumQuantity, nextQuantityStep)) {
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

router.get('/pickup-storages', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const storages = await prisma.pickupStorage.findMany({
    include: {
      product: { select: { id: true, name: true, nameEn: true } },
      productCity: { include: { city: { select: { id: true, name: true, nameEn: true } } } },
      assignedOrder: { select: { id: true, userId: true, paymentStatus: true, status: true } },
      assignedOrderItem: { select: { id: true, productName: true, quantity: true, unit: true } },
    },
    orderBy: [{ status: 'asc' }, { id: 'desc' }],
  })

  response.json({ storages })
})

router.post('/pickup-storages', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const parsed = parsePickupStoragePayload((request.body ?? {}) as Record<string, unknown>)
  if ('error' in parsed) {
    sendError(response, 400, parsed.error.code, parsed.error.message)
    return
  }

  const { productId, productCityId, variantKey, quantity, unit, photoUrl, address, instructions, isActive } = parsed.value

  const productCity = await prisma.productCity.findUnique({
    where: { id: productCityId },
    select: { id: true, productId: true },
  })
  if (!productCity || productCity.productId !== productId) {
    sendError(response, 400, 'product_city_mismatch', 'Selected product city does not belong to product')
    return
  }

  const storage = await prisma.pickupStorage.create({
    data: {
      productId,
      productCityId,
      variantKey,
      quantity,
      unit,
      photoUrl,
      address,
      instructions,
      isActive,
      status: isActive ? 'available' : 'inactive',
    },
    include: {
      product: { select: { id: true, name: true, nameEn: true } },
      productCity: { include: { city: { select: { id: true, name: true, nameEn: true } } } },
      assignedOrder: { select: { id: true, userId: true, paymentStatus: true, status: true } },
      assignedOrderItem: { select: { id: true, productName: true, quantity: true, unit: true } },
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'pickup_storage_created',
      entity: 'pickup_storage',
      entityId: storage.id,
      meta: JSON.stringify({ productId, productCityId, quantity, unit, variantKey }),
    },
  })

  response.status(201).json({ storage })
})

router.patch('/pickup-storages/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const storageId = parsePositiveInt(request.params.id)
  if (!storageId) {
    sendError(response, 400, 'invalid_id', 'Invalid storage id')
    return
  }

  const existing = await prisma.pickupStorage.findUnique({
    where: { id: storageId },
    include: { assignment: true },
  })
  if (!existing) {
    sendError(response, 404, 'not_found', 'Pickup storage not found')
    return
  }

  if (existing.assignment && (request.body.productId !== undefined || request.body.productCityId !== undefined || request.body.quantity !== undefined || request.body.unit !== undefined || request.body.variantKey !== undefined)) {
    sendError(response, 400, 'storage_locked', 'Assigned storage cannot change matching attributes')
    return
  }

  const parsed = parsePickupStoragePayload(
    (request.body ?? {}) as Record<string, unknown>,
    {
      productId: existing.productId,
      productCityId: existing.productCityId,
      variantKey: existing.variantKey,
      quantity: existing.quantity,
      unit: existing.unit,
      photoUrl: existing.photoUrl,
      address: existing.address,
      instructions: existing.instructions,
      isActive: existing.isActive,
    },
  )
  if ('error' in parsed) {
    sendError(response, 400, parsed.error.code, parsed.error.message)
    return
  }

  const { productId, productCityId, variantKey, quantity, unit, photoUrl, address, instructions, isActive } = parsed.value

  const productCity = await prisma.productCity.findUnique({
    where: { id: productCityId },
    select: { productId: true },
  })
  if (!productCity || productCity.productId !== productId) {
    sendError(response, 400, 'product_city_mismatch', 'Selected product city does not belong to product')
    return
  }

  const data: Record<string, unknown> = {
    productId,
    productCityId,
    variantKey,
    quantity,
    unit,
    photoUrl,
    address,
    instructions,
    isActive,
  }

  if (!existing.assignment) {
    data.status = isActive ? 'available' : 'inactive'
  } else if (!isActive) {
    data.isActive = false
  }

  const storage = await prisma.pickupStorage.update({
    where: { id: storageId },
    data,
    include: {
      product: { select: { id: true, name: true, nameEn: true } },
      productCity: { include: { city: { select: { id: true, name: true, nameEn: true } } } },
      assignedOrder: { select: { id: true, userId: true, paymentStatus: true, status: true } },
      assignedOrderItem: { select: { id: true, productName: true, quantity: true, unit: true } },
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'pickup_storage_updated',
      entity: 'pickup_storage',
      entityId: storage.id,
      meta: JSON.stringify({ productId, productCityId, quantity, unit, variantKey, isActive }),
    },
  })

  response.json({ storage })
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

  const existingDiscount = await prisma.discount.findUnique({ where: { id }, select: { id: true } })
  if (!existingDiscount) {
    sendError(response, 404, 'discount_not_found', 'Discount not found')
    return
  }

  const { isActive, usageLimit, expiresAt } = request.body
  const data: Record<string, unknown> = {}
  if (typeof isActive === 'boolean') data.isActive = isActive
  if (usageLimit !== undefined) {
    const parsedUsageLimit = getNonNegativeNumber(usageLimit)
    if (usageLimit !== null && parsedUsageLimit == null) {
      sendError(response, 400, 'invalid_usage_limit', 'Usage limit must be zero or greater')
      return
    }
    data.usageLimit = usageLimit === null ? null : parsedUsageLimit
  }
  if (expiresAt !== undefined) {
    if (expiresAt === null || expiresAt === '') {
      data.expiresAt = null
    } else {
      const parsedDate = new Date(expiresAt)
      if (Number.isNaN(parsedDate.getTime())) {
        sendError(response, 400, 'invalid_expiration', 'Expiration date is invalid')
        return
      }
      data.expiresAt = parsedDate
    }
  }

  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid fields to update')
    return
  }

  const discount = await prisma.discount.update({ where: { id }, data })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'discount_updated',
      entity: 'discount',
      entityId: id,
      meta: JSON.stringify(data),
    },
  })

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

  // Period filter: today | week | month | all (default: all)
  const period = typeof request.query.period === 'string' ? request.query.period : 'all'
  const now = new Date()
  let periodStart: Date | undefined
  if (period === 'today') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  } else if (period === 'week') {
    periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (period === 'month') {
    periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }
  const periodFilter = periodStart ? { gte: periodStart } : undefined
  const orderWhere = { ...(periodFilter ? { createdAt: periodFilter } : {}) }
  const paidOrderWhere = { ...orderWhere, paymentStatus: 'paid' }
  const cancelledOrderWhere = { ...orderWhere, status: 'cancelled' }

  const [
    totalOrders,
    pendingOrders,
    paidOrders,
    cancelledOrders,
    totalUsers,
    newUsers,
    revenueResult,
    depositStats,
    casinoBetStats,
    casinoWinStats,
    discountStats,
    virtualBalanceResult,
  ] = await Promise.all([
    prisma.order.count({ where: orderWhere }),
    prisma.order.count({ where: { ...orderWhere, status: 'pending' } }),
    prisma.order.count({ where: paidOrderWhere }),
    prisma.order.count({ where: cancelledOrderWhere }),
    prisma.user.count(),
    prisma.user.count({ where: periodFilter ? { createdAt: periodFilter } : {} }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { ...paidOrderWhere },
    }),
    prisma.depositRequest.aggregate({
      _sum: { creditedAmount: true, amountUsdt: true },
      _count: { id: true },
      where: { status: 'confirmed', ...(periodFilter ? { confirmedAt: periodFilter } : {}) },
    }),
    prisma.casinoRound.aggregate({
      _sum: { betAmount: true },
      _count: { id: true },
      where: periodFilter ? { createdAt: periodFilter } : {},
    }),
    prisma.casinoRound.aggregate({
      _sum: { payoutAmount: true },
      where: { ...(periodFilter ? { createdAt: periodFilter } : {}), payoutAmount: { gt: 0 } },
    }),
    prisma.order.aggregate({
      _sum: { discountAmount: true },
      where: { ...orderWhere, discountAmount: { gt: 0 } },
    }),
    prisma.balance.aggregate({ _sum: { amount: true } }),
  ])

  const totalRevenue = revenueResult._sum.total ?? 0
  const depositCredited = depositStats._sum.creditedAmount ?? 0
  const depositUSDT = depositStats._sum.amountUsdt ?? 0
  const depositCommission = depositUSDT - depositCredited
  const depositCount = depositStats._count.id

  response.json({
    period,
    totalOrders,
    pendingOrders,
    paidOrders,
    cancelledOrders,
    totalUsers,
    newUsers,
    totalRevenue,
    depositCount,
    depositUSDT,
    depositCredited,
    depositCommission,
    casinoBetCount: casinoBetStats._count.id,
    casinoBetTotal: casinoBetStats._sum.betAmount ?? 0,
    casinoWinTotal: casinoWinStats._sum.payoutAmount ?? 0,
    discountTotal: discountStats._sum.discountAmount ?? 0,
    virtualBalance: virtualBalanceResult._sum.amount ?? 0,
  })
})

router.get('/settings', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const [shopNameSetting, commissionSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: 'shop_name' } }),
    prisma.appSetting.findUnique({ where: { key: 'deposit_commission_pct' } }),
  ])
  const commissionPct = commissionSetting ? Number(commissionSetting.value) : 0
  response.json({
    shopName: shopNameSetting?.value || 'Telegram Shop',
    depositCommissionPct: Number.isFinite(commissionPct) ? commissionPct : 0,
  })
})

router.patch('/settings', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const shopName = request.body.shopName !== undefined ? getTrimmedString(request.body.shopName) : undefined
  const depositCommissionPct = request.body.depositCommissionPct !== undefined ? Number(request.body.depositCommissionPct) : undefined

  if (shopName === '') {
    sendError(response, 400, 'shop_name_required', 'Shop name is required')
    return
  }

  if (shopName !== undefined && shopName.length > 80) {
    sendError(response, 400, 'shop_name_too_long', 'Shop name must be 80 characters or fewer')
    return
  }

  if (depositCommissionPct !== undefined && (!Number.isFinite(depositCommissionPct) || depositCommissionPct < 0 || depositCommissionPct > 100)) {
    sendError(response, 400, 'invalid_commission', 'Commission must be between 0 and 100')
    return
  }

  const updates: Array<Promise<unknown>> = []

  if (shopName !== undefined) {
    updates.push(prisma.appSetting.upsert({
      where: { key: 'shop_name' },
      create: { key: 'shop_name', value: shopName },
      update: { value: shopName },
    }))
  }

  if (depositCommissionPct !== undefined) {
    updates.push(prisma.appSetting.upsert({
      where: { key: 'deposit_commission_pct' },
      create: { key: 'deposit_commission_pct', value: String(depositCommissionPct) },
      update: { value: String(depositCommissionPct) },
    }))
  }

  await Promise.all(updates)

  if (updates.length > 0) {
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'settings_updated',
        entity: 'app_setting',
        meta: JSON.stringify({ shopName, depositCommissionPct }),
      },
    })
  }

  const [updatedShopName, updatedCommission] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: 'shop_name' } }),
    prisma.appSetting.findUnique({ where: { key: 'deposit_commission_pct' } }),
  ])

  response.json({
    shopName: updatedShopName?.value || 'Telegram Shop',
    depositCommissionPct: updatedCommission ? Number(updatedCommission.value) : 0,
  })
})

// POST /api/admin/products - create a new product
router.post('/products', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const {
    name,
    nameEn,
    description,
    descriptionEn,
    price,
    image,
    categoryId,
    creditsEnabled,
    creditsPrice,
    minCreditsRequired,
    isActive,
    isRecommended,
    cities,
  } = request.body
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
  const parsedCreditsPrice = creditsPrice == null ? null : getPositiveNumber(creditsPrice)
  if (creditsPrice != null && parsedCreditsPrice == null) {
    sendError(response, 400, 'invalid_credits_price', 'Casino credits price must be a positive number')
    return
  }
  const parsedMinCreditsRequired = minCreditsRequired == null ? null : getNonNegativeNumber(minCreditsRequired)
  if (minCreditsRequired != null && parsedMinCreditsRequired == null) {
    sendError(response, 400, 'invalid_minimum_credits', 'Minimum casino credits must be zero or positive')
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
        creditsEnabled: typeof creditsEnabled === 'boolean' ? creditsEnabled : false,
        creditsPrice: creditsEnabled ? parsedCreditsPrice : null,
        minCreditsRequired: creditsEnabled ? parsedMinCreditsRequired : null,
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

router.get('/casino/config', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  await ensureCasinoDefaults(prisma)
  const [games, rewardConfigs] = await Promise.all([
    prisma.casinoGameConfig.findMany({ orderBy: { game: 'asc' } }),
    prisma.casinoRewardConfig.findMany({ orderBy: [{ game: 'asc' }, { weight: 'desc' }, { id: 'asc' }] }),
  ])

  response.json({ games, rewardConfigs })
})

router.patch('/casino/games/:game', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  await ensureCasinoDefaults(prisma)
  const game = getTrimmedString(request.params.game)
  const current = await prisma.casinoGameConfig.findUnique({ where: { game } })
  if (!current) {
    sendError(response, 404, 'game_not_found', 'Casino game not found')
    return
  }

  const data: Record<string, unknown> = {}
  if (request.body.isEnabled !== undefined) {
    if (typeof request.body.isEnabled !== 'boolean') {
      sendError(response, 400, 'invalid_enabled', 'isEnabled must be boolean')
      return
    }
    data.isEnabled = request.body.isEnabled
  }
  if (request.body.minBet !== undefined) {
    const minBet = getPositiveNumber(request.body.minBet)
    if (minBet == null) {
      sendError(response, 400, 'invalid_min_bet', 'minBet must be a positive number')
      return
    }
    data.minBet = minBet
  }
  if (request.body.maxBet !== undefined) {
    const maxBet = getPositiveNumber(request.body.maxBet)
    if (maxBet == null) {
      sendError(response, 400, 'invalid_max_bet', 'maxBet must be a positive number')
      return
    }
    data.maxBet = maxBet
  }
  if (request.body.spinLimit !== undefined) {
    const spinLimit = getPositiveInteger(request.body.spinLimit)
    if (spinLimit == null) {
      sendError(response, 400, 'invalid_spin_limit', 'spinLimit must be a positive integer')
      return
    }
    data.spinLimit = spinLimit
  }
  const nextMinBet = typeof data.minBet === 'number' ? data.minBet : current.minBet
  const nextMaxBet = typeof data.maxBet === 'number' ? data.maxBet : current.maxBet
  if (nextMaxBet < nextMinBet) {
    sendError(response, 400, 'invalid_bet_range', 'maxBet must be greater than or equal to minBet')
    return
  }
  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid fields to update')
    return
  }
  const updated = await prisma.casinoGameConfig.update({ where: { game }, data })
  await prisma.auditLog.create({
    data: { userId: admin.id, action: 'casino_game_updated', entity: 'casino_game', entityId: updated.id, meta: JSON.stringify(data) },
  })
  response.json({ game: updated })
})

router.post('/casino/reward-configs', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const game = getTrimmedString(request.body.game)
  const rewardType = getTrimmedString(request.body.rewardType)
  const title = getTrimmedString(request.body.title)
  const weight = getPositiveInteger(request.body.weight)
  const discountPercent = request.body.discountPercent == null ? null : getNonNegativeNumber(request.body.discountPercent)
  const creditAmount = request.body.creditAmount == null ? null : getNonNegativeNumber(request.body.creditAmount)
  const expiresInHours = request.body.expiresInHours == null ? null : getPositiveInteger(request.body.expiresInHours)
  const minOrderAmount = request.body.minOrderAmount == null ? null : getNonNegativeNumber(request.body.minOrderAmount)

  if (!game || !rewardType || !title || !weight) {
    sendError(response, 400, 'invalid_reward_config', 'game, rewardType, title and weight are required')
    return
  }
  if (!['casino_credits', 'shop_discount', 'none'].includes(rewardType)) {
    sendError(response, 400, 'invalid_reward_type', 'Unsupported reward type')
    return
  }
  if (discountPercent != null && discountPercent > 30) {
    sendError(response, 400, 'discount_limit_exceeded', 'Discount cannot exceed 30%')
    return
  }

  await ensureCasinoDefaults(prisma)
  const gameConfig = await prisma.casinoGameConfig.findUnique({ where: { game } })
  if (!gameConfig) {
    sendError(response, 404, 'game_not_found', 'Casino game not found')
    return
  }

  const rewardConfig = await prisma.casinoRewardConfig.create({
    data: {
      game,
      rewardType,
      title,
      resultKey: getOptionalTrimmedString(request.body.resultKey) ?? null,
      discountPercent,
      creditAmount,
      weight,
      isActive: typeof request.body.isActive === 'boolean' ? request.body.isActive : true,
      expiresInHours,
      minOrderAmount,
    },
  })
  await prisma.auditLog.create({
    data: { userId: admin.id, action: 'casino_reward_config_created', entity: 'casino_reward_config', entityId: rewardConfig.id, meta: JSON.stringify({ game, rewardType, title, weight }) },
  })
  response.status(201).json({ rewardConfig })
})

router.patch('/casino/reward-configs/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const id = parsePositiveInt(request.params.id)
  if (!id) {
    sendError(response, 400, 'invalid_id', 'Invalid reward config id')
    return
  }

  const data: Record<string, unknown> = {}
  if (request.body.title !== undefined) {
    const title = getTrimmedString(request.body.title)
    if (!title) {
      sendError(response, 400, 'invalid_title', 'Title is required')
      return
    }
    data.title = title
  }
  if (request.body.rewardType !== undefined) {
    const rewardType = getTrimmedString(request.body.rewardType)
    if (!['casino_credits', 'shop_discount', 'none'].includes(rewardType)) {
      sendError(response, 400, 'invalid_reward_type', 'Unsupported reward type')
      return
    }
    data.rewardType = rewardType
  }
  if (request.body.resultKey !== undefined) data.resultKey = getOptionalTrimmedString(request.body.resultKey)
  if (request.body.weight !== undefined) {
    const weight = getPositiveInteger(request.body.weight)
    if (weight == null) {
      sendError(response, 400, 'invalid_weight', 'Weight must be a positive integer')
      return
    }
    data.weight = weight
  }
  if (request.body.discountPercent !== undefined) {
    if (request.body.discountPercent === null) {
      data.discountPercent = null
    } else {
      const discountPercent = getNonNegativeNumber(request.body.discountPercent)
      if (discountPercent == null || discountPercent > 30) {
        sendError(response, 400, 'discount_limit_exceeded', 'Discount cannot exceed 30%')
        return
      }
      data.discountPercent = discountPercent
    }
  }
  if (request.body.creditAmount !== undefined) {
    if (request.body.creditAmount === null) {
      data.creditAmount = null
    } else {
      const creditAmount = getNonNegativeNumber(request.body.creditAmount)
      if (creditAmount == null) {
        sendError(response, 400, 'invalid_credit_amount', 'Credit amount must be zero or positive')
        return
      }
      data.creditAmount = creditAmount
    }
  }
  if (request.body.expiresInHours !== undefined) {
    if (request.body.expiresInHours === null) {
      data.expiresInHours = null
    } else {
      const expiresInHours = getPositiveInteger(request.body.expiresInHours)
      if (expiresInHours == null) {
        sendError(response, 400, 'invalid_expiration', 'expiresInHours must be a positive integer')
        return
      }
      data.expiresInHours = expiresInHours
    }
  }
  if (request.body.minOrderAmount !== undefined) {
    if (request.body.minOrderAmount === null) {
      data.minOrderAmount = null
    } else {
      const minOrderAmount = getNonNegativeNumber(request.body.minOrderAmount)
      if (minOrderAmount == null) {
        sendError(response, 400, 'invalid_minimum_order', 'minOrderAmount must be zero or positive')
        return
      }
      data.minOrderAmount = minOrderAmount
    }
  }
  if (request.body.isActive !== undefined) {
    if (typeof request.body.isActive !== 'boolean') {
      sendError(response, 400, 'invalid_active', 'isActive must be boolean')
      return
    }
    data.isActive = request.body.isActive
  }
  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid fields to update')
    return
  }

  const rewardConfig = await prisma.casinoRewardConfig.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { userId: admin.id, action: 'casino_reward_config_updated', entity: 'casino_reward_config', entityId: rewardConfig.id, meta: JSON.stringify(data) },
  })
  response.json({ rewardConfig })
})

router.get('/casino/history', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const history = await prisma.casinoRound.findMany({
    include: {
      reward: true,
      casinoBalance: {
        include: {
          user: {
            select: { id: true, telegramId: true, firstName: true, username: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  response.json({
    history: history.map((entry) => ({
      ...entry,
      user: entry.casinoBalance.user,
      reward: serializeReward(entry.reward),
    })),
  })
})

router.post('/casino/credits/adjust', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const userId = parsePositiveInt(request.body.userId)
  const amount = Number(request.body.amount)
  const reason = getTrimmedString(request.body.reason)
  if (!userId || !Number.isFinite(amount) || amount === 0 || !reason) {
    sendError(response, 400, 'invalid_adjustment', 'userId, amount, and reason are required')
    return
  }

  try {
    const balance = await prisma.$transaction(async (tx) => {
      const current = await getOrCreateCasinoBalance(tx, userId)
      if (amount < 0 && current.credits + amount < 0) {
        throw new Error('Casino credit balance cannot become negative')
      }
      const updated = await tx.casinoBalance.update({
        where: { id: current.id },
        data: {
          credits: { increment: amount },
          lifetimeWon: amount > 0 ? { increment: amount } : undefined,
        },
      })
      await tx.casinoCreditTransaction.create({
        data: {
          casinoBalanceId: current.id,
          amount,
          type: 'admin_adjustment',
          reason,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: 'casino_credits_adjusted',
          entity: 'casino_balance',
          entityId: current.id,
          meta: JSON.stringify({ userId, previousValue: current.credits, newValue: updated.credits, reason }),
        },
      })
      return updated
    })
    response.json({ balance })
  } catch (error) {
    sendError(response, 400, 'invalid_adjustment', error instanceof Error ? error.message : 'Invalid adjustment')
  }
})

// POST /api/admin/balance/adjust - Admin USD balance adjustment
router.post('/balance/adjust', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const userId = parsePositiveInt(request.body.userId)
  const amount = Number(request.body.amount)
  const reason = getTrimmedString(request.body.reason)
  if (!userId || !Number.isFinite(amount) || amount === 0 || !reason) {
    sendError(response, 400, 'invalid_adjustment', 'userId, amount, and reason are required')
    return
  }

  try {
    const balance = await prisma.$transaction(async (tx) => {
      const current = await tx.balance.upsert({
        where: { userId },
        create: { userId, amount: 0 },
        update: {},
      })
      if (amount < 0 && current.amount + amount < 0) {
        throw new Error('Balance cannot become negative')
      }
      const updated = await tx.balance.update({
        where: { id: current.id },
        data: { amount: { increment: amount } },
      })
      await tx.balanceTransaction.create({
        data: {
          balanceId: current.id,
          type: 'ADMIN_ADJUSTMENT',
          amount,
          status: 'completed',
          source: 'admin',
          adminId: admin.id,
          comment: reason,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: 'balance_adjusted',
          entity: 'balance',
          entityId: current.id,
          meta: JSON.stringify({ userId, previousValue: current.amount, newValue: updated.amount, reason }),
        },
      })
      return updated
    })
    response.json({ balance })
  } catch (error) {
    sendError(response, 400, 'invalid_adjustment', error instanceof Error ? error.message : 'Invalid adjustment')
  }
})

router.get('/operators', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const operators = await prisma.operator.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  })

  response.json({ operators })
})

router.post('/operators', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const telegramId = getTrimmedString(request.body.telegramId)
  const firstName = getTrimmedString(request.body.firstName)
  const lastName = getOptionalTrimmedString(request.body.lastName)
  const username = getOptionalTrimmedString(request.body.username)
  const notes = getOptionalTrimmedString(request.body.notes)

  if (!telegramId) {
    sendError(response, 400, 'telegram_id_required', 'Telegram id is required')
    return
  }
  if (!firstName) {
    sendError(response, 400, 'first_name_required', 'First name is required')
    return
  }

  const existing = await prisma.operator.findUnique({ where: { telegramId } })
  if (existing) {
    sendError(response, 409, 'operator_exists', 'Operator with this Telegram id already exists')
    return
  }

  const operator = await prisma.operator.create({
    data: {
      telegramId,
      firstName,
      lastName,
      username,
      notes,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'operator_created',
      entity: 'operator',
      entityId: operator.id,
      meta: JSON.stringify({ telegramId: operator.telegramId }),
    },
  })

  response.status(201).json({ operator })
})

router.patch('/operators/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const operatorId = parsePositiveInt(request.params.id)
  if (!operatorId) {
    sendError(response, 400, 'invalid_id', 'Invalid operator id')
    return
  }

  const existing = await prisma.operator.findUnique({ where: { id: operatorId } })
  if (!existing) {
    sendError(response, 404, 'not_found', 'Operator not found')
    return
  }

  const data: {
    telegramId?: string
    firstName?: string
    lastName?: string | null
    username?: string | null
    notes?: string | null
    isActive?: boolean
  } = {}

  if (request.body.telegramId !== undefined) {
    const telegramId = getTrimmedString(request.body.telegramId)
    if (!telegramId) {
      sendError(response, 400, 'telegram_id_required', 'Telegram id is required')
      return
    }
    const duplicate = await prisma.operator.findFirst({
      where: {
        telegramId,
        id: { not: operatorId },
      },
      select: { id: true },
    })
    if (duplicate) {
      sendError(response, 409, 'operator_exists', 'Operator with this Telegram id already exists')
      return
    }
    data.telegramId = telegramId
  }

  if (request.body.firstName !== undefined) {
    const firstName = getTrimmedString(request.body.firstName)
    if (!firstName) {
      sendError(response, 400, 'first_name_required', 'First name is required')
      return
    }
    data.firstName = firstName
  }

  if (request.body.lastName !== undefined) {
    data.lastName = getOptionalTrimmedString(request.body.lastName)
  }
  if (request.body.username !== undefined) {
    data.username = getOptionalTrimmedString(request.body.username)
  }
  if (request.body.notes !== undefined) {
    data.notes = getOptionalTrimmedString(request.body.notes)
  }
  if (typeof request.body.isActive === 'boolean') {
    data.isActive = request.body.isActive
  }

  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid operator fields provided')
    return
  }

  const operator = await prisma.operator.update({
    where: { id: operatorId },
    data,
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'operator_updated',
      entity: 'operator',
      entityId: operator.id,
      meta: JSON.stringify(data),
    },
  })

  response.json({ operator })
})

router.delete('/operators/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const operatorId = parsePositiveInt(request.params.id)
  if (!operatorId) {
    sendError(response, 400, 'invalid_id', 'Invalid operator id')
    return
  }

  const operator = await prisma.operator.findUnique({ where: { id: operatorId } })
  if (!operator) {
    sendError(response, 404, 'not_found', 'Operator not found')
    return
  }

  await prisma.$transaction([
    prisma.order.updateMany({
      where: { operatorId },
      data: { operatorId: null },
    }),
    prisma.operator.delete({ where: { id: operatorId } }),
    prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'operator_deleted',
        entity: 'operator',
        entityId: operatorId,
        meta: JSON.stringify({ telegramId: operator.telegramId }),
      },
    }),
  ])

  response.json({ ok: true })
})

router.patch('/operators/:id/toggle', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const operatorId = parsePositiveInt(request.params.id)
  if (!operatorId) {
    sendError(response, 400, 'invalid_id', 'Invalid operator id')
    return
  }

  const existing = await prisma.operator.findUnique({ where: { id: operatorId } })
  if (!existing) {
    sendError(response, 404, 'not_found', 'Operator not found')
    return
  }

  const operator = await prisma.operator.update({
    where: { id: operatorId },
    data: { isActive: !existing.isActive },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'operator_toggled',
      entity: 'operator',
      entityId: operator.id,
      meta: JSON.stringify({ isActive: operator.isActive }),
    },
  })

  response.json({ operator })
})

router.post('/orders/:id/assign-operator', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const orderId = parsePositiveInt(request.params.id)
  const operatorId = parsePositiveInt(request.body.operatorId)

  if (!orderId) {
    sendError(response, 400, 'invalid_id', 'Invalid order id')
    return
  }
  if (!operatorId) {
    sendError(response, 400, 'invalid_operator_id', 'Valid operator id is required')
    return
  }

  const [order, operator] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId } }),
    prisma.operator.findFirst({ where: { id: operatorId, isActive: true } }),
  ])

  if (!order) {
    sendError(response, 404, 'not_found', 'Order not found')
    return
  }
  if (!operator) {
    sendError(response, 404, 'operator_not_found', 'Active operator not found')
    return
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { operatorId: operator.id },
    include: {
      items: true,
      city: true,
      user: { select: { id: true, firstName: true, username: true, telegramId: true } },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      paymentMethod: true,
      deliveryOption: true,
      discount: true,
      operator: true,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'order_operator_assigned',
      entity: 'order',
      entityId: orderId,
      meta: JSON.stringify({ operatorId: operator.id }),
    },
  })

  response.json({ order: updated })
})

router.get('/bots', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const bots = await prisma.telegramBot.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  })

  response.json({ bots: bots.map(sanitizeTelegramBot) })
})

router.post('/bots', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const token = getTrimmedString(request.body.token)
  if (!token) {
    sendError(response, 400, 'token_required', 'Bot token is required')
    return
  }
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    sendError(response, 400, 'invalid_bot_token', 'Telegram bot token is invalid')
    return
  }

  let validatedBot: { botId: string; username: string; firstName: string } | null = null

  try {
    const validationUrl = new URL(`/bot${encodeURIComponent(token)}/getMe`, 'https://api.telegram.org')
    const telegramResponse = await fetch(validationUrl)
    const payload = await telegramResponse.json().catch(() => null) as
      | { ok?: boolean; result?: { id?: number | string; username?: string; first_name?: string } }
      | null

    if (!telegramResponse.ok || !payload?.ok || !payload.result?.id || !payload.result.username || !payload.result.first_name) {
      sendError(response, 400, 'invalid_bot_token', 'Telegram bot token is invalid')
      return
    }

    validatedBot = {
      botId: String(payload.result.id),
      username: payload.result.username,
      firstName: payload.result.first_name,
    }
  } catch {
    sendError(response, 503, 'telegram_validation_failed', 'Unable to validate Telegram bot token')
    return
  }

  if (!validatedBot) {
    sendError(response, 400, 'invalid_bot_token', 'Telegram bot token is invalid')
    return
  }

  const existing = await prisma.telegramBot.findFirst({
    where: {
      OR: [{ token }, { botId: validatedBot.botId }],
    },
  })
  if (existing) {
    sendError(response, 409, 'bot_exists', 'Telegram bot is already registered')
    return
  }

  const bot = await prisma.telegramBot.create({
    data: {
      token,
      botId: validatedBot.botId,
      username: validatedBot.username,
      firstName: validatedBot.firstName,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'telegram_bot_created',
      entity: 'telegram_bot',
      entityId: bot.id,
      meta: JSON.stringify({ botId: bot.botId, username: bot.username }),
    },
  })

  response.status(201).json({ bot: sanitizeTelegramBot(bot) })
})

router.patch('/bots/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const botId = parsePositiveInt(request.params.id)
  if (!botId) {
    sendError(response, 400, 'invalid_id', 'Invalid bot id')
    return
  }

  const existing = await prisma.telegramBot.findUnique({ where: { id: botId } })
  if (!existing) {
    sendError(response, 404, 'not_found', 'Bot not found')
    return
  }

  const data: {
    webAppUrl?: string | null
    menuText?: string | null
  } = {}

  if (request.body.webAppUrl !== undefined) {
    data.webAppUrl = getOptionalTrimmedString(request.body.webAppUrl)
  }
  if (request.body.menuText !== undefined) {
    data.menuText = getOptionalTrimmedString(request.body.menuText)
  }

  if (Object.keys(data).length === 0) {
    sendError(response, 400, 'no_changes', 'No valid bot fields provided')
    return
  }

  const bot = await prisma.telegramBot.update({
    where: { id: botId },
    data,
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'telegram_bot_updated',
      entity: 'telegram_bot',
      entityId: bot.id,
      meta: JSON.stringify(data),
    },
  })

  response.json({ bot: sanitizeTelegramBot(bot) })
})

router.patch('/bots/:id/toggle', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const botId = parsePositiveInt(request.params.id)
  if (!botId) {
    sendError(response, 400, 'invalid_id', 'Invalid bot id')
    return
  }

  const existing = await prisma.telegramBot.findUnique({ where: { id: botId } })
  if (!existing) {
    sendError(response, 404, 'not_found', 'Bot not found')
    return
  }

  const bot = await prisma.telegramBot.update({
    where: { id: botId },
    data: { isActive: !existing.isActive },
  })

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'telegram_bot_toggled',
      entity: 'telegram_bot',
      entityId: bot.id,
      meta: JSON.stringify({ isActive: bot.isActive }),
    },
  })

  response.json({ bot: sanitizeTelegramBot(bot) })
})

router.delete('/bots/:id', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const botId = parsePositiveInt(request.params.id)
  if (!botId) {
    sendError(response, 400, 'invalid_id', 'Invalid bot id')
    return
  }

  const bot = await prisma.telegramBot.findUnique({ where: { id: botId } })
  if (!bot) {
    sendError(response, 404, 'not_found', 'Bot not found')
    return
  }

  await prisma.telegramBot.delete({ where: { id: botId } })
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'telegram_bot_deleted',
      entity: 'telegram_bot',
      entityId: bot.id,
      meta: JSON.stringify({ botId: bot.botId, username: bot.username }),
    },
  })

  response.json({ ok: true })
})

// ──── Deposit Requests ────────────────────────────────────────────────────────

// GET /api/admin/deposits
router.get('/deposits', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const page = Math.max(1, Number(request.query.page) || 1)
  const status = typeof request.query.status === 'string' ? request.query.status : undefined
  const limit = 50

  const where = status && ['pending', 'confirmed', 'rejected'].includes(status) ? { status } : {}

  const [deposits, total] = await Promise.all([
    prisma.depositRequest.findMany({
      where,
      include: {
        user: { select: { id: true, telegramId: true, firstName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.depositRequest.count({ where }),
  ])

  response.json({
    deposits,
    total,
    page,
    pages: Math.ceil(total / limit),
  })
})

// POST /api/admin/deposits/:id/confirm
router.post('/deposits/:id/confirm', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const depositId = parsePositiveInt(request.params.id)
  if (!depositId) {
    sendError(response, 400, 'invalid_id', 'Invalid deposit id')
    return
  }

  const depositCheck = await prisma.depositRequest.findUnique({ where: { id: depositId } })
  if (!depositCheck) {
    sendError(response, 404, 'not_found', 'Deposit request not found')
    return
  }

  if (depositCheck.status !== 'pending') {
    sendError(response, 400, 'already_processed', 'This deposit has already been processed')
    return
  }

  if (!depositCheck.txHash?.trim()) {
    sendError(response, 400, 'tx_hash_required', 'Transaction hash must be submitted before confirmation')
    return
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Atomic: only update if still pending and tx hash exists — prevents race condition double-credit
      const updateResult = await tx.depositRequest.updateMany({
        where: { id: depositId, status: 'pending', txHash: { not: null } },
        data: {
          status: 'confirmed',
          confirmedAt: new Date(),
          adminNote: typeof request.body.note === 'string' ? request.body.note.trim() || null : null,
        },
      })
      if (updateResult.count !== 1) {
        throw new DepositModerationError(400, 'already_processed', 'This deposit has already been processed')
      }
      const deposit = await tx.depositRequest.findUniqueOrThrow({ where: { id: depositId } })
      if (!deposit.txHash?.trim()) {
        throw new DepositModerationError(400, 'tx_hash_required', 'Transaction hash must be submitted before confirmation')
      }
      const creditedAmount = deposit.creditedAmount ?? deposit.amountUsdt

      const balance = await tx.balance.upsert({
        where: { userId: deposit.userId },
        create: { userId: deposit.userId, amount: 0 },
        update: {},
      })

      await tx.balance.update({
        where: { id: balance.id },
        data: { amount: { increment: creditedAmount } },
      })

      await tx.balanceTransaction.create({
        data: {
          balanceId: balance.id,
          type: 'DEPOSIT',
          amount: creditedAmount,
          status: 'completed',
          source: 'deposit_request',
          referenceId: depositId,
          adminId: admin.id,
          comment: `USDT deposit (${deposit.network}) confirmed by admin`,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: 'deposit_confirmed',
          entity: 'deposit_request',
          entityId: depositId,
          meta: JSON.stringify({
            userId: deposit.userId,
            amountUsdt: deposit.amountUsdt,
            creditedAmount,
            network: deposit.network,
            txHash: deposit.txHash,
          }),
        },
      })
    })
  } catch (error) {
    if (error instanceof DepositModerationError) {
      sendError(response, error.status, error.code, error.message)
      return
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      sendError(response, 409, 'deposit_processing_conflict', 'Deposit is being processed, please retry')
      return
    }

    throw error
  }

  const updated = await prisma.depositRequest.findUniqueOrThrow({
    where: { id: depositId },
    include: { user: { select: { id: true, telegramId: true, firstName: true, username: true } } },
  })

  response.json({ deposit: updated })
})

// POST /api/admin/deposits/:id/reject
router.post('/deposits/:id/reject', authRateLimiter, async (request, response) => {
  const admin = await getAdminUser(request, response)
  if (!admin) return

  const depositId = parsePositiveInt(request.params.id)
  if (!depositId) {
    sendError(response, 400, 'invalid_id', 'Invalid deposit id')
    return
  }

  const deposit = await prisma.depositRequest.findUnique({ where: { id: depositId } })
  if (!deposit) {
    sendError(response, 404, 'not_found', 'Deposit request not found')
    return
  }

  if (deposit.status !== 'pending') {
    sendError(response, 400, 'already_processed', 'This deposit has already been processed')
    return
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.depositRequest.updateMany({
        where: { id: depositId, status: 'pending' },
        data: {
          status: 'rejected',
          adminNote: typeof request.body.note === 'string' ? request.body.note.trim() || null : null,
        },
      })
      if (updateResult.count !== 1) {
        throw new DepositModerationError(400, 'already_processed', 'This deposit has already been processed')
      }

      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: 'deposit_rejected',
          entity: 'deposit_request',
          entityId: depositId,
          meta: JSON.stringify({
            userId: deposit.userId,
            amountUsdt: deposit.amountUsdt,
            network: deposit.network,
            txHash: deposit.txHash,
          }),
        },
      })
    })
  } catch (error) {
    if (error instanceof DepositModerationError) {
      sendError(response, error.status, error.code, error.message)
      return
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      sendError(response, 409, 'deposit_processing_conflict', 'Deposit is being processed, please retry')
      return
    }

    throw error
  }

  const updated = await prisma.depositRequest.findUniqueOrThrow({
    where: { id: depositId },
    include: { user: { select: { id: true, telegramId: true, firstName: true, username: true } } },
  })

  response.json({ deposit: updated })
})

export default router
