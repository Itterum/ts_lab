import { Message } from 'node-telegram-bot-api';
import bot from '../main';

bot.onText(/first/, async (message: Message) => {
    const chatId = message.chat.id;

    await bot.sendMessage(chatId, 'test-first');
});
import axios from 'axios';
import { randomUUID } from 'crypto';
import TelegramBot, { MessageEntity } from 'node-telegram-bot-api';

type Post = {
    id: string;
    text: string;
    entities?: MessageEntity[];
    photos: string[];
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

type ClickupImageNode = {
    type: 'image';
    text: string;
    image: {
        name: string;
        title: string;
        type: string;
        extension: string;
        thumbnail_large: string;
        thumbnail_medium: string;
        thumbnail_small: string;
        url: string;
        uploaded: true;
    };
};

type ClickupNode = ClickupTextNode | ClickupImageNode;

type ClickupCommentPayload = {
    comment: ClickupNode[];
    root_parent_id: string;
    root_parent_type: number;
    roomId: string;
    parent: string;
    type: number;
    key: string;
    reactions: unknown[];
};

function buildPost(text: string, entities?: TelegramBot.MessageEntity[]): Post {
    return {
        id: randomUUID(),
        text,
        entities,
        photos: [],
    };
}

function normalizeTelegramPost(post: Post): NormalizedPost {
    const media: NormalizedMedia[] = post.photos.map((url, i) => {
        const clean = url.split('?')[0];
        const name = clean.split('/').pop() ?? `file_${i}.jpg`;
        const ext = name.split('.').pop() ?? 'jpg';

        return {
            type: 'image',
            url,
            name,
            mime: `image/${ext}`,
        };
    });

    return {
        text: post.text,
        media,
    };
}

function getFileInfo(url: string, fallback: string) {
    const clean = url.split('?')[0];
    const name = clean.split('/').pop() ?? fallback;
    const ext = name.split('.').pop() ?? 'jpg';

    return {
        name,
        ext,
        mime: `image/${ext}`,
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

    post.media.forEach((media) => {
        comment.push({ text: '\n' });

        if (media.type === 'image') {
            const file = getFileInfo(media.url, media.name);

            comment.push({
                type: 'image',
                text: file.name,
                image: {
                    name: file.name,
                    title: file.name,
                    type: file.ext,
                    extension: media.mime,
                    thumbnail_large: media.url,
                    thumbnail_medium: media.url,
                    thumbnail_small: media.url,
                    url: media.url,
                    uploaded: true,
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

bot.on('message', async (message: TelegramBot.Message): Promise<void> => {
    const chatId = message.chat.id;
    console.log(message);
    if (!message.forward_from_chat) return;

    const mediaGroupId = message.media_group_id;
    const rawText = message.text || message.caption;
    const entities = message.entities || message.caption_entities;

    if (mediaGroupId) {
        let post = mediaGroups.get(mediaGroupId);

        if (!post) {
            post = buildPost(rawText || '', entities);
            mediaGroups.set(mediaGroupId, post);
        }

        if (message.photo?.length) {
            const fileId = message.photo[message.photo.length - 1].file_id;

            try {
                const fileLink = await bot.getFileLink(fileId);

                post.photos.push(fileLink);
            } catch (error: any) {
                console.error('Error getting file link:', error.message);
            }
        }

        setTimeout(async () => {
            const readyPost = mediaGroups.get(mediaGroupId);
            if (!readyPost) return;

            pendingPosts.set(readyPost.id, readyPost);

            mediaGroups.delete(mediaGroupId);

            await bot.sendMessage(chatId, 'Please choose an option:', {
                reply_markup: buildChannelsKeyboard(readyPost.id),
            });
        }, 500);
    } else {
        const post: Post = buildPost(rawText || '', entities);

        if (message.photo?.length) {
            const fileId = message.photo[message.photo.length - 1].file_id;

            try {
                const fileLink = await bot.getFileLink(fileId);

                post.photos.push(fileLink);
            } catch (error: any) {
                console.error('Error getting file link:', error.message);
            }
        }

        pendingPosts.set(post.id, post);
        await bot.sendMessage(chatId, 'Please choose an option:', {
            reply_markup: buildChannelsKeyboard(post.id),
        });
    }
});

async function sendPostToClickUp(channelId: string, payload: ClickupCommentPayload) {
    console.log(`${channelId}:${JSON.stringify(payload)}`);
    try {
    } catch (err: any) {
        console.error(err.toString());
    }
}

bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    if (!message || !data) return;
    const chatId = message.chat.id;

    const [postId, channelListId] = data.split(':');
    const post = pendingPosts.get(postId);

    if (!post) {
        await bot.sendMessage(chatId, 'Post not found or expired');
        return;
    }

    if (channelListId) {
        const normalized = normalizeTelegramPost(post);

        const payload = buildClickupComment(normalized, channelListId);
        await sendPostToClickUp(channelListId, payload);
        await bot.sendMessage(chatId, 'I sending you post to clickup channel');
        pendingPosts.delete(postId);
    }

    await bot.answerCallbackQuery(callbackQuery.id);
});

export default bot;
