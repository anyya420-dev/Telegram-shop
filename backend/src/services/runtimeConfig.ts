export type ConfigStatus = 'CONFIGURED' | 'MISSING' | 'INVALID'

type RuntimeConfigStatus = {
  adminPasswordConfigured: boolean
  ownerTelegramIdConfigured: boolean
  databaseConfigured: boolean
  botTokenEncryptionKeyConfigured: boolean
  sessionSecretConfigured: boolean
}

const TELEGRAM_ID_PATTERN = /^\d{5,20}$/
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

function isConfigured(value: string) {
  return Boolean(value)
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

export function getSessionSecret() {
  const raw = readEnv('SESSION_SECRET')
  if (raw) {
    return raw
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
  if (isProductionRuntime()) {
    throw new Error('[config] SESSION_SECRET is required in production')
  }
  return 'dev-session-secret'
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

  return 'http://localhost:5173'
}

export function getAllowedCorsOrigins() {
  const origins = new Set<string>()
  const frontendUrl = getFrontendUrl()
  const webAppUrl = readEnv('WEB_APP_URL')

  if (frontendUrl) origins.add(frontendUrl)
  if (webAppUrl) origins.add(webAppUrl)

  if (!isProductionRuntime()) {
    origins.add('http://localhost:5173')
    origins.add('http://localhost:4173')
  }

  export function isDemoModeEnabled() {
    return readEnv('ALLOW_DEMO_MODE') === 'true'
  }

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

  if (key === 'ALLOW_DEMO_MODE' && isProductionRuntime() && value !== 'false') {
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
  return REQUIRED_PRODUCTION_KEYS
    .filter((key) => summary[key] !== 'CONFIGURED')
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
