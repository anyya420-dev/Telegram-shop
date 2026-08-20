import { Router } from 'express'
import { mapCity, prisma } from '../lib.js'

const router = Router()

router.get('/', async (_request, response) => {
  const cities = await prisma.city.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  response.json(cities.map(mapCity))
})

export default router
