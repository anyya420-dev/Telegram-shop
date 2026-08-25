import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib.js'

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex')
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function hasAdminPasswordConfigured() {
  const row = await prisma.adminSecurity.findFirst({ select: { id: true }, orderBy: { id: 'asc' } })
  return Boolean(row)
}

export async function verifyAdminPassword(password: string) {
  const row = await prisma.adminSecurity.findFirst({ orderBy: { id: 'asc' } })
  if (!row) {
    return { valid: false as const, reason: 'configuration_error' as const }
  }

  const expectedHash = Buffer.from(row.passwordHash, 'hex')
  const candidateHash = Buffer.from(hashPassword(password, row.passwordSalt), 'hex')
  if (expectedHash.length === candidateHash.length && timingSafeEqual(expectedHash, candidateHash)) {
    return { valid: true as const }
  }

  return { valid: false as const, reason: 'invalid_credentials' as const }
}

export async function rotateAdminPassword(nextPassword: string) {
  const salt = randomBytes(16).toString('hex')
  const passwordHash = hashPassword(nextPassword, salt)
  const current = await prisma.adminSecurity.findFirst({ orderBy: { id: 'asc' } })
  if (!current) {
    await prisma.adminSecurity.create({
      data: {
        passwordHash,
        passwordSalt: salt,
        passwordAlgo: 'scrypt',
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
    },
  })
}

export async function ensureBootstrapPasswordFromEnv() {
  const configured = await hasAdminPasswordConfigured()
  if (configured) return

  const bootstrap = (process.env.ADMIN_PASSWORD ?? '').trim()
  if (!bootstrap) return
  await rotateAdminPassword(bootstrap)
}

export async function createAdminSession() {
  const token = randomBytes(48).toString('base64url')
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS)
  await prisma.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      expiresAt,
    },
  })
  return { token, expiresAt }
}

export async function getActiveAdminSession(token: string | undefined) {
  if (!token) return null
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
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

export async function revokeAdminSession(token: string | undefined) {
  if (!token) return
  await prisma.adminSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
