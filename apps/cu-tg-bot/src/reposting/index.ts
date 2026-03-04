import TelegramBot, { MessageEntity } from 'node-telegram-bot-api';

const bot: TelegramBot = new TelegramBot('', {
    polling: true,
});

type Post = Record<string, any>;
const mediaGroups = new Map<string, Post>();

function buildPost(text: string, entities?: MessageEntity[]): Post {
    const result = [];

    if (!entities) return {};

    for (const entity of entities) {
        const { offset, length } = entity;
        result.push(text.substring(offset, length));
    }

    return result;
}

bot.on('message', async (message: TelegramBot.Message): Promise<void> => {
    if (message.forward_from_chat) {
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

            setTimeout(() => {
                const readyPost = mediaGroups.get(mediaGroupId);
                if (readyPost) {
                    console.log('FINAL POST:', readyPost);

                    console.log('Send post: ', readyPost);
                    mediaGroups.delete(mediaGroupId);
                }
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

            console.log('SINGLE POST:', post);
        }
    }
});

export default bot;
