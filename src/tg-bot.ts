import {Telegraf, Context} from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';

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

// Helper to fetch ClickUp lists (channels)
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

// When a forwarded message arrives
bot.on('message', async (ctx) => {
    const msg = ctx.message;

    const lists = await getClickUpLists();
    const keyboard = {
        inline_keyboard: lists.map((l: any) => [
            {text: l.name, callback_data: `post_${l.id}`},
        ]),
    };

    await ctx.reply('Choose ClickUp channel to publish:', {reply_markup: keyboard});
});

bot.action(/post_(.+)/, async (ctx) => {
    const listId = ctx.match[1];
    const callbackQuery = ctx.callbackQuery;
    console.log(callbackQuery);
    const botMessage = callbackQuery.message;
    console.log(botMessage);
    let textToSend = '';

    if (botMessage && 'reply_to_message' in botMessage && botMessage.reply_to_message) {
        const originalMsg = botMessage.reply_to_message;
        if ('text' in originalMsg) {
            textToSend = originalMsg.text;
        }
    }

    await ctx.answerCbQuery('Отправляю...');

    try {
        // 1. Ищем ID чата для этого листа
        const chatId = await getClickUpChannelId(listId);

        if (!chatId) {
            return ctx.editMessageText('В этом листе не найден чат. Сначала создайте Chat View в ClickUp.');
        }

        // 2. Отправляем сообщение в чат
        await axios.post(
            `https://api.clickup.com/api/v3/workspaces/${WORKSPACE_ID}/chat/channels/${chatId}/messages`,
            {
                'type': 'message',
                'content_format': 'text/md',
                'content': textToSend
            },
            {headers: {'Authorization': CLICK_UP_TOKEN}}
        );

        await ctx.editMessageText(`✅ Сообщение успешно отправлено в чат листа!`);
    } catch (error) {
        console.error('Ошибка при отправке в ClickUp:', error);
        await ctx.reply('Ошибка при отправке сообщения в ClickUp.');
    }
});

async function getClickUpChannelId(listId: any) {
    const url = `https://api.clickup.com/api/v3/workspaces/${WORKSPACE_ID}/chat/channels/location`;
    const res = await axios.post(url, {
        location: {
            id: listId,
            type: 'list' // Можно менять на "folder" или "space" [web:56]
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