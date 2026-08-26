import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

const repoRoot = '/home/runner/work/Telegram-shop/Telegram-shop'
const pgBinDir = '/usr/lib/postgresql/16/bin'
const pgPort = 55432
const dbName = 'telegram_shop_test'
const dataDir = mkdtempSync(join(tmpdir(), 'telegram-shop-pg-'))

const databaseUrl = `postgresql://postgres@127.0.0.1:${pgPort}/${dbName}?schema=public`

let server: Server | null = null
let baseUrl = ''
let createApp: (() => any) | null = null
let prisma: any = null
let createSessionToken: ((telegramId: string) => string) | null = null

function run(command: string, args: string[], cwd = repoRoot, env = process.env) {
  const childEnv = { ...env }
  delete childEnv.NODE_OPTIONS
  execFileSync(command, args, {
    cwd,
    env: childEnv,
    stdio: 'ignore',
  })
}

before(async () => {
  run(`${pgBinDir}/initdb`, ['-D', dataDir, '-A', 'trust', '-U', 'postgres'])
  run(`${pgBinDir}/pg_ctl`, ['-D', dataDir, '-o', `-p ${pgPort} -k ${dataDir}`, '-w', 'start'])
  run(`${pgBinDir}/createdb`, ['-h', dataDir, '-p', String(pgPort), '-U', 'postgres', dbName])

  process.env.NODE_ENV = 'production'
  process.env.ADMIN_PASSWORD = 'admin-secret'
  process.env.DATABASE_URL = databaseUrl
  process.env.FRONTEND_URL = 'https://telegram-shop-3781.onrender.com/'
  process.env.WEB_APP_URL = 'https://telegram-shop-webapp.onrender.com/webapp'
  delete process.env.CORS_ALLOWED_ORIGINS

  run('npm', ['run', 'db:generate'])
  run('npm', ['run', 'db:migrate:deploy', '--workspace', 'backend'])

  const indexModule = await import('../src/index.js')
  const libModule = await import('../src/lib.js')
  createApp = indexModule.createApp
  prisma = libModule.prisma
  createSessionToken = libModule.createSessionToken

  const app = createApp()
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
    server.once('error', reject)
  })

  const address = server!.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  if (prisma) {
    await prisma.$disconnect()
  }

  try {
    run(`${pgBinDir}/pg_ctl`, ['-D', dataDir, '-w', 'stop', '-m', 'fast'])
  } catch {
    // ignore teardown failures when startup didn't complete
  }
  rmSync(dataDir, { recursive: true, force: true })
})

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init)
}

async function requestJson(path: string, init: RequestInit = {}) {
  const response = await request(path, init)
  const body = await response.json().catch(() => ({}))
  return { response, body }
}

test('admin session flow keeps public endpoints independent', async () => {
  const publicBefore = await request('/api/health')
  assert.equal(publicBefore.status, 200)

  const loginGood = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-secret' }),
  })
  assert.equal(loginGood.status, 200)
  const cookieHeader = loginGood.headers.get('set-cookie')
  assert.ok(cookieHeader)
  assert.match(cookieHeader, /HttpOnly/i)
  assert.match(cookieHeader, /Secure/i)
  assert.match(cookieHeader, /SameSite=None/i)
  assert.match(cookieHeader, /Path=\/api\/admin/i)

  const loginBad = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong' }),
  })
  assert.equal(loginBad.status, 401)

  const adminWithoutSession = await request('/api/admin/stats')
  assert.equal(adminWithoutSession.status, 401)

  const adminWithSession = await request('/api/admin/stats', {
    headers: { cookie: cookieHeader },
  })
  assert.equal(adminWithSession.status, 200)

  const publicDuring = await request('/api/health')
  assert.equal(publicDuring.status, 200)

  const logout = await request('/api/admin/auth/logout', {
    method: 'POST',
    headers: { cookie: cookieHeader },
  })
  assert.equal(logout.status, 200)

  const adminAfterLogout = await request('/api/admin/stats', {
    headers: { cookie: cookieHeader },
  })
  assert.equal(adminAfterLogout.status, 401)

  const publicAfterLogout = await request('/api/health')
  assert.equal(publicAfterLogout.status, 200)
})

test('cors allows only production frontend origin and handles preflight', async () => {
  const preflight = await request('/api/admin/auth/status', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://telegram-shop.onrender.com',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://telegram-shop.onrender.com')
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')

  const legacyOrigin = await request('/api/health', {
    headers: {
      Origin: 'https://telegram-shop-3781.onrender.com',
    },
  })
  assert.equal(legacyOrigin.status, 200)
  assert.equal(legacyOrigin.headers.get('access-control-allow-origin'), 'https://telegram-shop-3781.onrender.com')

  const configuredWebAppOrigin = await request('/api/health', {
    headers: {
      Origin: 'https://telegram-shop-webapp.onrender.com',
    },
  })
  assert.equal(configuredWebAppOrigin.status, 200)
  assert.equal(configuredWebAppOrigin.headers.get('access-control-allow-origin'), 'https://telegram-shop-webapp.onrender.com')

  const disallowed = await request('/api/health', {
    headers: {
      Origin: 'https://evil.example.com',
    },
  })
  assert.equal(disallowed.status, 403)
  const body = await disallowed.json() as { code?: string }
  assert.equal(body.code, 'cors_origin_not_allowed')

  const noOrigin = await request('/api/health')
  assert.equal(noOrigin.status, 200)
})

test('payment settings CRUD and checkout manual payment flow', async () => {
  const login = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-secret' }),
  })
  assert.equal(login.status, 200)
  const adminCookie = login.headers.get('set-cookie') ?? ''
  assert.ok(adminCookie)

  const unauthorizedCreate = await request('/api/admin/payment-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'card', title: 'Card', cardNumber: '1111222233334444', currency: 'USD' }),
  })
  assert.equal(unauthorizedCreate.status, 401)

  const createdCard = await requestJson('/api/admin/payment-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ type: 'card', title: 'Main Card', cardNumber: '1111222233334444', cardholderName: 'SHOP ADMIN', currency: 'USD' }),
  })
  assert.equal(createdCard.response.status, 201)
  assert.equal(createdCard.body.method.type, 'card')

  const createdTon = await requestJson('/api/admin/payment-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ type: 'ton', title: 'TON Mainnet', walletAddress: 'UQTONMAINNETADDR', network: 'TON Mainnet', currency: 'TON' }),
  })
  assert.equal(createdTon.response.status, 201)
  assert.equal(createdTon.body.method.type, 'ton')

  const createdCrypto = await requestJson('/api/admin/payment-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ type: 'crypto', title: 'USDT TRC20', walletAddress: 'TUSDTADDRESS', network: 'TRC20', currency: 'USDT' }),
  })
  assert.equal(createdCrypto.response.status, 201)
  assert.equal(createdCrypto.body.method.type, 'crypto')

  const updatedCrypto = await requestJson(`/api/admin/payment-settings/${createdCrypto.body.method.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ title: 'USDT TRC20 Wallet 1' }),
  })
  assert.equal(updatedCrypto.response.status, 200)
  assert.equal(updatedCrypto.body.method.title, 'USDT TRC20 Wallet 1')

  const toggledTon = await requestJson(`/api/admin/payment-settings/${createdTon.body.method.id}/toggle`, {
    method: 'PATCH',
    headers: { cookie: adminCookie },
  })
  assert.equal(toggledTon.response.status, 200)
  assert.equal(toggledTon.body.method.isEnabled, false)

  const allMethods = await requestJson('/api/admin/payment-settings', {
    headers: { cookie: adminCookie },
  })
  assert.equal(allMethods.response.status, 200)
  assert.equal(allMethods.body.methods.length >= 3, true)

  const deletedTon = await requestJson(`/api/admin/payment-settings/${createdTon.body.method.id}`, {
    method: 'DELETE',
    headers: { cookie: adminCookie },
  })
  assert.equal(deletedTon.response.status, 200)

  const telegramId = '900000001'
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: { telegramId, firstName: 'Demo', username: 'demo_customer', language: 'ru' },
    update: {},
  })
  const sessionToken = createSessionToken!(telegramId)
  const userId = user.id
  const authHeader = { 'X-Session-Token': sessionToken, 'Content-Type': 'application/json' }

  const city = await prisma.city.create({ data: { name: 'Test City', nameEn: 'Test City', isActive: true } })
  const category = await prisma.category.create({ data: { name: 'Test Category', nameEn: 'Test Category', isActive: true } })
  const product = await prisma.product.create({
    data: {
      name: 'Test Product',
      description: 'Test',
      price: 25,
      categoryId: category.id,
      isActive: true,
      isRecommended: false,
    },
  })
  const productCity = await prisma.productCity.create({
    data: {
      productId: product.id,
      cityId: city.id,
      stock: 100,
      minimumQuantity: 1,
      quantityStep: 1,
      maximumQuantity: 10,
      unit: 'шт.',
      isAvailable: true,
    },
  })

  await prisma.user.update({ where: { id: userId }, data: { selectedCityId: city.id } })
  const cart = await prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} })
  await prisma.cartItem.create({ data: { cartId: cart.id, productCityId: productCity.id, quantity: 2 } })

  const enabledMethods = await requestJson('/api/payments/methods', {
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(enabledMethods.response.status, 200)
  assert.equal(enabledMethods.body.methods.some((method: any) => method.id === createdTon.body.method.id), false)
  const cryptoMethod = enabledMethods.body.methods.find((method: any) => method.type === 'crypto')
  assert.ok(cryptoMethod)
  assert.equal(Boolean(cryptoMethod.network && cryptoMethod.walletAddress), true)

  const checkout = await requestJson('/api/orders', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ paymentMethodId: createdCard.body.method.id }),
  })
  assert.equal(checkout.response.status, 200)
  assert.equal(checkout.body.order.paymentStatus, 'unpaid')
  assert.equal(checkout.body.order.status, 'pending')

  const markPaid = await requestJson(`/api/orders/${checkout.body.order.id}/mark-paid`, {
    method: 'POST',
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(markPaid.response.status, 200)
  assert.equal(markPaid.body.order.paymentStatus, 'pending')
  assert.equal(markPaid.body.order.status, 'payment_pending')

  const pendingOrders = await requestJson('/api/admin/orders?status=payment_pending', {
    headers: { cookie: adminCookie },
  })
  assert.equal(pendingOrders.response.status, 200)
  assert.equal(pendingOrders.body.orders.some((order: any) => order.id === checkout.body.order.id), true)

  const confirmPayment = await requestJson(`/api/admin/orders/${checkout.body.order.id}/payment`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ action: 'confirm' }),
  })
  assert.equal(confirmPayment.response.status, 200)
  assert.equal(confirmPayment.body.order.paymentStatus, 'confirmed')
  assert.equal(confirmPayment.body.order.status, 'confirmed')
})

test('cart and checkout enforce quantity, delivery, stock, and cart clearing rules', async () => {
  const telegramId = '900000002'
  const user = await prisma.user.create({
    data: { telegramId, firstName: 'Buyer', username: 'buyer', language: 'ru' },
  })
  const sessionToken = createSessionToken!(telegramId)
  const authHeaders = { 'X-Session-Token': sessionToken, 'Content-Type': 'application/json' }

  const city = await prisma.city.create({ data: { name: 'Checkout City', nameEn: 'Checkout City', isActive: true } })
  const category = await prisma.category.create({ data: { name: 'Checkout Category', nameEn: 'Checkout Category', isActive: true } })
  const product = await prisma.product.create({
    data: {
      name: 'Flow Product',
      nameEn: 'Flow Product',
      description: 'Flow test product',
      descriptionEn: 'Flow test product',
      price: 12,
      categoryId: category.id,
      isActive: true,
    },
  })
  const productCity = await prisma.productCity.create({
    data: {
      productId: product.id,
      cityId: city.id,
      stock: 6,
      minimumQuantity: 2,
      quantityStep: 2,
      maximumQuantity: 6,
      unit: 'шт.',
      isAvailable: true,
    },
  })
  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      type: 'card',
      title: 'Checkout Card',
      cardNumber: '5555444433332222',
      cardholderName: 'SHOP',
      currency: 'USD',
      isEnabled: true,
    },
  })
  const deliveryOption = await prisma.deliveryOption.create({
    data: {
      name: 'Courier',
      nameEn: 'Courier',
      type: 'delivery',
      price: 5,
      isActive: true,
      sortOrder: 1,
    },
  })
  const discount = await prisma.discount.create({
    data: {
      code: 'SAVE10',
      type: 'percent',
      value: 10,
      minOrderAmount: 20,
      usageLimit: 5,
      isActive: true,
    },
  })

  await prisma.user.update({ where: { id: user.id }, data: { selectedCityId: city.id } })

  const firstAdd = await requestJson('/api/cart/items', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ productCityId: productCity.id, quantity: 2 }),
  })
  assert.equal(firstAdd.response.status, 200)
  assert.equal(firstAdd.body.cart.items[0].quantity, 2)

  const secondAdd = await requestJson('/api/cart/items', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ productCityId: productCity.id, quantity: 2 }),
  })
  assert.equal(secondAdd.response.status, 200)
  assert.equal(secondAdd.body.cart.items[0].quantity, 4)
  assert.equal(secondAdd.body.cart.subtotal, 48)

  const deliveryOptionsResponse = await requestJson('/api/delivery', {
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(deliveryOptionsResponse.response.status, 200)
  assert.deepEqual(Object.keys(deliveryOptionsResponse.body.options[0]).sort(), ['id', 'name', 'nameEn', 'price', 'type'])

  const invalidDelivery = await requestJson('/api/orders', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ paymentMethodId: paymentMethod.id, deliveryOptionId: 999999 }),
  })
  assert.equal(invalidDelivery.response.status, 400)
  assert.equal(invalidDelivery.body.code, 'delivery_option_unavailable')

  const cartId = secondAdd.body.cart.id as number
  const cartItemId = secondAdd.body.cart.items[0].id as number
  assert.ok(cartId)
  assert.ok(cartItemId)

  await prisma.cartItem.update({
    where: { id: cartItemId },
    data: { quantity: 3 },
  })

  const invalidQuantity = await requestJson('/api/orders', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ paymentMethodId: paymentMethod.id, deliveryOptionId: deliveryOption.id }),
  })
  assert.equal(invalidQuantity.response.status, 400)
  assert.equal(invalidQuantity.body.code, 'quantity_invalid')

  await prisma.cartItem.update({
    where: { id: cartItemId },
    data: { quantity: 4 },
  })

  const checkout = await requestJson('/api/orders', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      paymentMethodId: paymentMethod.id,
      deliveryOptionId: deliveryOption.id,
      discountCode: discount.code,
      comment: 'Leave at the door',
    }),
  })
  assert.equal(checkout.response.status, 200)
  assert.equal(checkout.body.order.subtotal, 48)
  assert.equal(checkout.body.order.discountAmount, 4.8)
  assert.equal(checkout.body.order.deliveryFee, 5)
  assert.equal(checkout.body.order.total, 48.2)
  assert.equal(checkout.body.order.items.length, 1)
  assert.equal(checkout.body.order.items[0].quantity, 4)
  assert.equal(checkout.body.order.comment, 'Leave at the door')
  assert.equal(checkout.body.cart.items.length, 0)

  const updatedProductCity = await prisma.productCity.findUniqueOrThrow({ where: { id: productCity.id } })
  assert.equal(updatedProductCity.stock, 2)

  const updatedDiscount = await prisma.discount.findUniqueOrThrow({ where: { id: discount.id } })
  assert.equal(updatedDiscount.usedCount, 1)

  const cartAfterCheckout = await requestJson('/api/cart', {
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(cartAfterCheckout.response.status, 200)
  assert.equal(cartAfterCheckout.body.cart.id, cartId)
  assert.equal(cartAfterCheckout.body.cart.items.length, 0)

  const secondCheckout = await requestJson('/api/orders', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ paymentMethodId: paymentMethod.id }),
  })
  assert.equal(secondCheckout.response.status, 400)
  assert.equal(secondCheckout.body.code, 'cart_empty')
})

test('session bootstrap, city selection, and catalog stay city-aware', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'bootstrap-secret'
  process.env.ALLOW_DEMO_MODE = 'true'

  const cityNorth = await prisma.city.create({ data: { name: 'North City', nameEn: 'North City', isActive: true, sortOrder: 1 } })
  const citySouth = await prisma.city.create({ data: { name: 'South City', nameEn: 'South City', isActive: true, sortOrder: 2 } })
  await prisma.city.create({ data: { name: 'Hidden City', nameEn: 'Hidden City', isActive: false, sortOrder: 3 } })
  const categoryTea = await prisma.category.create({ data: { name: 'Tea', nameEn: 'Tea', isActive: true, sortOrder: 1 } })
  const categoryCoffee = await prisma.category.create({ data: { name: 'Coffee', nameEn: 'Coffee', isActive: true, sortOrder: 2 } })

  const activeProduct = await prisma.product.create({
    data: {
      name: 'Aurora Tea',
      nameEn: 'Aurora Tea',
      description: 'Northern harvest',
      descriptionEn: 'Northern harvest',
      price: 15,
      image: 'https://cdn.example.com/aurora-tea.png',
      categoryId: categoryTea.id,
      isActive: true,
      isRecommended: true,
    },
  })
  const hiddenProduct = await prisma.product.create({
    data: {
      name: 'Quiet Coffee',
      nameEn: 'Quiet Coffee',
      description: 'Archived roast',
      descriptionEn: 'Archived roast',
      price: 12,
      categoryId: categoryCoffee.id,
      isActive: false,
    },
  })

  const activeCityProduct = await prisma.productCity.create({
    data: {
      productId: activeProduct.id,
      cityId: cityNorth.id,
      stock: 5,
      minimumQuantity: 1,
      quantityStep: 1,
      maximumQuantity: 10,
      unit: 'шт.',
      isAvailable: true,
    },
  })
  await prisma.productCity.create({
    data: {
      productId: activeProduct.id,
      cityId: citySouth.id,
      stock: 0,
      minimumQuantity: 1,
      quantityStep: 1,
      maximumQuantity: 10,
      unit: 'шт.',
      isAvailable: true,
    },
  })
  await prisma.productCity.create({
    data: {
      productId: hiddenProduct.id,
      cityId: cityNorth.id,
      stock: 8,
      minimumQuantity: 1,
      quantityStep: 1,
      maximumQuantity: 10,
      unit: 'шт.',
      isAvailable: true,
    },
  })

  await prisma.user.updateMany({
    where: { telegramId: '900000001' },
    data: { selectedCityId: null },
  })

  const bootstrap = await requestJson('/api/session/bootstrap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      initData: 'query_id=abc&user=%7B%22id%22%3A700000001%2C%22first_name%22%3A%22Alice%22%2C%22username%22%3A%22alice%22%7D&auth_date=1&hash=bad',
      telegramUser: { id: '700000001', first_name: 'Alice', username: 'alice' },
      isTelegramEnvironment: true,
    }),
  })
  assert.equal(bootstrap.response.status, 401)

  const demoBootstrap = await requestJson('/api/session/bootstrap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      initData: '',
      telegramUser: { id: '900000001', first_name: 'Demo', username: 'demo_customer' },
      isTelegramEnvironment: false,
    }),
  })
  assert.equal(demoBootstrap.response.status, 200)
  assert.equal(demoBootstrap.body.user.selectedCityId, null)
  assert.equal(demoBootstrap.body.cities.map((city: any) => city.name).includes('Hidden City'), false)
  assert.equal(demoBootstrap.body.categories.length >= 2, true)
  assert.equal(demoBootstrap.body.sessionToken.length > 0, true)

  const sessionToken = demoBootstrap.body.sessionToken as string
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Session-Token': sessionToken,
  }

  const cityUpdate = await requestJson('/api/users/city', {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ cityId: cityNorth.id }),
  })
  assert.equal(cityUpdate.response.status, 200)
  assert.equal(cityUpdate.body.user.selectedCityId, cityNorth.id)
  assert.equal(cityUpdate.body.user.selectedCity.name, 'North City')

  const catalogNorth = await requestJson(`/api/catalog?cityId=${cityNorth.id}&search=aurora&sort=price_desc`, {
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(catalogNorth.response.status, 200)
  assert.equal(catalogNorth.body.products.length, 1)
  assert.equal(catalogNorth.body.products[0].productCityId, activeCityProduct.id)
  assert.equal(catalogNorth.body.products[0].unit, 'шт.')
  assert.equal(catalogNorth.body.products[0].unitTranslations.ru, 'шт.')

  const catalogByCategory = await requestJson(`/api/catalog?cityId=${cityNorth.id}&categoryId=${categoryCoffee.id}`, {
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(catalogByCategory.response.status, 200)
  assert.equal(catalogByCategory.body.products.length, 0)

  const southCatalog = await requestJson(`/api/catalog?cityId=${citySouth.id}`, {
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(southCatalog.response.status, 200)
  assert.equal(southCatalog.body.products.length, 0)

  const unavailableDetail = await requestJson(`/api/products/${activeProduct.id}?cityId=${citySouth.id}`, {
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(unavailableDetail.response.status, 200)
  assert.equal(unavailableDetail.body.product.isAvailable, false)
  assert.equal(unavailableDetail.body.product.stock, 0)
})
