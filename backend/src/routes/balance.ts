import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, prisma, sendError } from '../lib.js'

const router = Router()

async function getOrCreateBalance(userId: number) {
  return prisma.balance.upsert({
    where: { userId },
    create: { userId, amount: 0 },
    update: {},
    include: {
      transactions: {
        where: { type: { notIn: ['casino_win', 'casino_loss', 'casino_migration_applied'] } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  })
}

// GET /api/balance
router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const balance = await getOrCreateBalance(user.id)
  response.json({ balance })
})

// POST /api/balance/topup - disabled to prevent fake deposits / withdrawal-like behavior
router.post('/topup', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return
  sendError(response, 403, 'balance_topup_disabled', 'Direct balance top-up is disabled. Use checkout payment methods for real purchases.')
})

export default router
