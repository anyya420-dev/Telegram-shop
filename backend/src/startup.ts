import type { Server } from 'node:http'
import type { Express } from 'express'

type StartupLogger = Pick<Console, 'error' | 'info' | 'log'>

export type BackgroundInitializationOptions = {
  seedAdminConfigForFreshInstall: () => Promise<void>
  initializeTelegramBot: () => Promise<unknown>
  delay?: (ms: number) => Promise<void>
  logger?: StartupLogger
  retryDelayMs?: number
}

export type StartHttpServerOptions = BackgroundInitializationOptions & {
  app: Express
  host?: string
  port: number
}

const DEFAULT_RETRY_DELAY_MS = 5_000

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function listen(app: Express, port: number, host = '0.0.0.0') {
  return new Promise<Server>((resolve) => {
    let server!: Server
    server = app.listen(port, host, () => {
      resolve(server)
    })
  })
}

export async function runBackgroundInitialization({
  seedAdminConfigForFreshInstall,
  initializeTelegramBot,
  delay = wait,
  logger = console,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: BackgroundInitializationOptions) {
  let attempt = 0

  while (true) {
    attempt += 1

    try {
      await seedAdminConfigForFreshInstall()
      logger.info('[startup] Database-dependent initialization completed', { attempt })
      break
    } catch (error) {
      logger.error(
        '[startup] Database-dependent initialization failed; HTTP server remains available and readiness stays degraded until the database recovers.',
        error instanceof Error ? error.message : String(error),
      )
      await delay(retryDelayMs)
    }
  }

  try {
    await initializeTelegramBot()
  } catch (error) {
    logger.error(
      '[BOT] Background initialization failed (server continues running):',
      error instanceof Error ? error.message : String(error),
    )
  }
}

export async function startHttpServer({
  app,
  host = '0.0.0.0',
  port,
  logger = console,
  ...backgroundInitializationOptions
}: StartHttpServerOptions) {
  await listen(app, port, host)
  logger.log(`Backend running on http://${host}:${port}`)
  logger.info('Backend HTTP server started; continuing database-dependent initialization in background')
  void runBackgroundInitialization({
    ...backgroundInitializationOptions,
    logger,
  })
}
