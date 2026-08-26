import 'dotenv/config'
import { Markup, Telegraf } from 'telegraf'

const token = process.env.TELEGRAM_BOT_TOKEN
const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:5173'

if (!token) {
  console.warn('TELEGRAM_BOT_TOKEN is not set. Bot is disabled until the token is provided.')
  process.exit(0)
}

const bot = new Telegraf(token)
const commandsMenuButton = { type: 'commands' as const }

async function clearLegacyWebAppMenuButton(chatId?: number) {
  const payload: { chat_id?: number; menu_button: { type: 'commands' } } = {
    menu_button: commandsMenuButton,
  }
  if (typeof chatId === 'number') {
    payload.chat_id = chatId
  }

  await bot.telegram.callApi('setChatMenuButton', payload)
}

bot.start(async (context) => {
  try {
    await clearLegacyWebAppMenuButton(context.chat?.id)
  } catch (error) {
    console.warn('Failed to clear legacy chat menu button for /start:', error)
  }

  await context.reply('Добро пожаловать в NARCOS SHOP. Откройте Web App, чтобы выбрать город и начать покупки.', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.webApp('🛍️ Открыть NARCOS', webAppUrl)],
    ]).reply_markup,
  })
})

bot.command('shop', async (context) => {
  try {
    await clearLegacyWebAppMenuButton(context.chat?.id)
  } catch (error) {
    console.warn('Failed to clear legacy chat menu button for /shop:', error)
  }

  await context.reply('Откройте магазин через кнопку ниже.', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.webApp('🛍️ Открыть NARCOS', webAppUrl)],
    ]).reply_markup,
  })
})

bot.launch()
  .then(async () => {
    try {
      await clearLegacyWebAppMenuButton()
    } catch (error) {
      console.warn('Telegram bot started, but failed to clear default menu button:', error)
    }
    console.log('Telegram bot started')
  })
  .catch((error) => {
    console.error('Failed to start Telegram bot:', error)
    process.exit(1)
  })

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
