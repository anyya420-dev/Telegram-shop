import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import express from 'express'
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
import paymentsRouter from './routes/payments.js'
import productsRouter from './routes/products.js'
import reviewsRouter from './routes/reviews.js'
import sessionRouter from './routes/session.js'
import supportRouter from './routes/support.js'
import usersRouter from './routes/users.js'
import wishlistRouter from './routes/wishlist.js'
import { prisma } from './lib.js'

const productionFrontendOrigin = 'https://telegram-shop-3781.onrender.com'
function getAllowedOrigins() {
  if (process.env.NODE_ENV === 'production') {
    return new Set([productionFrontendOrigin])
  }

  const developmentDefaults = [productionFrontendOrigin, 'http://localhost:5173', 'http://localhost:4173']
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean)
  return new Set(configuredOrigins && configuredOrigins.length > 0 ? configuredOrigins : developmentDefaults)
}

export function createApp() {
  const app = express()
  const allowedOrigins = getAllowedOrigins()

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

  app.use(express.json())

  app.use('/api/session', sessionRouter)
  app.use('/api/cities', citiesRouter)
  app.use('/api/categories', categoriesRouter)
  app.use('/api/catalog', catalogRouter)
  app.use('/api/products', productsRouter)
  app.use('/api/cart', cartRouter)
  app.use('/api/orders', ordersRouter)
  app.use('/api/payments', paymentsRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/balance', balanceRouter)
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
