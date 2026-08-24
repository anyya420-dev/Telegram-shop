import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { createCorsMiddleware, normalizeOrigin } from './cors.js'

const ALLOWED_ORIGIN = 'https://telegram-shop-3781.onrender.com'
const DISALLOWED_ORIGIN = 'https://evil.example.com'

function createTestServer(allowedOrigins: string[]) {
  const app = express()
  app.use(createCorsMiddleware({ allowedOrigins }))
  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'telegram-shop-backend' })
  })
  app.use(express.json())
  // Stands in for an auth-protected route: it must never be reached by OPTIONS.
  app.use('/api/session', (request, response, next) => {
    if (request.method !== 'POST') {
      response.status(405).json({ code: 'method_not_allowed', message: 'blocked by auth guard' })
      return
    }
    next()
  })
  app.post('/api/session/bootstrap', (_request, response) => {
    response.status(401).json({ code: 'telegram_init_data_required', message: 'nope' })
  })

  const server = app.listen(0, '127.0.0.1')
  return new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    server.once('listening', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}

test('normalizeOrigin strips trailing slashes, paths and lowercases scheme + host', () => {
  assert.equal(normalizeOrigin('https://Telegram-Shop-3781.onrender.com/'), ALLOWED_ORIGIN)
  assert.equal(normalizeOrigin('  https://telegram-shop-3781.onrender.com  '), ALLOWED_ORIGIN)
  assert.equal(normalizeOrigin('HTTPS://TELEGRAM-SHOP-3781.ONRENDER.COM/app/'), ALLOWED_ORIGIN)
  assert.equal(normalizeOrigin('https://telegram-shop-3781.onrender.com:443'), ALLOWED_ORIGIN)
  assert.equal(normalizeOrigin('http://localhost:5173/'), 'http://localhost:5173')
})

test('normalizeOrigin rejects empty and non-http values', () => {
  assert.equal(normalizeOrigin(''), null)
  assert.equal(normalizeOrigin('   '), null)
  assert.equal(normalizeOrigin(undefined), null)
  assert.equal(normalizeOrigin('null'), null)
  assert.equal(normalizeOrigin('not-a-url'), null)
  assert.equal(normalizeOrigin('ftp://example.com'), null)
})

test('allowed origin receives credentialed CORS headers and Vary: Origin', async () => {
  const server = await createTestServer([ALLOWED_ORIGIN])
  try {
    const response = await fetch(`${server.baseUrl}/health`, {
      headers: { Origin: ALLOWED_ORIGIN },
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN)
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
    assert.match(response.headers.get('vary') ?? '', /Origin/)
  } finally {
    await server.close()
  }
})

test('allowlist entry with a trailing slash still matches the browser Origin header', async () => {
  const server = await createTestServer([`${ALLOWED_ORIGIN}/`])
  try {
    const response = await fetch(`${server.baseUrl}/health`, {
      headers: { Origin: ALLOWED_ORIGIN },
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN)
  } finally {
    await server.close()
  }
})

test('OPTIONS preflight for /api/session/bootstrap succeeds before auth middleware', async () => {
  const server = await createTestServer([ALLOWED_ORIGIN])
  try {
    const response = await fetch(`${server.baseUrl}/api/session/bootstrap`, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })

    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN)
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
    assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/)
    assert.match(response.headers.get('access-control-allow-headers') ?? '', /content-type/i)
  } finally {
    await server.close()
  }
})

test('disallowed origin is rejected with 403 and no Access-Control-Allow-Origin', async () => {
  const server = await createTestServer([ALLOWED_ORIGIN])
  try {
    const response = await fetch(`${server.baseUrl}/health`, {
      headers: { Origin: DISALLOWED_ORIGIN },
    })

    assert.equal(response.status, 403)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
    const body = await response.json() as { code?: string }
    assert.equal(body.code, 'cors_origin_not_allowed')
  } finally {
    await server.close()
  }
})

test('disallowed origin preflight never returns CORS headers', async () => {
  const server = await createTestServer([ALLOWED_ORIGIN])
  try {
    const response = await fetch(`${server.baseUrl}/api/session/bootstrap`, {
      method: 'OPTIONS',
      headers: {
        Origin: DISALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
      },
    })

    assert.equal(response.status, 403)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  } finally {
    await server.close()
  }
})

test('requests without an Origin header (curl / health probes) are never blocked', async () => {
  const server = await createTestServer([ALLOWED_ORIGIN])
  try {
    const response = await fetch(`${server.baseUrl}/health`)
    assert.equal(response.status, 200)
    // Never a wildcard: credentialed CORS forbids it.
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  } finally {
    await server.close()
  }
})

test('CORS never emits a wildcard origin together with credentials', async () => {
  const server = await createTestServer([ALLOWED_ORIGIN])
  try {
    for (const origin of [ALLOWED_ORIGIN, `${ALLOWED_ORIGIN}/`]) {
      const response = await fetch(`${server.baseUrl}/health`, { headers: { Origin: origin } })
      assert.notEqual(response.headers.get('access-control-allow-origin'), '*')
    }
  } finally {
    await server.close()
  }
})
