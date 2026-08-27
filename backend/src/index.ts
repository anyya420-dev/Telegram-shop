import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import express from 'express'
import type { Request } from 'express'
import adminRouter from './routes/admin.js'
import balanceRouter from './routes/balance.js'
import cartRouter from './routes/cart.js'
import casinoRouter from './routes/casino.js'
import catalogRouter from './routes/catalog.js'
import categoriesRouter from './routes/categories.js'
import citiesRouter from './routes/cities.js'
import deliveryRouter from './routes/delivery.js'
import depositsRouter from './routes/deposits.js'
import discountsRouter from './routes/discounts.js'
import ordersRouter from './routes/orders.js'
import operatorsRouter from './routes/operators.js'
import paymentsRouter from './routes/payments.js'
import productsRouter from './routes/products.js'
import reviewsRouter from './routes/reviews.js'
import sessionRouter from './routes/session.js'
import supportRouter from './routes/support.js'
import usersRouter from './routes/users.js'
import wishlistRouter from './routes/wishlist.js'
import { prisma } from './lib.js'

const fallbackProductionOrigins = [
  'https://telegram-shop-378j.onrender.com',
]

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function readConfiguredOrigins() {
  return [process.env.FRONTEND_URL, process.env.WEB_APP_URL, process.env.CORS_ALLOWED_ORIGINS]
    .flatMap((value) => value?.split(',') ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin)
    .filter((value): value is string => Boolean(value))
}

function getAllowedOrigins() {
  const configuredOrigins = readConfiguredOrigins()

  if (process.env.NODE_ENV === 'production') {
    return new Set([...fallbackProductionOrigins, ...configuredOrigins])
  }

  return new Set([...fallbackProductionOrigins, 'http://localhost:5173', 'http://localhost:4173', ...configuredOrigins])
}

export function createApp() {
  const app = express()
  const allowedOrigins = getAllowedOrigins()

  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
    next()
  })

  app.use((request, response, next) => {
    response.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers')
    const origin = request.headers.origin

    if (!origin) {
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS')
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token, X-Requested-With')
        response.status(204).end()
        return
      }
      next()
      return
    }

    if (!allowedOrigins.has(origin)) {
      response.status(403).json({
        code: 'cors_origin_not_allowed',
        message: 'Origin is not allowed by the server CORS policy',
      })
      return
    }

    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS')
      response.setHeader(
        'Access-Control-Allow-Headers',
        typeof request.headers['access-control-request-headers'] === 'string' && request.headers['access-control-request-headers'].trim()
          ? request.headers['access-control-request-headers']
          : 'Content-Type, Authorization, X-Session-Token, X-Requested-With',
      )
      response.setHeader('Access-Control-Max-Age', '86400')
      response.status(204).end()
      return
    }

    next()
  })

  app.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'ok',
      service: 'telegram-shop-backend',
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/api/health', (_request, response) => {
    response.status(200).json({
      status: 'ok',
      service: 'telegram-shop-backend',
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/ready', async (_request, response) => {
    const timestamp = new Date().toISOString()
    try {
      await prisma.$queryRaw`SELECT 1`
      response.status(200).json({ status: 'ok', service: 'telegram-shop-backend', timestamp, dependencies: { database: 'ok' } })
    } catch {
      response.status(503).json({ status: 'degraded', service: 'telegram-shop-backend', timestamp, dependencies: { database: 'error' } })
    }
  })

  app.get('/api/ready', async (_request, response) => {
    const timestamp = new Date().toISOString()
    try {
      await prisma.$queryRaw`SELECT 1`
      response.status(200).json({ status: 'ok', service: 'telegram-shop-backend', timestamp, dependencies: { database: 'ok' } })
    } catch {
      response.status(503).json({ status: 'degraded', service: 'telegram-shop-backend', timestamp, dependencies: { database: 'error' } })
    }
  })

  app.use(express.json({
    verify(request: Request & { rawBody?: Buffer }, _response, buffer) {
      request.rawBody = Buffer.from(buffer)
    },
  }))

  app.use('/api/session', sessionRouter)
  app.use('/api/cities', citiesRouter)
  app.use('/api/categories', categoriesRouter)
  app.use('/api/catalog', catalogRouter)
  app.use('/api/products', productsRouter)
  app.use('/api/cart', cartRouter)
  app.use('/api/orders', ordersRouter)
  app.use('/api/operators', operatorsRouter)
  app.use('/api/payments', paymentsRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/balance', balanceRouter)
  app.use('/api/deposits', depositsRouter)
  app.use('/api/casino', casinoRouter)
  app.use('/api/support', supportRouter)
  app.use('/api/discounts', discountsRouter)
  app.use('/api/reviews', reviewsRouter)
  app.use('/api/wishlist', wishlistRouter)
  app.use('/api/delivery', deliveryRouter)
  app.use('/api/admin', adminRouter)

  app.get('/', (_request, response) => {
    response.json({ status: 'ok', message: 'Backend is running' })
  })

  // Global error handler — prevents stack traces leaking in production
  app.use((err: unknown, _request: import('express').Request, response: import('express').Response, _next: import('express').NextFunction) => {
    const isProd = process.env.NODE_ENV === 'production'
    const message = err instanceof Error ? err.message : 'Internal server error'
    if (!isProd) console.error('[unhandled error]', err)
    response.status(500).json({ code: 'internal_error', message: isProd ? 'Internal server error' : message })
  })

  return app
}

const app = createApp()
const port = Number(process.env.PORT ?? 3001)

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Backend running on http://0.0.0.0:${port}`)
  })
}

export default app
