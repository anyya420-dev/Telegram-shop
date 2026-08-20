import { PrismaClient } from '@prisma/client'
import { createHmac, timingSafeEqual } from 'node:crypto'

process.env.DATABASE_URL ??= 'file:./dev.db'

export const prisma = new PrismaClient()
export const DEMO_TELEGRAM_USER = {
  id: '900000001',
  username: 'demo_customer',
  first_name: 'Demo',
}

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-session-secret'

export type AppLanguage = 'ru' | 'en'

type TelegramUserPayload = {
  id: string
  username?: string
  first_name: string
}

export function normalizeQuantity(value: number) {
  return Number(value.toFixed(2))
}

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

  const rawUser = params.get('user')

  if (!rawUser) {
    return null
  }

  try {
    const parsedUser = JSON.parse(rawUser) as { id?: number | string; username?: string; first_name?: string }

    if (!parsedUser.id || !parsedUser.first_name) {
      return null
    }

    return {
      id: String(parsedUser.id),
      username: parsedUser.username,
      first_name: parsedUser.first_name,
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
    image: string
    categoryId: number
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
    image: productCity.product.image,
    categoryId: productCity.product.categoryId,
    categoryName: productCity.product.category.name,
    categoryNameTranslations: createTranslations(productCity.product.category.name, productCity.product.category.nameEn),
    isRecommended: productCity.product.isRecommended,
    stock: productCity.stock,
    isAvailable: productCity.isAvailable,
    minimumQuantity: productCity.minimumQuantity,
    quantityStep: productCity.quantityStep,
    maximumQuantity: productCity.maximumQuantity,
    unit: productCity.unit,
  }
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
