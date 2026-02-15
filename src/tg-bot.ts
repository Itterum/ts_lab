import {Telegraf} from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
import {MediaGroup} from '@dietime/telegraf-media-group';
import {media_group} from '@dietime/telegraf-media-group';
import FormData from 'form-data';

dotenv.config();
// Environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CLICK_UP_TOKEN = process.env.CLICK_UP_TOKEN;
const WORKSPACE_ID = process.env.WORKSPACE_ID;

if (!TELEGRAM_TOKEN) {
    throw new Error('Missing TELEGRAM_TOKEN env var');
}
if (!CLICK_UP_TOKEN) {
    throw new Error('Missing CLICK_UP_TOKEN env var');
}
if (!WORKSPACE_ID) {
    throw new Error('Missing WORKSPACE_ID env var');
}

const bot = new Telegraf(TELEGRAM_TOKEN);

bot.use(new MediaGroup({timeout: 5000}).middleware());

bot.on(media_group(), async (ctx) => {
    // const msg = ctx.message;
    const lastPhoto = ctx.update.media_group[ctx.update.media_group.length - 1];
    const caption = lastPhoto.caption || '📷 Альбом фото';

    const lists = await getClickUpLists();
    const keyboard = {
        inline_keyboard: lists.map((l: any) => [
            {text: l.name, callback_data: `post_${l.id}`},
        ]),
    };

    await ctx.reply('Choose ClickUp channel to publish:', {
        reply_markup: keyboard,
        reply_parameters: {message_id: lastPhoto.message_id}
    });
});

bot.action(/post_(.+)/, async (ctx) => {
    const listId = ctx.match[1];
    const callbackMsg = ctx.callbackQuery.message;

    if (!callbackMsg || !('reply_to_message' in callbackMsg) || !callbackMsg.reply_to_message) {
        return ctx.answerCbQuery('Сообщение недоступно!');
    }

    const originalMsg = callbackMsg.reply_to_message as any;
    let fullContent = originalMsg.caption || originalMsg.text || '';

    if (originalMsg.forward_origin) {
        const channel = originalMsg.forward_origin.chat;
        fullContent += `\n\n🔗 Переслано из: ${channel.title || channel.username}`;
    }

    await ctx.answerCbQuery('Отправляю...');

    try {
        const chatId = await getClickUpChannelId(listId);
        if (!chatId) {
            return ctx.editMessageText('В этом листе не найден чат.');
        }

        const uploadForm = new FormData();
        // Если есть фото, скачиваем его и добавляем в форму
        if (originalMsg.photo && originalMsg.photo.length > 0) {
            const largestPhoto = originalMsg.photo[originalMsg.photo.length - 1];
            // Получаем прямую ссылку через getFile и ваш getTelegramPhotoUrl
            const photoUrl = await getTelegramPhotoUrl(largestPhoto.file_id);
            const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);

            uploadForm.append('attachment', buffer, {
                filename: `photo_${largestPhoto.file_id}.jpg`,
                contentType: 'image/jpeg',
            });
        }

        const uploadRes = await axios.post(
            `https://api.clickup.com/api/v3/workspaces/${WORKSPACE_ID}/files`,
            uploadForm,
            {
                headers: {
                    ...uploadForm.getHeaders(),
                    Authorization: CLICK_UP_TOKEN,
                },
            }
        );

        const fileId = uploadRes.data.data.id;

        await axios.post(
            `https://api.clickup.com/api/v3/workspaces/${WORKSPACE_ID}/chat/channels/${chatId}/messages`,
            {
                content: fullContent,
                context_type: 'text/md',
                attachments: [
                    {id: fileId}
                ]
            },
            {
                headers: {
                    'Authorization': CLICK_UP_TOKEN
                }
            }
        );

        await ctx.editMessageText(`✅ Сообщение с фото отправлено в ClickUp!`);
    } catch (error: any) {
        console.error('Ошибка:', error.response?.data || error.message);
        await ctx.reply('Произошла ошибка при отправке.');
    }
});

async function getTelegramPhotoUrl(fileId: string): Promise<string> {
    try {
        const file = await bot.telegram.getFile(fileId);
        return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
    } catch {
        return 'https://t.me/placeholder_photo.jpg';
    }
}

async function getClickUpLists() {
    const headers = {'Authorization': CLICK_UP_TOKEN};

    const spacesRes = await axios.get(`https://api.clickup.com/api/v2/team/${WORKSPACE_ID}/space`, {headers});
    const spaces = spacesRes.data.spaces;

    let allLists = [];

    for (const space of spaces) {
        const folderlessRes = await axios.get(`https://api.clickup.com/api/v2/space/${space.id}/list`, {headers});
        allLists.push(...folderlessRes.data.lists);

        const foldersRes = await axios.get(`https://api.clickup.com/api/v2/space/${space.id}/folder`, {headers});

        for (const folder of foldersRes.data.folders) {
            const folderListsRes = await axios.get(`https://api.clickup.com/api/v2/folder/${folder.id}/list`, {headers});
            allLists.push(...folderListsRes.data.lists);
        }
    }

    return allLists.map(list => ({id: list.id, name: list.name}));
}

async function getClickUpChannelId(listId: any) {
    const url = `https://api.clickup.com/api/v3/workspaces/${WORKSPACE_ID}/chat/channels/location`;
    const res = await axios.post(url, {
        location: {
            id: listId,
            type: 'list'
        }
    }, {
        headers: {
            'Authorization': CLICK_UP_TOKEN,
            'Content-Type': 'application/json'
        }
    });

    return res.data.data.id; // Возвращает ID канала чата
}

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));