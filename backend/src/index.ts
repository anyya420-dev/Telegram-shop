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

const authRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
})

async function getAuthorizedUser(request: express.Request, response: express.Response) {
  const authorization = request.header('authorization') ?? request.header('x-session-token') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization
  const telegramId = verifySessionToken(token)

  if (!telegramId) {
    response.status(401).json({ message: 'Invalid session token' })
    return null
  }

  const user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user) {
    response.status(404).json({ message: 'User not found' })
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
      response.status(503).json({ message: 'Telegram bot token is required for Web App verification' })
      return
    }

    telegramUser = verifyTelegramInitData(initData, botToken)

    if (!telegramUser) {
      response.status(401).json({ message: 'Telegram init data verification failed' })
      return
    }
  } else if (allowDemoMode) {
    telegramUser = DEMO_TELEGRAM_USER
  } else {
    response.status(401).json({ message: 'Telegram init data is required' })
    return
  }

  const user = await prisma.user.upsert({
    where: { telegramId: String(telegramUser.id) },
    create: {
      telegramId: String(telegramUser.id),
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name,
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
    user,
    cities,
    categories,
  })
})

app.get('/api/catalog', async (request, response) => {
  const cityId = parsePositiveInt(request.query.cityId)
  const search = String(request.query.search ?? '').trim()
  const categoryId = request.query.categoryId ? parsePositiveInt(request.query.categoryId) ?? undefined : undefined

  if (!cityId) {
    response.status(400).json({ message: 'cityId must be a positive integer' })
    return
  }

  const productCities = await prisma.productCity.findMany({
    where: {
      cityId,
      isAvailable: true,
      stock: { gt: 0 },
      product: {
        isActive: true,
        ...(search ? { name: { contains: search } } : {}),
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
    response.status(400).json({ message: 'productId and cityId must be positive integers' })
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
    response.status(404).json({ message: 'Product not found for selected city' })
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
    response.status(400).json({ message: 'cityId must be a positive integer' })
    return
  }

  const city = await prisma.city.findFirst({ where: { id: cityId, isActive: true } })

  if (!city) {
    response.status(404).json({ message: 'City not found' })
    return
  }

  const cart = await getOrCreateCart(user.id)
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })

  const updatedUser = await prisma.user.update({
    where: { telegramId: user.telegramId },
    data: { selectedCityId: cityId },
    include: { selectedCity: true },
  })

  response.json({ user: updatedUser })
})

app.post('/api/cart/items', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)

  if (!user) {
    return
  }

  const productCityId = parsePositiveInt(request.body.productCityId)
  const quantity = Number(request.body.quantity)

  if (!productCityId) {
    response.status(400).json({ message: 'productCityId must be a positive integer' })
    return
  }

  const productCity = await prisma.productCity.findUnique({
    where: { id: productCityId },
    include: {
      product: true,
    },
  })

  if (!productCity || !productCity.isAvailable) {
    response.status(404).json({ message: 'Product is unavailable' })
    return
  }

  if (user.selectedCityId !== productCity.cityId) {
    response.status(400).json({ message: 'Choose the same city before adding products' })
    return
  }

  if (!isAllowedQuantity(quantity, productCity.minimumQuantity, productCity.quantityStep, productCity.maximumQuantity)) {
    response.status(400).json({ message: 'Quantity does not match product rules' })
    return
  }

  if (quantity > productCity.stock) {
    response.status(400).json({ message: 'Requested quantity exceeds stock' })
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
    response.status(400).json({ message: 'itemId must be a positive integer' })
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
    response.status(404).json({ message: 'Cart item not found' })
    return
  }

  if (!isAllowedQuantity(quantity, item.productCity.minimumQuantity, item.productCity.quantityStep, item.productCity.maximumQuantity)) {
    response.status(400).json({ message: 'Quantity does not match product rules' })
    return
  }

  if (quantity > item.productCity.stock) {
    response.status(400).json({ message: 'Requested quantity exceeds stock' })
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
    response.status(400).json({ message: 'itemId must be a positive integer' })
    return
  }

  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: { cart: true },
  })

  if (!item || item.cart.userId !== user.id) {
    response.status(404).json({ message: 'Cart item not found' })
    return
  }

  await prisma.cartItem.delete({ where: { id: itemId } })
  response.json(await buildCartResponse(user.id))
})

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})
