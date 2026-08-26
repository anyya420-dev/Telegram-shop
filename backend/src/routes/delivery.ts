import { Router } from 'express'
import { authRateLimiter, prisma } from '../lib.js'

const router = Router()

// GET /api/delivery - list active delivery options
router.get('/', authRateLimiter, async (_request, response) => {
  const options = await prisma.deliveryOption.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      nameEn: true,
      type: true,
      price: true,
    },
    orderBy: { sortOrder: 'asc' },
  })
  response.json({ options })
})

export default router
