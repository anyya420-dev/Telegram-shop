import { Markup, Telegraf } from 'telegraf'
import { getActiveBotToken, validateBotToken } from './botService.js'

const PRODUCTION_WEB_APP_URL = 'https://telegram-shop-378j.onrender.com'

let botInstance: Telegraf | null = null

function getWebAppUrl() {
  return process.env.WEB_APP_URL ?? process.env.FRONTEND_URL ?? PRODUCTION_WEB_APP_URL
}

export async function initializeTelegramBot() {
  if (botInstance) return botInstance

  const token = await getActiveBotToken()
  if (!token) {
    throw new Error('Telegram bot startup failed: TELEGRAM_BOT_TOKEN is missing (or no active admin bot token is configured).')
  }

  const botInfo = await validateBotToken(token)
  if (!botInfo) {
    throw new Error('Telegram bot startup failed: invalid TELEGRAM_BOT_TOKEN (or active admin bot token).')
  }

  const bot = new Telegraf(token)
  const webAppUrl = getWebAppUrl()

  bot.start(async (context) => {
    await context.reply(
      '🛒 Добро пожаловать в NARCOS SHOP!\n\nОткройте магазин, чтобы выбрать товар и сделать заказ.',
      {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.webApp('Открыть магазин', webAppUrl),
        ]).reply_markup,
      },
    )
  })

  bot.command('shop', async (context) => {
    await context.reply('Откройте магазин через кнопку ниже.', {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.webApp('Открыть магазин', webAppUrl),
      ]).reply_markup,
    })
  })

  process.once('SIGINT', () => {
    bot.stop('SIGINT')
  })
  process.once('SIGTERM', () => {
    bot.stop('SIGTERM')
  })

  await bot.launch({
    dropPendingUpdates: true,
  })

  botInstance = bot

  console.log('Telegram bot initialized successfully')

  return bot
}
