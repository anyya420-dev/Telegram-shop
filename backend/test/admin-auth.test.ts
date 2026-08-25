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
      Origin: 'https://telegram-shop-3781.onrender.com',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://telegram-shop-3781.onrender.com')
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')

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
