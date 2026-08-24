import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { prisma } from '../lib.js'

const ADMIN_SESSION_TTL_HOURS = 12

function getEnvAdminIds() {
  return (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function getEnvAdminPassword() {
  const raw = process.env.ADMIN_PASSWORD ?? process.env.DEFAULT_ADMIN_PASSWORD ?? ''
  return raw.trim()
}

function derivePasswordHash(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex')
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

  if (!security) {
    const password = getEnvAdminPassword()
    if (password) {
      const salt = randomBytes(16).toString('hex')
      const passwordHash = derivePasswordHash(password, salt)
      await prisma.adminSecurity.create({
        data: {
          passwordHash,
          passwordSalt: salt,
          passwordAlgo: 'scrypt',
        },
      })
    }
  }
}

export async function isAdminTelegramId(telegramId: string) {
  const admin = await prisma.administrator.findUnique({ where: { telegramId } })
  if (admin) {
    return true
  }

  const hasAnyAdmins = (await prisma.administrator.count()) > 0
  if (hasAnyAdmins) {
    return false
  }

  const envIds = getEnvAdminIds()
  return envIds.length === 0 || envIds.includes(telegramId)
}

export async function listAdministratorIds() {
  const admins = await prisma.administrator.findMany({ orderBy: { createdAt: 'asc' } })
  return admins.map((admin) => admin.telegramId)
}

export async function verifyAdminPassword(password: string) {
  const security = await prisma.adminSecurity.findFirst({ orderBy: { id: 'asc' } })
  if (!security) {
    return false
  }

  const expectedHash = Buffer.from(security.passwordHash, 'hex')
  const receivedHash = Buffer.from(derivePasswordHash(password, security.passwordSalt), 'hex')
  if (expectedHash.length !== receivedHash.length) {
    return false
  }

  return timingSafeEqual(expectedHash, receivedHash)
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
  const security = await prisma.adminSecurity.findFirst({ orderBy: { id: 'asc' } })
  return Boolean(security)
}
