import TelegramBot, { MessageEntity } from 'node-telegram-bot-api';

const bot: TelegramBot = new TelegramBot('', {
    polling: true,
});

type Post = {
    media_group_id?: string;
    text?: string;
    photos: string[];
};
const mediaGroups = new Map<string, Post>();

function escapeMarkdown(text: string): string {
    return text.replace(/([_*[\]()~`>#+-=|{}.!\\])/g, '\\$1');
}

function formatTextToMarkdown(text: string, entities?: MessageEntity[]): string {
    if (!entities?.length) return escapeMarkdown(text);

    let result = text;

    const sorted = [...entities].sort((a, b) => b.offset - a.offset);

    for (const entity of sorted) {
        const { offset, length, type } = entity;
        const originalPart = result.slice(offset, offset + length);
        const part = escapeMarkdown(originalPart);

        let replacement = part;

        switch (type) {
            case 'bold':
                replacement = `**${part}**`;
                break;

            case 'italic':
                replacement = `*${part}*`;
                break;

            case 'code':
                replacement = `\`${originalPart}\``;
                break;

            case 'text_link':
                replacement = `[${part}](${entity.url})`;
                break;

            case 'url':
                replacement = `[${part}](${originalPart})`;
                break;
        }

        result = result.slice(0, offset) + replacement + result.slice(offset + length);
    }

    return result;
}

bot.onText(/\/help/, async (message: TelegramBot.Message): Promise<void> => {
    await bot.sendMessage(
        message.chat.id,
        '/subscribe surname.name (Как указано в кликапе)\n' +
            '/unsubscribe surname.name (Как указано в кликапе)',
    );
});

bot.on('message', async (message: TelegramBot.Message): Promise<void> => {
    const chatId: number = message.chat.id;

    if (message.forward_from_chat) {
        const mediaGroupId = message.media_group_id;
        const rawText = message.text || message.caption;

        const formattedText = rawText
            ? formatTextToMarkdown(rawText, message.entities || message.caption_entities)
            : undefined;

        if (mediaGroupId) {
            let post = mediaGroups.get(mediaGroupId);

            if (!post) {
                post = {
                    media_group_id: mediaGroupId,
                    text: formattedText,
                    photos: [],
                };
                mediaGroups.set(mediaGroupId, post);
            }

            if (message.photo?.length) {
                const fileId = message.photo[message.photo.length - 1].file_id;

                try {
                    const fileLink = await bot.getFileLink(fileId);
                    await bot.downloadFile(fileId, './images');

                    post.photos.push(fileLink);
                } catch (error: any) {
                    console.error('Error getting file link:', error.message);
                }
            }

            setTimeout(() => {
                const readyPost = mediaGroups.get(mediaGroupId);
                if (readyPost) {
                    console.log('FINAL POST:', readyPost);
                    mediaGroups.delete(mediaGroupId);
                }
            }, 500);
        } else {
            const post: Post = {
                text: formattedText,
                photos: [],
            };

            if (message.photo?.length) {
                const fileId = message.photo[message.photo.length - 1].file_id;

                try {
                    const fileLink = await bot.getFileLink(fileId);
                    await bot.downloadFile(fileId, './images');

                    post.photos.push(fileLink);
                } catch (error: any) {
                    console.error('Error getting file link:', error.message);
                }
            }

            console.log('SINGLE POST:', post);
        }
    }

    const user: string | null = '';
    if (user) {
        console.log(`[MESSAGE] CU@${user} : ${message}`);
    } else {
        console.log(
            `[MESSAGE] TG@${message.chat.username} : ${JSON.stringify(message).substring(0, 10)}`,
        );
    }
});

bot.onText(/\/start/, async (message: TelegramBot.Message): Promise<void> => {
    const chatId: number = message.chat.id;
    const user: string | null = '';
    if (!user) {
        await bot.sendMessage(
            chatId,
            'Привет! Напиши, пожалуйста, своё имя в ClickUp!!! (surname.name)',
        );
    } else {
        await bot.sendMessage(chatId, `Привет! ${user}`);
    }
});

export default bot;
