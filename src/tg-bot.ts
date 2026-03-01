import { Telegraf } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
import { MediaGroup, media_group } from '@dietime/telegraf-media-group';
import { chromium } from 'playwright';

dotenv.config();
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CLICK_UP_TOKEN = process.env.CLICK_UP_TOKEN;
const WORKSPACE_ID = process.env.WORKSPACE_ID;
if (!TELEGRAM_TOKEN) throw new Error('Missing TELEGRAM_TOKEN env var');
if (!CLICK_UP_TOKEN) throw new Error('Missing CLICK_UP_TOKEN env var');
if (!WORKSPACE_ID) throw new Error('Missing WORKSPACE_ID env var');

const bot = new Telegraf(TELEGRAM_TOKEN);
bot.use(new MediaGroup({ timeout: 5000 }).middleware());

async function downloadTelegramPhoto(fileId: string): Promise<Buffer | null> {
    if (!fileId) return null;
    try {
        const file = await bot.telegram.getFile(fileId);
        const url = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    } catch (e) {
        console.error('Failed to download photo', e);
        return null;
    }
}

async function getClickUpLists() {
    const headers = { Authorization: CLICK_UP_TOKEN };
    const spacesRes = await axios.get(`https://api.clickup.com/api/v2/team/${WORKSPACE_ID}/space`, { headers });
    const spaces = spacesRes.data.spaces;
    const allLists: any[] = [];
    for (const space of spaces) {
        const folderlessRes = await axios.get(`https://api.clickup.com/api/v2/space/${space.id}/list`, { headers });
        allLists.push(...folderlessRes.data.lists);
        const foldersRes = await axios.get(`https://api.clickup.com/api/v2/space/${space.id}/folder`, { headers });
        for (const folder of foldersRes.data.folders) {
            const folderListsRes = await axios.get(`https://api.clickup.com/api/v2/folder/${folder.id}/list`, { headers });
            allLists.push(...folderListsRes.data.lists);
        }
    }
    return allLists.map((l: any) => ({ id: l.id, name: l.name }));
}

async function getClickUpChannelId(listId: string): Promise<string | null> {
    const url = `https://api.clickup.com/api/v3/workspaces/${WORKSPACE_ID}/chat/channels/location`;
    try {
        const res = await axios.post(
            url,
            { location: { id: listId, type: 'list' } },
            { headers: { Authorization: CLICK_UP_TOKEN, 'Content-Type': 'application/json' } }
        );
        return res.data.data.id;
    } catch (e) {
        console.error('Error getting channel ID', e);
        return null;
    }
}

async function sendPostToClickUp(chatId: string, telegramPost: { text?: string; photo?: any[] }) {
    const context = await chromium.launchPersistentContext('./clickup-auth.json', { headless: true });
    const page = await context.newPage();
    await page.goto(`https://app.clickup.com/chat/${chatId}`);
    await page.waitForSelector('[data-testid="chat-input"]');
    if (telegramPost.text) {
        await page.fill('[data-testid="chat-input"]', telegramPost.text);
    }
    if (telegramPost.photo && telegramPost.photo.length > 0) {
        const buffer = await downloadTelegramPhoto(telegramPost.photo[0].file_id);
        if (buffer) {
            const fileInput = page.locator('input[type="file"]');
            await fileInput.setInputFiles([{ name: 'photo.jpg', mimeType: 'image/jpeg', buffer }]);
        }
    }
    await page.click('[data-testid="send-message-button"]');
    await context.close();
}

bot.on(media_group(), async (ctx) => {
    const lastPhoto = ctx.update.media_group[ctx.update.media_group.length - 1];
    const caption = lastPhoto.caption || '📷 Альбом фото';
    const lists = await getClickUpLists();
    const keyboard = { inline_keyboard: lists.map((l) => [{ text: l.name, callback_data: `post_${l.id}` }]) };
    await ctx.reply('Choose ClickUp channel to publish:', {
        reply_markup: keyboard,
        reply_parameters: { message_id: lastPhoto.message_id },
    });
});

bot.action(/post_(.+)/, async (ctx) => {
    const listId = ctx.match[1];
    const callbackMsg = ctx.callbackQuery?.message;
    if (!callbackMsg || !('reply_to_message' in callbackMsg) || !callbackMsg.reply_to_message) {
        return ctx.answerCbQuery('Сообщение недоступно!');
    }
    const originalMsg: any = callbackMsg.reply_to_message;
    let fullContent = originalMsg.caption || originalMsg.text || '';
    if (originalMsg.forward_origin) {
        const channel = originalMsg.forward_origin.chat;
        fullContent += `\n\n🔗 Переслано из: ${channel.title ?? channel.username}`;
    }
    await ctx.answerCbQuery('Отправляю...');
    try {
        const chatId = await getClickUpChannelId(listId);
        if (!chatId) return ctx.editMessageText('В этом листе не найден чат.');
        await sendPostToClickUp(chatId, { text: fullContent, photo: originalMsg.photo });
        await ctx.editMessageText('✅ Сообщение с фото отправлено в ClickUp!');
    } catch (error: any) {
        console.error('Ошибка:', error.response?.data || error.message);
        await ctx.reply('Произошла ошибка при отправке.');
    }
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
