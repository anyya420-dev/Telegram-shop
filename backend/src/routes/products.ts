import { Router } from 'express'
import { mapProduct, parsePositiveInt, prisma, sendError } from '../lib.js'

const router = Router()

// GET /api/products/recommended?cityId=1
router.get('/recommended/list', async (req, res) => {
  try {
    const cityId = parsePositiveInt(req.query.cityId)
    const products = await prisma.productCity.findMany({
      where: {
        isAvailable: true,
        stock: { gt: 0 },
        cityId: cityId || undefined,
        product: { isActive: true, isRecommended: true },
      },
      include: {
        product: {
          include: { category: true },
        },
      },
    })
    res.json(products.map(mapProduct))
  } catch {
    res.status(500).json({ error: 'Failed to fetch recommended products' })
  }
})

// GET /api/products?cityId=1&categoryId=2&search=coffee
router.get('/', async (req, res) => {
  try {
    const cityId = parsePositiveInt(req.query.cityId)
    const categoryId = parsePositiveInt(req.query.categoryId)
    const search = typeof req.query.search === 'string' ? req.query.search : undefined

    const products = await prisma.productCity.findMany({
      where: {
        isAvailable: true,
        stock: { gt: 0 },
        cityId: cityId || undefined,
        product: {
          isActive: true,
          categoryId: categoryId || undefined,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { nameEn: { contains: search, mode: 'insensitive' } },
                  { description: { contains: search, mode: 'insensitive' } },
                  { descriptionEn: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      },
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: [{ product: { isRecommended: 'desc' } }, { product: { name: 'asc' } }],
    })
    res.json(products.map(mapProduct))
  } catch {
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// GET /api/products/:productId?cityId=1
router.get('/:productId', async (request, response) => {
  const productId = parsePositiveInt(request.params.productId)
  const cityId = parsePositiveInt(request.query.cityId)

  if (!productId) {
    sendError(response, 400, 'product_required', 'productId must be a positive integer')
    return
  }

  const productCity = cityId
    ? await prisma.productCity.findFirst({
        where: {
          productId,
          cityId,
          product: { isActive: true },
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
      })
    : await prisma.productCity.findFirst({
        where: {
          productId,
          isAvailable: true,
          stock: { gt: 0 },
          product: { isActive: true },
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
        orderBy: [{ city: { sortOrder: 'asc' } }, { stock: 'desc' }],
      })
  if (!productCity) {
    sendError(response, 404, 'product_not_found', 'Product not found for selected city')
    return
  }

  response.json({ product: mapProduct(productCity) })
})

export default router
