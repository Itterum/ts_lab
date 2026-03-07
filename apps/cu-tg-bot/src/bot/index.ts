import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { Post, TelegramMedia } from './types';

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) throw new Error('Missing TELEGRAM_TOKEN env var');

const bot: TelegramBot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: true,
});

const CHANNELS = [
    {
        name: 'TEST CRM',
        listId: '6-901808797194-8',
    },
];

function buildChannelsKeyboard(postId: string) {
    return {
        inline_keyboard: CHANNELS.map((channel) => [
            {
                text: channel.name,
                callback_data: `${postId}:${channel.listId}`,
            },
        ]),
    };
}

const mediaGroups = new Map<string, Post>();
const pendingPosts = new Map<string, Post>();

function extractMedia(message: TelegramBot.Message): TelegramMedia[] {
    const media: TelegramMedia[] = [];

    if (message.photo) {
        const largestPhoto = message.photo[message.photo.length - 1];
        media.push({ type: 'photo', data: [largestPhoto] });
    }

    if (message.video) media.push({ type: 'video', data: message.video });
    if (message.audio) media.push({ type: 'audio', data: message.audio });
    if (message.voice) media.push({ type: 'voice', data: message.voice });
    if (message.document) media.push({ type: 'document', data: message.document });

    return media;
}

function buildPost(message: TelegramBot.Message): Post {
    return {
        id: randomUUID(),

        text: message.text ?? message.caption ?? null,
        entities: message.entities ?? message.caption_entities ?? [],

        media: extractMedia(message),

        chatId: message.chat.id,
        messageId: message.message_id,
        date: message.date,
    };
}

bot.on('message', async (message: TelegramBot.Message): Promise<void> => {
    const chatId = message.chat.id;

    if (!message.forward_from_chat) return;

    const mediaGroupId = message.media_group_id;

    if (mediaGroupId) {
        let post = mediaGroups.get(mediaGroupId);

        if (!post) {
            post = buildPost(message);
            mediaGroups.set(mediaGroupId, post);
        }

        post.media.push(...extractMedia(message));

        setTimeout(async () => {
            const readyPost = mediaGroups.get(mediaGroupId);
            if (!readyPost) return;

            pendingPosts.set(readyPost.id, { ...readyPost });
            mediaGroups.delete(mediaGroupId);

            console.log('TG POST\n', JSON.stringify(readyPost, null, 2));

            await bot.sendMessage(chatId, 'Выберите канал для отправки:', {
                reply_markup: buildChannelsKeyboard(readyPost.id),
            });
        }, 1000);
    }

    if (!mediaGroupId) {
        const post = buildPost(message);

        pendingPosts.set(post.id, {
            ...post,
        });

        console.log('TG POST:\n', JSON.stringify(post, null, 2));

        await bot.sendMessage(chatId, 'Выберите канал для отправки:', {
            reply_markup: buildChannelsKeyboard(post.id),
        });
    }
});

bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;

    if (!message || !data) return;

    const chatId = message.chat.id;
    const [postId, channelListId] = data.split(':');

    const post = pendingPosts.get(postId);

    if (!post) {
        await bot.sendMessage(chatId, 'Пост не найден или истек срок хранения');
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (channelListId) {
        try {
            const payload = buildClickupComment(normalized, channelListId);

            await sendPostToClickUp(channelListId, payload);

            await bot.sendMessage(chatId, '✅ Пост успешно отправлен в ClickUp');

            pendingPosts.delete(postId);
        } catch (error: any) {
            console.error('Ошибка при отправке в ClickUp:', error);
            await bot.sendMessage(chatId, `❌ Ошибка при отправке: ${error.message}`);
        }
    }

    await bot.answerCallbackQuery(callbackQuery.id);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

console.log('Бот запущен и готов к работе');

export default bot;
