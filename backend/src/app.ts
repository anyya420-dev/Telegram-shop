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
import { getAllowedCorsOrigins } from './services/runtimeConfig.js'

export const SERVICE_NAME = 'telegram-shop-backend'

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
export function createApp(options: { allowedOrigins?: readonly string[] } = {}): Express {
  const allowedOrigins = options.allowedOrigins ?? getAllowedCorsOrigins()
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  // 1. CORS runs before EVERYTHING. OPTIONS preflight is answered here, so it can
  //    never be blocked by an authentication or rate-limit check further down.
  app.use(createCorsMiddleware({
    allowedOrigins,
    onRejected: (origin) => {
      console.warn('[cors] rejected origin', { origin, allowedOrigins })
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

  app.get('/health', sendHealth)
  app.get('/healthz', sendHealth)
  app.get('/api/health', sendHealth)

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

    console.error('[http] unhandled error', error instanceof Error ? error.message : String(error))
    response.status(500).json({ code: 'server_error', message: 'Internal server error' })
  })

  return app
}
