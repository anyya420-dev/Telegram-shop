import assert from 'node:assert/strict'
import test from 'node:test'
import type { Express } from 'express'
import { runBackgroundInitialization, startHttpServer } from './startup.js'

function createFakeApp(onListen: () => void) {
  return {
    listen(_port: number, _host: string, callback: () => void) {
      onListen()
      callback()
      return { close() {} }
    },
  } as unknown as Express
}

test('startHttpServer binds before database-dependent initialization completes', async () => {
  const events: string[] = []
  let releaseSeed!: () => void
  let botInitialized = false

  const seedStarted = new Promise<void>((resolve) => {
    releaseSeed = resolve
  })

  await startHttpServer({
    app: createFakeApp(() => {
      events.push('listen')
    }),
    port: 10000,
    logger: {
      log: () => {},
      info: () => {},
      error: () => {},
    },
    seedAdminConfigForFreshInstall: async () => {
      events.push('seed-start')
      await seedStarted
      events.push('seed-end')
    },
    initializeTelegramBot: async () => {
      botInitialized = true
      events.push('bot-init')
    },
  })

  assert.deepEqual(events, ['listen', 'seed-start'])
  assert.equal(botInitialized, false)

  releaseSeed()
  await new Promise<void>((resolve) => setImmediate(resolve))

  assert.deepEqual(events, ['listen', 'seed-start', 'seed-end', 'bot-init'])
  assert.equal(botInitialized, true)
})

test('runBackgroundInitialization retries after a database failure and keeps the process alive', async () => {
  const attempts: string[] = []
  let seedAttempts = 0
  let waitedMs: number | null = null
  let botInitialized = false

  await runBackgroundInitialization({
    logger: {
      log: () => {},
      info: () => {},
      error: () => {},
    },
    delay: async (ms) => {
      waitedMs = ms
    },
    retryDelayMs: 123,
    seedAdminConfigForFreshInstall: async () => {
      seedAttempts += 1
      attempts.push(`seed-${seedAttempts}`)
      if (seedAttempts === 1) {
        throw new Error('database temporarily unavailable')
      }
    },
    initializeTelegramBot: async () => {
      botInitialized = true
      attempts.push('bot')
    },
  })

  assert.equal(waitedMs, 123)
  assert.deepEqual(attempts, ['seed-1', 'seed-2', 'bot'])
  assert.equal(botInitialized, true)
})
