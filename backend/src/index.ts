import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { buildCartResponse, getOrCreateCart, isAllowedQuantity, mapProduct, prisma } from './lib.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

app.use(cors({ origin: frontendUrl }))
app.use(express.json())

app.get('/health', (_request, response) => {
  response.json({ ok: true })
})

app.post('/api/session/bootstrap', async (request, response) => {
  const telegramUser = request.body.telegramUser

  if (!telegramUser?.id || !telegramUser?.first_name) {
    response.status(400).json({ message: 'Telegram user data is required' })
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
    telegramEnvironment: Boolean(request.body.isTelegramEnvironment),
    user,
    cities,
    categories,
  })
})

app.get('/api/catalog', async (request, response) => {
  const cityId = Number(request.query.cityId)
  const search = String(request.query.search ?? '').trim()
  const categoryId = request.query.categoryId ? Number(request.query.categoryId) : undefined

  if (!Number.isInteger(cityId)) {
    response.status(400).json({ message: 'cityId is required' })
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
    orderBy: [
      { product: { isRecommended: 'desc' } },
      { product: { name: 'asc' } },
    ],
  })

  response.json({
    products: productCities.map(mapProduct),
  })
})

app.get('/api/products/:productId', async (request, response) => {
  const productId = Number(request.params.productId)
  const cityId = Number(request.query.cityId)

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

app.get('/api/cart', async (request, response) => {
  const telegramId = String(request.query.telegramId ?? '')

  const user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user) {
    response.status(404).json({ message: 'User not found' })
    return
  }

  await getOrCreateCart(user.id)
  response.json(await buildCartResponse(user.id))
})

app.patch('/api/users/:telegramId/city', async (request, response) => {
  const telegramId = String(request.params.telegramId)
  const cityId = Number(request.body.cityId)

  const user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user) {
    response.status(404).json({ message: 'User not found' })
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
    where: { telegramId },
    data: { selectedCityId: cityId },
    include: { selectedCity: true },
  })

  response.json({ user: updatedUser })
})

app.post('/api/cart/items', async (request, response) => {
  const telegramId = String(request.body.telegramId ?? '')
  const productCityId = Number(request.body.productCityId)
  const quantity = Number(request.body.quantity)

  const user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user) {
    response.status(404).json({ message: 'User not found' })
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

app.patch('/api/cart/items/:itemId', async (request, response) => {
  const itemId = Number(request.params.itemId)
  const telegramId = String(request.body.telegramId ?? '')
  const quantity = Number(request.body.quantity)

  const user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user) {
    response.status(404).json({ message: 'User not found' })
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

app.delete('/api/cart/items/:itemId', async (request, response) => {
  const itemId = Number(request.params.itemId)
  const telegramId = String(request.query.telegramId ?? '')

  const user = await prisma.user.findUnique({ where: { telegramId } })

  if (!user) {
    response.status(404).json({ message: 'User not found' })
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
