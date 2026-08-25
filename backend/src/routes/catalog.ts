import { Router } from 'express'
import { mapProduct, parsePositiveInt, prisma, sendError } from '../lib.js'

const router = Router()
type CatalogSort = 'newest' | 'price_asc' | 'price_desc' | 'popular'

function getCatalogSort(value: unknown): CatalogSort {
  return value === 'price_asc' || value === 'price_desc' || value === 'popular' ? value : 'newest'
}

function buildCatalogOrderBy(sort: CatalogSort) {
  switch (sort) {
    case 'price_asc':
      return [{ product: { price: 'asc' } }, { product: { name: 'asc' } }] as const
    case 'price_desc':
      return [{ product: { price: 'desc' } }, { product: { name: 'asc' } }] as const
    case 'popular':
      return [{ product: { isRecommended: 'desc' } }, { product: { name: 'asc' } }] as const
    case 'newest':
    default:
      return [{ product: { createdAt: 'desc' } }, { product: { name: 'asc' } }] as const
  }
}

router.get('/', async (request, response) => {
  const cityId = parsePositiveInt(request.query.cityId)
  const search = String(request.query.search ?? '').trim()
  const categoryId = request.query.categoryId ? parsePositiveInt(request.query.categoryId) ?? undefined : undefined
  const sort = getCatalogSort(request.query.sort)

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
                { name: { contains: search, mode: 'insensitive' } },
                { nameEn: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { descriptionEn: { contains: search, mode: 'insensitive' } },
                { category: { name: { contains: search, mode: 'insensitive' } } },
                { category: { nameEn: { contains: search, mode: 'insensitive' } } },
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
    orderBy: buildCatalogOrderBy(sort),
  })

  response.json({ products: productCities.map(mapProduct) })
})

export default router
