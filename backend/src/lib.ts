import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

export const DEMO_TELEGRAM_ID = '900000001'

export function normalizeQuantity(value: number) {
  return Number(value.toFixed(2))
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
    description: string
    price: number
    image: string
    categoryId: number
    isRecommended: boolean
    category: {
      name: string
    }
  }
}) {
  return {
    id: productCity.product.id,
    productCityId: productCity.id,
    cityId: productCity.cityId,
    name: productCity.product.name,
    description: productCity.product.description,
    price: productCity.product.price,
    image: productCity.product.image,
    categoryId: productCity.product.categoryId,
    categoryName: productCity.product.category.name,
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
