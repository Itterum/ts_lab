import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import TelegramBot, { MessageEntity } from 'node-telegram-bot-api';
import {
    ClickupAttachmentNode,
    ClickupAttribute,
    ClickupCommentPayload,
    ClickupImageAttachmentNode,
    ClickupNode,
    ClickupTextNode,
    Post,
    TelegramMedia,
} from './types';

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

async function getFileUrl(fileId: string) {
    try {
        return await bot.getFileLink(fileId);
    } catch (error: any) {
        console.error('Ошибка при отправке в ClickUp:', error);
    }
}

function mapTelegramEntityToClickUpAttributes(
    entity: MessageEntity,
    entityText?: string,
): ClickupAttribute {
    const attributes: ClickupAttribute = {};

    switch (entity.type) {
        case 'bold':
            attributes.bold = true;
            break;
        case 'italic':
            attributes.italic = true;
            break;
        case 'underline':
            attributes.underline = true;
            break;
        case 'strikethrough':
            attributes.strike = true;
            break;
        case 'code':
        case 'pre':
            attributes.code = true;
            break;
        case 'text_link':
            attributes.link = entity.url;
            break;
        case 'url':
            attributes.link = entityText;
            break;
    }

    return attributes;
}

function processTextWithEntities(text: string, entities: MessageEntity[]): ClickupTextNode[] {
    if (!text) return [];

    const nodes: ClickupTextNode[] = [];

    const sortedEntities = [...entities].sort((a, b) => a.offset - b.offset);

    const formattedSections: {
        start: number;
        end: number;
        attributes: ClickupAttribute;
    }[] = [];

    for (const entity of sortedEntities) {
        const entityText = text.substring(entity.offset, entity.offset + entity.length);
        const attributes = mapTelegramEntityToClickUpAttributes(entity, entityText);

        const existingSection = formattedSections.find(
            (s) => s.start === entity.offset && s.end === entity.offset + entity.length,
        );

        if (existingSection) {
            existingSection.attributes = {
                ...existingSection.attributes,
                ...attributes,
            };
        } else {
            formattedSections.push({
                start: entity.offset,
                end: entity.offset + entity.length,
                attributes,
            });
        }
    }

    formattedSections.sort((a, b) => a.start - b.start);

    let currentPosition = 0;

    const generateBlockId = () => `block-${randomUUID().substring(0, 10)}`;

    for (const section of formattedSections) {
        if (section.start > currentPosition) {
            const plainText = text.substring(currentPosition, section.start);
            if (plainText) {
                const lines = plainText.split('\n');
                lines.forEach((line, i) => {
                    if (line) {
                        nodes.push({
                            text: line,
                            attributes: {
                                'block-id': generateBlockId(),
                            },
                        });
                    }
                    if (i < lines.length - 1) {
                        nodes.push({
                            text: '\n',
                            attributes: {
                                'block-id': generateBlockId(),
                            },
                        });
                    }
                });
            }
        }

        const sectionText = text.substring(section.start, section.end);

        const attributesWithBlockId = {
            ...section.attributes,
            'block-id': generateBlockId(),
        };

        const lines = sectionText.split('\n');
        lines.forEach((line, i) => {
            if (line) {
                nodes.push({
                    text: line,
                    attributes: attributesWithBlockId,
                });
            }
            if (i < lines.length - 1) {
                nodes.push({
                    text: '\n',
                    attributes: {
                        'block-id': generateBlockId(),
                    },
                });
            }
        });

        currentPosition = section.end;
    }

    if (currentPosition < text.length) {
        const remainingText = text.substring(currentPosition);
        if (remainingText) {
            const lines = remainingText.split('\n');
            lines.forEach((line, i) => {
                if (line) {
                    nodes.push({
                        text: line,
                        attributes: {
                            'block-id': generateBlockId(),
                        },
                    });
                }
                if (i < lines.length - 1) {
                    nodes.push({
                        text: '\n',
                        attributes: {
                            'block-id': generateBlockId(),
                        },
                    });
                }
            });
        }
    }

    return nodes;
}

async function buildClickUpComment(post: Post): Promise<ClickupCommentPayload> {
    const comment: ClickupNode[] = [];

    if (post.text) {
        const textNodes = processTextWithEntities(post.text, post.entities || []);
        comment.push(...textNodes);
    } else {
        comment.push({ text: '' });
    }

    if (post.media && post.media.length > 0) {
        if (post.text) {
            comment.push({
                text: '\n',
                attributes: {
                    'block-id': `block-${randomUUID().substring(0, 10)}`,
                },
            });
        }

        for (let i = 0; i < post.media.length; i++) {
            const media = post.media[i];

            let fileData;
            if (Array.isArray(media.data)) {
                fileData =
                    media.type === 'photo' ? media.data[media.data.length - 1] : media.data[0];
            } else {
                fileData = media.data;
            }

            try {
                if (media.type === 'photo') {
                    const fileUrl = await getFileUrl(fileData.file_id);

                    if (!fileUrl) continue;

                    const attachmentNode: ClickupImageAttachmentNode = {
                        type: 'image',
                        text: '',
                        image: {
                            name: `photo_${i + 1}.jpg`,
                            title: `Photo ${i + 1}`,
                            type: 'image/jpeg',
                            extension: 'jpg',
                            url: fileUrl,
                            uploaded: true,
                        },
                    };
                    comment.push(attachmentNode);
                }

                if (media.type === 'video') {
                    const fileUrl = await getFileUrl(fileData.file_id);

                    if (!fileUrl) continue;

                    const attachmentNode: ClickupAttachmentNode = {
                        type: 'attachment',
                        text: '',
                        attachment: {
                            name: fileData.file_name || `video_${i + 1}.mp4`,
                            title: `Video ${i + 1}`,
                            type: fileData.mime_type || 'video/mp4',
                            extension: 'mp4',
                            url: fileUrl,
                            uploaded: true,
                        },
                    };
                    comment.push(attachmentNode);
                }

                if (media.type === 'document') {
                    const fileUrl = await getFileUrl(fileData.file_id);

                    if (!fileUrl) continue;

                    const attachmentNode: ClickupAttachmentNode = {
                        type: 'attachment',
                        text: '',
                        attachment: {
                            name: fileData.file_name || `document_${i + 1}.pdf`,
                            title: `Document ${i + 1}`,
                            type: fileData.mime_type || 'application/octet-stream',
                            extension: fileData.file_name?.split('.').pop() || 'bin',
                            url: fileUrl,
                            uploaded: true,
                        },
                    };
                    comment.push(attachmentNode);
                }

                if (i < post.media.length - 1) {
                    comment.push({
                        text: '\n',
                        attributes: {
                            'block-id': `block-${randomUUID().substring(0, 10)}`,
                        },
                    });
                }
            } catch (error) {
                console.error(`Ошибка при получении URL для медиа ${i + 1}:`, error);
                comment.push({
                    text: `[Ошибка загрузки ${media.type}]`,
                });
            }
        }
    }

    return { comment };
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
        } else {
            const newMedia = extractMedia(message);

            const existingTypes = new Set(
                post.media.map((m) =>
                    Array.isArray(m.data) ? m.data[0]?.file_id : m.data?.file_id,
                ),
            );

            const uniqueNewMedia = newMedia.filter((m) => {
                const fileId = Array.isArray(m.data) ? m.data[0]?.file_id : m.data?.file_id;
                return !existingTypes.has(fileId);
            });

            post.media.push(...uniqueNewMedia);
        }

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
            const payload = await buildClickUpComment(post);

            console.log(JSON.stringify(payload, null, 2));

            // await sendPostToClickUp(channelListId, payload);

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
