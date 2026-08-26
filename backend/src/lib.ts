import { PrismaClient } from '@prisma/client'
import type { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { createHmac, timingSafeEqual } from 'node:crypto'

process.env.DATABASE_URL ??= 'postgresql://localhost/dev'

export const prisma = new PrismaClient()
export const APP_ROLES = ['OWNER', 'ADMIN', 'OPERATOR', 'CUSTOMER'] as const
export type AppRole = (typeof APP_ROLES)[number]
export const DEMO_TELEGRAM_USER = {
  id: '900000001',
  username: 'demo_customer',
  first_name: 'Demo',
  last_name: 'Customer',
}

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-session-secret'

export type AppLanguage = 'ru' | 'en'

type TelegramUserPayload = {
  id: string
  username?: string
  first_name: string
  last_name?: string
}

type TranslationShape = {
  name: string
  nameEn: string | null
}

export function normalizeQuantity(value: number) {
  return Number(value.toFixed(2))
}

export function parsePositiveInt(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function isLanguage(value: unknown): value is AppLanguage {
  return value === 'ru' || value === 'en'
}

export function sendError(response: Response, status: number, code: string, message: string) {
  response.status(status).json({ code, message })
}

export const authRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'too_many_requests', message: 'Too many requests, please try again later' },
})

export function createSessionToken(telegramId: string) {
  const signature = createHmac('sha256', SESSION_SECRET).update(telegramId).digest('hex')
  return `${telegramId}.${signature}`
}

export function verifySessionToken(token: string | undefined) {
  if (!token) {
    return null
  }

  const [telegramId, signature] = token.split('.')

  if (!telegramId || !signature) {
    return null
  }

  const expectedSignature = createHmac('sha256', SESSION_SECRET).update(telegramId).digest('hex')
  const received = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null
  }

  return telegramId
}

export function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')

  if (!hash) {
    return null
  }

  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const calculatedHash = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  const received = Buffer.from(hash, 'hex')
  const expected = Buffer.from(calculatedHash, 'hex')

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null
  }

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate)) {
    return null
  }
  const maxAuthAgeSeconds = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SECONDS ?? 60 * 60 * 24)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (authDate <= 0 || nowSeconds - authDate > maxAuthAgeSeconds) {
    return null
  }

  const rawUser = params.get('user')

  if (!rawUser) {
    return null
  }

  try {
    const parsedUser = JSON.parse(rawUser) as { id?: number | string; username?: string; first_name?: string; last_name?: string }

    if (!parsedUser.id || !parsedUser.first_name) {
      return null
    }

    return {
      id: String(parsedUser.id),
      username: parsedUser.username,
      first_name: parsedUser.first_name,
      last_name: parsedUser.last_name,
    } satisfies TelegramUserPayload
  } catch {
    return null
  }
}

export function isAllowedQuantity(quantity: number, minimum: number, step: number, maximum: number) {
  const normalizedQuantity = normalizeQuantity(quantity)
  const normalizedMinimum = normalizeQuantity(minimum)
  const normalizedStep = normalizeQuantity(step)
  const normalizedMaximum = normalizeQuantity(maximum)
  const distance = normalizeQuantity((normalizedQuantity - normalizedMinimum) / normalizedStep)

  return (
    normalizedQuantity >= normalizedMinimum &&
    normalizedQuantity <= normalizedMaximum &&
    Math.abs(distance - Math.round(distance)) < 0.0001
  )
}

function createTranslations(ru: string, en?: string | null) {
  return {
    ru,
    en: en ?? ru,
  }
}

export function mapCity<T extends TranslationShape>(city: T) {
  return {
    ...city,
    nameTranslations: createTranslations(city.name, city.nameEn),
  }
}

export function mapCategory<T extends TranslationShape>(category: T) {
  return {
    ...category,
    nameTranslations: createTranslations(category.name, category.nameEn),
  }
}

export function mapUser<T extends { selectedCity: TranslationShape | null }>(user: T) {
  return {
    ...user,
    selectedCity: user.selectedCity ? mapCity(user.selectedCity) : null,
  }
}

export function mapProduct(productCity: {
  id: number
  cityId: number
  stock: number
  minimumQuantity: number
  quantityStep: number
  maximumQuantity: number
  unit: string
  isAvailable: boolean
  product: {
    id: number
    name: string
    nameEn: string | null
    description: string
    descriptionEn: string | null
    price: number
    creditsEnabled?: boolean
    creditsPrice?: number | null
    minCreditsRequired?: number | null
    image: string | null
    categoryId: number
    isActive: boolean
    isRecommended: boolean
    category: {
      name: string
      nameEn: string | null
    }
  }
}) {
  return {
    id: productCity.product.id,
    productCityId: productCity.id,
    cityId: productCity.cityId,
    name: productCity.product.name,
    nameTranslations: createTranslations(productCity.product.name, productCity.product.nameEn),
    description: productCity.product.description,
    descriptionTranslations: createTranslations(productCity.product.description, productCity.product.descriptionEn),
    price: productCity.product.price,
    creditsEnabled: productCity.product.creditsEnabled ?? false,
    creditsPrice: productCity.product.creditsPrice ?? null,
    minCreditsRequired: productCity.product.minCreditsRequired ?? null,
    image: productCity.product.image,
    categoryId: productCity.product.categoryId,
    categoryName: productCity.product.category.name,
    categoryNameTranslations: createTranslations(productCity.product.category.name, productCity.product.category.nameEn),
    isRecommended: productCity.product.isRecommended,
    stock: productCity.stock,
    isAvailable: productCity.product.isActive && productCity.isAvailable && productCity.stock > 0,
    minimumQuantity: productCity.minimumQuantity,
    quantityStep: productCity.quantityStep,
    maximumQuantity: productCity.maximumQuantity,
    unit: productCity.unit,
    unitTranslations: createTranslations(productCity.unit),
  }
}

export async function getAuthorizedUser(request: Request, response: Response) {
  const authorization = request.header('authorization') ?? request.header('x-session-token') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization
  const telegramId = verifySessionToken(token)

  if (!telegramId) {
    sendError(response, 401, 'invalid_session_token', 'Invalid session token')
    return null
  }

  const user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user) {
    sendError(response, 404, 'user_not_found', 'User not found')
    return null
  }

  return user
}

export async function getAuthorizedUserByRole(request: Request, response: Response, allowedRoles: AppRole[]) {
  const user = await getAuthorizedUser(request, response)
  if (!user) {
    return null
  }

  if (!hasAnyRole(user.role, allowedRoles)) {
    sendError(response, 403, 'forbidden', 'Insufficient permissions')
    return null
  }

  return user
}

export async function getOrCreateCart(userId: number) {
  return prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
  })
}

export async function buildCartResponse(userId: number) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          productCity: {
            include: {
              product: {
                include: {
                  category: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!cart) {
    return {
      cart: {
        id: 0,
        items: [],
        subtotal: 0,
        deliveryFee: 0,
        discount: 0,
        total: 0,
      },
      recommended: [],
    }
  }

  const items = cart.items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    lineTotal: normalizeQuantity(item.productCity.product.price * item.quantity),
    productCity: mapProduct(item.productCity),
  }))

  const subtotal = normalizeQuantity(items.reduce((sum, item) => sum + item.lineTotal, 0))
  const cartProductCityIds = cart.items.map((item) => item.productCityId)
  const cityId = cart.items[0]?.productCity.cityId

  const recommended = cityId
    ? await prisma.productCity.findMany({
        where: {
          cityId,
          isAvailable: true,
          productId: { notIn: cart.items.map((item) => item.productCity.productId) },
          product: {
            isActive: true,
            isRecommended: true,
          },
          id: { notIn: cartProductCityIds },
        },
        include: {
          product: {
            include: {
              category: true,
            },
          },
        },
        take: 3,
      })
    : []

  return {
    cart: {
      id: cart.id,
      items,
      subtotal,
      deliveryFee: 0,
      discount: 0,
      total: subtotal,
    },
    recommended: recommended.map(mapProduct),
  }
}
export function normalizeRole(value: unknown): AppRole {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return APP_ROLES.includes(normalized as AppRole) ? normalized as AppRole : 'CUSTOMER'
}

export function hasAnyRole(value: unknown, allowed: AppRole[]) {
  const role = normalizeRole(value)
  return allowed.includes(role)
}
