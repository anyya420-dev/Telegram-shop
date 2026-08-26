import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const TELEGRAM_API_BASE = 'https://api.telegram.org'

function getEncryptionKey() {
  const secret = process.env.BOT_TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'dev-bot-token-encryption-key'
  return createHash('sha256').update(secret).digest()
}

export function encryptBotToken(token: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decryptBotToken(encryptedToken: string) {
  const payload = Buffer.from(encryptedToken, 'base64')
  const iv = payload.subarray(0, 12)
  const authTag = payload.subarray(12, 28)
  const encrypted = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function maskBotToken(token: string) {
  const suffix = token.slice(-4)
  return `••••••••••${suffix}`
}

export async function fetchTelegramGetMe(token: string) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getMe`)
  const payload = await response.json() as {
    ok: boolean
    description?: string
    result?: { id: number; username?: string; first_name?: string }
  }

  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.description || 'Telegram token validation failed')
  }

  return payload.result
}

export async function setTelegramMenuButton(token: string, text: string, webAppUrl: string) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text,
        web_app: { url: webAppUrl },
      },
    }),
  })
  const payload = await response.json() as { ok: boolean; description?: string }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || 'Failed to configure menu button')
  }
}

export async function clearTelegramMenuButton(token: string) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menu_button: { type: 'commands' } }),
  })
  const payload = await response.json() as { ok: boolean; description?: string }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || 'Failed to reset menu button')
  }
}

export async function setTelegramWebhook(token: string, webhookUrl: string, webhookSecret?: string) {
  const body = new URLSearchParams()
  body.set('url', webhookUrl)
  if (webhookSecret) {
    body.set('secret_token', webhookSecret)
  }
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await response.json() as { ok: boolean; description?: string }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || 'Failed to set webhook')
  }
}

export async function getTelegramWebhookInfo(token: string) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getWebhookInfo`)
  const payload = await response.json() as {
    ok: boolean
    description?: string
    result?: {
      url: string
      has_custom_certificate: boolean
      pending_update_count: number
      last_error_date?: number
      last_error_message?: string
      max_connections?: number
      ip_address?: string
    }
  }
  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.description || 'Failed to get webhook info')
  }

  return payload.result
}
