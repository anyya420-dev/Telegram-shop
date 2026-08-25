import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'
import adminRouter from './routes/admin.js'
import balanceRouter from './routes/balance.js'
import cartRouter from './routes/cart.js'
import casinoRouter from './routes/casino.js'
import catalogRouter from './routes/catalog.js'
import categoriesRouter from './routes/categories.js'
import citiesRouter from './routes/cities.js'
import deliveryRouter from './routes/delivery.js'
import discountsRouter from './routes/discounts.js'
import ordersRouter from './routes/orders.js'
import productsRouter from './routes/products.js'
import reviewsRouter from './routes/reviews.js'
import sessionRouter from './routes/session.js'
import supportRouter from './routes/support.js'
import usersRouter from './routes/users.js'
import wishlistRouter from './routes/wishlist.js'
import { createCorsMiddleware } from './middleware/cors.js'
import { prisma } from './lib.js'
import { getAllowedCorsOrigins } from './services/runtimeConfig.js'

export const SERVICE_NAME = 'telegram-shop-backend'

type StructuredHttpError = {
  status: number
  code: string
  message: string
}

function isStructuredHttpError(value: unknown): value is StructuredHttpError {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<StructuredHttpError>
  return (
    typeof candidate.status === 'number' &&
    candidate.status >= 400 &&
    candidate.status <= 599 &&
    typeof candidate.code === 'string' &&
    candidate.code.length > 0 &&
    typeof candidate.message === 'string' &&
    candidate.message.length > 0
  )
}

/**
 * Builds the Express application.
 *
 * Middleware order is load-bearing and must not be reshuffled:
 *   1. CORS (terminates OPTIONS preflight before auth / rate limiting / body parsing)
 *   2. Public health endpoints (no auth, no database access)
 *   3. JSON body parser
 *   4. API routers (each router owns its own auth)
 *   5. JSON 404 + JSON error handler
 */
export function createApp(options: {
  allowedOrigins?: readonly string[]
  logger?: Pick<Console, 'error' | 'warn'>
  readinessCheck?: () => Promise<unknown>
} = {}): Express {
  const allowedOrigins = options.allowedOrigins ?? getAllowedCorsOrigins()
  const logger = options.logger ?? console
  const readinessCheck = options.readinessCheck ?? (() => prisma.$queryRaw`SELECT 1`)
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  // 1. CORS runs before EVERYTHING. OPTIONS preflight is answered here, so it can
  //    never be blocked by an authentication or rate-limit check further down.
  app.use(createCorsMiddleware({
    allowedOrigins,
    onRejected: (origin) => {
      logger.warn('[cors] rejected origin', { origin, allowedOrigins })
    },
  }))

  // 2. Public, unauthenticated health endpoints.
  const sendHealth = (_request: Request, response: Response) => {
    response.status(200).json({
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    })
  }

  const sendReadiness = async (_request: Request, response: Response) => {
    const timestamp = new Date().toISOString()

    try {
      await readinessCheck()
      response.status(200).json({
        status: 'ok',
        service: SERVICE_NAME,
        timestamp,
        dependencies: {
          database: 'ok',
        },
      })
    } catch (error) {
      logger.error(
        '[ready] database readiness check failed',
        error instanceof Error ? error.message : String(error),
      )
      response.status(503).json({
        status: 'degraded',
        service: SERVICE_NAME,
        timestamp,
        dependencies: {
          database: 'error',
        },
      })
    }
  }

  app.get('/health', sendHealth)
  app.get('/healthz', sendHealth)
  app.get('/api/health', sendHealth)
  app.get('/ready', sendReadiness)
  app.get('/readyz', sendReadiness)
  app.get('/api/ready', sendReadiness)

  app.get('/', (_request, response) => {
    response.json({ status: 'ok', service: SERVICE_NAME, message: 'Backend is running' })
  })

  // 3. Body parsing.
  app.use(express.json({ limit: '1mb' }))

  // 4. API routers.
  app.use('/api/session', sessionRouter)
  app.use('/api/cities', citiesRouter)
  app.use('/api/categories', categoriesRouter)
  app.use('/api/catalog', catalogRouter)
  app.use('/api/products', productsRouter)
  app.use('/api/cart', cartRouter)
  app.use('/api/orders', ordersRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/balance', balanceRouter)
  app.use('/api/casino', casinoRouter)
  app.use('/api/support', supportRouter)
  app.use('/api/discounts', discountsRouter)
  app.use('/api/reviews', reviewsRouter)
  app.use('/api/wishlist', wishlistRouter)
  app.use('/api/delivery', deliveryRouter)
  app.use('/api/admin', adminRouter)

  // 5. JSON 404 + error handlers, so a browser never receives an HTML error page
  //    (which surfaces in the Mini App as an opaque "connection" failure).
  app.use('/api', (_request: Request, response: Response) => {
    response.status(404).json({ code: 'not_found', message: 'Endpoint not found' })
  })

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error)
      return
    }

    if (
      error instanceof SyntaxError &&
      typeof (error as { status?: unknown }).status === 'number'
    ) {
      response.status(400).json({ code: 'invalid_json', message: 'Invalid JSON request body' })
      return
    }

    if (isStructuredHttpError(error)) {
      response.status(error.status).json({ code: error.code, message: error.message })
      return
    }

    logger.error('[http] unhandled error', error instanceof Error ? error.message : String(error))
    response.status(500).json({ code: 'server_error', message: 'Internal server error' })
  })

  return app
}
