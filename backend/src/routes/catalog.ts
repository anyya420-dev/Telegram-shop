import type { Prisma } from '@prisma/client'
import { Router } from 'express'
import { mapProduct, parsePositiveInt, prisma, sendError } from '../lib.js'

const router = Router()
type CatalogSort = 'newest' | 'price_asc' | 'price_desc' | 'popular'

function getCatalogSort(value: unknown): CatalogSort {
  return value === 'price_asc' || value === 'price_desc' || value === 'popular' ? value : 'newest'
}

function buildCatalogOrderBy(sort: CatalogSort): Prisma.ProductCityOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ product: { price: 'asc' } }, { product: { name: 'asc' } }]
    case 'price_desc':
      return [{ product: { price: 'desc' } }, { product: { name: 'asc' } }]
    case 'popular':
      return [{ product: { isRecommended: 'desc' } }, { product: { name: 'asc' } }]
    case 'newest':
    default:
      return [{ product: { createdAt: 'desc' } }, { product: { name: 'asc' } }]
  }
}

function pickBrowseProductCities<T extends {
  productId: number
  city: { sortOrder: number }
  stock: number
}>(productCities: T[]) {
  const uniqueByProduct = new Map<number, (typeof productCities)[number]>()

  for (const item of productCities) {
    const current = uniqueByProduct.get(item.productId)
    if (!current) {
      uniqueByProduct.set(item.productId, item)
      continue
    }

    if (item.city.sortOrder < current.city.sortOrder || (item.city.sortOrder === current.city.sortOrder && item.stock > current.stock)) {
      uniqueByProduct.set(item.productId, item)
    }
  }

  return [...uniqueByProduct.values()]
}

router.get('/', async (request, response) => {
  const cityId = parsePositiveInt(request.query.cityId)
  const search = String(request.query.search ?? '').trim()
  const categoryId = request.query.categoryId ? parsePositiveInt(request.query.categoryId) ?? undefined : undefined
  const sort = getCatalogSort(request.query.sort)

  const productCities = await prisma.productCity.findMany({
    where: {
      cityId: cityId ?? undefined,
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
      city: {
        select: {
          sortOrder: true,
        },
      },
      product: {
        include: {
          category: true,
        },
      },
    },
    orderBy: buildCatalogOrderBy(sort),
  })

  const products = cityId ? productCities : pickBrowseProductCities(productCities)
  response.json({ products: products.map(mapProduct) })
})

export default router
