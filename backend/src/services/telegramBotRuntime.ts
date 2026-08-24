import { Markup, Telegraf } from 'telegraf'
import { getActiveBotToken, validateBotToken } from './botService.js'

const PRODUCTION_WEB_APP_URL = 'https://telegram-shop-378j.onrender.com'

let botInstance: Telegraf | null = null

function getWebAppUrl() {
  return process.env.WEB_APP_URL ?? process.env.FRONTEND_URL ?? PRODUCTION_WEB_APP_URL
}

export async function initializeTelegramBot() {
  if (botInstance) return botInstance

  console.log('Telegram bot initialization started')
  const token = await getActiveBotToken()
  if (!token) {
    throw new Error('Telegram bot startup failed: TELEGRAM_BOT_TOKEN is missing (or no active admin bot token is configured).')
  }

  console.log('Telegram bot token loaded, validating with Telegram API')
  const botInfo = await validateBotToken(token)
  if (!botInfo) {
    throw new Error('Telegram bot startup failed: invalid TELEGRAM_BOT_TOKEN (or active admin bot token).')
  }
  console.log(`Telegram bot authenticated successfully (id=${botInfo.id}, username=@${botInfo.username || 'unknown'})`)

  const bot = new Telegraf(token)
  const webAppUrl = getWebAppUrl()
  console.log(`Telegram Web App URL configured: ${webAppUrl}`)

  bot.catch((error, context) => {
    const updateType = context.updateType ?? 'unknown'
    console.error(`Telegram bot polling error (updateType=${updateType})`)
    console.error(error)
  })

  bot.start(async (context) => {
    console.log(`/start received from chat ${context.chat?.id ?? 'unknown'}`)
    await context.reply(
      '🛒 Добро пожаловать в NARCOS SHOP!\n\nОткройте магазин, чтобы выбрать товар и сделать заказ.',
      {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.webApp('Открыть магазин', webAppUrl),
        ]).reply_markup,
      },
    )
    console.log(`/start response sent to chat ${context.chat?.id ?? 'unknown'}`)
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

  console.log('Telegram bot polling startup requested')
  try {
    await bot.launch({
      dropPendingUpdates: true,
    })
  } catch (error) {
    console.error('Telegram bot polling startup failed')
    throw error
  }
  console.log('Telegram bot polling started')

  botInstance = bot

  console.log('Telegram bot initialized successfully')

  return bot
}
