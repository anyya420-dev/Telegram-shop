/**
 * Bot configuration service.
 *
 * Handles encrypted storage of the Telegram bot token.
 * The raw token is NEVER logged, returned to the frontend, or stored as plaintext.
 *
 * Encryption: AES-256-GCM
 * Key: derived from BOT_TOKEN_ENCRYPTION_KEY env var (falls back to SESSION_SECRET)
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { prisma } from '../lib.js'

// ── Key derivation ──────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const raw =
    process.env.BOT_TOKEN_ENCRYPTION_KEY ??
    process.env.SESSION_SECRET ??
    'dev-bot-encryption-key'
  // Derive a fixed 32-byte key from the secret
  return createHmac('sha256', 'bot-token-encryption-v1').update(raw).digest()
}

// ── Encrypt / decrypt ───────────────────────────────────────────────────────

export function encryptToken(token: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptToken(encryptedData: string): string {
  const parts = encryptedData.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted token format')
  const [ivHex, authTagHex, ciphertextHex] = parts
  const key = getEncryptionKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

// ── Telegram API validation ─────────────────────────────────────────────────

export type BotInfo = {
  id: number
  username: string
  firstName: string
}

export async function validateBotToken(token: string): Promise<BotInfo | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      ok: boolean
      result?: { id?: number; username?: string; first_name?: string }
    }
    if (!data.ok || !data.result?.id) return null
    return {
      id: data.result.id,
      username: data.result.username ?? '',
      firstName: data.result.first_name ?? '',
    }
  } catch {
    return null
  }
}

// ── Bot config helpers ──────────────────────────────────────────────────────

export type BotStatus =
  | { connected: false; bot: null }
  | { connected: true; bot: BotInfo; lastValidatedAt: Date | null }

export async function getBotStatus(): Promise<BotStatus> {
  const config = await prisma.botConfig.findFirst({
    where: { enabled: true },
    orderBy: { id: 'desc' },
  })
  if (!config) return { connected: false, bot: null }
  return {
    connected: true,
    bot: {
      id: Number(config.botId),
      username: config.botUsername,
      firstName: config.botFirstName,
    },
    lastValidatedAt: config.lastValidatedAt,
  }
}

/**
 * Returns the active bot token for use by other backend services.
 * Checks the database first, then falls back to the TELEGRAM_BOT_TOKEN env var.
 * Never exposed to the frontend.
 */
export async function getActiveBotToken(): Promise<string | null> {
  try {
    const config = await prisma.botConfig.findFirst({
      where: { enabled: true },
      orderBy: { id: 'desc' },
    })
    if (config) return decryptToken(config.encryptedToken)
  } catch {
    // Fall through to env var
  }
  return process.env.TELEGRAM_BOT_TOKEN ?? null
}
