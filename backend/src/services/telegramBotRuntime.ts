import { Markup, Telegraf } from 'telegraf'
import { getActiveBotToken, validateBotToken } from './botService.js'
import { getWebAppUrl } from './runtimeConfig.js'

let botInstance: Telegraf | null = null

export async function initializeTelegramBot() {
  if (botInstance) {
    console.log('[BOT] Already initialized, skipping.')
    return botInstance
  }

  console.log('[BOT] Initialization started')
  console.log(`[BOT] TELEGRAM_BOT_TOKEN env var present: ${Boolean(process.env.TELEGRAM_BOT_TOKEN)}`)

  const token = await getActiveBotToken()
  if (!token) {
    throw new Error('[BOT] Startup failed: TELEGRAM_BOT_TOKEN is missing (and no active admin bot token is configured).')
  }
  console.log('[BOT] Token loaded, calling Telegram getMe to validate')

  const botInfo = await validateBotToken(token)
  if (!botInfo) {
    throw new Error('[BOT] Startup failed: invalid TELEGRAM_BOT_TOKEN (getMe returned no result).')
  }
  console.log(`[BOT] getMe OK — id=${botInfo.id}, username=@${botInfo.username || 'unknown'}, name=${botInfo.firstName || 'unknown'}`)

  const bot = new Telegraf(token)
  const webAppUrl = getWebAppUrl()
  console.log(`[BOT] Web App URL: ${webAppUrl}`)

  bot.catch((error, context) => {
    const updateType = context.updateType ?? 'unknown'
    console.error(`[BOT] Polling error (updateType=${updateType}):`, error)
  })

  if (process.env.LOG_BOT_UPDATES === 'true') {
    bot.use((context, next) => {
      const type = context.updateType ?? 'unknown'
      const from = context.from?.id ?? 'unknown'
      console.log(`[BOT] Update received: type=${type} from=${from}`)
      return next()
    })
  }

  bot.start(async (context) => {
    const chatId = context.chat?.id ?? 'unknown'
    console.log(`[BOT] /start received from chat=${chatId}`)
    try {
      await context.reply(
        '🛒 Добро пожаловать в NARCOS SHOP!\n\nОткройте магазин, чтобы выбрать товар и сделать заказ.',
        {
          reply_markup: Markup.inlineKeyboard([
            Markup.button.webApp('Открыть магазин', webAppUrl),
          ]).reply_markup,
        },
      )
      console.log(`[BOT] /start response sent to chat=${chatId}`)
    } catch (error) {
      console.error(`[BOT] /start reply failed for chat=${chatId}:`, error)
    }
  })

  bot.command('shop', async (context) => {
    const chatId = context.chat?.id ?? 'unknown'
    console.log(`[BOT] /shop received from chat=${chatId}`)
    try {
      await context.reply('Откройте магазин через кнопку ниже.', {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.webApp('Открыть магазин', webAppUrl),
        ]).reply_markup,
      })
      console.log(`[BOT] /shop response sent to chat=${chatId}`)
    } catch (error) {
      console.error(`[BOT] /shop reply failed for chat=${chatId}:`, error)
    }
  })

  process.once('SIGINT', () => {
    console.log('[BOT] SIGINT received, stopping')
    bot.stop('SIGINT')
  })
  process.once('SIGTERM', () => {
    console.log('[BOT] SIGTERM received, stopping')
    bot.stop('SIGTERM')
  })

  console.log('[BOT] Calling bot.launch() (polling mode, dropPendingUpdates=true)')
  try {
    await bot.launch({
      dropPendingUpdates: true,
    })
  } catch (error) {
    console.error('[BOT] bot.launch() failed:', error)
    throw error
  }
  console.log('[BOT] Polling started successfully — bot is live')

  botInstance = bot

  console.log('[BOT] Initialization complete')

  return bot
}
