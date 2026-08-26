import 'dotenv/config'
import { Markup, Telegraf } from 'telegraf'

const token = process.env.TELEGRAM_BOT_TOKEN
const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:5173'

if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN is not set. Bot is disabled until the token is provided.')
  process.exit(0)
}

const bot = new Telegraf(token)

bot.start(async (context) => {
  await context.reply('Добро пожаловать в NARCOS SHOP. Откройте Web App, чтобы выбрать город и начать покупки.', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.webApp('🛍 Открыть NARCOS', webAppUrl)],
    ]).reply_markup,
  })
})

bot.command('shop', async (context) => {
  await context.reply('Откройте магазин через кнопку ниже.', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.webApp('🛍 Открыть NARCOS', webAppUrl)],
    ]).reply_markup,
  })
})

bot.launch().then(() => {
  console.log('Telegram bot started')
})

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
