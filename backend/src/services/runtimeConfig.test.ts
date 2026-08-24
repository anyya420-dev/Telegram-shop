import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertProductionRuntimeConfig,
  getAllowedCorsOrigins,
  getRuntimeConfigSummary,
  getRuntimeConfigStatus,
  getSessionSecret,
} from './runtimeConfig.js'

type EnvSnapshot = Record<string, string | undefined>

const trackedEnvKeys = [
  'NODE_ENV',
  'DATABASE_URL',
  'SESSION_SECRET',
  'OWNER_TELEGRAM_ID',
  'ADMIN_PASSWORD',
  'BOT_TOKEN_ENCRYPTION_KEY',
  'FRONTEND_URL',
  'WEB_APP_URL',
  'ALLOW_DEMO_MODE',
] as const

const envSnapshot: EnvSnapshot = Object.fromEntries(
  trackedEnvKeys.map((key) => [key, process.env[key]]),
)

function restoreEnv() {
  for (const key of trackedEnvKeys) {
    const previous = envSnapshot[key]
    if (typeof previous === 'undefined') {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

function setProductionBaseline() {
  process.env.NODE_ENV = 'production'
  process.env.DATABASE_URL = 'postgresql://db.example.local/shop'
  process.env.SESSION_SECRET = 'super-secret-session'
  process.env.OWNER_TELEGRAM_ID = '8405501187'
  process.env.ADMIN_PASSWORD = 'admin-password'
  process.env.BOT_TOKEN_ENCRYPTION_KEY = 'bot-encryption-secret-key-1234567890'
  process.env.FRONTEND_URL = 'https://frontend.example.com'
  process.env.WEB_APP_URL = 'https://frontend.example.com'
  process.env.ALLOW_DEMO_MODE = 'false'
}

test.afterEach(() => {
  restoreEnv()
})

test('getRuntimeConfigSummary marks OWNER_TELEGRAM_ID invalid when non-numeric', () => {
  setProductionBaseline()
  process.env.OWNER_TELEGRAM_ID = 'owner'

  const summary = getRuntimeConfigSummary()
  assert.equal(summary.OWNER_TELEGRAM_ID, 'INVALID')
})

test('assertProductionRuntimeConfig fails for missing required env vars', () => {
  process.env.NODE_ENV = 'production'
  delete process.env.SESSION_SECRET

  assert.throws(() => assertProductionRuntimeConfig(), /SESSION_SECRET/)
})

test('assertProductionRuntimeConfig fails when production demo mode is enabled', () => {
  setProductionBaseline()
  process.env.ALLOW_DEMO_MODE = 'true'

  assert.throws(() => assertProductionRuntimeConfig(), /ALLOW_DEMO_MODE/)
})

test('assertProductionRuntimeConfig succeeds with valid production config', () => {
  setProductionBaseline()
  assert.doesNotThrow(() => assertProductionRuntimeConfig())
})

test('getAllowedCorsOrigins keeps production origins explicit', () => {
  setProductionBaseline()
  const origins = getAllowedCorsOrigins()
  assert.deepEqual(origins, ['https://frontend.example.com'])
})

test('getSessionSecret throws in production when missing', () => {
  process.env.NODE_ENV = 'production'
  delete process.env.SESSION_SECRET

  assert.throws(() => getSessionSecret(), /SESSION_SECRET/)
})

test('getRuntimeConfigStatus reflects missing owner/admin configuration', () => {
  setProductionBaseline()
  delete process.env.OWNER_TELEGRAM_ID
  delete process.env.ADMIN_PASSWORD

  const status = getRuntimeConfigStatus()
  assert.equal(status.ownerTelegramIdConfigured, false)
  assert.equal(status.adminPasswordConfigured, false)
})

test('runtime summary never exposes secret values', () => {
  setProductionBaseline()
  const summary = getRuntimeConfigSummary()
  assert.notEqual(String(summary.ADMIN_PASSWORD), process.env.ADMIN_PASSWORD)
  assert.notEqual(String(summary.SESSION_SECRET), process.env.SESSION_SECRET)
  assert.notEqual(String(summary.BOT_TOKEN_ENCRYPTION_KEY), process.env.BOT_TOKEN_ENCRYPTION_KEY)
})
