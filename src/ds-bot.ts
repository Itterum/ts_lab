// import {
//     Client,
//     GuildMember,
//     Intents,
//     Events
// } from 'discord.js';

// import {Player, QueryType} from 'discord-player';

// import dotenv from 'dotenv';

// dotenv.config();
// const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// const client = new Client({
//     intents: [
//         Intents.FLAGS.GUILD_VOICE_STATES,
//         Intents.FLAGS.GUILD_MESSAGES,
//         Intents.FLAGS.GUILDS
//     ]
// });

// client.on('ready', () => {
//     console.log('Bot is online!');
//     client.user.setActivity({
//         name: 'd_b',
//         type: 'LISTENING',
//     });
// });
// client.on('error', console.error);
// client.on('warn', console.warn);

// const player = new Player(client);

// player.on('error', (error: Error) => {
//     console.log(`[Error emitted from the queue: ${error.message}`);
// });

// client.on(Events.ClientReady, readyClient => {
//     console.log(`Logged in as ${readyClient.user.tag}!`);
// });

// client.on(Events.InteractionCreate, async interaction => {
//     if (!interaction.isChatInputCommand()) return;

//     if (interaction.commandName === 'ping') {
//         await interaction.reply('Pong!');
//     }
// });

// client.login(DISCORD_TOKEN);
