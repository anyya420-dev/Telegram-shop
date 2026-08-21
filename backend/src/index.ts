import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import cartRouter from './routes/cart.js'
import catalogRouter from './routes/catalog.js'
import categoriesRouter from './routes/categories.js'
import citiesRouter from './routes/cities.js'
import productsRouter from './routes/products.js'
import sessionRouter from './routes/session.js'
import usersRouter from './routes/users.js'

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
app.use('/api/users', usersRouter)

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`)
})

export default app
