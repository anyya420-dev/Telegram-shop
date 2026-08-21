/**
 * Telegram bot notifier – sends order status updates to users via the bot.
 * This is a best-effort fire-and-forget helper; it never throws.
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

const STATUS_LABELS: Record<string, string> = {
  pending: '⏳ Ожидает подтверждения',
  confirmed: '✅ Подтверждён',
  processing: '🔧 В обработке',
  ready: '📦 Готов к выдаче',
  delivered: '🚚 Доставлен',
  cancelled: '❌ Отменён',
}

export function notifyOrderStatusChange(
  telegramId: string,
  orderId: number,
  status: string,
): void {
  if (!TELEGRAM_BOT_TOKEN) {
    return
  }

  const label = STATUS_LABELS[status] ?? status
  const text = `Статус вашего заказа #${orderId} изменён:\n${label}`

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  const body = JSON.stringify({ chat_id: telegramId, text, parse_mode: 'HTML' })

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {
    // Ignore notification errors – they must not affect the API response
  })
}
