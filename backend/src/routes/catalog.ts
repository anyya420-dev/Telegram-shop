import { Router } from 'express'
import { mapProduct, parsePositiveInt, prisma, sendError } from '../lib.js'

const router = Router()

router.get('/', async (request, response) => {
  const cityId = parsePositiveInt(request.query.cityId)
  const search = String(request.query.search ?? '').trim()
  const categoryId = request.query.categoryId ? parsePositiveInt(request.query.categoryId) ?? undefined : undefined

  if (!cityId) {
    sendError(response, 400, 'city_required', 'cityId must be a positive integer')
    return
  }

  const productCities = await prisma.productCity.findMany({
    where: {
      cityId,
      isAvailable: true,
      stock: { gt: 0 },
      product: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { nameEn: { contains: search } },
                { description: { contains: search } },
                { descriptionEn: { contains: search } },
              ],
            }
          : {}),
        ...(categoryId ? { categoryId } : {}),
      },
    },
    include: {
      product: {
        include: {
          category: true,
        },
      },
    },
    orderBy: [{ product: { isRecommended: 'desc' } }, { product: { name: 'asc' } }],
  })

  response.json({ products: productCities.map(mapProduct) })
})

export default router
