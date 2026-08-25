import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, api } from '../src/api/client.ts'

type RecordedCall = {
  url: string
  init: RequestInit
}
const expectedAuthorization = ['Bearer', 'session-token'].join(' ')

function readHeader(headers: HeadersInit | undefined, key: string) {
  const normalized = key.toLowerCase()
  const bucket = new Headers(headers)
  return bucket.get(normalized)
}

test('public API requests never depend on admin token/cookie transport', async () => {
  const calls: RecordedCall[] = []
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  api.setSessionToken('session-token')
  await api.getCities()

  assert.equal(calls.length, 1)
  const call = calls[0]
  assert.equal(call.url, '/api/cities')
  assert.equal(call.init.credentials, 'omit')
  assert.equal(readHeader(call.init.headers, 'authorization'), expectedAuthorization)
  assert.equal(readHeader(call.init.headers, 'content-type'), null)
})

test('admin API requests use isolated admin auth transport', async () => {
  const calls: RecordedCall[] = []
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  api.setSessionToken('session-token')
  await api.adminLogout()

  assert.equal(calls.length, 1)
  const call = calls[0]
  assert.equal(call.url, '/api/admin/auth/logout')
  assert.equal(call.init.credentials, 'include')
  assert.equal(readHeader(call.init.headers, 'authorization'), expectedAuthorization)
})

test('failed admin login does not break subsequent public API requests', async () => {
  const calls: RecordedCall[] = []
  const responses = [
    new Response(JSON.stringify({ code: 'invalid_credentials', message: 'Invalid administrator credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ]

  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const response = responses.shift()
    if (!response) {
      throw new Error('Unexpected extra request')
    }
    return response
  }) as typeof fetch

  api.setSessionToken('session-token')

  await assert.rejects(
    () => api.adminLogin({ password: 'bad-password' }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === 'invalid_credentials' &&
      error.status === 401,
  )

  await api.getCities()

  assert.equal(calls.length, 2)
  const publicCall = calls[1]
  assert.equal(publicCall.url, '/api/cities')
  assert.equal(publicCall.init.credentials, 'omit')
  assert.equal(readHeader(publicCall.init.headers, 'authorization'), expectedAuthorization)
})

test('public -> admin login -> admin -> public -> admin logout -> public keeps public transport clean', async () => {
  const calls: RecordedCall[] = []
  const responses = [
    new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({ settings: { administrators: [], passwordConfigured: true, bot: { connected: false, botId: null, username: null, firstName: null, tokenMasked: null, lastValidatedAt: null } } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({ users: 0, products: 0, orders: 0, revenue: 0, pendingOrders: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  ]

  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const response = responses.shift()
    if (!response) throw new Error('Unexpected extra request')
    return response
  }) as typeof fetch

  api.setSessionToken('session-token')
  await api.getCities()
  await api.adminLogin({ password: 'correct-password' })
  await api.getAdminStats()
  await api.getCities()
  await api.adminLogout()
  await api.getCities()

  assert.equal(calls.length, 6)
  const [public1, loginCall, adminCall, public2, logoutCall, public3] = calls

  for (const call of [public1, public2, public3]) {
    assert.equal(call.init.credentials, 'omit')
    assert.equal(readHeader(call.init.headers, 'authorization'), expectedAuthorization)
    assert.equal(readHeader(call.init.headers, 'x-admin-token'), null)
  }

  for (const call of [loginCall, adminCall, logoutCall]) {
    assert.equal(call.init.credentials, 'include')
    assert.equal(readHeader(call.init.headers, 'authorization'), expectedAuthorization)
  }
})
