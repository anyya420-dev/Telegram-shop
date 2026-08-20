import { Router } from 'express'
import { mapProduct, parsePositiveInt, prisma, sendError } from '../lib.js'

const router = Router()

router.get('/:productId', async (request, response) => {
  const productId = parsePositiveInt(request.params.productId)
  const cityId = parsePositiveInt(request.query.cityId)

  if (!productId || !cityId) {
    sendError(response, 400, 'product_city_required', 'productId and cityId must be positive integers')
    return
  }

  const productCity = await prisma.productCity.findFirst({
    where: {
      productId,
      cityId,
      isAvailable: true,
      product: { isActive: true },
    },
    include: {
      product: {
        include: {
          category: true,
        },
      },
    },
  })

  if (!productCity) {
    sendError(response, 404, 'product_not_found', 'Product not found for selected city')
    return
  }

  response.json({ product: mapProduct(productCity) })
})

export default router
