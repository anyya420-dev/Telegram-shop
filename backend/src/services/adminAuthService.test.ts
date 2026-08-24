import assert from 'node:assert/strict'
import { randomBytes, scryptSync } from 'node:crypto'
import test from 'node:test'
import { prisma } from '../lib.js'
import {
  createAdminSession,
  getAuthorizedAdminSession,
  hasAdminPasswordConfigured,
  hashAdminSessionToken,
  isOwnerTelegramId,
  seedAdminConfigForFreshInstall,
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

const prismaAny = prisma as any
const originalFindFirst = prismaAny.adminSecurity.findFirst.bind(prisma.adminSecurity)
const originalUpdate = prismaAny.adminSecurity.update.bind(prisma.adminSecurity)
const originalCreate = prismaAny.adminSecurity.create.bind(prisma.adminSecurity)
const originalAdminCount = prismaAny.administrator.count.bind(prisma.administrator)
const originalAdminUpsert = prismaAny.administrator.upsert.bind(prisma.administrator)
const originalAdminCreateMany = prismaAny.administrator.createMany.bind(prisma.administrator)
const originalSessionCreate = prismaAny.adminSession.create.bind(prisma.adminSession)
const originalSessionFindUnique = prismaAny.adminSession.findUnique.bind(prisma.adminSession)
const originalSessionUpdate = prismaAny.adminSession.update.bind(prisma.adminSession)

function restorePrisma() {
  prismaAny.adminSecurity.findFirst = originalFindFirst
  prismaAny.adminSecurity.update = originalUpdate
  prismaAny.adminSecurity.create = originalCreate
  prismaAny.administrator.count = originalAdminCount
  prismaAny.administrator.upsert = originalAdminUpsert
  prismaAny.administrator.createMany = originalAdminCreateMany
  prismaAny.adminSession.create = originalSessionCreate
  prismaAny.adminSession.findUnique = originalSessionFindUnique
  prismaAny.adminSession.update = originalSessionUpdate
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
  prismaAny.adminSecurity.findFirst = async () => null

  const result = await verifyAdminPassword('secret')
  assert.deepEqual(result, { valid: false, reason: 'configuration_error' })
})

test('verifyAdminPassword validates against ADMIN_PASSWORD when no AdminSecurity row exists', async () => {
  process.env.ADMIN_PASSWORD = 'correct-pass'
  prismaAny.adminSecurity.findFirst = async () => null

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

  prismaAny.adminSecurity.findFirst = async () =>
    ({ id: 1, passwordHash: staleHash, passwordSalt: staleSalt, passwordAlgo: 'scrypt', updatedAt: new Date(), updatedByAdmin: null })
  prismaAny.adminSecurity.update = async () => {
    updated = true
    return {}
  }

  const result = await verifyAdminPassword('new-password')
  assert.deepEqual(result, { valid: true })
  assert.equal(updated, true)
})

test('verifyAdminPassword allows DB hash auth when ADMIN_PASSWORD is missing', async () => {
  delete process.env.ADMIN_PASSWORD
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync('db-password', salt, 64).toString('hex')
  prismaAny.adminSecurity.findFirst = async () =>
    ({ id: 1, passwordHash: hash, passwordSalt: salt, passwordAlgo: 'scrypt', updatedAt: new Date(), updatedByAdmin: null })

  const ok = await verifyAdminPassword('db-password')
  const fail = await verifyAdminPassword('wrong-password')

  assert.deepEqual(ok, { valid: true })
  assert.deepEqual(fail, { valid: false, reason: 'invalid_credentials' })
})

test('seedAdminConfigForFreshInstall upserts owner and keeps bootstrap idempotent', async () => {
  process.env.OWNER_TELEGRAM_ID = '8405501187'
  process.env.ADMIN_PASSWORD = 'owner-password'
  let upsertCount = 0
  let createManyCount = 0
  let securityCreateCount = 0

  prismaAny.administrator.count = async () => 0
  prismaAny.administrator.upsert = async ({ where }: { where: { telegramId: string } }) => {
    assert.equal(where.telegramId, '8405501187')
    upsertCount += 1
    return { id: 1, telegramId: '8405501187', createdAt: new Date(), updatedAt: new Date() }
  }
  prismaAny.administrator.createMany = async () => {
    createManyCount += 1
    return { count: 1 }
  }
  let securityReadCount = 0
  prismaAny.adminSecurity.findFirst = async () => {
    securityReadCount += 1
    if (securityReadCount === 1) return null
    return { id: 1, passwordHash: 'x'.repeat(128), passwordSalt: 'salt', passwordAlgo: 'scrypt', updatedAt: new Date(), updatedByAdmin: null }
  }
  prismaAny.adminSecurity.create = async () => {
    securityCreateCount += 1
    return { id: 1 }
  }
  prismaAny.adminSecurity.update = async () => ({ id: 1 })

  await seedAdminConfigForFreshInstall()
  await seedAdminConfigForFreshInstall()

  assert.equal(upsertCount, 2)
  assert.equal(createManyCount, 2)
  assert.equal(securityCreateCount, 1)
})

test('hasAdminPasswordConfigured is true when DB hash exists even without env', async () => {
  delete process.env.ADMIN_PASSWORD
  prismaAny.adminSecurity.findFirst = async () => ({ id: 1, passwordHash: 'hash', passwordSalt: 'salt', passwordAlgo: 'scrypt' })

  const configured = await hasAdminPasswordConfigured()
  assert.equal(configured, true)
})

test('createAdminSession stores only token hash', async () => {
  let capturedHash: string | null = null
  prismaAny.adminSession.create = async ({ data }: { data: { tokenHash: string } }) => {
    capturedHash = data.tokenHash
    return {}
  }

  const session = await createAdminSession(10)

  assert.ok(session.token.length > 20)
  assert.equal(capturedHash, hashAdminSessionToken(session.token))
  assert.notEqual(capturedHash, session.token)
})

test('getAuthorizedAdminSession rejects expired session', async () => {
  prismaAny.adminSession.findUnique = async () => ({
      id: 1,
      adminId: 1,
      tokenHash: 'x',
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(),
      lastActivityAt: new Date(),
      revokedAt: null,
      admin: { id: 1, telegramId: '8405501187', createdAt: new Date(), updatedAt: new Date() },
    })

  const session = await getAuthorizedAdminSession('token')
  assert.equal(session, null)
})
