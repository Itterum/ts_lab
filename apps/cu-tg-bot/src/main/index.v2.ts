import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) throw new Error('Missing TELEGRAM_TOKEN env var');

const bot: TelegramBot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: true,
});

type Post = {
    id: string;
    text: string;
    entities?: TelegramBot.MessageEntity[];
    media: NormalizedMedia[];
};

type MediaType = 'image' | 'video' | 'document';

type NormalizedMedia = {
    type: MediaType;
    url: string;
    name: string;
    mime: string;
};

type NormalizedPost = {
    text: string;
    media: NormalizedMedia[];
};

type ClickupTextNode = {
    text: string;
    attributes?: {
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        link?: string;
    };
};

type ClickupAttachmentNode = {
    type: string;
    text: string;
    attachment: {
        name: string;
        title: string;
        type: string;
        extension: string;
        url: string;
        uploaded: true;
    };
};

type ClickupNode = ClickupTextNode | ClickupAttachmentNode;

type ClickupCommentPayload = {
    comment: ClickupNode[];
};

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

function buildPost(text: string, entities?: TelegramBot.MessageEntity[]): Post {
    return {
        id: randomUUID(),
        text: text,
        entities,
        media: [],
    };
}

async function extractMediaFromAttachment(
    message: TelegramBot.Message,
): Promise<NormalizedMedia | null> {
    try {
        if (message.photo?.length) {
            const fileId = message.photo[message.photo.length - 1].file_id;
            const url = await bot.getFileLink(fileId);

            return {
                type: 'image',
                url: url.toString(),
                name: 'photo.jpg',
                mime: 'image/jpeg',
            };
        }

        if (message.video) {
            const url = await bot.getFileLink(message.video.file_id);

            return {
                type: 'video',
                url: url.toString(),
                name: message.video.fil || 'video.mp4',
                mime: message.video.mime_type || 'video/mp4',
            };
        }

        if (message.document) {
            const url = await bot.getFileLink(message.document.file_id);

            return {
                type: 'document',
                url: url.toString(),
                name: message.document.file_name || '',
                mime: message.document.mime_type || '',
            };
        }

        return null;
    } catch (err) {
        console.error('Media extract error', err);
        return null;
    }
}

bot.on('message', async (message: TelegramBot.Message): Promise<void> => {
    const chatId = message.chat.id;
    console.log('Получено сообщение:', JSON.stringify(message, null, 2));

    if (!message.forward_from_chat) return;

    const mediaGroupId = message.media_group_id;
    const rawText = message.text || message.caption || '';
    const entities = message.entities || message.caption_entities;

    if (mediaGroupId) {
        let post = mediaGroups.get(mediaGroupId);

        if (!post) {
            post = buildPost(rawText, entities);
            mediaGroups.set(mediaGroupId, post);
        }

        const media = await extractMediaFromAttachment(message);

        if (media) {
            post.media.push(media);
        }

        setTimeout(async () => {
            const readyPost = mediaGroups.get(mediaGroupId);
            if (!readyPost) return;

            const normalized = await normalizeTelegramPost(readyPost);

            pendingPosts.set(readyPost.id, {
                ...readyPost,
                media: normalized.media,
            });

            mediaGroups.delete(mediaGroupId);

            await bot.sendMessage(chatId, 'Выберите канал для отправки:', {
                reply_markup: buildChannelsKeyboard(readyPost.id),
            });
        }, 1000);
    }

    if (!mediaGroupId) {
        const post = buildPost(rawText, entities);

        const media = await extractMediaFromAttachment(message);
        if (media) {
            post.media.push(media);
        }

        const normalized = await normalizeTelegramPost(post);

        pendingPosts.set(post.id, {
            ...post,
            media: normalized.media,
        });

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
            const normalized = await normalizeTelegramPost(post);

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
