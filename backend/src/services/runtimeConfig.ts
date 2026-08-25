import { normalizeOrigin } from '../middleware/cors.js'

export type ConfigStatus = 'CONFIGURED' | 'MISSING' | 'INVALID'

type RuntimeConfigStatus = {
  adminPasswordConfigured: boolean
  ownerTelegramIdConfigured: boolean
  databaseConfigured: boolean
  botTokenEncryptionKeyConfigured: boolean
  sessionSecretConfigured: boolean
}

const TELEGRAM_ID_PATTERN = /^\d{5,20}$/
const URL_CONFIG_KEYS = ['FRONTEND_URL', 'WEB_APP_URL'] as const
const BOOLEAN_CONFIG_KEYS = ['ALLOW_DEMO_MODE'] as const

/**
 * Origin that is always part of the CORS allowlist in production.
 * It ensures the Telegram Mini App keeps working even if FRONTEND_URL/WEB_APP_URL
 * is temporarily misconfigured in the hosting dashboard.
 */
export const REQUIRED_PRODUCTION_FRONTEND_ORIGIN = 'https://telegram-shop-3781.onrender.com'

const REQUIRED_PRODUCTION_KEYS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'OWNER_TELEGRAM_ID',
  'ADMIN_PASSWORD',
  'BOT_TOKEN_ENCRYPTION_KEY',
  'FRONTEND_URL',
  'WEB_APP_URL',
] as const

function readEnv(key: string) {
  const value = process.env[key]
  return value?.trim() ?? ''
}

function isValidTelegramId(value: string) {
  return TELEGRAM_ID_PATTERN.test(value)
}

export function getRuntimeEnvironmentLabel() {
  return process.env.NODE_ENV ?? 'development'
}

export function isProductionRuntime() {
  return getRuntimeEnvironmentLabel() === 'production'
}

export function isDemoModeEnabled() {
  // Demo mode is never available in production, regardless of the env value.
  if (isProductionRuntime()) {
    return false
  }
  // Outside production demo mode stays on unless explicitly disabled.
  return parseBooleanEnv(readEnv('ALLOW_DEMO_MODE')) !== false
}

function parseBooleanEnv(value: string): boolean | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return null
}

export function getSessionSecret() {
  const raw = readEnv('SESSION_SECRET')
  if (raw) {
    return raw
  }
  if (isProductionRuntime()) {
    throw new Error('[config] SESSION_SECRET is required in production')
  }
  return 'dev-session-secret'
}

export function getBotTokenEncryptionSecret() {
  const raw = readEnv('BOT_TOKEN_ENCRYPTION_KEY')
  if (raw) {
    return raw
  }
  if (isProductionRuntime()) {
    throw new Error('[config] BOT_TOKEN_ENCRYPTION_KEY is required in production')
  }
  return getSessionSecret()
}

export function getFrontendUrl() {
  return readEnv('FRONTEND_URL')
}

export function getWebAppUrl() {
  const configuredWebAppUrl = readEnv('WEB_APP_URL')
  if (configuredWebAppUrl) {
    return configuredWebAppUrl
  }

  const frontendUrl = getFrontendUrl()
  if (frontendUrl) {
    return frontendUrl
  }

  if (isProductionRuntime()) {
    // Never hand out a localhost Web App URL to real Telegram users.
    return REQUIRED_PRODUCTION_FRONTEND_ORIGIN
  }

  return 'http://localhost:5173'
}

export function getAllowedCorsOrigins() {
  if (isProductionRuntime()) {
    return [REQUIRED_PRODUCTION_FRONTEND_ORIGIN]
  }

  const origins = new Set<string>()

  const add = (value: string) => {
    const normalized = normalizeOrigin(value)
    if (normalized) {
      origins.add(normalized)
    }
  }

  add(getFrontendUrl())
  add(readEnv('WEB_APP_URL'))

  // Optional comma-separated extra origins for local/dev checks.
  for (const extra of readEnv('CORS_ALLOWED_ORIGINS').split(',')) {
    add(extra)
  }
  add('http://localhost:5173')
  add('http://localhost:4173')
  add('http://127.0.0.1:5173')
  add('http://127.0.0.1:4173')

  return [...origins]
}

function getConfigStatusForKey(key: string): ConfigStatus {
  const value = readEnv(key)
  if (!value) {
    return 'MISSING'
  }

  if (key === 'OWNER_TELEGRAM_ID' && !isValidTelegramId(value)) {
    return 'INVALID'
  }

  if ((URL_CONFIG_KEYS as readonly string[]).includes(key) && !normalizeOrigin(value)) {
    return 'INVALID'
  }

  if (
    isProductionRuntime() &&
    (key === 'FRONTEND_URL' || key === 'WEB_APP_URL') &&
    normalizeOrigin(value) !== REQUIRED_PRODUCTION_FRONTEND_ORIGIN
  ) {
    return 'INVALID'
  }

  if ((BOOLEAN_CONFIG_KEYS as readonly string[]).includes(key) && parseBooleanEnv(value) === null) {
    return 'INVALID'
  }

  if (key === 'ALLOW_DEMO_MODE' && isProductionRuntime() && parseBooleanEnv(value) !== false) {
    return 'INVALID'
  }

  return 'CONFIGURED'
}

export function getRuntimeConfigSummary() {
  return {
    NODE_ENV: getConfigStatusForKey('NODE_ENV'),
    DATABASE_URL: getConfigStatusForKey('DATABASE_URL'),
    SESSION_SECRET: getConfigStatusForKey('SESSION_SECRET'),
    OWNER_TELEGRAM_ID: getConfigStatusForKey('OWNER_TELEGRAM_ID'),
    ADMIN_PASSWORD: getConfigStatusForKey('ADMIN_PASSWORD'),
    BOT_TOKEN_ENCRYPTION_KEY: getConfigStatusForKey('BOT_TOKEN_ENCRYPTION_KEY'),
    TELEGRAM_BOT_TOKEN: getConfigStatusForKey('TELEGRAM_BOT_TOKEN'),
    FRONTEND_URL: getConfigStatusForKey('FRONTEND_URL'),
    WEB_APP_URL: getConfigStatusForKey('WEB_APP_URL'),
    ALLOW_DEMO_MODE: getConfigStatusForKey('ALLOW_DEMO_MODE'),
    ADMIN_TELEGRAM_IDS: getConfigStatusForKey('ADMIN_TELEGRAM_IDS'),
    PORT: getConfigStatusForKey('PORT'),
  } as const
}

export function getRuntimeConfigStatus(): RuntimeConfigStatus {
  const summary = getRuntimeConfigSummary()
  return {
    adminPasswordConfigured: summary.ADMIN_PASSWORD === 'CONFIGURED',
    ownerTelegramIdConfigured: summary.OWNER_TELEGRAM_ID === 'CONFIGURED',
    databaseConfigured: summary.DATABASE_URL === 'CONFIGURED',
    botTokenEncryptionKeyConfigured: summary.BOT_TOKEN_ENCRYPTION_KEY === 'CONFIGURED',
    sessionSecretConfigured: summary.SESSION_SECRET === 'CONFIGURED',
  }
}

export function getMissingRequiredRuntimeConfigKeys() {
  const summary = getRuntimeConfigSummary()
  return REQUIRED_PRODUCTION_KEYS.filter((key) => summary[key] !== 'CONFIGURED')
}

export function getInvalidRuntimeConfigKeys() {
  const summary = getRuntimeConfigSummary()
  return Object.entries(summary)
    .filter(([, status]) => status === 'INVALID')
    .map(([key]) => key)
}

export function assertProductionRuntimeConfig() {
  if (!isProductionRuntime()) {
    return
  }

  const missing = getMissingRequiredRuntimeConfigKeys()
  const invalid = getInvalidRuntimeConfigKeys()
  const allowDemoModeStatus = getRuntimeConfigSummary().ALLOW_DEMO_MODE
  if (allowDemoModeStatus !== 'CONFIGURED') {
    invalid.push('ALLOW_DEMO_MODE')
  }

  if (missing.length === 0 && invalid.length === 0) {
    return
  }

  const uniqueInvalid = [...new Set(invalid)]
  const errors: string[] = []
  if (missing.length > 0) {
    errors.push(`missing: ${missing.join(', ')}`)
  }
  if (uniqueInvalid.length > 0) {
    errors.push(`invalid: ${uniqueInvalid.join(', ')}`)
  }
  throw new Error(`[config] Production runtime configuration invalid (${errors.join('; ')})`)
}
