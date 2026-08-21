import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, prisma, sendError } from '../lib.js'

const router = Router()

// POST /api/discounts/validate - validate a promo code
router.post('/validate', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const code = typeof request.body.code === 'string' ? request.body.code.trim().toUpperCase() : ''
  const orderAmount = Number(request.body.orderAmount) || 0

  if (!code) {
    sendError(response, 400, 'code_required', 'Discount code is required')
    return
  }

  const discount = await prisma.discount.findFirst({
    where: { code, isActive: true },
  })

  if (!discount) {
    sendError(response, 404, 'discount_not_found', 'Discount code not found or inactive')
    return
  }

  if (discount.expiresAt && discount.expiresAt < new Date()) {
    sendError(response, 400, 'discount_expired', 'Discount code has expired')
    return
  }

  if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit) {
    sendError(response, 400, 'discount_exhausted', 'Discount code usage limit reached')
    return
  }

  if (orderAmount < discount.minOrderAmount) {
    sendError(
      response,
      400,
      'order_too_small',
      `Minimum order amount is ${discount.minOrderAmount} to use this code`,
    )
    return
  }

  const discountAmount =
    discount.type === 'percent'
      ? Number(((orderAmount * discount.value) / 100).toFixed(2))
      : Math.min(discount.value, orderAmount)

  response.json({ discount, discountAmount })
})

export default router
