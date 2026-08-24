import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { prisma } from '../lib.js'

const ADMIN_SESSION_TTL_HOURS = 12
const TELEGRAM_ID_PATTERN = /^\d{5,20}$/
// Fixed salt used only for timing-safe equality comparison of plain-text env passwords.
// Never used for persistent storage – actual stored hashes always use a random per-record salt.
const ENV_COMPARE_SALT = 'admin-env-compare-v1'
let ownerValidationWarningShown = false

function normalizeTelegramId(value: unknown) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      return null
    }
    return String(value)
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!TELEGRAM_ID_PATTERN.test(normalized)) {
    return null
  }

  return normalized
}

export function getOwnerTelegramId() {
  const rawOwnerId = process.env.OWNER_TELEGRAM_ID
  if (!rawOwnerId) {
    return null
  }

  const ownerId = normalizeTelegramId(rawOwnerId)
  if (!ownerId) {
    if (!ownerValidationWarningShown) {
      ownerValidationWarningShown = true
      console.warn('[admin-auth] OWNER_TELEGRAM_ID is set but invalid; expected numeric Telegram ID')
    }
    return null
  }

  return ownerId
}

function getEnvAdminIds() {
  const ids = (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .map((value) => normalizeTelegramId(value))
    .filter((value): value is string => Boolean(value))
  const owner = getOwnerTelegramId()
  if (owner && !ids.includes(owner)) {
    ids.unshift(owner)
  }
  return ids
}

function getEnvAdminPassword() {
  const raw = process.env.ADMIN_PASSWORD ?? ''
  return raw.trim()
}

function derivePasswordHash(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex')
}

/**
 * Timing-safe equality check for two plain-text passwords.
 * Both values are hashed with scrypt and the same fixed salt so the
 * resulting buffers have equal length, enabling timingSafeEqual.
 * This function is used ONLY for comparison – the result is never stored.
 */
function envPasswordMatchesSubmitted(envPassword: string, submittedPassword: string): boolean {
  const a = Buffer.from(derivePasswordHash(envPassword, ENV_COMPARE_SALT), 'hex')
  const b = Buffer.from(derivePasswordHash(submittedPassword, ENV_COMPARE_SALT), 'hex')
  return timingSafeEqual(a, b)
}

export function hashAdminSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createRandomToken() {
  return randomBytes(48).toString('base64url')
}

export async function seedAdminConfigForFreshInstall(currentTelegramId?: string) {
  const [adminCount, security] = await Promise.all([
    prisma.administrator.count(),
    prisma.adminSecurity.findFirst({ orderBy: { id: 'asc' } }),
  ])

  // Always ensure the OWNER_TELEGRAM_ID is an administrator
  const owner = getOwnerTelegramId()
  if (owner) {
    await prisma.administrator.upsert({
      where: { telegramId: owner },
      create: { telegramId: owner },
      update: {},
    })
  }

  if (adminCount === 0) {
    const envIds = getEnvAdminIds()
    const idsToSeed = envIds.length > 0 ? envIds : currentTelegramId ? [currentTelegramId] : []
    if (idsToSeed.length > 0) {
      await prisma.administrator.createMany({
        data: idsToSeed.map((telegramId) => ({ telegramId })),
        skipDuplicates: true,
      })
    }
  }

  const envPassword = getEnvAdminPassword()
  if (!security) {
    if (envPassword) {
      const salt = randomBytes(16).toString('hex')
      const passwordHash = derivePasswordHash(envPassword, salt)
      await prisma.adminSecurity.create({
        data: {
          passwordHash,
          passwordSalt: salt,
          passwordAlgo: 'scrypt',
        },
      })
    }
  } else if (envPassword) {
    // If the env var no longer matches the stored hash, update the DB record
    // to re-sync it with the current ADMIN_PASSWORD.  This handles the
    // case where ADMIN_PASSWORD was rotated in the deployment environment
    // (e.g. Render dashboard) after the initial seed ran.
    const storedHash = Buffer.from(security.passwordHash, 'hex')
    const checkHash = Buffer.from(derivePasswordHash(envPassword, security.passwordSalt), 'hex')
    const hashesMatch = storedHash.length === checkHash.length && timingSafeEqual(storedHash, checkHash)
    if (!hashesMatch) {
      const newSalt = randomBytes(16).toString('hex')
      await prisma.adminSecurity.update({
        where: { id: security.id },
        data: {
          passwordHash: derivePasswordHash(envPassword, newSalt),
          passwordSalt: newSalt,
          passwordAlgo: 'scrypt',
        },
      })
    }
  }
}

export async function isAdminTelegramId(telegramId: string) {
  const normalizedTelegramId = normalizeTelegramId(telegramId)
  if (!normalizedTelegramId) {
    return false
  }

  // OWNER_TELEGRAM_ID always has admin access regardless of db state
  const owner = getOwnerTelegramId()
  if (owner && normalizedTelegramId === owner) {
    return true
  }

  const admin = await prisma.administrator.findUnique({ where: { telegramId: normalizedTelegramId } })
  if (admin) {
    return true
  }

  const hasAnyAdmins = (await prisma.administrator.count()) > 0
  if (hasAnyAdmins) {
    return false
  }

  const envIds = getEnvAdminIds()
  return envIds.length === 0 || envIds.includes(normalizedTelegramId)
}

export function isOwnerTelegramId(telegramId: string) {
  const owner = getOwnerTelegramId()
  const normalizedTelegramId = normalizeTelegramId(telegramId)
  return Boolean(owner && normalizedTelegramId && normalizedTelegramId === owner)
}

export async function ensureOwnerAdministratorRecord(telegramId: string) {
  const normalizedTelegramId = normalizeTelegramId(telegramId)
  if (!normalizedTelegramId || !isOwnerTelegramId(normalizedTelegramId)) {
    return null
  }

  return prisma.administrator.upsert({
    where: { telegramId: normalizedTelegramId },
    create: { telegramId: normalizedTelegramId },
    update: {},
  })
}

export async function listAdministratorIds() {
  const admins = await prisma.administrator.findMany({ orderBy: { createdAt: 'asc' } })
  return admins.map((admin) => admin.telegramId)
}

export type PasswordVerifyResult =
  | { valid: true }
  | { valid: false; reason: 'invalid_credentials' | 'configuration_error' }

/**
 * Verifies the provided password against the stored admin security record.
 *
 * Primary check: scrypt hash stored in the AdminSecurity DB table.
 * Recovery check: if a DB record exists but the entered password does NOT
 *   match the stored hash, the ADMIN_PASSWORD environment variable is also
 *   tried.  If the env var matches, the DB record is updated with a fresh
 *   hash derived from the submitted password.  This handles the deployment
 *   scenario where ADMIN_PASSWORD was changed in Render after the initial
 *   DB seed, leaving a stale hash in the database.  The env var effectively
 *   acts as a "password reset" that re-syncs the DB on next successful login.
 * Fallback check: when no DB record exists at all, only ADMIN_PASSWORD is
 *   consulted (original fallback path, unchanged).
 *
 * Security properties preserved:
 *  - timing-safe comparison in all paths
 *  - env password is never logged or returned
 *  - DB is authoritative when DB hash and entered password agree
 *  - env var can only promote itself to DB-authoritative by matching the
 *    server's current ADMIN_PASSWORD value; a leaked old password alone
 *    cannot bypass the env-gated recovery
 */
export async function verifyAdminPassword(password: string): Promise<PasswordVerifyResult> {
  const envPassword = getEnvAdminPassword()
  const security = await prisma.adminSecurity.findFirst({ orderBy: { id: 'asc' } })

  if (security) {
    const expectedHash = Buffer.from(security.passwordHash, 'hex')
    const receivedHash = Buffer.from(derivePasswordHash(password, security.passwordSalt), 'hex')
    if (expectedHash.length === receivedHash.length && timingSafeEqual(expectedHash, receivedHash)) {
      return { valid: true }
    }

    // DB hash did not match.  Try the ADMIN_PASSWORD env var as a recovery
    // path so that changing ADMIN_PASSWORD in the deployment environment
    // (e.g. Render) re-syncs access without requiring direct DB access.
    if (envPassword && envPasswordMatchesSubmitted(envPassword, password)) {
      // Env password matches: re-sync DB record so future logins use the
      // new hash and the env var is no longer needed as a recovery path.
      const newSalt = randomBytes(16).toString('hex')
      await prisma.adminSecurity.update({
        where: { id: security.id },
        data: {
          passwordHash: derivePasswordHash(envPassword, newSalt),
          passwordSalt: newSalt,
          passwordAlgo: 'scrypt',
        },
      })
      return { valid: true }
    }

    return { valid: false, reason: 'invalid_credentials' }
  }

  if (!envPassword) {
    return { valid: false, reason: 'configuration_error' }
  }

  if (envPasswordMatchesSubmitted(envPassword, password)) {
    return { valid: true }
  }

  return { valid: false, reason: 'invalid_credentials' }
}

export async function setAdminPassword(password: string, updatedByAdmin: number | null) {
  const salt = randomBytes(16).toString('hex')
  const passwordHash = derivePasswordHash(password, salt)

  const current = await prisma.adminSecurity.findFirst({ orderBy: { id: 'asc' } })
  if (!current) {
    await prisma.adminSecurity.create({
      data: {
        passwordHash,
        passwordSalt: salt,
        passwordAlgo: 'scrypt',
        updatedByAdmin,
      },
    })
    return
  }

  await prisma.adminSecurity.update({
    where: { id: current.id },
    data: {
      passwordHash,
      passwordSalt: salt,
      passwordAlgo: 'scrypt',
      updatedByAdmin,
    },
  })
}

export async function createAdminSession(adminId: number) {
  const rawToken = createRandomToken()
  const tokenHash = hashAdminSessionToken(rawToken)
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000)

  await prisma.adminSession.create({
    data: {
      adminId,
      tokenHash,
      expiresAt,
    },
  })

  return {
    token: rawToken,
    expiresAt,
  }
}

export async function revokeAdminSession(token: string) {
  const tokenHash = hashAdminSessionToken(token)
  await prisma.adminSession.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  })
}

export async function getAuthorizedAdminSession(token: string | undefined) {
  if (!token) {
    return null
  }

  const tokenHash = hashAdminSessionToken(token)
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: { admin: true },
  })

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null
  }

  await prisma.adminSession.update({
    where: { id: session.id },
    data: { lastActivityAt: new Date() },
  })

  return session
}

export async function hasAdminPasswordConfigured() {
  if (getEnvAdminPassword()) {
    return true
  }

  const security = await prisma.adminSecurity.findFirst({ orderBy: { id: 'asc' } })
  return Boolean(security)
}
