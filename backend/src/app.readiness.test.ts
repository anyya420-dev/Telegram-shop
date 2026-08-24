import assert from 'node:assert/strict'
import test from 'node:test'
import type { AddressInfo } from 'node:net'
import { createApp } from './app.js'
import { prisma } from './lib.js'

const ALLOWED_ORIGIN = 'https://telegram-shop-3781.onrender.com'
const prismaAny = prisma as any
const originalQueryRaw = prismaAny.$queryRaw.bind(prisma)

function createServer() {
  const app = createApp({ allowedOrigins: [ALLOWED_ORIGIN] })
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

test.afterEach(() => {
  prismaAny.$queryRaw = originalQueryRaw
})

test('GET /health is still served when the database is unavailable', async () => {
  prismaAny.$queryRaw = async () => {
    throw new Error('database unavailable')
  }

  const server = await createServer()
  try {
    const response = await fetch(`${server.baseUrl}/health`)
    assert.equal(response.status, 200)
    const body = await response.json() as { status?: string; service?: string }
    assert.equal(body.status, 'ok')
    assert.equal(body.service, 'telegram-shop-backend')
  } finally {
    await server.close()
  }
})

test('GET /ready reports database availability when the readiness probe succeeds', async () => {
  prismaAny.$queryRaw = async () => [{ ok: 1 }]

  const server = await createServer()
  try {
    const response = await fetch(`${server.baseUrl}/ready`)
    assert.equal(response.status, 200)
    const body = await response.json() as {
      status?: string
      dependencies?: { database?: string }
    }
    assert.equal(body.status, 'ok')
    assert.equal(body.dependencies?.database, 'ok')
  } finally {
    await server.close()
  }
})

test('GET /ready reports database failure when the readiness probe fails', async () => {
  prismaAny.$queryRaw = async () => {
    throw new Error('database unavailable')
  }

  const server = await createServer()
  try {
    const response = await fetch(`${server.baseUrl}/ready`)
    assert.equal(response.status, 503)
    const body = await response.json() as {
      status?: string
      dependencies?: { database?: string }
    }
    assert.equal(body.status, 'degraded')
    assert.equal(body.dependencies?.database, 'error')
  } finally {
    await server.close()
  }
})
