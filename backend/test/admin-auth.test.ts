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
let prisma: { $disconnect: () => Promise<void> } | null = null

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
