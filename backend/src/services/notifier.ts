/**
 * Telegram bot notifier – sends order status updates to users via the bot.
 * This is a best-effort fire-and-forget helper; it never throws.
 *
 * Token resolution order:
 *   1. Active bot config from the database (admin-configured)
 *   2. TELEGRAM_BOT_TOKEN environment variable (legacy fallback)
 */

import { getActiveBotToken } from './botService.js'

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
  const label = STATUS_LABELS[status] ?? status
  const text = `Статус вашего заказа #${orderId} изменён:\n${label}`

  // Resolve token asynchronously; errors are silently ignored
  getActiveBotToken()
    .then((token) => {
      if (!token) return

      const url = `https://api.telegram.org/bot${token}/sendMessage`
      const body = JSON.stringify({ chat_id: telegramId, text, parse_mode: 'HTML' })

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    })
    .catch(() => {
      // Ignore notification errors – they must not affect the API response
    })
}
