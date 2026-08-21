import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, parsePositiveInt, prisma, sendError } from '../lib.js'

const router = Router()

// GET /api/reviews?productId=X
router.get('/', authRateLimiter, async (request, response) => {
  const productId = parsePositiveInt(request.query.productId)
  if (!productId) {
    sendError(response, 400, 'product_id_required', 'productId query param is required')
    return
  }

  const reviews = await prisma.review.findMany({
    where: { productId },
    include: { user: { select: { firstName: true, username: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const avgRating = reviews.length
    ? Number((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1))
    : null

  response.json({ reviews, avgRating, count: reviews.length })
})

// POST /api/reviews
router.post('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const productId = parsePositiveInt(request.body.productId)
  if (!productId) {
    sendError(response, 400, 'product_id_required', 'productId is required')
    return
  }

  const rating = Number(request.body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    sendError(response, 400, 'invalid_rating', 'Rating must be an integer 1-5')
    return
  }

  const comment =
    typeof request.body.comment === 'string' ? request.body.comment.trim() : undefined

  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) {
    sendError(response, 404, 'product_not_found', 'Product not found')
    return
  }

  const review = await prisma.review.upsert({
    where: { userId_productId: { userId: user.id, productId } },
    create: { userId: user.id, productId, rating, comment: comment || null },
    update: { rating, comment: comment || null },
    include: { user: { select: { firstName: true, username: true } } },
  })

  await prisma.userActivityLog.create({
    data: {
      userId: user.id,
      action: 'review_submitted',
      meta: JSON.stringify({ productId, rating }),
    },
  })

  response.json({ review })
})

// DELETE /api/reviews/:productId
router.delete('/:productId', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const productId = parsePositiveInt(request.params.productId)
  if (!productId) {
    sendError(response, 400, 'invalid_id', 'Invalid product id')
    return
  }

  await prisma.review.deleteMany({
    where: { userId: user.id, productId },
  })

  response.json({ ok: true })
})

export default router
