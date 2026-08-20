import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import {
  buildCartResponse,
  createSessionToken,
  DEMO_TELEGRAM_USER,
  getOrCreateCart,
  isAllowedQuantity,
  mapProduct,
  prisma,
  verifySessionToken,
  verifyTelegramInitData,
} from './lib.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const allowDemoMode = process.env.ALLOW_DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production'

app.use(cors({ origin: frontendUrl }))
app.use(express.json())

app.get('/health', (_request, response) => {
  response.json({ ok: true })
})

function parsePositiveInt(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function isLanguage(value: unknown): value is 'ru' | 'en' {
  return value === 'ru' || value === 'en'
}

function sendError(response: express.Response, status: number, code: string, message: string) {
  response.status(status).json({ code, message })
}

const authRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'too_many_requests', message: 'Too many requests, please try again later' },
})

async function getAuthorizedUser(request: express.Request, response: express.Response) {
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

app.post('/api/session/bootstrap', authRateLimiter, async (request, response) => {
  let telegramUser: { id: string; username?: string; first_name: string } | null = null
  const initData = String(request.body.initData ?? '')

  if (initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN

    if (!botToken) {
      sendError(response, 503, 'telegram_bot_token_required', 'Telegram bot token is required for Web App verification')
      return
    }

    telegramUser = verifyTelegramInitData(initData, botToken)

    if (!telegramUser) {
      sendError(response, 401, 'telegram_verification_failed', 'Telegram init data verification failed')
      return
    }
  } else if (allowDemoMode) {
    telegramUser = DEMO_TELEGRAM_USER
  } else {
    sendError(response, 401, 'telegram_init_data_required', 'Telegram init data is required')
    return
  }

  const user = await prisma.user.upsert({
    where: { telegramId: String(telegramUser.id) },
    create: {
      telegramId: String(telegramUser.id),
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name,
      language: 'ru',
    },
    update: {
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name,
    },
    include: {
      selectedCity: true,
    },
  })

  await getOrCreateCart(user.id)

  const [cities, categories] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ])

  response.json({
    telegramEnvironment: Boolean(initData),
    sessionToken: createSessionToken(user.telegramId),
    user: {
      ...user,
      selectedCity: user.selectedCity
        ? {
            ...user.selectedCity,
            nameTranslations: {
              ru: user.selectedCity.name,
              en: user.selectedCity.nameEn ?? user.selectedCity.name,
            },
          }
        : null,
    },
    cities: cities.map((city) => ({
      ...city,
      nameTranslations: {
        ru: city.name,
        en: city.nameEn ?? city.name,
      },
    })),
    categories: categories.map((category) => ({
      ...category,
      nameTranslations: {
        ru: category.name,
        en: category.nameEn ?? category.name,
      },
    })),
  })
})

app.get('/api/catalog', async (request, response) => {
  const cityId = parsePositiveInt(request.query.cityId)
  const search = String(request.query.search ?? '').trim()
  const categoryId = request.query.categoryId ? parsePositiveInt(request.query.categoryId) ?? undefined : undefined

  if (!cityId) {
    sendError(response, 400, 'city_required', 'cityId must be a positive integer')
    return
  }

  const productCities = await prisma.productCity.findMany({
    where: {
      cityId,
      isAvailable: true,
      stock: { gt: 0 },
      product: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { nameEn: { contains: search } },
                { description: { contains: search } },
                { descriptionEn: { contains: search } },
              ],
            }
          : {}),
        ...(categoryId ? { categoryId } : {}),
      },
    },
    include: {
      product: {
        include: {
          category: true,
        },
      },
    },
    orderBy: [{ product: { isRecommended: 'desc' } }, { product: { name: 'asc' } }],
  })

  response.json({ products: productCities.map(mapProduct) })
})

app.get('/api/products/:productId', async (request, response) => {
  const productId = parsePositiveInt(request.params.productId)
  const cityId = parsePositiveInt(request.query.cityId)

  if (!productId || !cityId) {
    sendError(response, 400, 'product_city_required', 'productId and cityId must be positive integers')
    return
  }

  const productCity = await prisma.productCity.findFirst({
    where: {
      productId,
      cityId,
      isAvailable: true,
      product: { isActive: true },
    },
    include: {
      product: {
        include: {
          category: true,
        },
      },
    },
  })

  if (!productCity) {
    sendError(response, 404, 'product_not_found', 'Product not found for selected city')
    return
  }

  response.json({ product: mapProduct(productCity) })
})

app.get('/api/cart', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  await getOrCreateCart(user.id)
  response.json(await buildCartResponse(user.id))
})

app.patch('/api/users/city', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const cityId = parsePositiveInt(request.body.cityId)

  if (!cityId) {
    sendError(response, 400, 'city_required', 'cityId must be a positive integer')
    return
  }

  const city = await prisma.city.findFirst({ where: { id: cityId, isActive: true } })

  if (!city) {
    sendError(response, 404, 'city_not_found', 'City not found')
    return
  }

  const cart = await getOrCreateCart(user.id)
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })

  const updatedUser = await prisma.user.update({
    where: { telegramId: user.telegramId },
    data: { selectedCityId: cityId },
    include: { selectedCity: true },
  })

  response.json({
    user: {
      ...updatedUser,
      selectedCity: updatedUser.selectedCity
        ? {
            ...updatedUser.selectedCity,
            nameTranslations: {
              ru: updatedUser.selectedCity.name,
              en: updatedUser.selectedCity.nameEn ?? updatedUser.selectedCity.name,
            },
          }
        : null,
    },
  })
})

app.patch('/api/users/language', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const language = request.body.language

  if (!isLanguage(language)) {
    sendError(response, 400, 'request_failed', 'language must be ru or en')
    return
  }

  const updatedUser = await prisma.user.update({
    where: { telegramId: user.telegramId },
    data: { language },
    include: { selectedCity: true },
  })

  response.json({
    user: {
      ...updatedUser,
      selectedCity: updatedUser.selectedCity
        ? {
            ...updatedUser.selectedCity,
            nameTranslations: {
              ru: updatedUser.selectedCity.name,
              en: updatedUser.selectedCity.nameEn ?? updatedUser.selectedCity.name,
            },
          }
        : null,
    },
  })
})

app.post('/api/cart/items', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const productCityId = parsePositiveInt(request.body.productCityId)
  const quantity = Number(request.body.quantity)

  if (!productCityId) {
    sendError(response, 400, 'product_city_required', 'productCityId must be a positive integer')
    return
  }

  const productCity = await prisma.productCity.findUnique({
    where: { id: productCityId },
    include: {
      product: true,
    },
  })

  if (!productCity || !productCity.isAvailable) {
    sendError(response, 404, 'product_unavailable', 'Product is unavailable')
    return
  }

  if (user.selectedCityId !== productCity.cityId) {
    sendError(response, 400, 'city_mismatch', 'Choose the same city before adding products')
    return
  }

  if (!isAllowedQuantity(quantity, productCity.minimumQuantity, productCity.quantityStep, productCity.maximumQuantity)) {
    sendError(response, 400, 'quantity_invalid', 'Quantity does not match product rules')
    return
  }

  if (quantity > productCity.stock) {
    sendError(response, 400, 'stock_exceeded', 'Requested quantity exceeds stock')
    return
  }

  const cart = await getOrCreateCart(user.id)

  await prisma.cartItem.upsert({
    where: {
      cartId_productCityId: {
        cartId: cart.id,
        productCityId,
      },
    },
    create: {
      cartId: cart.id,
      productCityId,
      quantity,
    },
    update: {
      quantity,
    },
  })

  response.json(await buildCartResponse(user.id))
})

app.patch('/api/cart/items/:itemId', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const itemId = parsePositiveInt(request.params.itemId)
  const quantity = Number(request.body.quantity)

  if (!itemId) {
    sendError(response, 400, 'cart_item_required', 'itemId must be a positive integer')
    return
  }

  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: {
      cart: true,
      productCity: true,
    },
  })

  if (!item || item.cart.userId !== user.id) {
    sendError(response, 404, 'cart_item_not_found', 'Cart item not found')
    return
  }

  if (!isAllowedQuantity(quantity, item.productCity.minimumQuantity, item.productCity.quantityStep, item.productCity.maximumQuantity)) {
    sendError(response, 400, 'quantity_invalid', 'Quantity does not match product rules')
    return
  }

  if (quantity > item.productCity.stock) {
    sendError(response, 400, 'stock_exceeded', 'Requested quantity exceeds stock')
    return
  }

  await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  })

  response.json(await buildCartResponse(user.id))
})

app.delete('/api/cart/items/:itemId', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const itemId = parsePositiveInt(request.params.itemId)

  if (!itemId) {
    sendError(response, 400, 'cart_item_required', 'itemId must be a positive integer')
    return
  }

  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: { cart: true },
  })

  if (!item || item.cart.userId !== user.id) {
    sendError(response, 404, 'cart_item_not_found', 'Cart item not found')
    return
  }

  await prisma.cartItem.delete({ where: { id: itemId } })
  response.json(await buildCartResponse(user.id))
})

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})
