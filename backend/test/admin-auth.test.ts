import { createHash, scryptSync } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from '../src/index.js'
import { prisma } from '../src/lib.js'

type AdminSecurityRow = {
  id: number
  passwordHash: string
  passwordSalt: string
  passwordAlgo: string
  updatedAt: Date
}

type AdminSessionRow = {
  id: number
  tokenHash: string
  expiresAt: Date
  createdAt: Date
  lastActivityAt: Date
  revokedAt: Date | null
}

const state: {
  adminSecurity: AdminSecurityRow | null
  sessions: Map<string, AdminSessionRow>
  nextSessionId: number
} = {
  adminSecurity: null,
  sessions: new Map(),
  nextSessionId: 1,
}

const adminSecurityDelegate = (prisma as any).adminSecurity
const adminSessionDelegate = (prisma as any).adminSession
const orderDelegate = (prisma as any).order
const userDelegate = (prisma as any).user

const original = {
  adminSecurity: {
    findFirst: adminSecurityDelegate.findFirst,
    create: adminSecurityDelegate.create,
    update: adminSecurityDelegate.update,
  },
  adminSession: {
    create: adminSessionDelegate.create,
    findUnique: adminSessionDelegate.findUnique,
    update: adminSessionDelegate.update,
    updateMany: adminSessionDelegate.updateMany,
  },
  order: {
    count: orderDelegate.count,
    aggregate: orderDelegate.aggregate,
  },
  user: {
    count: userDelegate.count,
  },
}

function installPrismaMocks() {
  adminSecurityDelegate.findFirst = async () => state.adminSecurity
  adminSecurityDelegate.create = async ({ data }: { data: { passwordHash: string; passwordSalt: string; passwordAlgo: string } }) => {
    state.adminSecurity = {
      id: 1,
      passwordHash: data.passwordHash,
      passwordSalt: data.passwordSalt,
      passwordAlgo: data.passwordAlgo,
      updatedAt: new Date(),
    }
    return state.adminSecurity
  }
  adminSecurityDelegate.update = async ({ data }: { data: { passwordHash: string; passwordSalt: string; passwordAlgo: string } }) => {
    if (!state.adminSecurity) {
      throw new Error('admin_security row missing')
    }
    state.adminSecurity = {
      ...state.adminSecurity,
      passwordHash: data.passwordHash,
      passwordSalt: data.passwordSalt,
      passwordAlgo: data.passwordAlgo,
      updatedAt: new Date(),
    }
    return state.adminSecurity
  }

  adminSessionDelegate.create = async ({ data }: { data: { tokenHash: string; expiresAt: Date } }) => {
    const row: AdminSessionRow = {
      id: state.nextSessionId++,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      revokedAt: null,
    }
    state.sessions.set(row.tokenHash, row)
    return row
  }
  adminSessionDelegate.findUnique = async ({ where }: { where: { tokenHash: string } }) => {
    return state.sessions.get(where.tokenHash) ?? null
  }
  adminSessionDelegate.update = async ({ where, data }: { where: { id: number }; data: { lastActivityAt?: Date; revokedAt?: Date | null } }) => {
    for (const row of state.sessions.values()) {
      if (row.id === where.id) {
        if (data.lastActivityAt) row.lastActivityAt = data.lastActivityAt
        if (data.revokedAt !== undefined) row.revokedAt = data.revokedAt
        return row
      }
    }
    throw new Error('session not found')
  }
  adminSessionDelegate.updateMany = async ({ where, data }: { where: { tokenHash: string; revokedAt: null }; data: { revokedAt: Date } }) => {
    const row = state.sessions.get(where.tokenHash)
    if (!row || row.revokedAt !== null) {
      return { count: 0 }
    }
    row.revokedAt = data.revokedAt
    return { count: 1 }
  }

  orderDelegate.count = async () => 3
  orderDelegate.aggregate = async () => ({ _sum: { total: 1250 } })
  userDelegate.count = async () => 9
}

function restorePrisma() {
  adminSecurityDelegate.findFirst = original.adminSecurity.findFirst
  adminSecurityDelegate.create = original.adminSecurity.create
  adminSecurityDelegate.update = original.adminSecurity.update
  adminSessionDelegate.create = original.adminSession.create
  adminSessionDelegate.findUnique = original.adminSession.findUnique
  adminSessionDelegate.update = original.adminSession.update
  adminSessionDelegate.updateMany = original.adminSession.updateMany
  orderDelegate.count = original.order.count
  orderDelegate.aggregate = original.order.aggregate
  userDelegate.count = original.user.count
}

let server: Server | null = null
let baseUrl = ''

async function startServer() {
  const app = createApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server!.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
}

async function stopServer() {
  if (!server) return
  await new Promise<void>((resolve, reject) => {
    server!.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  server = null
}

beforeEach(async () => {
  process.env.NODE_ENV = 'production'
  process.env.ADMIN_PASSWORD = 'admin-secret'
  state.adminSecurity = null
  state.sessions.clear()
  state.nextSessionId = 1
  installPrismaMocks()
  await startServer()
})

after(async () => {
  restorePrisma()
})

afterEach(async () => {
  await stopServer()
})

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init)
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

  const loginBad = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong' }),
  })
  assert.equal(loginBad.status, 401)

  const adminWithoutSession = await request('/api/admin/stats')
  assert.equal(adminWithoutSession.status, 401)

  const adminWithSession = await request('/api/admin/stats', {
    headers: { cookie: cookieHeader! },
  })
  assert.equal(adminWithSession.status, 200)

  const publicDuring = await request('/api/health', {
    headers: { cookie: cookieHeader! },
  })
  assert.equal(publicDuring.status, 200)

  const logout = await request('/api/admin/auth/logout', {
    method: 'POST',
    headers: { cookie: cookieHeader! },
  })
  assert.equal(logout.status, 200)

  const adminAfterLogout = await request('/api/admin/stats', {
    headers: { cookie: cookieHeader! },
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

test('password hash format is scrypt-compatible', async () => {
  const login = await request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-secret' }),
  })
  assert.equal(login.status, 200)

  assert.ok(state.adminSecurity)
  const expectedHash = scryptSync('admin-secret', state.adminSecurity!.passwordSalt, 64).toString('hex')
  assert.equal(state.adminSecurity!.passwordHash, expectedHash)

  const sessionCookie = login.headers.get('set-cookie') ?? ''
  const token = sessionCookie.split(';')[0]?.split('=')[1] ?? ''
  const tokenHash = createHash('sha256').update(decodeURIComponent(token)).digest('hex')
  assert.ok(state.sessions.has(tokenHash))
})
