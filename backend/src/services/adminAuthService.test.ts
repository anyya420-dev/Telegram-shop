import assert from 'node:assert/strict'
import { randomBytes, scryptSync } from 'node:crypto'
import test from 'node:test'
import { prisma } from '../lib.js'
import {
  createAdminSession,
  getAuthorizedAdminSession,
  hashAdminSessionToken,
  isOwnerTelegramId,
  verifyAdminPassword,
} from './adminAuthService.js'

type EnvSnapshot = {
  ADMIN_PASSWORD: string | undefined
  OWNER_TELEGRAM_ID: string | undefined
}

const envSnapshot: EnvSnapshot = {
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  OWNER_TELEGRAM_ID: process.env.OWNER_TELEGRAM_ID,
}

const originalFindFirst = prisma.adminSecurity.findFirst.bind(prisma.adminSecurity)
const originalUpdate = prisma.adminSecurity.update.bind(prisma.adminSecurity)
const originalSessionCreate = prisma.adminSession.create.bind(prisma.adminSession)
const originalSessionFindUnique = prisma.adminSession.findUnique.bind(prisma.adminSession)
const originalSessionUpdate = prisma.adminSession.update.bind(prisma.adminSession)

function restorePrisma() {
  prisma.adminSecurity.findFirst = originalFindFirst
  prisma.adminSecurity.update = originalUpdate
  prisma.adminSession.create = originalSessionCreate
  prisma.adminSession.findUnique = originalSessionFindUnique
  prisma.adminSession.update = originalSessionUpdate
}

test.afterEach(() => {
  process.env.ADMIN_PASSWORD = envSnapshot.ADMIN_PASSWORD
  process.env.OWNER_TELEGRAM_ID = envSnapshot.OWNER_TELEGRAM_ID
  restorePrisma()
})

test('isOwnerTelegramId: true only for configured owner', () => {
  process.env.OWNER_TELEGRAM_ID = '8405501187'
  assert.equal(isOwnerTelegramId('8405501187'), true)
  assert.equal(isOwnerTelegramId('8405501188'), false)
})

test('isOwnerTelegramId: false when owner variable is missing', () => {
  delete process.env.OWNER_TELEGRAM_ID
  assert.equal(isOwnerTelegramId('8405501187'), false)
})

test('verifyAdminPassword returns configuration_error when ADMIN_PASSWORD is missing', async () => {
  delete process.env.ADMIN_PASSWORD
  prisma.adminSecurity.findFirst = async () => null as never

  const result = await verifyAdminPassword('secret')
  assert.deepEqual(result, { valid: false, reason: 'configuration_error' })
})

test('verifyAdminPassword validates against ADMIN_PASSWORD when no AdminSecurity row exists', async () => {
  process.env.ADMIN_PASSWORD = 'correct-pass'
  prisma.adminSecurity.findFirst = async () => null as never

  const ok = await verifyAdminPassword('correct-pass')
  const fail = await verifyAdminPassword('wrong-pass')

  assert.deepEqual(ok, { valid: true })
  assert.deepEqual(fail, { valid: false, reason: 'invalid_credentials' })
})

test('verifyAdminPassword re-syncs stale AdminSecurity hash when env password matches', async () => {
  process.env.ADMIN_PASSWORD = 'new-password'
  const staleSalt = randomBytes(16).toString('hex')
  const staleHash = scryptSync('old-password', staleSalt, 64).toString('hex')
  let updated = false

  prisma.adminSecurity.findFirst = async () =>
    ({ id: 1, passwordHash: staleHash, passwordSalt: staleSalt, passwordAlgo: 'scrypt', updatedAt: new Date(), updatedByAdmin: null }) as never
  prisma.adminSecurity.update = async () => {
    updated = true
    return {} as never
  }

  const result = await verifyAdminPassword('new-password')
  assert.deepEqual(result, { valid: true })
  assert.equal(updated, true)
})

test('createAdminSession stores only token hash', async () => {
  let capturedHash: string | null = null
  prisma.adminSession.create = async ({ data }: { data: { tokenHash: string } }) => {
    capturedHash = data.tokenHash
    return {} as never
  }

  const session = await createAdminSession(10)

  assert.ok(session.token.length > 20)
  assert.equal(capturedHash, hashAdminSessionToken(session.token))
  assert.notEqual(capturedHash, session.token)
})

test('getAuthorizedAdminSession rejects expired session', async () => {
  prisma.adminSession.findUnique = async () =>
    ({
      id: 1,
      adminId: 1,
      tokenHash: 'x',
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(),
      lastActivityAt: new Date(),
      revokedAt: null,
      admin: { id: 1, telegramId: '8405501187', createdAt: new Date(), updatedAt: new Date() },
    }) as never

  const session = await getAuthorizedAdminSession('token')
  assert.equal(session, null)
})
