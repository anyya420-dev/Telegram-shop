import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { api } from './client'

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

  for (const call of calls) {
    assert.equal(call.init.credentials, 'omit')
  }

  const headers = new Headers(calls[0].init.headers)
  assert.equal(headers.has('Authorization'), false)
})
