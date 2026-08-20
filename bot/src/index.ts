import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-app-url.com';

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  void bot.sendMessage(chatId, '🛍 Добро пожаловать в магазин!', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🛍 Открыть магазин',
            web_app: { url: WEBAPP_URL },
          },
        ],
      ],
    },
  });
});

bot.onText(/\/help/, (msg) => {
  void bot.sendMessage(
    msg.chat.id,
    '📋 Доступные команды:\n/start — открыть магазин\n/help — помощь'
  );
});

console.log('Bot started');
