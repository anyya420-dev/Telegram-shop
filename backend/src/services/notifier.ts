import { prisma } from '../lib.js'
import { decryptBotToken } from './telegramBots.js'

type BotRuntimeConfig = {
  token: string
  webAppUrl: string | null
}

type MessageButton = {
  text: string
  url: string
}

const STATUS_LABELS: Record<string, string> = {
  waiting_for_delivery_price: '🧮 Ожидает расчёта доставки',
  ready_for_payment: '💳 Ожидает оплаты',
  payment_pending: '💳 Платёж проверяется администратором',
  confirmed: '✅ Подтверждён',
  processing: '🔧 В обработке',
  ready: '📦 Готов к выдаче',
  delivered: '🚚 Доставлен',
  cancelled: '❌ Отменён',
}

async function resolveBotConfig(): Promise<BotRuntimeConfig | null> {
  const configuredBot = await prisma.telegramBot.findFirst({
    where: { status: 'enabled' },
    orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
  })

  if (configuredBot) {
    return {
      token: decryptBotToken(configuredBot.encryptedToken),
      webAppUrl: configuredBot.webAppUrl,
    }
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return null
  }

  return {
    token: process.env.TELEGRAM_BOT_TOKEN,
    webAppUrl: process.env.WEB_APP_URL ?? process.env.FRONTEND_URL ?? null,
  }
}

async function sendTelegramMessage(
  telegramId: string,
  text: string,
  button?: MessageButton,
): Promise<void> {
  const bot = await resolveBotConfig()
  if (!bot) {
    return
  }

  const payload: {
    chat_id: string
    text: string
    parse_mode: 'HTML'
    reply_markup?: { inline_keyboard: Array<Array<{ text: string; web_app?: { url: string }; url?: string }>> }
  } = {
    chat_id: telegramId,
    text,
    parse_mode: 'HTML',
  }

  if (button) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: button.text, web_app: { url: button.url } }]],
    }
  }

  await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function notifyOrderStatusChange(
  telegramId: string,
  orderId: number,
  status: string,
): void {
  const label = STATUS_LABELS[status] ?? status
  const text = `Статус вашего заказа #${orderId} изменён:\n${label}`

  void sendTelegramMessage(telegramId, text).catch(() => {
    // ignore notifier failures
  })
}

export function notifyOperatorAccessGranted(telegramId: string): void {
  const webAppUrl = process.env.WEB_APP_URL ?? process.env.FRONTEND_URL
  const text = 'Вам выдан доступ к панели оператора NARCOS SHOP.'

  void sendTelegramMessage(
    telegramId,
    text,
    webAppUrl
      ? { text: 'OPEN OPERATOR PANEL', url: webAppUrl }
      : undefined,
  ).catch(() => {
    // ignore notifier failures
  })
}

export function notifyOrderReadyForPayment(telegramId: string, orderId: number, deliveryPrice: number, total: number): void {
  const text = `Доставка для заказа #${orderId} рассчитана.\nДоставка: ${deliveryPrice.toFixed(2)} USDT\nИтого: ${total.toFixed(2)} USDT`
  void sendTelegramMessage(telegramId, text).catch(() => {
    // ignore notifier failures
  })
}

export function notifyOperatorOrderAssigned(
  telegramId: string,
  order: { id: number; cityName: string; productsCount: number; subtotal: number },
): void {
  const webAppUrl = process.env.WEB_APP_URL ?? process.env.FRONTEND_URL
  const text = `NEW ORDER #${order.id}\nCity: ${order.cityName}\nProducts: ${order.productsCount}\nProducts subtotal: ${order.subtotal.toFixed(2)} USDT\nDelivery: NOT CALCULATED`

  void sendTelegramMessage(
    telegramId,
    text,
    webAppUrl
      ? { text: 'OPEN ORDER', url: `${webAppUrl.replace(/\/+$/, '')}/#/orders/${order.id}` }
      : undefined,
  ).catch(() => {
    // ignore notifier failures
  })
}

export function notifyOperatorOrderPaid(
  telegramId: string,
  order: { id: number; subtotal: number; delivery: number; discount: number; total: number },
): void {
  const webAppUrl = process.env.WEB_APP_URL ?? process.env.FRONTEND_URL
  const text = `ORDER #${order.id} PAID\\nProducts: ${order.subtotal.toFixed(2)} USDT\\nDelivery: ${order.delivery.toFixed(2)} USDT\\nDiscount: ${order.discount.toFixed(2)} USDT\\nTotal: ${order.total.toFixed(2)} USDT`
  void sendTelegramMessage(
    telegramId,
    text,
    webAppUrl
      ? { text: 'OPEN ORDER', url: `${webAppUrl.replace(/\\/+$/, '')}/#/orders/${order.id}` }
      : undefined,
  ).catch(() => {
    // ignore notifier failures
  })
}
