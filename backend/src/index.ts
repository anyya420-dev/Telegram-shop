import 'dotenv/config'
import { createApp } from './app.js'
import { getOwnerTelegramId, seedAdminConfigForFreshInstall } from './services/adminAuthService.js'
import {
  assertProductionRuntimeConfig,
  getAllowedCorsOrigins,
  getInvalidRuntimeConfigKeys,
  getMissingRequiredRuntimeConfigKeys,
  getRuntimeConfigSummary,
} from './services/runtimeConfig.js'
import { initializeTelegramBot } from './services/telegramBotRuntime.js'

const port = Number(process.env.PORT ?? 3001)
const allowedOrigins = getAllowedCorsOrigins()
const app = createApp({ allowedOrigins })

async function start() {
  try {
    const runtimeConfig = getRuntimeConfigSummary()

    // Fail fast: an unbootable configuration must not silently serve broken CORS.
    assertProductionRuntimeConfig()

    if (allowedOrigins.length === 0) {
      throw new Error(
        '[config] No CORS origins resolved. Set FRONTEND_URL / WEB_APP_URL to the public frontend URL.',
      )
    }

    console.info('Backend startup auth config', {
      nodeEnv: process.env.NODE_ENV ?? 'undefined',
      ownerTelegramIdConfigured: Boolean(getOwnerTelegramId()),
      runtimeConfig,
      corsAllowedOrigins: allowedOrigins,
      renderGitCommit: process.env.RENDER_GIT_COMMIT ?? 'unknown',
    })
    const missingRequiredConfig = getMissingRequiredRuntimeConfigKeys()
    const invalidConfig = getInvalidRuntimeConfigKeys()
    if (missingRequiredConfig.length > 0) {
      console.error('[config] missing required runtime environment variables', {
        missing: missingRequiredConfig,
      })
    }
    if (invalidConfig.length > 0) {
      console.error('[config] invalid runtime environment variables', {
        invalid: invalidConfig,
      })
    }
    await seedAdminConfigForFreshInstall()

    // Start HTTP server first so Render's health check succeeds immediately.
    // Bot initialization is intentionally deferred: if the bot token is
    // missing or Telegram's API is slow the server must still accept HTTP
    // traffic.  A failed bot init is logged but does NOT crash the process.
    await new Promise<void>((resolve) => {
      app.listen(port, '0.0.0.0', () => {
        console.log(`Backend running on http://0.0.0.0:${port}`)
        resolve()
      })
    })

    console.log('Backend HTTP server started; initializing Telegram bot in background')
    initializeTelegramBot().catch((error: unknown) => {
      console.error(
        '[BOT] Background initialization failed (server continues running):',
        error instanceof Error ? error.message : String(error),
      )
    })
  } catch (error) {
    console.error('Backend startup failed.')
    if (error instanceof Error) {
      console.error(error.message)
    }
    process.exit(1)
  }
}

void start()

export default app
