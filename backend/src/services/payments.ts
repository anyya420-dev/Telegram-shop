import { createHmac, randomBytes } from 'node:crypto'
import type { Request } from 'express'
import type { Order, Payment, PaymentMethod, Prisma, PrismaClient } from '@prisma/client'
import { normalizeQuantity } from '../lib.js'

export const PAYMENT_STATUSES = ['pending', 'processing', 'paid', 'failed', 'expired', 'cancelled', 'refunded'] as const
export const PAYMENT_TYPES = ['card', 'crypto'] as const
export const CARD_PROVIDER = 'stripe'
export const PAYMENT_EXPIRATION_MINUTES = 30

type PaymentMethodInput = {
  type: string
  title: string
  currency?: string | null
  provider?: string | null
  providerMode?: string | null
  providerKey?: string | null
  providerConfig?: string | null
  asset?: string | null
  network?: string | null
  walletAddress?: string | null
  displayName?: string | null
  instructions?: string | null
  sortOrder?: number
  isTonConnectEnabled?: boolean
  isEnabled?: boolean
}

export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentConfigError'
  }
}

export function sanitizePaymentMethod(method: PaymentMethod) {
  return {
    id: method.id,
    type: method.type,
    title: method.title,
    currency: method.currency,
    provider: method.provider,
    providerMode: method.providerMode,
    providerKey: null,
    providerConfig: null,
    asset: method.asset,
    network: method.network,
    walletAddress: method.type === 'crypto' ? method.walletAddress : null,
    displayName: method.displayName,
    instructions: method.instructions,
    sortOrder: method.sortOrder,
    isTonConnectEnabled: method.isTonConnectEnabled,
    isEnabled: method.isEnabled,
  }
}

export function sanitizePayment(payment: Payment & { paymentMethod?: PaymentMethod | null }) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    paymentMethodId: payment.paymentMethodId,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    asset: payment.asset,
    network: payment.network,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    providerSessionId: payment.providerSessionId,
    checkoutUrl: payment.checkoutUrl,
    recipient: payment.recipient,
    senderAddress: payment.senderAddress,
    transactionHash: payment.transactionHash,
    referenceCode: payment.referenceCode,
    failureReason: payment.failureReason,
    paidAt: payment.paidAt,
    expiresAt: payment.expiresAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    paymentMethod: payment.paymentMethod ? sanitizePaymentMethod(payment.paymentMethod) : undefined,
  }
}

export function normalizeWalletAddress(value: string | null | undefined) {
  return value?.trim() || null
}

export function normalizeUpper(value: string | null | undefined) {
  const next = value?.trim().toUpperCase()
  return next ? next : null
}

export function parsePaymentMethodInput(input: PaymentMethodInput, existing?: PaymentMethod) {
  const type = (input.type || existing?.type || '').trim().toLowerCase()
  if (!PAYMENT_TYPES.includes(type as (typeof PAYMENT_TYPES)[number])) {
    throw new PaymentConfigError('type must be card or crypto')
  }

  const title = (input.title ?? existing?.title ?? '').trim()
  if (!title) {
    throw new PaymentConfigError('title is required')
  }

  const isEnabled = typeof input.isEnabled === 'boolean' ? input.isEnabled : (existing?.isEnabled ?? true)
  const sortOrder = Number.isInteger(input.sortOrder) ? Number(input.sortOrder) : (existing?.sortOrder ?? 0)
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new PaymentConfigError('sortOrder must be a non-negative integer')
  }

  const currency = normalizeUpper(input.currency ?? existing?.currency)
  const provider = (input.provider ?? existing?.provider ?? '').trim().toLowerCase() || null
  const providerMode = (input.providerMode ?? existing?.providerMode ?? '').trim().toLowerCase() || null
  const providerKey = (input.providerKey ?? existing?.providerKey ?? '').trim() || null
  const providerConfig = (input.providerConfig ?? existing?.providerConfig ?? '').trim() || null
  const asset = normalizeUpper(input.asset ?? existing?.asset)
  const network = normalizeUpper(input.network ?? existing?.network)
  const walletAddress = normalizeWalletAddress(input.walletAddress ?? existing?.walletAddress)
  const displayName = (input.displayName ?? existing?.displayName ?? title).trim() || title
  const instructions = (input.instructions ?? existing?.instructions ?? '').trim() || null
  const isTonConnectEnabled =
    typeof input.isTonConnectEnabled === 'boolean'
      ? input.isTonConnectEnabled
      : (existing?.isTonConnectEnabled ?? false)

  if (type === 'card') {
    if (provider !== CARD_PROVIDER) {
      throw new PaymentConfigError('card provider must be stripe')
    }
    if (!providerMode || !['test', 'live'].includes(providerMode)) {
      throw new PaymentConfigError('card providerMode must be test or live')
    }
    if (!currency) {
      throw new PaymentConfigError('card currency is required')
    }
  }

  if (type === 'crypto') {
    if (!asset || !network || !walletAddress) {
      throw new PaymentConfigError('crypto asset, network and walletAddress are required')
    }
    if (asset !== 'TON' && isTonConnectEnabled) {
      throw new PaymentConfigError('TON Connect can only be enabled for TON asset')
    }
    if (isTonConnectEnabled && network !== 'TON') {
      throw new PaymentConfigError('TON Connect requires TON network')
    }
  }

  return {
    type,
    title,
    currency,
    provider,
    providerMode,
    providerKey,
    providerConfig,
    asset,
    network,
    walletAddress,
    displayName,
    instructions,
    sortOrder,
    isTonConnectEnabled,
    isEnabled,
    cardNumber: null,
    cardholderName: null,
  } satisfies Prisma.PaymentMethodUncheckedCreateInput
}

export function getStripeSecretKey(mode: string | null) {
  if (mode === 'live') {
    return process.env.STRIPE_LIVE_SECRET_KEY ?? null
  }

  return process.env.STRIPE_TEST_SECRET_KEY ?? null
}

export function getStripeWebhookSecret(mode: string | null) {
  if (mode === 'live') {
    return process.env.STRIPE_LIVE_WEBHOOK_SECRET ?? null
  }

  return process.env.STRIPE_TEST_WEBHOOK_SECRET ?? null
}

function buildReferenceCode() {
  return randomBytes(8).toString('hex').toUpperCase()
}

function getExpirationDate() {
  return new Date(Date.now() + PAYMENT_EXPIRATION_MINUTES * 60_000)
}

function getBaseAppUrl() {
  return (process.env.WEB_APP_URL || process.env.FRONTEND_URL || 'https://telegram-shop-378j.onrender.com').replace(/\/+$/, '')
}

async function createStripeCheckoutSession(method: PaymentMethod, order: Order, payment: Payment) {
  const secretKey = getStripeSecretKey(method.providerMode)
  if (!secretKey) {
    throw new PaymentConfigError('Stripe credentials are not configured')
  }

  const body = new URLSearchParams()
  body.set('mode', 'payment')
  body.set('success_url', `${getBaseAppUrl()}/#/orders/${order.id}`)
  body.set('cancel_url', `${getBaseAppUrl()}/#/checkout`)
  body.set('client_reference_id', String(payment.id))
  body.set('metadata[orderId]', String(order.id))
  body.set('metadata[paymentId]', String(payment.id))
  body.set('line_items[0][price_data][currency]', (method.currency ?? 'USD').toLowerCase())
  body.set('line_items[0][price_data][product_data][name]', `Telegram Shop order #${order.id}`)
  body.set('line_items[0][price_data][unit_amount]', String(Math.round(order.total * 100)))
  body.set('line_items[0][quantity]', '1')

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + secretKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!stripeResponse.ok) {
    const errorText = await stripeResponse.text()
    throw new PaymentConfigError(`Stripe session creation failed: ${errorText || stripeResponse.statusText}`)
  }

  const session = await stripeResponse.json() as { id: string; url?: string; payment_intent?: string }
  return {
    providerSessionId: session.id,
    providerPaymentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    checkoutUrl: session.url ?? null,
    metadata: JSON.stringify({ stripeSessionId: session.id }),
  }
}

export async function createOrRefreshOrderPayment(tx: Prisma.TransactionClient, order: Order, method: PaymentMethod) {
  const existingPending = await tx.payment.findFirst({
    where: {
      orderId: order.id,
      paymentMethodId: method.id,
      status: { in: ['pending', 'processing'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existingPending && (!existingPending.expiresAt || existingPending.expiresAt > new Date())) {
    if (method.type !== 'card' || existingPending.checkoutUrl) {
      return existingPending
    }

    try {
      const stripeSession = await createStripeCheckoutSession(method, order, existingPending)
      return tx.payment.update({
        where: { id: existingPending.id },
        data: stripeSession,
      })
    } catch (error) {
      if (error instanceof PaymentConfigError && error.message === 'Stripe credentials are not configured') {
        return existingPending
      }
      throw error
    }
  }

  const payment = await tx.payment.create({
    data: {
      orderId: order.id,
      paymentMethodId: method.id,
      status: 'pending',
      amount: normalizeQuantity(order.total),
      currency: method.type === 'card' ? method.currency : null,
      asset: method.type === 'crypto' ? method.asset : null,
      network: method.type === 'crypto' ? method.network : null,
      provider: method.provider,
      recipient: method.type === 'crypto' ? method.walletAddress : null,
      referenceCode: buildReferenceCode(),
      expiresAt: getExpirationDate(),
      metadata: method.type === 'crypto'
        ? JSON.stringify({ instructions: method.instructions, isTonConnectEnabled: method.isTonConnectEnabled })
        : null,
    },
  })

  if (method.type !== 'card') {
    return payment
  }

  try {
    const stripeSession = await createStripeCheckoutSession(method, order, payment)
    return tx.payment.update({
      where: { id: payment.id },
      data: stripeSession,
    })
  } catch (error) {
    if (error instanceof PaymentConfigError && error.message === 'Stripe credentials are not configured') {
      return payment
    }
    throw error
  }
}

export async function expirePaymentIfNeeded(tx: Prisma.TransactionClient | PrismaClient, payment: Payment) {
  if (payment.status === 'pending' && payment.expiresAt && payment.expiresAt <= new Date()) {
    return tx.payment.update({
      where: { id: payment.id },
      data: { status: 'expired', failureReason: 'payment_expired' },
    })
  }

  return payment
}

export function readStripeSignature(request: Request) {
  return request.header('stripe-signature') ?? ''
}

export function verifyStripeWebhookSignature(payload: Buffer, signature: string, secret: string) {
  const elements = signature.split(',').map((part) => part.trim())
  const timestamp = elements.find((part) => part.startsWith('t='))?.slice(2)
  const hash = elements.find((part) => part.startsWith('v1='))?.slice(3)

  if (!timestamp || !hash) {
    return false
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload.toString('utf8')}`).digest('hex')
  return expected === hash
}

export function getJsonMetadata(value: string | null) {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
}
