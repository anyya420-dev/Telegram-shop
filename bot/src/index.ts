import 'dotenv/config'
import { Markup, Telegraf } from 'telegraf'

const isProduction = process.env.NODE_ENV === 'production'
const localUrlPattern = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?(?:\/|$)/i

const normalizeUrl = (value: string | undefined) => value?.trim().replace(/\/+$/, '') ?? ''

function ensurePublicWebAppUrl(variableName: string, value: string) {
  if (!value) {
    throw new Error(`${variableName} must be configured with a public Web App URL.`)
  }

  if (isProduction && localUrlPattern.test(value)) {
    throw new Error(`${variableName} cannot point to localhost in production.`)
  }
}

function resolveBotToken() {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (telegramBotToken) return telegramBotToken

  const legacyBotToken = process.env.BOT_TOKEN?.trim()
  if (legacyBotToken) {
    console.error('BOT_TOKEN is deprecated and is no longer used. Set TELEGRAM_BOT_TOKEN.')
  }

  throw new Error('TELEGRAM_BOT_TOKEN is required for bot startup.')
}

async function startBot() {
  const token = resolveBotToken()
  const webAppUrl = normalizeUrl(process.env.WEB_APP_URL ?? process.env.FRONTEND_URL)
  ensurePublicWebAppUrl('WEB_APP_URL', webAppUrl)

  const adminPanelWebAppUrl = normalizeUrl(process.env.ADMIN_WEB_APP_URL ?? `${webAppUrl}/#/admin`)
  ensurePublicWebAppUrl('ADMIN_WEB_APP_URL', adminPanelWebAppUrl)

  const bot = new Telegraf(token)

  bot.catch((error) => {
    console.error('Telegram Shop bot runtime error:', error)
  })

  bot.start(async (context) => {
    await context.reply(
      'Добро пожаловать в Telegram Shop. Откройте Web App, чтобы выбрать город и начать покупки.',
      Markup.inlineKeyboard([
        [Markup.button.webApp('🛍 Открыть Telegram Shop', webAppUrl)],
      ]),
    )
  })

  bot.command('adminpanel420', async (context) => {
    await context.reply(
      'Войти в Web App Admin Panel',
      Markup.inlineKeyboard([
        [Markup.button.webApp('🔐 Войти в Web App Admin Panel', adminPanelWebAppUrl)],
      ]),
    )
  })

  await bot.telegram.getMe()
  const webhookInfo = await bot.telegram.getWebhookInfo()
  if (webhookInfo.url) {
    console.warn(`Detected active webhook (${webhookInfo.url}). Switching bot to polling mode.`)
    await bot.telegram.deleteWebhook()
  }
  await bot.launch({ dropPendingUpdates: true })
  console.log('Telegram Shop bot started')

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

startBot().catch((error) => {
  console.error('Telegram Shop bot failed to start:', error)
  process.exit(1)
})
