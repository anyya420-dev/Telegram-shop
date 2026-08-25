import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, prisma } from '../lib.js'

const router = Router()

router.get('/methods', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const methods = await prisma.paymentMethod.findMany({
    where: { isEnabled: true },
    orderBy: [{ type: 'asc' }, { id: 'asc' }],
  })

  response.json({ methods })
})

export default router
