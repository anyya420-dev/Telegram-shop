import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
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
  process.env.AUTH_RATE_LIMIT_MAX = '500'
  process.env.FRONTEND_URL = 'https://telegram-shop-frontend-w1zw.onrender.com/'
  process.env.WEB_APP_URL = 'https://telegram-shop-frontend-w1zw.onrender.com/miniapp'
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

function createTelegramInitData(
  user: { id: number; first_name: string; username?: string; last_name?: string },
  botToken: string,
  authDate = Math.floor(Date.now() / 1000),
) {
  const params = new URLSearchParams()
  params.set('auth_date', String(authDate))
  params.set('query_id', 'bootstrap-query')
  params.set('user', JSON.stringify(user))

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  params.set('hash', hash)

  return params.toString()
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

test('admin password follows ADMIN_PASSWORD env changes', async () => {
  try {
    const initialLogin = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin-secret' }),
    })
    assert.equal(initialLogin.status, 200)

    process.env.ADMIN_PASSWORD = 'admin-secret-updated'

    const oldPasswordLogin = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin-secret' }),
    })
    assert.equal(oldPasswordLogin.status, 401)

    const updatedPasswordLogin = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin-secret-updated' }),
    })
    assert.equal(updatedPasswordLogin.status, 200)
  } finally {
    process.env.ADMIN_PASSWORD = 'admin-secret'
  }
})

test('cors allows only production frontend origin and handles preflight', async () => {
  const preflight = await request('/api/admin/auth/status', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://telegram-shop-frontend-w1zw.onrender.com',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://telegram-shop-frontend-w1zw.onrender.com')
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')

  const configuredWebAppOrigin = await request('/api/health', {
    headers: {
      Origin: 'https://telegram-shop-frontend-w1zw.onrender.com',
    },
  })
  assert.equal(configuredWebAppOrigin.status, 200)
  assert.equal(configuredWebAppOrigin.headers.get('access-control-allow-origin'), 'https://telegram-shop-frontend-w1zw.onrender.com')

  const narcosOrigin = await request('/api/health', {
    headers: {
      Origin: 'https://narcos-shop.onrender.com',
    },
  })
  assert.equal(narcosOrigin.status, 403)
  const narcosBody = await narcosOrigin.json() as { code?: string }
  assert.equal(narcosBody.code, 'cors_origin_not_allowed')

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

test('payment settings CRUD, payment sessions, crypto review flow, and duplicate protection', async () => {
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
    body: JSON.stringify({ type: 'card', title: 'Card', provider: 'stripe', providerMode: 'test', currency: 'USD' }),
  })
  assert.equal(unauthorizedCreate.status, 401)

  const createdCard = await requestJson('/api/admin/payment-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ type: 'card', title: 'Main Card', provider: 'stripe', providerMode: 'test', currency: 'USD', sortOrder: 1 }),
  })
  assert.equal(createdCard.response.status, 201)
  assert.equal(createdCard.body.method.type, 'card')
  assert.equal(createdCard.body.method.provider, 'stripe')

  const createdTon = await requestJson('/api/admin/payment-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ type: 'crypto', title: 'TON Mainnet', walletAddress: 'UQTONMAINNETADDR', network: 'TON', asset: 'TON', currency: 'TON', isTonConnectEnabled: true, sortOrder: 2 }),
  })
  assert.equal(createdTon.response.status, 201)
  assert.equal(createdTon.body.method.type, 'crypto')

  const createdCrypto = await requestJson('/api/admin/payment-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ type: 'crypto', title: 'USDT TRC20', walletAddress: 'TUSDTADDRESS', network: 'TRC20', asset: 'USDT', currency: 'USDT', instructions: 'Send exact amount', sortOrder: 3 }),
  })
  assert.equal(createdCrypto.response.status, 201)
  assert.equal(createdCrypto.body.method.type, 'crypto')

  const updatedCrypto = await requestJson(`/api/admin/payment-settings/${createdCrypto.body.method.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ title: 'USDT TRC20 Wallet 1', displayName: 'USDT — TRC20', walletAddress: 'TUSDTADDRESS2' }),
  })
  assert.equal(updatedCrypto.response.status, 200)
  assert.equal(updatedCrypto.body.method.title, 'USDT TRC20 Wallet 1')
  assert.equal(updatedCrypto.body.method.walletAddress, 'TUSDTADDRESS2')

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
  const cryptoMethod = enabledMethods.body.methods.find((method: any) => method.id === createdCrypto.body.method.id)
  assert.ok(cryptoMethod)
  assert.equal(cryptoMethod.asset, 'USDT')
  assert.equal(cryptoMethod.network, 'TRC20')
  assert.equal(Boolean(cryptoMethod.walletAddress), true)

  const checkout = await requestJson('/api/orders', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ paymentMethodId: createdCard.body.method.id }),
  })
  assert.equal(checkout.response.status, 200)
  assert.equal(checkout.body.order.paymentStatus, 'pending')
  assert.equal(checkout.body.order.status, 'pending')
  assert.equal(checkout.body.order.payments.length, 1)

  const cardSession = await requestJson(`/api/payments/orders/${checkout.body.order.id}/session`, {
    method: 'POST',
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(cardSession.response.status, 201)
  assert.equal(cardSession.body.payment.amount, 50)
  assert.equal(cardSession.body.payment.paymentMethod.type, 'card')
  assert.equal(cardSession.body.payment.checkoutUrl ?? null, null)

  const markPaid = await requestJson(`/api/orders/${checkout.body.order.id}/mark-paid`, {
    method: 'POST',
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(markPaid.response.status, 400)
  assert.equal(markPaid.body.code, 'invalid_payment_type')

  await prisma.cartItem.create({ data: { cartId: cart.id, productCityId: productCity.id, quantity: 2 } })
  const cryptoCheckout = await requestJson('/api/orders', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ paymentMethodId: createdCrypto.body.method.id }),
  })
  assert.equal(cryptoCheckout.response.status, 200)
  assert.equal(cryptoCheckout.body.order.payments[0].network, 'TRC20')

  const cryptoSession = await requestJson(`/api/payments/orders/${cryptoCheckout.body.order.id}/session`, {
    method: 'POST',
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(cryptoSession.response.status, 201)
  assert.equal(cryptoSession.body.payment.recipient, 'TUSDTADDRESS2')
  assert.equal(cryptoSession.body.payment.status, 'pending')

  const cryptoSubmit = await requestJson(`/api/payments/${cryptoSession.body.payment.id}/crypto/submit`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ transactionHash: 'TRX_HASH_1234567890ABCDEF', senderAddress: 'TSENDER12345' }),
  })
  assert.equal(cryptoSubmit.response.status, 200)
  assert.equal(cryptoSubmit.body.payment.status, 'processing')

  const pendingOrders = await requestJson('/api/admin/orders?status=payment_pending', {
    headers: { cookie: adminCookie },
  })
  assert.equal(pendingOrders.response.status, 200)
  assert.equal(pendingOrders.body.orders.some((order: any) => order.id === cryptoCheckout.body.order.id), true)

  const adminPayments = await requestJson('/api/admin/payments', {
    headers: { cookie: adminCookie },
  })
  assert.equal(adminPayments.response.status, 200)
  assert.equal(adminPayments.body.payments.some((payment: any) => payment.id === cryptoSession.body.payment.id), true)

  const confirmPayment = await requestJson(`/api/admin/payments/${cryptoSession.body.payment.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ status: 'paid', reason: 'Confirmed on-chain transfer' }),
  })
  assert.equal(confirmPayment.response.status, 200)
  assert.equal(confirmPayment.body.payment.status, 'paid')

  await prisma.cartItem.create({ data: { cartId: cart.id, productCityId: productCity.id, quantity: 2 } })
  const duplicateCheckout = await requestJson('/api/orders', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ paymentMethodId: createdCrypto.body.method.id }),
  })
  const duplicateSession = await requestJson(`/api/payments/orders/${duplicateCheckout.body.order.id}/session`, {
    method: 'POST',
    headers: { 'X-Session-Token': sessionToken },
  })
  const duplicateSubmit = await requestJson(`/api/payments/${duplicateSession.body.payment.id}/crypto/submit`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ transactionHash: 'TRX_HASH_1234567890ABCDEF' }),
  })
  assert.equal(duplicateSubmit.response.status, 409)
  assert.equal(duplicateSubmit.body.code, 'transaction_already_used')
})

test('stripe webhook verifies signature, marks payment paid, and ignores duplicate callbacks', async () => {
  process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test_payment'

  const telegramId = '900000011'
  const user = await prisma.user.create({
    data: { telegramId, firstName: 'Stripe', username: 'stripe_user', language: 'ru' },
  })
  const city = await prisma.city.create({ data: { name: 'Stripe City', nameEn: 'Stripe City', isActive: true } })
  const category = await prisma.category.create({ data: { name: 'Stripe Category', nameEn: 'Stripe Category', isActive: true } })
  const product = await prisma.product.create({
    data: { name: 'Stripe Product', description: 'Stripe product', price: 19, categoryId: category.id, isActive: true },
  })
  const productCity = await prisma.productCity.create({
    data: { productId: product.id, cityId: city.id, stock: 10, minimumQuantity: 1, quantityStep: 1, maximumQuantity: 10, unit: 'шт.', isAvailable: true },
  })
  const method = await prisma.paymentMethod.create({
    data: { type: 'card', title: 'Stripe Card', provider: 'stripe', providerMode: 'test', currency: 'USD', isEnabled: true },
  })
  await prisma.user.update({ where: { id: user.id }, data: { selectedCityId: city.id } })
  const cart = await prisma.cart.create({ data: { userId: user.id } })
  await prisma.cartItem.create({ data: { cartId: cart.id, productCityId: productCity.id, quantity: 2 } })

  const token = createSessionToken!(telegramId)
  const checkout = await requestJson('/api/orders', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethodId: method.id }),
  })
  assert.equal(checkout.response.status, 200)

  const sessionResponse = await requestJson(`/api/payments/orders/${checkout.body.order.id}/session`, {
    method: 'POST',
    headers: { 'X-Session-Token': token },
  })
  assert.equal(sessionResponse.response.status, 201)

  const paymentId = sessionResponse.body.payment.id
  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        payment_intent: 'pi_test_123',
        metadata: { paymentId: String(paymentId) },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', process.env.STRIPE_TEST_WEBHOOK_SECRET!).update(`${timestamp}.${payload}`).digest('hex')

  const invalidWebhook = await request('/api/payments/webhooks/stripe?mode=test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${timestamp},v1=invalid` },
    body: payload,
  })
  assert.equal(invalidWebhook.status, 400)

  const validWebhook = await request('/api/payments/webhooks/stripe?mode=test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: payload,
  })
  assert.equal(validWebhook.status, 200)

  const paidPayment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
  assert.equal(paidPayment.status, 'paid')
  assert.equal(paidPayment.providerSessionId, 'cs_test_123')
  assert.equal(paidPayment.providerPaymentId, 'pi_test_123')

  const paidOrder = await prisma.order.findUniqueOrThrow({ where: { id: checkout.body.order.id } })
  assert.equal(paidOrder.paymentStatus, 'paid')
  assert.equal(paidOrder.status, 'processing')

  const duplicateWebhook = await request('/api/payments/webhooks/stripe?mode=test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: payload,
  })
  assert.equal(duplicateWebhook.status, 200)
  const duplicateBody = await duplicateWebhook.json()
  assert.equal(duplicateBody.duplicated, true)
})

test('casino credits stay separate from shop balance and direct top-ups are blocked', async () => {
  const telegramId = '900000012'
  const user = await prisma.user.create({
    data: { telegramId, firstName: 'Casino', username: 'casino_user', language: 'ru' },
  })
  const balance = await prisma.balance.create({
    data: { userId: user.id, amount: 42 },
  })
  await prisma.balanceTransaction.create({
    data: { balanceId: balance.id, type: 'refund', amount: 42, comment: 'Refund credit' },
  })

  const token = createSessionToken!(telegramId)

  const shopBalance = await requestJson('/api/balance', {
    headers: { 'X-Session-Token': token },
  })
  assert.equal(shopBalance.response.status, 200)
  assert.equal(shopBalance.body.balance.amount, 42)
  assert.equal(shopBalance.body.balance.transactions.length, 1)
  assert.equal(shopBalance.body.balance.transactions[0].type, 'refund')

  const blockedTopup = await requestJson('/api/balance/topup', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 100 }),
  })
  assert.equal(blockedTopup.response.status, 403)
  assert.equal(blockedTopup.body.code, 'balance_topup_disabled')

  const casinoState = await requestJson('/api/casino', {
    headers: { 'X-Session-Token': token },
  })
  assert.equal(casinoState.response.status, 200)
  assert.equal(casinoState.body.balance.credits, 1000)
  assert.equal(casinoState.body.history.length, 0)

  const spin = await requestJson('/api/casino/spin', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bet: 25, target: 3 }),
  })
  assert.equal(spin.response.status, 200)
  assert.notEqual(spin.body.balance.credits, 1000)

  const shopBalanceAfter = await requestJson('/api/balance', {
    headers: { 'X-Session-Token': token },
  })
  assert.equal(shopBalanceAfter.response.status, 200)
  assert.equal(shopBalanceAfter.body.balance.amount, 42)
  assert.equal(shopBalanceAfter.body.balance.transactions.every((entry: any) => !String(entry.type).startsWith('casino_')), true)

  const casinoHistory = await requestJson('/api/casino/history', {
    headers: { 'X-Session-Token': token },
  })
  assert.equal(casinoHistory.response.status, 200)
  assert.equal(casinoHistory.body.history.length, 1)
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
      provider: 'stripe',
      providerMode: 'test',
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
      deliveryAddress: 'Checkout street, 10',
    }),
  })
  assert.equal(checkout.response.status, 200)
  assert.equal(checkout.body.order.subtotal, 48)
  assert.equal(checkout.body.order.discountAmount, 4.8)
  assert.equal(checkout.body.order.deliveryFee, 0)
  assert.equal(checkout.body.order.total, 43.2)
  assert.equal(checkout.body.order.items.length, 1)
  assert.equal(checkout.body.order.items[0].quantity, 4)
  assert.equal(checkout.body.order.comment, 'Leave at the door')
  assert.equal(checkout.body.order.deliveryAddress, 'Checkout street, 10')
  assert.equal(checkout.body.order.deliveryPriceConfirmed, false)
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

test('customer auth rejects invalid sessions and blocks access to other users or admin data', async () => {
  const invalidProfile = await requestJson('/api/users/me', {
    headers: { 'X-Session-Token': 'broken.token' },
  })
  assert.equal(invalidProfile.response.status, 401)
  assert.equal(invalidProfile.body.code, 'invalid_session_token')

  const ownerTelegramId = '900000003'
  const otherTelegramId = '900000004'
  const owner = await prisma.user.create({
    data: { telegramId: ownerTelegramId, firstName: 'Owner', username: 'owner_user', language: 'ru' },
  })
  const otherUser = await prisma.user.create({
    data: { telegramId: otherTelegramId, firstName: 'Other', username: 'other_user', language: 'ru' },
  })

  const city = await prisma.city.create({ data: { name: 'Owner City', nameEn: 'Owner City', isActive: true } })
  const order = await prisma.order.create({
    data: {
      userId: owner.id,
      cityId: city.id,
      status: 'pending',
      subtotal: 15,
      total: 15,
      paymentStatus: 'pending',
    },
  })

  const otherToken = createSessionToken!(otherTelegramId)

  const otherUsersOrder = await requestJson(`/api/orders/${order.id}`, {
    headers: { 'X-Session-Token': otherToken },
  })
  assert.equal(otherUsersOrder.response.status, 404)
  assert.equal(otherUsersOrder.body.code, 'not_found')

  const customerAdminAttempt = await request('/api/admin/stats', {
    headers: { 'X-Session-Token': otherToken },
  })
  assert.equal(customerAdminAttempt.status, 401)
})

test('session bootstrap requires real Telegram init data when demo mode is disabled', async () => {
  const previousAllowDemoMode = process.env.ALLOW_DEMO_MODE
  delete process.env.ALLOW_DEMO_MODE

  const bootstrap = await requestJson('/api/session/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData: '',
      isTelegramEnvironment: false,
    }),
  })

  assert.equal(bootstrap.response.status, 401)
  assert.equal(bootstrap.body.code, 'telegram_init_data_required')

  if (previousAllowDemoMode === undefined) {
    delete process.env.ALLOW_DEMO_MODE
  } else {
    process.env.ALLOW_DEMO_MODE = previousAllowDemoMode
  }
})

test('session bootstrap accepts initData signed by active managed bot token', async () => {
  const previousAllowDemoMode = process.env.ALLOW_DEMO_MODE
  const previousTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN
  process.env.ALLOW_DEMO_MODE = 'false'
  process.env.TELEGRAM_BOT_TOKEN = '111111111:env-bootstrap-token'

  try {
    const managedBotToken = '222222222:managed-bootstrap-token'
    await prisma.telegramBot.create({
      data: {
        token: managedBotToken,
        botId: 'managed-bootstrap-bot',
        username: 'managed_bootstrap_bot',
        firstName: 'Managed Bootstrap Bot',
        isActive: true,
      },
    })

    const initData = createTelegramInitData(
      { id: 700000021, first_name: 'Managed', username: 'managed_user' },
      managedBotToken,
    )

    const bootstrap = await requestJson('/api/session/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData,
        isTelegramEnvironment: true,
      }),
    })

    assert.equal(bootstrap.response.status, 200)
    assert.equal(bootstrap.body.user.telegramId, '700000021')
  } finally {
    if (previousAllowDemoMode === undefined) {
      delete process.env.ALLOW_DEMO_MODE
    } else {
      process.env.ALLOW_DEMO_MODE = previousAllowDemoMode
    }

    if (previousTelegramBotToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN
    } else {
      process.env.TELEGRAM_BOT_TOKEN = previousTelegramBotToken
    }
  }
})

test('session bootstrap rejects stale Telegram initData', async () => {
  const previousAllowDemoMode = process.env.ALLOW_DEMO_MODE
  const previousTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN
  process.env.ALLOW_DEMO_MODE = 'false'
  process.env.TELEGRAM_BOT_TOKEN = '111111111:env-bootstrap-token'

  try {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 90_000
    const initData = createTelegramInitData(
      { id: 700000022, first_name: 'Stale', username: 'stale_user' },
      process.env.TELEGRAM_BOT_TOKEN,
      staleTimestamp,
    )

    const bootstrap = await requestJson('/api/session/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData,
        isTelegramEnvironment: true,
      }),
    })

    assert.equal(bootstrap.response.status, 401)
    assert.equal(bootstrap.body.code, 'telegram_verification_failed')
  } finally {
    if (previousAllowDemoMode === undefined) {
      delete process.env.ALLOW_DEMO_MODE
    } else {
      process.env.ALLOW_DEMO_MODE = previousAllowDemoMode
    }

    if (previousTelegramBotToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN
    } else {
      process.env.TELEGRAM_BOT_TOKEN = previousTelegramBotToken
    }
  }
})

test('operators auth requires verified Telegram init data and rejects spoofed headers', async () => {
  const previousAllowDemoMode = process.env.ALLOW_DEMO_MODE
  const previousTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN
  process.env.ALLOW_DEMO_MODE = 'false'
  process.env.TELEGRAM_BOT_TOKEN = '111111111:env-operator-token'

  try {
    const managedBotToken = '333333333:managed-operator-token'
    await prisma.telegramBot.create({
      data: {
        token: managedBotToken,
        botId: 'managed-operator-bot',
        username: 'managed_operator_bot',
        firstName: 'Managed Operator Bot',
        isActive: true,
      },
    })

    const spoofedHeader = await requestJson('/api/operators/pending', {
      headers: {
        'X-Telegram-User-Id': '123456789',
      },
    })
    assert.equal(spoofedHeader.response.status, 401)
    assert.equal(spoofedHeader.body.code, 'telegram_init_data_required')

    const unregisteredInitData = createTelegramInitData(
      { id: 700000031, first_name: 'NotOperator', username: 'not_operator' },
      managedBotToken,
    )
    const unregisteredOperator = await requestJson('/api/operators/pending', {
      headers: {
        'X-Telegram-Init-Data': unregisteredInitData,
      },
    })
    assert.equal(unregisteredOperator.response.status, 403)
    assert.equal(unregisteredOperator.body.code, 'operator_access_denied')

    const activeTelegramId = '700000032'
    await prisma.operator.create({
      data: {
        telegramId: activeTelegramId,
        firstName: 'Active',
        username: 'active_operator',
        isActive: true,
      },
    })

    const activeInitData = createTelegramInitData(
      { id: Number(activeTelegramId), first_name: 'Active', username: 'active_operator' },
      managedBotToken,
    )
    const authenticatedOperator = await requestJson('/api/operators/pending', {
      headers: {
        'X-Telegram-Init-Data': activeInitData,
      },
    })
    assert.equal(authenticatedOperator.response.status, 200)
    assert.ok(Array.isArray(authenticatedOperator.body.orders))
  } finally {
    if (previousAllowDemoMode === undefined) {
      delete process.env.ALLOW_DEMO_MODE
    } else {
      process.env.ALLOW_DEMO_MODE = previousAllowDemoMode
    }

    if (previousTelegramBotToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN
    } else {
      process.env.TELEGRAM_BOT_TOKEN = previousTelegramBotToken
    }
  }
})

test('customer can cancel payment pending order', async () => {
  const telegramId = '900000005'
  const user = await prisma.user.create({
    data: { telegramId, firstName: 'Pending', username: 'pending_user', language: 'ru' },
  })
  const city = await prisma.city.create({ data: { name: 'Pending City', nameEn: 'Pending City', isActive: true } })
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      cityId: city.id,
      status: 'payment_pending',
      paymentStatus: 'pending',
      subtotal: 10,
      total: 10,
    },
  })
  const product = await prisma.product.create({
    data: {
      name: 'Pending Product',
      description: 'Pending',
      price: 10,
      categoryId: (await prisma.category.create({ data: { name: 'Pending Category', isActive: true } })).id,
      isActive: true,
    },
  })
  const productCity = await prisma.productCity.create({
    data: {
      productId: product.id,
      cityId: city.id,
      stock: 0,
      minimumQuantity: 1,
      quantityStep: 1,
      maximumQuantity: 10,
      unit: 'шт.',
      isAvailable: true,
    },
  })
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productCityId: productCity.id,
      productName: product.name,
      quantity: 2,
      price: 5,
      lineTotal: 10,
      unit: 'шт.',
    },
  })

  const sessionToken = createSessionToken!(telegramId)
  const cancelResponse = await requestJson(`/api/orders/${order.id}/cancel`, {
    method: 'POST',
    headers: { 'X-Session-Token': sessionToken },
  })

  assert.equal(cancelResponse.response.status, 200)
  assert.equal(cancelResponse.body.order.status, 'cancelled')

  const refreshedProductCity = await prisma.productCity.findUniqueOrThrow({ where: { id: productCity.id } })
  assert.equal(refreshedProductCity.stock, 2)
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
  assert.equal(demoBootstrap.body.user.lastName, 'Customer')
  assert.equal(demoBootstrap.body.cities.map((city: any) => city.name).includes('Hidden City'), false)
  assert.equal(demoBootstrap.body.categories.length >= 2, true)
  assert.equal(demoBootstrap.body.sessionToken.length > 0, true)

  const sessionToken = demoBootstrap.body.sessionToken as string
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Session-Token': sessionToken,
  }

  const browseCatalog = await requestJson('/api/catalog?search=aurora', {
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(browseCatalog.response.status, 200)
  assert.equal(browseCatalog.body.products.length, 1)
  assert.equal(browseCatalog.body.products[0].productCityId, activeCityProduct.id)

  const browseProductDetail = await requestJson(`/api/products/${activeProduct.id}`, {
    headers: { 'X-Session-Token': sessionToken },
  })
  assert.equal(browseProductDetail.response.status, 200)
  assert.equal(browseProductDetail.body.product.productCityId, activeCityProduct.id)

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
  assert.ok(['шт', 'шт.'].includes(catalogNorth.body.products[0].unit))
  assert.ok(['шт', 'шт.'].includes(catalogNorth.body.products[0].unitTranslations.ru))

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

test('admin city and product management enforce authorization and validation', async () => {
  const login = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-secret' }),
  })
  assert.equal(login.status, 200)
  const adminCookie = login.headers.get('set-cookie') ?? ''
  assert.ok(adminCookie)

  const customer = await prisma.user.create({
    data: { telegramId: '710000001', firstName: 'Admin', lastName: 'Customer', username: 'admin_customer', language: 'ru' },
  })

  const unauthorizedMutation = await request('/api/admin/cities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Blocked City' }),
  })
  assert.equal(unauthorizedMutation.status, 401)

  const createdCity = await requestJson('/api/admin/cities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'Admin City One', nameEn: 'Admin City One', sortOrder: 5, isActive: true }),
  })
  assert.equal(createdCity.response.status, 201)
  assert.equal(createdCity.body.city.name, 'Admin City One')

  const duplicateCity = await requestJson('/api/admin/cities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'Admin City One' }),
  })
  assert.equal(duplicateCity.response.status, 409)
  assert.equal(duplicateCity.body.code, 'city_exists')

  const secondCity = await requestJson('/api/admin/cities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'Admin City Two', nameEn: 'Admin City Two', sortOrder: 10, isActive: true }),
  })
  assert.equal(secondCity.response.status, 201)

  const createdCategory = await requestJson('/api/admin/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'Admin Category', nameEn: 'Admin Category', sortOrder: 1 }),
  })
  assert.equal(createdCategory.response.status, 201)

  const badProduct = await requestJson('/api/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'Broken Product', price: 100, categoryId: 999999 }),
  })
  assert.equal(badProduct.response.status, 404)
  assert.equal(badProduct.body.code, 'category_not_found')

  const createdProduct = await requestJson('/api/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      name: 'Admin Product',
      nameEn: 'Admin Product',
      description: 'Product description',
      descriptionEn: 'Product description',
      price: 250,
      image: 'https://example.com/product.png',
      categoryId: createdCategory.body.category.id,
      cities: [
        {
          cityId: createdCity.body.city.id,
          stock: 12,
          isAvailable: true,
          minimumQuantity: 2,
          quantityStep: 2,
          maximumQuantity: 10,
          unit: 'pcs',
        },
      ],
    }),
  })
  assert.equal(createdProduct.response.status, 201)
  assert.equal(createdProduct.body.product.productCities.length, 1)
  assert.equal(createdProduct.body.product.productCities[0].minimumQuantity, 2)

  const invalidProductUpdate = await requestJson(`/api/admin/products/${createdProduct.body.product.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ price: 0 }),
  })
  assert.equal(invalidProductUpdate.response.status, 400)
  assert.equal(invalidProductUpdate.body.code, 'price_required')

  const updatedProduct = await requestJson(`/api/admin/products/${createdProduct.body.product.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      name: 'Admin Product Updated',
      description: 'Updated description',
      categoryId: createdCategory.body.category.id,
      price: 300,
      isActive: false,
      isRecommended: true,
    }),
  })
  assert.equal(updatedProduct.response.status, 200)
  assert.equal(updatedProduct.body.product.name, 'Admin Product Updated')
  assert.equal(updatedProduct.body.product.isRecommended, true)

  const invalidProductCityUpdate = await requestJson(`/api/admin/product-cities/${createdProduct.body.product.productCities[0].id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ stock: 3, minimumQuantity: 4, quantityStep: 1, maximumQuantity: 4 }),
  })
  assert.equal(invalidProductCityUpdate.response.status, 400)
  assert.equal(invalidProductCityUpdate.body.code, 'quantity_invalid')

  const addedProductCity = await requestJson('/api/admin/product-cities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      productId: createdProduct.body.product.id,
      cityId: secondCity.body.city.id,
      stock: 8,
      isAvailable: true,
      minimumQuantity: 1,
      quantityStep: 1,
      maximumQuantity: 8,
      unit: 'pcs',
    }),
  })
  assert.equal(addedProductCity.response.status, 201)
  assert.equal(addedProductCity.body.productCity.city.name, 'Admin City Two')

  const updatedCity = await requestJson(`/api/admin/cities/${createdCity.body.city.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ isActive: false }),
  })
  assert.equal(updatedCity.response.status, 200)
  assert.equal(updatedCity.body.city.isActive, false)

  const publicCities = await requestJson('/api/cities')
  assert.equal(publicCities.response.status, 200)
  assert.equal(publicCities.body.some((city: { id: number }) => city.id === createdCity.body.city.id), false)
  assert.equal(publicCities.body.some((city: { id: number }) => city.id === secondCity.body.city.id), true)

  await prisma.user.update({ where: { id: customer.id }, data: { selectedCityId: secondCity.body.city.id } })
  await prisma.balance.create({ data: { userId: customer.id, amount: 999 } })

  const users = await requestJson('/api/admin/users', {
    headers: { cookie: adminCookie },
  })
  assert.equal(users.response.status, 200)
  const listedCustomer = users.body.users.find((user: { id: number }) => user.id === customer.id)
  assert.ok(listedCustomer)
  assert.equal(listedCustomer.balance, 999)
  assert.equal(listedCustomer.selectedCity.name, 'Admin City Two')

  const auditLogs = await requestJson('/api/admin/audit-logs', {
    headers: { cookie: adminCookie },
  })
  assert.equal(auditLogs.response.status, 200)
  const cityAuditLog = auditLogs.body.logs.find((log: { action: string; entityId: number; userId?: number | null }) => log.action === 'city_created' && log.entityId === createdCity.body.city.id)
  assert.ok(cityAuditLog)
  assert.equal(typeof cityAuditLog.userId, 'number')
})

test('admin discount and delivery management validate updates', async () => {
  const login = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-secret' }),
  })
  assert.equal(login.status, 200)
  const adminCookie = login.headers.get('set-cookie') ?? ''
  assert.ok(adminCookie)

  const discount = await requestJson('/api/admin/discounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ code: 'ADMIN10', type: 'percent', value: 10, minOrderAmount: 100 }),
  })
  assert.equal(discount.response.status, 200)

  const invalidDiscountUpdate = await requestJson(`/api/admin/discounts/${discount.body.discount.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ usageLimit: -1 }),
  })
  assert.equal(invalidDiscountUpdate.response.status, 400)
  assert.equal(invalidDiscountUpdate.body.code, 'invalid_usage_limit')

  const validDiscountUpdate = await requestJson(`/api/admin/discounts/${discount.body.discount.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ isActive: false, usageLimit: 5 }),
  })
  assert.equal(validDiscountUpdate.response.status, 200)
  assert.equal(validDiscountUpdate.body.discount.isActive, false)
  assert.equal(validDiscountUpdate.body.discount.usageLimit, 5)

  const createdDelivery = await requestJson('/api/admin/delivery-options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'Pickup Point', nameEn: 'Pickup Point', type: 'pickup', price: 0, sortOrder: 2, isActive: true }),
  })
  assert.equal(createdDelivery.response.status, 200)
  assert.equal(createdDelivery.body.option.type, 'pickup')

  const invalidDeliveryUpdate = await requestJson(`/api/admin/delivery-options/${createdDelivery.body.option.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ type: 'invalid-type' }),
  })
  assert.equal(invalidDeliveryUpdate.response.status, 400)
  assert.equal(invalidDeliveryUpdate.body.code, 'invalid_type')

  const validDeliveryUpdate = await requestJson(`/api/admin/delivery-options/${createdDelivery.body.option.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ isActive: false, price: 25 }),
  })
  assert.equal(validDeliveryUpdate.response.status, 200)
  assert.equal(validDeliveryUpdate.body.option.isActive, false)
  assert.equal(validDeliveryUpdate.body.option.price, 25)
})

test('casino gameplay stays server-side and admin discounts cannot exceed 30%', async () => {
  const city = await prisma.city.create({ data: { name: 'Casino City' } })
  const user = await prisma.user.create({
    data: {
      telegramId: '900000020',
      firstName: 'Casino',
      selectedCityId: city.id,
    },
  })
  const token = createSessionToken!(user.telegramId)

  const firstSpin = await requestJson('/api/casino/spin', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bet: 25, target: 3 }),
  })
  assert.equal(firstSpin.response.status, 200)
  assert.equal(typeof firstSpin.body.dice, 'number')
  assert.equal(typeof firstSpin.body.win, 'boolean')

  const adminLogin = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-secret' }),
  })
  const adminCookie = adminLogin.headers.get('set-cookie')!

  const invalidReward = await requestJson('/api/admin/casino/reward-configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ game: 'wheel', rewardType: 'shop_discount', title: 'Invalid', discountPercent: 35, weight: 1 }),
  })
  assert.equal(invalidReward.response.status, 400)
  assert.equal(invalidReward.body.code, 'discount_limit_exceeded')
})

test('checkout applies casino credits and owned rewards server-side', async () => {
  const city = await prisma.city.create({ data: { name: 'Credits City' } })
  const category = await prisma.category.create({ data: { name: 'Casino Credits Category' } })
  const product = await prisma.product.create({
    data: {
      name: 'Credits Product',
      description: 'Credits product',
      price: 1000,
      categoryId: category.id,
      creditsEnabled: true,
      creditsPrice: 1000,
      productCities: {
        create: {
          cityId: city.id,
          stock: 10,
          minimumQuantity: 1,
          quantityStep: 1,
          maximumQuantity: 5,
          unit: 'pcs',
          isAvailable: true,
        },
      },
    },
    include: { productCities: true },
  })
  const user = await prisma.user.create({
    data: {
      telegramId: '900000021',
      firstName: 'Buyer',
      selectedCityId: city.id,
    },
  })
  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      type: 'card',
      title: 'Stripe',
      provider: 'stripe',
      providerMode: 'test',
      providerKey: 'sk_test_checkout',
      currency: 'USD',
      isEnabled: true,
    },
  })
  const reward = await prisma.casinoReward.create({
    data: {
      userId: user.id,
      game: 'wheel',
      rewardType: 'shop_discount',
      discountPercent: 10,
      status: 'available',
    },
  })
  const token = createSessionToken!(user.telegramId)

  const addCart = await requestJson('/api/cart/items', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ productCityId: product.productCities[0].id, quantity: 1 }),
  })
  assert.equal(addCart.response.status, 200)

  const checkout = await requestJson('/api/orders', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethodId: paymentMethod.id, rewardId: reward.id, casinoCreditsToUse: 300 }),
  })
  assert.equal(checkout.response.status, 200)
  assert.equal(checkout.body.order.casinoCreditsUsed, 300)
  assert.equal(checkout.body.order.reward.id, reward.id)
  assert.equal(checkout.body.order.total, 630)

  const casinoState = await requestJson('/api/casino', {
    headers: { 'X-Session-Token': token },
  })
  assert.equal(casinoState.response.status, 200)
  assert.equal(casinoState.body.balance.credits, 700)
})

test('owner manages administrators, revokes sessions, and updates shop name', async () => {
  const ownerLogin = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-secret', mode: 'owner' }),
  })
  assert.equal(ownerLogin.status, 200)
  const ownerCookie = ownerLogin.headers.get('set-cookie') ?? ''
  assert.ok(ownerCookie)

  const createAdmin = await requestJson('/api/admin/administrators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: ownerCookie },
    body: JSON.stringify({ username: 'qa_admin' }),
  })
  assert.equal(createAdmin.response.status, 201)
  assert.equal(createAdmin.body.administrator.username, 'qa_admin')
  const adminId = Number(createAdmin.body.administrator.id)
  assert.ok(adminId > 0)
  const generatedPassword = String(createAdmin.body.generatedPassword ?? '')
  assert.ok(generatedPassword.length >= 16)

  const adminLogin = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: generatedPassword }),
  })
  assert.equal(adminLogin.status, 200)
  const adminCookie = adminLogin.headers.get('set-cookie') ?? ''
  assert.ok(adminCookie)

  const adminStats = await request('/api/admin/stats', {
    headers: { cookie: adminCookie },
  })
  assert.equal(adminStats.status, 200)

  const adminOwnerOnly = await request('/api/admin/administrators', {
    headers: { cookie: adminCookie },
  })
  assert.equal(adminOwnerOnly.status, 403)

  const deactivated = await request(`/api/admin/administrators/${adminId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: ownerCookie },
    body: JSON.stringify({ isActive: false }),
  })
  assert.equal(deactivated.status, 200)

  const adminStatsAfterDeactivate = await request('/api/admin/stats', {
    headers: { cookie: adminCookie },
  })
  assert.equal(adminStatsAfterDeactivate.status, 401)

  const updateSetting = await requestJson('/api/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: ownerCookie },
    body: JSON.stringify({ shopName: 'NARCOS VERIFIED' }),
  })
  assert.equal(updateSetting.response.status, 200)
  assert.equal(updateSetting.body.shopName, 'NARCOS VERIFIED')

  const bootstrap = await requestJson('/api/session/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData: '',
      isTelegramEnvironment: false,
    }),
  })
  assert.equal(bootstrap.response.status, 200)
  assert.equal(bootstrap.body.shopName, 'NARCOS VERIFIED')
})

test('pickup storage is one-time exact assignment and hidden until order is paid', async () => {
  const adminLogin = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-secret' }),
  })
  assert.equal(adminLogin.status, 200)
  const adminCookie = adminLogin.headers.get('set-cookie') ?? ''

  const city = await prisma.city.create({ data: { name: 'Pickup City', isActive: true } })
  const category = await prisma.category.create({ data: { name: 'Pickup Category', isActive: true } })
  const product = await prisma.product.create({
    data: {
      name: 'Coffee Pickup',
      description: 'Coffee pickup',
      price: 100,
      categoryId: category.id,
      productCities: {
        create: {
          cityId: city.id,
          stock: 2,
          minimumQuantity: 0.5,
          quantityStep: 0.5,
          maximumQuantity: 2,
          unit: 'кг',
          isAvailable: true,
        },
      },
    },
    include: { productCities: true },
  })
  const productCity = product.productCities[0]

  const pickupOption = await prisma.deliveryOption.create({
    data: { name: 'Pickup point', type: 'pickup', price: 0, isActive: true },
  })
  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      type: 'crypto',
      title: 'USDT',
      asset: 'USDT',
      network: 'TRC20',
      walletAddress: 'TUSDT_PICKUP_WALLET',
      isEnabled: true,
    },
  })

  const createStorage = await requestJson('/api/admin/pickup-storages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      productId: product.id,
      productCityId: productCity.id,
      quantity: 0.5,
      unit: 'kg',
      address: 'Pickup Address 1',
      instructions: 'Use code 1234',
      isActive: true,
    }),
  })
  assert.equal(createStorage.response.status, 201)
  assert.equal(createStorage.body.storage.unit, 'кг')

  const user = await prisma.user.create({
    data: { telegramId: '900000041', firstName: 'Pickup Buyer', selectedCityId: city.id },
  })
  const token = createSessionToken!(user.telegramId)

  const addCart = await requestJson('/api/cart/items', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ productCityId: productCity.id, quantity: 0.5 }),
  })
  assert.equal(addCart.response.status, 200)

  const checkout = await requestJson('/api/orders', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethodId: paymentMethod.id, deliveryOptionId: pickupOption.id }),
  })
  assert.equal(checkout.response.status, 200)
  const orderId = checkout.body.order.id as number

  const orderBeforePayment = await requestJson(`/api/orders/${orderId}`, {
    headers: { 'X-Session-Token': token },
  })
  assert.equal(orderBeforePayment.response.status, 200)
  assert.equal(orderBeforePayment.body.order.items[0].pickupAssignment, null)

  const paymentSession = await requestJson(`/api/payments/orders/${orderId}/session`, {
    method: 'POST',
    headers: { 'X-Session-Token': token },
  })
  assert.equal(paymentSession.response.status, 201)

  const submitted = await requestJson(`/api/payments/${paymentSession.body.payment.id}/crypto/submit`, {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionHash: 'TXHASH_PICKUP_00000001' }),
  })
  assert.equal(submitted.response.status, 200)

  const confirmPaid = await requestJson(`/api/admin/payments/${paymentSession.body.payment.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ status: 'paid', reason: 'verified' }),
  })
  assert.equal(confirmPaid.response.status, 200)

  const paidOrder = await requestJson(`/api/orders/${orderId}`, {
    headers: { 'X-Session-Token': token },
  })
  assert.equal(paidOrder.response.status, 200)
  assert.equal(paidOrder.body.order.items[0].pickupAssignment.address, 'Pickup Address 1')
  assert.equal(paidOrder.body.order.items[0].pickupAssignment.unit, 'кг')

  const storageAfterAssign = await prisma.pickupStorage.findUniqueOrThrow({ where: { id: createStorage.body.storage.id } })
  assert.equal(storageAfterAssign.status, 'assigned')
  assert.equal(storageAfterAssign.assignedOrderId, orderId)
  assert.ok(storageAfterAssign.assignedOrderItemId)

  const user2 = await prisma.user.create({
    data: { telegramId: '900000042', firstName: 'Second Buyer', selectedCityId: city.id },
  })
  const token2 = createSessionToken!(user2.telegramId)

  await requestJson('/api/cart/items', {
    method: 'POST',
    headers: { 'X-Session-Token': token2, 'Content-Type': 'application/json' },
    body: JSON.stringify({ productCityId: productCity.id, quantity: 0.5 }),
  })

  const checkout2 = await requestJson('/api/orders', {
    method: 'POST',
    headers: { 'X-Session-Token': token2, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethodId: paymentMethod.id, deliveryOptionId: pickupOption.id }),
  })
  assert.equal(checkout2.response.status, 200)

  const paymentSession2 = await requestJson(`/api/payments/orders/${checkout2.body.order.id}/session`, {
    method: 'POST',
    headers: { 'X-Session-Token': token2 },
  })
  assert.equal(paymentSession2.response.status, 201)

  await requestJson(`/api/payments/${paymentSession2.body.payment.id}/crypto/submit`, {
    method: 'POST',
    headers: { 'X-Session-Token': token2, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionHash: 'TXHASH_PICKUP_00000002' }),
  })

  const confirmPaid2 = await requestJson(`/api/admin/payments/${paymentSession2.body.payment.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ status: 'paid', reason: 'verified second' }),
  })
  assert.equal(confirmPaid2.response.status, 200)

  const paidOrder2 = await requestJson(`/api/orders/${checkout2.body.order.id}`, {
    headers: { 'X-Session-Token': token2 },
  })
  assert.equal(paidOrder2.response.status, 200)
  assert.equal(paidOrder2.body.order.items[0].pickupAssignment, null)
  assert.equal(paidOrder2.body.order.pickupStorageResolutionRequired, true)
})

test('pickup assignment matches each line independently for multi-product order', async () => {
  const adminLogin = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-secret' }),
  })
  assert.equal(adminLogin.status, 200)
  const adminCookie = adminLogin.headers.get('set-cookie') ?? ''

  const city = await prisma.city.create({ data: { name: 'Multi Pickup City', isActive: true } })
  const category = await prisma.category.create({ data: { name: 'Multi Pickup Category', isActive: true } })

  const tshirt = await prisma.product.create({
    data: {
      name: 'T-shirt',
      description: 'Shirt',
      price: 50,
      categoryId: category.id,
      productCities: {
        create: {
          cityId: city.id,
          stock: 10,
          minimumQuantity: 1,
          quantityStep: 1,
          maximumQuantity: 10,
          unit: 'шт',
          isAvailable: true,
        },
      },
    },
    include: { productCities: true },
  })

  const coffee = await prisma.product.create({
    data: {
      name: 'Coffee',
      description: 'Coffee',
      price: 80,
      categoryId: category.id,
      productCities: {
        create: {
          cityId: city.id,
          stock: 10,
          minimumQuantity: 0.5,
          quantityStep: 0.5,
          maximumQuantity: 5,
          unit: 'кг',
          isAvailable: true,
        },
      },
    },
    include: { productCities: true },
  })

  const tshirtCity = tshirt.productCities[0]
  const coffeeCity = coffee.productCities[0]

  const pickupOption = await prisma.deliveryOption.create({
    data: { name: 'Pickup multi', type: 'pickup', price: 0, isActive: true },
  })
  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      type: 'crypto',
      title: 'USDT multi',
      asset: 'USDT',
      network: 'TRC20',
      walletAddress: 'TUSDT_PICKUP_MULTI',
      isEnabled: true,
    },
  })

  const tshirtStorage = await requestJson('/api/admin/pickup-storages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      productId: tshirt.id,
      productCityId: tshirtCity.id,
      quantity: 1,
      unit: 'шт',
      address: 'Storage A',
      instructions: 'Shirt pickup',
      isActive: true,
    }),
  })
  assert.equal(tshirtStorage.response.status, 201)

  const coffeeStorage = await requestJson('/api/admin/pickup-storages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      productId: coffee.id,
      productCityId: coffeeCity.id,
      quantity: 0.5,
      unit: 'кг',
      address: 'Storage C',
      instructions: 'Coffee pickup',
      isActive: true,
    }),
  })
  assert.equal(coffeeStorage.response.status, 201)

  const user = await prisma.user.create({
    data: { telegramId: '900000043', firstName: 'Multi Buyer', selectedCityId: city.id },
  })
  const token = createSessionToken!(user.telegramId)

  const addTshirt = await requestJson('/api/cart/items', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ productCityId: tshirtCity.id, quantity: 1 }),
  })
  assert.equal(addTshirt.response.status, 200)

  const addCoffee = await requestJson('/api/cart/items', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ productCityId: coffeeCity.id, quantity: 0.5 }),
  })
  assert.equal(addCoffee.response.status, 200)

  const checkout = await requestJson('/api/orders', {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethodId: paymentMethod.id, deliveryOptionId: pickupOption.id }),
  })
  assert.equal(checkout.response.status, 200)
  const orderId = checkout.body.order.id as number

  const paymentSession = await requestJson(`/api/payments/orders/${orderId}/session`, {
    method: 'POST',
    headers: { 'X-Session-Token': token },
  })
  assert.equal(paymentSession.response.status, 201)

  const submit = await requestJson(`/api/payments/${paymentSession.body.payment.id}/crypto/submit`, {
    method: 'POST',
    headers: { 'X-Session-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionHash: 'TXHASH_PICKUP_MULTI_0000003' }),
  })
  assert.equal(submit.response.status, 200)

  const confirm = await requestJson(`/api/admin/payments/${paymentSession.body.payment.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ status: 'paid', reason: 'verified multi' }),
  })
  assert.equal(confirm.response.status, 200)

  const paidOrder = await requestJson(`/api/orders/${orderId}`, {
    headers: { 'X-Session-Token': token },
  })
  assert.equal(paidOrder.response.status, 200)
  assert.equal(paidOrder.body.order.items.length, 2)

  const shirtItem = paidOrder.body.order.items.find((item: any) => item.productName === 'T-shirt')
  const coffeeItem = paidOrder.body.order.items.find((item: any) => item.productName === 'Coffee')
  assert.ok(shirtItem?.pickupAssignment)
  assert.ok(coffeeItem?.pickupAssignment)
  assert.equal(shirtItem.pickupAssignment.address, 'Storage A')
  assert.equal(shirtItem.pickupAssignment.unit, 'шт')
  assert.equal(coffeeItem.pickupAssignment.address, 'Storage C')
  assert.equal(coffeeItem.pickupAssignment.unit, 'кг')
  assert.notEqual(shirtItem.pickupAssignment.pickupStorageId, coffeeItem.pickupAssignment.pickupStorageId)

  const shirtStorageDb = await prisma.pickupStorage.findUniqueOrThrow({ where: { id: tshirtStorage.body.storage.id } })
  const coffeeStorageDb = await prisma.pickupStorage.findUniqueOrThrow({ where: { id: coffeeStorage.body.storage.id } })
  assert.equal(shirtStorageDb.status, 'assigned')
  assert.equal(coffeeStorageDb.status, 'assigned')
  assert.equal(shirtStorageDb.assignedOrderId, orderId)
  assert.equal(coffeeStorageDb.assignedOrderId, orderId)
  assert.notEqual(shirtStorageDb.assignedOrderItemId, coffeeStorageDb.assignedOrderItemId)
})
