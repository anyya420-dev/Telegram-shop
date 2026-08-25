import assert from 'node:assert/strict'
import { randomBytes, scryptSync } from 'node:crypto'
import test from 'node:test'
import { prisma } from '../lib.js'
import {
  createAdminSession,
  getAuthorizedAdminSession,
  hasAdminPasswordConfigured,
  hashAdminSessionToken,
  isAdminTelegramId,
  isOwnerTelegramId,
  normalizeTelegramId,
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

const originalAdminFindUnique = prismaAny.administrator.findUnique.bind(prisma.administrator)

function restorePrisma() {
  prismaAny.adminSecurity.findFirst = originalFindFirst
  prismaAny.adminSecurity.update = originalUpdate
  prismaAny.adminSecurity.create = originalCreate
  prismaAny.administrator.count = originalAdminCount
  prismaAny.administrator.upsert = originalAdminUpsert
  prismaAny.administrator.createMany = originalAdminCreateMany
  prismaAny.administrator.findUnique = originalAdminFindUnique
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
  assert.equal(isOwnerTelegramId(8405501187), true)
  assert.equal(isOwnerTelegramId(8405501187n), true)
  assert.equal(isOwnerTelegramId('8405501188'), false)
})

test('isOwnerTelegramId: false when owner variable is missing', () => {
  delete process.env.OWNER_TELEGRAM_ID
  assert.equal(isOwnerTelegramId('8405501187'), false)
})

test('normalizeTelegramId normalizes string/number/bigint consistently', () => {
  assert.equal(normalizeTelegramId('8405501187'), '8405501187')
  assert.equal(normalizeTelegramId(8405501187), '8405501187')
  assert.equal(normalizeTelegramId(8405501187n), '8405501187')
  assert.equal(normalizeTelegramId('0008405501187'), '8405501187')
  assert.equal(normalizeTelegramId(' 8405501187 '), '8405501187')
  assert.equal(normalizeTelegramId('0'), null)
  assert.equal(normalizeTelegramId(-1), null)
  assert.equal(normalizeTelegramId('owner'), null)
})

test('verifyAdminPassword returns configuration_error when admin security is missing', async () => {
  prismaAny.adminSecurity.findFirst = async () => null

  const result = await verifyAdminPassword('secret')
  assert.deepEqual(result, { valid: false, reason: 'configuration_error' })
})

test('verifyAdminPassword validates against stored admin security hash', async () => {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync('correct-password', salt, 64).toString('hex')
  prismaAny.adminSecurity.findFirst = async () =>
    ({ id: 1, passwordHash: hash, passwordSalt: salt, passwordAlgo: 'scrypt', updatedAt: new Date(), updatedByAdmin: null })

  const ok = await verifyAdminPassword('correct-password')
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

test('hasAdminPasswordConfigured is false when admin security row is missing', async () => {
  prismaAny.adminSecurity.findFirst = async () => null
  const configured = await hasAdminPasswordConfigured()
  assert.equal(configured, false)
})

test('hasAdminPasswordConfigured is true when admin security row exists', async () => {
  prismaAny.adminSecurity.findFirst = async () => ({ id: 1 })
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

test('getAuthorizedAdminSession rejects revoked session', async () => {
  prismaAny.adminSession.findUnique = async () => ({
      id: 1,
      adminId: 1,
      tokenHash: 'x',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      lastActivityAt: new Date(),
      revokedAt: new Date(),
      admin: { id: 1, telegramId: '8405501187', createdAt: new Date(), updatedAt: new Date() },
    })

  const session = await getAuthorizedAdminSession('token')
  assert.equal(session, null)
})

test('getAuthorizedAdminSession returns active session and updates activity timestamp', async () => {
  let updateCalled = false
  prismaAny.adminSession.findUnique = async () => ({
      id: 7,
      adminId: 1,
      tokenHash: 'x',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      lastActivityAt: new Date(),
      revokedAt: null,
      admin: { id: 1, telegramId: '8405501187', createdAt: new Date(), updatedAt: new Date() },
    })
  prismaAny.adminSession.update = async ({ where, data }: { where: { id: number }; data: { lastActivityAt: Date } }) => {
    updateCalled = true
    assert.equal(where.id, 7)
    assert.ok(data.lastActivityAt instanceof Date)
    return {}
  }

  const session = await getAuthorizedAdminSession('token')
  assert.equal(session?.admin.telegramId, '8405501187')
  assert.equal(updateCalled, true)
})

// ── isAdminTelegramId ─────────────────────────────────────────────────────────

test('isAdminTelegramId: OWNER_TELEGRAM_ID is always admin regardless of DB', async () => {
  process.env.OWNER_TELEGRAM_ID = '8405501187'
  // No DB lookup needed – owner bypasses DB
  const result = await isAdminTelegramId('8405501187')
  assert.equal(result, true)
})

test('isAdminTelegramId: returns false for invalid/empty telegramId', async () => {
  const result = await isAdminTelegramId('')
  assert.equal(result, false)
  const result2 = await isAdminTelegramId(null)
  assert.equal(result2, false)
})

test('isAdminTelegramId: returns true for ID found in administrator table', async () => {
  delete process.env.OWNER_TELEGRAM_ID
  prismaAny.administrator.findUnique = async ({ where }: { where: { telegramId: string } }) => {
    if (where.telegramId === '8405501187') return { id: 1, telegramId: '8405501187', createdAt: new Date(), updatedAt: new Date() }
    return null
  }
  prismaAny.administrator.count = async () => 1
  const result = await isAdminTelegramId('8405501187')
  assert.equal(result, true)
})

test('isAdminTelegramId: returns false for unknown ID when admins exist in DB', async () => {
  delete process.env.OWNER_TELEGRAM_ID
  prismaAny.administrator.findUnique = async () => null
  prismaAny.administrator.count = async () => 1
  const result = await isAdminTelegramId('9999999999')
  assert.equal(result, false)
})

test('isAdminTelegramId: normalizes numeric and bigint telegram ID input', async () => {
  process.env.OWNER_TELEGRAM_ID = '8405501187'
  const byNumber = await isAdminTelegramId(8405501187)
  const byBigint = await isAdminTelegramId(8405501187n)
  assert.equal(byNumber, true)
  assert.equal(byBigint, true)
})

// ── Verify admin password success (owner auth) ────────────────────────────────

test('verifyAdminPassword succeeds when submitted password matches DB hash', async () => {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync('owner-secret', salt, 64).toString('hex')
  prismaAny.adminSecurity.findFirst = async () =>
    ({ id: 1, passwordHash: hash, passwordSalt: salt, passwordAlgo: 'scrypt', updatedAt: new Date(), updatedByAdmin: null })

  const result = await verifyAdminPassword('owner-secret')
  assert.deepEqual(result, { valid: true })
})

test('verifyAdminPassword rejects submitted password that does not match stored hash', async () => {
  // A wrong submitted password must fail when compared with the stored hash.
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync('correct-pass', salt, 64).toString('hex')
  prismaAny.adminSecurity.findFirst = async () =>
    ({ id: 1, passwordHash: hash, passwordSalt: salt, passwordAlgo: 'scrypt', updatedAt: new Date(), updatedByAdmin: null })
  const result = await verifyAdminPassword('wrong-pass')
  assert.deepEqual(result, { valid: false, reason: 'invalid_credentials' })
})

// ── Admin session token contract ──────────────────────────────────────────────

test('createAdminSession token is not stored in plain text', async () => {
  let storedTokenHash: string | undefined
  prismaAny.adminSession.create = async ({ data }: { data: { tokenHash: string; adminId: number; expiresAt: Date } }) => {
    storedTokenHash = data.tokenHash
    return {}
  }

  const session = await createAdminSession(42)
  assert.ok(storedTokenHash)
  // The stored value must be the hash of the token, not the token itself
  assert.equal(storedTokenHash, hashAdminSessionToken(session.token))
  assert.notEqual(storedTokenHash, session.token)
})

test('createAdminSession produces a token with sufficient entropy (length > 30)', async () => {
  prismaAny.adminSession.create = async () => ({})
  const session = await createAdminSession(1)
  assert.ok(session.token.length > 30, 'token should have sufficient length')
})

test('getAuthorizedAdminSession returns null for missing/undefined token', async () => {
  const result = await getAuthorizedAdminSession(undefined)
  assert.equal(result, null)
})

test('getAuthorizedAdminSession returns null for empty string token', async () => {
  const result = await getAuthorizedAdminSession('')
  assert.equal(result, null)
})
