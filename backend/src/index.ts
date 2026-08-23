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

const app = express()
const port = Number(process.env.PORT ?? 3001)
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

app.use(cors({ origin: frontendUrl }))
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

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend running on http://0.0.0.0:${port}`)
})

export default app
