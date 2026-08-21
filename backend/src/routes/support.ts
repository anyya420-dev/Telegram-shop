import { Router } from 'express'
import { authRateLimiter, getAuthorizedUser, parsePositiveInt, prisma, sendError } from '../lib.js'

const router = Router()

// GET /api/support - list my tickets
router.get('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    include: { replies: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  response.json({ tickets })
})

// POST /api/support - create ticket
router.post('/', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const subject = typeof request.body.subject === 'string' ? request.body.subject.trim() : ''
  const message = typeof request.body.message === 'string' ? request.body.message.trim() : ''

  if (!subject || subject.length < 3) {
    sendError(response, 400, 'invalid_subject', 'Subject must be at least 3 characters')
    return
  }

  if (!message || message.length < 10) {
    sendError(response, 400, 'invalid_message', 'Message must be at least 10 characters')
    return
  }

  const ticket = await prisma.supportTicket.create({
    data: { userId: user.id, subject, message, status: 'open' },
    include: { replies: true },
  })

  await prisma.userActivityLog.create({
    data: { userId: user.id, action: 'support_ticket_created', meta: JSON.stringify({ ticketId: ticket.id }) },
  })

  response.json({ ticket })
})

// POST /api/support/:id/reply - reply to ticket
router.post('/:id/reply', authRateLimiter, async (request, response) => {
  const user = await getAuthorizedUser(request, response)
  if (!user) return

  const ticketId = parsePositiveInt(request.params.id)
  if (!ticketId) {
    sendError(response, 400, 'invalid_id', 'Invalid ticket id')
    return
  }

  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, userId: user.id } })
  if (!ticket) {
    sendError(response, 404, 'ticket_not_found', 'Ticket not found')
    return
  }

  const message = typeof request.body.message === 'string' ? request.body.message.trim() : ''
  if (!message || message.length < 1) {
    sendError(response, 400, 'invalid_message', 'Message is required')
    return
  }

  await prisma.supportTicketReply.create({
    data: { ticketId, isAdmin: false, message },
  })

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: 'open' },
    include: { replies: { orderBy: { createdAt: 'asc' } } },
  })

  response.json({ ticket: updated })
})

export default router
