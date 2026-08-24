import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionToken, verifySessionToken } from './lib.js'

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
