type RuntimeConfigStatus = {
  adminPasswordConfigured: boolean
  ownerTelegramIdConfigured: boolean
  databaseConfigured: boolean
  botTokenEncryptionKeyConfigured: boolean
}

function isConfigured(value: string | undefined) {
  return Boolean(value && value.trim())
}

export function getRuntimeConfigStatus(): RuntimeConfigStatus {
  return {
    adminPasswordConfigured: isConfigured(process.env.ADMIN_PASSWORD),
    ownerTelegramIdConfigured: isConfigured(process.env.OWNER_TELEGRAM_ID),
    databaseConfigured: isConfigured(process.env.DATABASE_URL),
    botTokenEncryptionKeyConfigured: isConfigured(process.env.BOT_TOKEN_ENCRYPTION_KEY),
  }
}

export function getRuntimeConfigSummary() {
  const status = getRuntimeConfigStatus()
  return {
    ADMIN_PASSWORD: status.adminPasswordConfigured ? 'configured' : 'missing',
    OWNER_TELEGRAM_ID: status.ownerTelegramIdConfigured ? 'configured' : 'missing',
    DATABASE_URL: status.databaseConfigured ? 'configured' : 'missing',
    BOT_TOKEN_ENCRYPTION_KEY: status.botTokenEncryptionKeyConfigured ? 'configured' : 'missing',
  }
}

export function getMissingRequiredRuntimeConfigKeys() {
  const summary = getRuntimeConfigSummary()
  return Object.entries(summary)
    .filter(([, value]) => value === 'missing')
    .map(([key]) => key)
}

export function getRuntimeEnvironmentLabel() {
  return process.env.NODE_ENV ?? 'development'
}
