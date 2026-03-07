import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) throw new Error('Missing TELEGRAM_TOKEN env var');

const bot: TelegramBot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: true,
});

bot.on('message', async (message: TelegramBot.Message): Promise<void> => {});

import { randomUUID } from 'crypto';
import axios from 'axios';

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
    type: 'attachment';
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

const mediaGroups = new Map<string, Post>();
const pendingPosts = new Map<string, Post>();

function extractUrlsFromText(text: string, entities?: TelegramBot.MessageEntity[]): string[] {
    const urls: string[] = [];

    if (!entities || !text) return urls;

    entities.forEach((entity) => {
        if (entity.type === 'text_link' && entity.url) {
            urls.push(entity.url);
        } else if (entity.type === 'url') {
            const url = text.substring(entity.offset, entity.offset + entity.length);
            urls.push(url);
        }
    });

    return [...new Set(urls)];
}

function detectMediaTypeFromUrl(url: string): {
    type: MediaType | null;
    mime: string;
    ext: string;
} {
    const urlLower = url.toLowerCase();

    const imageExts: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
    };

    const videoExts: Record<string, string> = {
        mp4: 'video/mp4',
    };

    for (const [ext, mime] of Object.entries(imageExts)) {
        if (urlLower.includes(`.${ext}`) || urlLower.includes(`.${ext}?`)) {
            return { type: 'image', mime, ext };
        }
    }

    for (const [ext, mime] of Object.entries(videoExts)) {
        if (urlLower.includes(`.${ext}`) || urlLower.includes(`.${ext}?`)) {
            return { type: 'video', mime, ext };
        }
    }

    return { type: null, mime: '', ext: '' };
}

function getFileNameFromUrl(url: string, defaultName: string = 'file'): string {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();

        if (filename && filename.includes('.')) {
            return decodeURIComponent(filename);
        }

        const domain = urlObj.hostname.replace('www.', '');
        return `${domain}_${Date.now()}`;
    } catch {
        return defaultName;
    }
}

async function isUrlAccessible(url: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch {
        return false;
    }
}

async function getMimeTypeFromUrl(url: string): Promise<string> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.headers.get('content-type') || '';
    } catch {
        return '';
    }
}

function buildPost(text: string, entities?: TelegramBot.MessageEntity[]): Post {
    return {
        id: randomUUID(),
        text: text || '',
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
                name: message.video.file_name || 'video.mp4',
                mime: message.video.mime_type || 'video/mp4',
            };
        }

        if (message.document) {
            const url = await bot.getFileLink(message.document.file_id);

            return {
                type: 'document',
                url: url.toString(),
                name: message.document.file_name || 'file',
                mime: message.document.mime_type || 'application/octet-stream',
            };
        }

        return null;
    } catch (err) {
        console.error('Media extract error', err);
        return null;
    }
}

async function processUrlsToMedia(
    urls: string[],
    existingMedia: NormalizedMedia[],
): Promise<NormalizedMedia[]> {
    const newMedia: NormalizedMedia[] = [];

    for (const url of urls) {
        const exists =
            existingMedia.some((m) => m.url === url) || newMedia.some((m) => m.url === url);
        if (exists) continue;

        const isAccessible = await isUrlAccessible(url);
        if (!isAccessible) {
            console.log(`URL недоступен: ${url}`);
            continue;
        }

        const { type, mime, ext } = detectMediaTypeFromUrl(url);

        if (type) {
            let finalMime = mime;
            if (!finalMime) {
                finalMime = await getMimeTypeFromUrl(url);
            }

            newMedia.push({
                type,
                url,
                name: getFileNameFromUrl(url, `file.${ext || 'bin'}`),
                mime: finalMime || mime || 'application/octet-stream',
            });
        } else {
            newMedia.push({
                type: 'link',
                url,
                name: getFileNameFromUrl(url, 'link'),
                mime: 'text/html',
                source: 'text_link',
            });
        }
    }

    return newMedia;
}

async function normalizeTelegramPost(post: Post): Promise<NormalizedPost> {
    const media: NormalizedMedia[] = [...post.media];

    if (post.urls && post.urls.length > 0) {
        const urlMedia = await processUrlsToMedia(post.urls, media);
        media.push(...urlMedia);
    }

    return {
        text: post.text,
        media,
    };
}

function getFileInfo(url: string, fallback: string): { name: string; ext: string; mime: string } {
    try {
        const clean = url.split('?')[0];
        const name = clean.split('/').pop() ?? fallback;
        const ext = name.split('.').pop() || '';

        const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            mp4: 'video/mp4',
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };

        return {
            name,
            ext,
            mime: mimeMap[ext] || 'application/octet-stream',
        };
    } catch {
        return {
            name: fallback,
            ext: '',
            mime: 'application/octet-stream',
        };
    }
}

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

function buildClickupComment(post: NormalizedPost, rootId: string): ClickupCommentPayload {
    const comment: ClickupNode[] = [];

    if (post.text) {
        const lines = post.text.split('\n');

        lines.forEach((line, i) => {
            if (line.length) {
                comment.push({ text: line });
            }

            if (i < lines.length - 1) {
                comment.push({ text: '\n' });
            }
        });
    }

    post.media.forEach((media, index) => {
        if (index > 0 || (post.text && post.text.length > 0)) {
            comment.push({ text: '\n' });
        }

        if (media.type === 'image') {
            const file = getFileInfo(media.url, media.name);

            comment.push({
                type: 'image',
                text: file.name,
                image: {
                    name: file.name,
                    title: file.name,
                    type: file.ext,
                    extension: media.mime || file.mime,
                    thumbnail_large: media.url,
                    thumbnail_medium: media.url,
                    thumbnail_small: media.url,
                    url: media.url,
                    uploaded: true,
                },
            });
        } else if (media.type === 'video') {
            const file = getFileInfo(media.url, media.name);

            comment.push({
                type: 'frame',
                text: file.name,
                frame: {
                    service: 'link',
                    url: media.url,
                    src: media.url,
                },
            });
        } else {
            comment.push({
                text: media.url,
                attributes: {
                    link: media.url,
                },
            });
        }
    });

    return {
        comment,
        root_parent_id: rootId,
        root_parent_type: 8,
        roomId: rootId,
        parent: rootId,
        type: 8,
        key: `8_${rootId}`,
        reactions: [],
    };
}

async function sendPostToClickUp(channelId: string, payload: ClickupCommentPayload) {
    console.log(`${channelId}:${JSON.stringify(payload, null, 2)}`);
    try {
        // Раскомментируйте для реальной отправки
        // await axios.post(`https://cu-proxy.bbcd.io/wrapper/channel-messages/${channelId}`, payload);
    } catch (err: any) {
        console.error('Error sending to ClickUp:', err.toString());
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
    } else {
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
