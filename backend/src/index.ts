import 'dotenv/config'
import cors from 'cors'
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
import productsRouter from './routes/products.js'
import reviewsRouter from './routes/reviews.js'
import sessionRouter from './routes/session.js'
import supportRouter from './routes/support.js'
import usersRouter from './routes/users.js'
import wishlistRouter from './routes/wishlist.js'
import { getOwnerTelegramId, seedAdminConfigForFreshInstall } from './services/adminAuthService.js'
import {
  assertProductionRuntimeConfig,
  getAllowedCorsOrigins,
  getInvalidRuntimeConfigKeys,
  getMissingRequiredRuntimeConfigKeys,
  getRuntimeConfigSummary,
} from './services/runtimeConfig.js'
import { initializeTelegramBot } from './services/telegramBotRuntime.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)

const allowedOrigins = getAllowedCorsOrigins()

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // allow requests with no origin (e.g. mobile apps, curl, Telegram WebApp)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))
app.use(express.json())

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

app.get('/', (_request, response) => {
  response.json({ status: 'ok', message: 'Backend is running' })
})

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

async function start() {
  try {
    const runtimeConfig = getRuntimeConfigSummary()
    assertProductionRuntimeConfig()
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
    console.log('Backend startup: initializing Telegram bot before starting HTTP server')
    await initializeTelegramBot()
    app.listen(port, '0.0.0.0', () => {
      console.log(`Backend running on http://0.0.0.0:${port}`)
    })
  } catch (error) {
    console.error('Backend startup failed during Telegram bot initialization.')
    if (error instanceof Error) {
      console.error(error.message)
    }
    process.exit(1)
  }
}

void start()

export default app
