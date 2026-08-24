import assert from 'node:assert/strict'
import test from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

const ALLOWED_ORIGIN = 'https://telegram-shop-3781.onrender.com'

type EnvSnapshot = Record<string, string | undefined>

const trackedEnvKeys = [
  'NODE_ENV',
  'DATABASE_URL',
  'SESSION_SECRET',
  'FRONTEND_URL',
  'WEB_APP_URL',
  'ALLOW_DEMO_MODE',
] as const

const envSnapshot: EnvSnapshot = Object.fromEntries(
  trackedEnvKeys.map((key) => [key, process.env[key]]),
)

process.env.NODE_ENV = 'production'
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost/dev'
process.env.SESSION_SECRET = 'smoke-test-session-secret'
process.env.FRONTEND_URL = ALLOWED_ORIGIN
process.env.WEB_APP_URL = ALLOWED_ORIGIN
process.env.ALLOW_DEMO_MODE = 'false'

const { createApp } = await import('./app.js')

let server: Server
let baseUrl = ''

test.before(async () => {
  const app = createApp({ allowedOrigins: [ALLOWED_ORIGIN] })
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  for (const key of trackedEnvKeys) {
    const previous = envSnapshot[key]
    if (typeof previous === 'undefined') {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
})

test('GET /health is public and reports the service name', async () => {
  const response = await fetch(`${baseUrl}/health`)
  assert.equal(response.status, 200)
  const body = await response.json() as { status?: string; service?: string }
  assert.equal(body.status, 'ok')
  assert.equal(body.service, 'telegram-shop-backend')
})

test('GET /api/health mirrors /health and requires no auth', async () => {
  const response = await fetch(`${baseUrl}/api/health`)
  assert.equal(response.status, 200)
  const body = await response.json() as { status?: string; service?: string }
  assert.equal(body.status, 'ok')
  assert.equal(body.service, 'telegram-shop-backend')
})

test('GET /ready returns JSON readiness details without requiring auth', async () => {
  const response = await fetch(`${baseUrl}/ready`)
  assert.ok([200, 503].includes(response.status), `expected readiness status 200/503, received ${response.status}`)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  const body = await response.json() as {
    status?: string
    service?: string
    dependencies?: { database?: string }
  }
  assert.equal(body.service, 'telegram-shop-backend')
  assert.ok(body.status === 'ok' || body.status === 'degraded')
  assert.ok(body.dependencies?.database === 'ok' || body.dependencies?.database === 'error')
})

test('GET /health from the allowed origin returns credentialed CORS headers', async () => {
  const response = await fetch(`${baseUrl}/health`, { headers: { Origin: ALLOWED_ORIGIN } })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN)
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
})

test('OPTIONS /api/session/bootstrap preflight passes before auth and rate limiting', async () => {
  const response = await fetch(`${baseUrl}/api/session/bootstrap`, {
    method: 'OPTIONS',
    headers: {
      Origin: ALLOWED_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN)
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/)
})

test('POST /api/session/bootstrap without initData is rejected in production', async () => {
  const response = await fetch(`${baseUrl}/api/session/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
    body: JSON.stringify({}),
  })

  assert.ok(
    [400, 401, 403].includes(response.status),
    `expected 400/401/403 for missing initData, received ${response.status}`,
  )
  assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN)
  const body = await response.json() as { code?: string }
  assert.equal(body.code, 'telegram_init_data_required')
})

test('POST /api/session/bootstrap with a forged initData string is rejected', async () => {
  const response = await fetch(`${baseUrl}/api/session/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
    body: JSON.stringify({ initData: 'auth_date=1&hash=deadbeef&user=%7B%22id%22%3A1%7D' }),
  })

  assert.ok(
    [400, 401, 403, 503].includes(response.status),
    `expected a rejection for forged initData, received ${response.status}`,
  )
  assert.notEqual(response.status, 200)
})

test('POST /api/session/bootstrap with a non-string initData returns 400', async () => {
  const response = await fetch(`${baseUrl}/api/session/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ALLOWED_ORIGIN },
    body: JSON.stringify({ initData: { nested: true } }),
  })

  assert.equal(response.status, 400)
  const body = await response.json() as { code?: string }
  assert.equal(body.code, 'invalid_request_body')
})

test('unknown /api routes return JSON, never an HTML error page', async () => {
  const response = await fetch(`${baseUrl}/api/does-not-exist`, {
    headers: { Origin: ALLOWED_ORIGIN },
  })

  assert.equal(response.status, 404)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  const body = await response.json() as { code?: string }
  assert.equal(body.code, 'not_found')
})

test('an unlisted origin cannot reach /api/session/bootstrap', async () => {
  const response = await fetch(`${baseUrl}/api/session/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
    body: JSON.stringify({}),
  })

  assert.equal(response.status, 403)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})
