import 'dotenv/config'
import { Markup, Telegraf } from 'telegraf'

const token = process.env.TELEGRAM_BOT_TOKEN
const webAppUrl = process.env.WEB_APP_URL ?? process.env.FRONTEND_URL ?? 'https://telegram-shop-378j.onrender.com'

if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN is not set. Bot worker will stay idle until the token is provided.')
  const idleInterval = setInterval(() => {
    // keep worker process alive to avoid restart loops when token is intentionally unset
  }, 60_000)
  process.once('SIGINT', () => {
    clearInterval(idleInterval)
    process.exit(0)
  })
  process.once('SIGTERM', () => {
    clearInterval(idleInterval)
    process.exit(0)
  })
} else {
  const bot = new Telegraf(token)

  bot.start(async (context) => {
    await context.reply(
      'Добро пожаловать в Telegram Shop. Откройте Web App, чтобы выбрать город и начать покупки.',
      Markup.inlineKeyboard([
        [Markup.button.webApp('🛍 Открыть Telegram Shop', webAppUrl)],
      ]),
    )
  })

  bot.launch().then(() => {
    console.log('Telegram Shop bot started')
  }).catch((error) => {
    console.error('Telegram Shop bot failed to start:', error)
    process.exit(1)
  })

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}
