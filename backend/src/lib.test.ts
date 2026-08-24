import assert from 'node:assert/strict'
import test from 'node:test'
import { createHmac } from 'node:crypto'
import { createSessionToken, verifySessionToken, verifyTelegramInitData } from './lib.js'

type EnvSnapshot = Record<string, string | undefined>

const trackedEnvKeys = ['NODE_ENV', 'SESSION_SECRET'] as const
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

test.afterEach(() => {
  restoreEnv()
})

test('session token roundtrip uses SESSION_SECRET consistently', () => {
  process.env.NODE_ENV = 'development'
  process.env.SESSION_SECRET = 'session-secret-1'

  const token = createSessionToken('8405501187')
  assert.equal(verifySessionToken(token), '8405501187')
})

test('session token verification fails when SESSION_SECRET changes', () => {
  process.env.NODE_ENV = 'development'
  process.env.SESSION_SECRET = 'session-secret-1'
  const token = createSessionToken('8405501187')

  process.env.SESSION_SECRET = 'session-secret-2'
  assert.equal(verifySessionToken(token), null)
})

test('session token creation fails in production when SESSION_SECRET is missing', () => {
  process.env.NODE_ENV = 'production'
  delete process.env.SESSION_SECRET

  assert.throws(() => createSessionToken('8405501187'), /SESSION_SECRET/)
})

function createSignedInitData(params: Record<string, string>, botToken: string) {
  const sortedPayload = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(sortedPayload).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

test('verifyTelegramInitData accepts valid signed initData', () => {
  const botToken = '123456:token'
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    auth_date: String(now),
    query_id: 'AAH',
    user: JSON.stringify({ id: '8405501187', first_name: 'Owner', username: 'owner' }),
  }
  const initData = createSignedInitData(payload, botToken)

  const user = verifyTelegramInitData(initData, botToken)
  assert.equal(user?.id, '8405501187')
  assert.equal(user?.first_name, 'Owner')
})

test('verifyTelegramInitData rejects stale initData', () => {
  const botToken = '123456:token'
  const stale = Math.floor(Date.now() / 1000) - (60 * 60 * 24) - 10
  const payload = {
    auth_date: String(stale),
    query_id: 'AAH',
    user: JSON.stringify({ id: '8405501187', first_name: 'Owner' }),
  }
  const initData = createSignedInitData(payload, botToken)

  const user = verifyTelegramInitData(initData, botToken)
  assert.equal(user, null)
})

test('verifyTelegramInitData rejects tampered hash', () => {
  const botToken = '123456:token'
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    auth_date: String(now),
    query_id: 'AAH',
    user: JSON.stringify({ id: '8405501187', first_name: 'Owner' }),
  }
  const initData = createSignedInitData(payload, botToken)
  const tampered = initData.replace('first_name%22%3A%22Owner%22', 'first_name%22%3A%22Hacker%22')

  const user = verifyTelegramInitData(tampered, botToken)
  assert.equal(user, null)
})
