import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { prisma } from '../lib.js'

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000
const OWNER_USERNAME = 'owner'
let lastSyncedAdminPassword: string | null = null
let adminPasswordSyncInFlight: Promise<void> | null = null

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex')
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function parseHexBuffer(value: string) {
  if (!/^[a-fA-F0-9]+$/.test(value) || value.length % 2 !== 0) {
    return null
  }
  return Buffer.from(value, 'hex')
}

function verifyPasswordHash(password: string, salt: string, expectedHashValue: string) {
  const expectedHash = parseHexBuffer(expectedHashValue)
  if (!expectedHash) {
    return false
  }
  const candidateHash = Buffer.from(hashPassword(password, salt), 'hex')
  return expectedHash.length === candidateHash.length && timingSafeEqual(expectedHash, candidateHash)
}

export function generateAdminPassword() {
  return randomBytes(18).toString('base64url')
}

export async function hasAdminPasswordConfigured() {
  const owner = await prisma.adminAccount.findFirst({
    where: { role: 'owner', deletedAt: null },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  return Boolean(owner)
}

export async function rotateOwnerPassword(nextPassword: string) {
  const salt = randomBytes(16).toString('hex')
  const passwordHash = hashPassword(nextPassword, salt)
  const currentOwner = await prisma.adminAccount.findFirst({
    where: { role: 'owner', deletedAt: null },
    orderBy: { id: 'asc' },
  })

  if (!currentOwner) {
    await prisma.adminAccount.create({
      data: {
        username: OWNER_USERNAME,
        role: 'owner',
        passwordHash,
        passwordSalt: salt,
        passwordAlgo: 'scrypt',
        isActive: true,
      },
    })
  } else {
    await prisma.adminAccount.update({
      where: { id: currentOwner.id },
      data: {
        username: currentOwner.username || OWNER_USERNAME,
        passwordHash,
        passwordSalt: salt,
        passwordAlgo: 'scrypt',
        isActive: true,
        deletedAt: null,
      },
    })
  }

  process.env.ADMIN_PASSWORD = nextPassword
  lastSyncedAdminPassword = nextPassword
}

export async function rotateAdminAccountPassword(accountId: number, nextPassword: string) {
  const salt = randomBytes(16).toString('hex')
  const passwordHash = hashPassword(nextPassword, salt)
  await prisma.adminAccount.update({
    where: { id: accountId },
    data: {
      passwordHash,
      passwordSalt: salt,
      passwordAlgo: 'scrypt',
    },
  })
}

export async function verifyAdminPassword(password: string, mode: 'admin' | 'owner' = 'admin') {
  const accounts = await prisma.adminAccount.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      role: mode === 'owner' ? 'owner' : undefined,
    },
    orderBy: [{ role: 'desc' }, { id: 'asc' }],
  })

  if (accounts.length === 0) {
    return { valid: false as const, reason: 'configuration_error' as const }
  }

  for (const account of accounts) {
    if (verifyPasswordHash(password, account.passwordSalt, account.passwordHash)) {
      return { valid: true as const, account }
    }
  }

  return { valid: false as const, reason: 'invalid_credentials' as const }
}

export async function verifyAdminAccountPassword(accountId: number, password: string) {
  const account = await prisma.adminAccount.findUnique({ where: { id: accountId } })
  if (!account || account.deletedAt || !account.isActive) {
    return false
  }
  return verifyPasswordHash(password, account.passwordSalt, account.passwordHash)
}

export async function ensureAdminPasswordFromEnv() {
  const bootstrap = (process.env.ADMIN_PASSWORD ?? '').trim()
  if (!bootstrap) {
    lastSyncedAdminPassword = null
    return
  }

  if (bootstrap === lastSyncedAdminPassword) {
    return
  }

  while (adminPasswordSyncInFlight) {
    await adminPasswordSyncInFlight
    if (bootstrap === lastSyncedAdminPassword) {
      return
    }
  }

  const syncPromise = (async () => {
    const currentOwner = await prisma.adminAccount.findFirst({
      where: { role: 'owner', deletedAt: null },
      orderBy: { id: 'asc' },
    })

    if (!currentOwner) {
      await rotateOwnerPassword(bootstrap)
      return
    }

    if (verifyPasswordHash(bootstrap, currentOwner.passwordSalt, currentOwner.passwordHash)) {
      lastSyncedAdminPassword = bootstrap
      return
    }

    await rotateOwnerPassword(bootstrap)
  })()

  adminPasswordSyncInFlight = syncPromise
  try {
    await syncPromise
  } finally {
    if (adminPasswordSyncInFlight === syncPromise) {
      adminPasswordSyncInFlight = null
    }
  }
}

export async function createAdminSession(adminAccountId: number) {
  const token = randomBytes(48).toString('base64url')
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS)
  await prisma.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      adminAccountId,
      expiresAt,
    },
  })
  return { token, expiresAt }
}

export async function getActiveAdminSession(token: string | undefined) {
  if (!token) return null
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { adminAccount: true },
  })

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null
  }

  if (!session.adminAccount || session.adminAccount.deletedAt || !session.adminAccount.isActive) {
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    })
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

export async function revokeAdminSessionsByAccountId(adminAccountId: number) {
  await prisma.adminSession.updateMany({
    where: { adminAccountId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
