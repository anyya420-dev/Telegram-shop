import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { api, resolveApiUrl } from './client'

type Call = { url: string; init: RequestInit }

const calls: Call[] = []

beforeEach(() => {
  calls.length = 0
  api.setSessionToken(null)

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    calls.push({ url, init: init ?? {} })

    const payload = url.includes('/admin/auth/status') ? { authenticated: true } : { ok: true }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
})

test('public and admin clients keep transport isolation across auth flow', async () => {
  await api.getCities()
  await api.adminLogin({ password: 'password' })
  await api.adminStatus()
  await api.getCities()
  await api.adminLogout()
  await api.getCities()

  assert.equal(calls.length, 6)

  const [publicBefore, adminLogin, adminStatus, publicDuring, adminLogout, publicAfter] = calls

  assert.equal(publicBefore.init.credentials, 'omit')
  assert.equal(publicDuring.init.credentials, 'omit')
  assert.equal(publicAfter.init.credentials, 'omit')

  assert.equal(adminLogin.init.credentials, 'include')
  assert.equal(adminStatus.init.credentials, 'include')
  assert.equal(adminLogout.init.credentials, 'include')

  const publicHeaders = new Headers(publicDuring.init.headers)
  assert.equal(publicHeaders.has('X-Admin-Token'), false)
  assert.equal(publicHeaders.has('x-admin-token'), false)

  assert.equal(publicBefore.url.includes('/cities'), true)
  assert.equal(adminLogin.url.includes('/admin/auth/login'), true)
  assert.equal(adminStatus.url.includes('/admin/auth/status'), true)
  assert.equal(adminLogout.url.includes('/admin/auth/logout'), true)
})

test('public client never switches to credentialed mode', async () => {
  api.setSessionToken('user-session-token')

  await api.getCities()
  await api.getProduct(1, 1)
  await api.getPaymentMethods()

  for (const call of calls) {
    assert.equal(call.init.credentials, 'omit')
  }

  const headers = new Headers(calls[0].init.headers)
  assert.equal(headers.has('Authorization'), false)
})

test('payment and admin payment endpoints use correct paths and transports', async () => {
  await api.getPaymentMethods()
  await api.getCasinoState()
  await api.getAdminPaymentSettings()
  await api.createAdminPaymentSetting({ type: 'crypto', title: 'USDT TRC20', currency: 'USDT', network: 'TRC20', walletAddress: 'T123' })
  await api.toggleAdminPaymentSetting(7)
  await api.deleteAdminPaymentSetting(7)

  assert.equal(calls[0].url.includes('/payments/methods'), true)
  assert.equal(calls[0].init.credentials, 'omit')
  assert.equal(calls[1].url.includes('/casino'), true)
  assert.equal(calls[1].init.credentials, 'omit')
  assert.equal(calls[2].url.includes('/admin/payment-settings'), true)
  assert.equal(calls[2].init.credentials, 'include')
  assert.equal(calls[3].url.includes('/admin/payment-settings'), true)
  assert.equal(calls[4].url.includes('/admin/payment-settings/7/toggle'), true)
  assert.equal(calls[5].url.includes('/admin/payment-settings/7'), true)
})

test('resolveApiUrl normalizes Render API env values', () => {
  assert.equal(resolveApiUrl({ VITE_API_URL: 'https://narcos-shop.onrender.com' }), 'https://narcos-shop.onrender.com/api')
  assert.equal(resolveApiUrl({ VITE_API_URL: 'https://narcos-shop.onrender.com/api/' }), 'https://narcos-shop.onrender.com/api')
  assert.equal(resolveApiUrl({ VITE_API_URL: 'narcos-shop.onrender.com/api' }), 'https://narcos-shop.onrender.com/api')
  assert.equal(resolveApiUrl({ VITE_API_URL: '/api/' }), '/api')
  assert.equal(resolveApiUrl({ VITE_API_URL: '   ' }), '/api')
  assert.equal(resolveApiUrl({ VITE_API_URL: '   ', PROD: true }), 'https://narcos-shop.onrender.com/api')
  assert.equal(resolveApiUrl({ VITE_API_URL: '   ', PROD: true, VITE_DEFAULT_API_URL: 'https://shop-api.example.com' }), 'https://shop-api.example.com/api')
  assert.equal(resolveApiUrl({ VITE_API_URL: '   ', MODE: 'production' }), 'https://narcos-shop.onrender.com/api')
  assert.equal(resolveApiUrl({ VITE_API_URL: '   ', MODE: 'development' }), '/api')
})

test('catalog requests forward sort and filter params to the shared client', async () => {
  await api.getCatalog({ cityId: 4, search: 'tea', categoryId: 7, sort: 'price_desc' })

  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /cityId=4/)
  assert.match(calls[0].url, /search=tea/)
  assert.match(calls[0].url, /categoryId=7/)
  assert.match(calls[0].url, /sort=price_desc/)
})
