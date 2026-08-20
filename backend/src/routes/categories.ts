import { Router } from 'express'
import { mapCategory, prisma } from '../lib.js'

const router = Router()

router.get('/', async (_request, response) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  response.json(categories.map(mapCategory))
})

export default router
