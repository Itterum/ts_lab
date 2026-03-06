import { Message } from 'node-telegram-bot-api';
import bot from '../main';

bot.onText(/second/, async (message: Message) => {
    const chatId = message.chat.id;

    await bot.sendMessage(chatId, 'test-second');
});
