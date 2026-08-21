import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, mapProduct, parsePositiveInt, prisma, sendError } from '../lib.js'

const router = Router()

const productCityInclude = {
  product: { include: { category: true } },
}

// GET /api/wishlist
router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const items = await prisma.wishlist.findMany({
    where: { userId: user.id },
    include: { productCity: { include: productCityInclude } },
    orderBy: { createdAt: 'desc' },
  })

  response.json({ items: items.map((i) => ({ id: i.id, product: mapProduct(i.productCity) })) })
})

// POST /api/wishlist - add item
router.post('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const productCityId = parsePositiveInt(request.body.productCityId)
  if (!productCityId) {
    sendError(response, 400, 'invalid_id', 'productCityId is required')
    return
  }

  const pc = await prisma.productCity.findUnique({ where: { id: productCityId } })
  if (!pc) {
    sendError(response, 404, 'not_found', 'Product not found')
    return
  }

  const item = await prisma.wishlist.upsert({
    where: { userId_productCityId: { userId: user.id, productCityId } },
    create: { userId: user.id, productCityId },
    update: {},
    include: { productCity: { include: productCityInclude } },
  })

  response.json({ item: { id: item.id, product: mapProduct(item.productCity) } })
})

// DELETE /api/wishlist/:productCityId - remove item
router.delete('/:productCityId', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const productCityId = parsePositiveInt(request.params.productCityId)
  if (!productCityId) {
    sendError(response, 400, 'invalid_id', 'Invalid productCityId')
    return
  }

  await prisma.wishlist.deleteMany({ where: { userId: user.id, productCityId } })
  response.json({ ok: true })
})

export default router
