const http = require('http');

// Simple web server to satisfy Render's port check
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord bot is alive!');
}).listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ---------------------- CONFIGURATION ----------------------
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_USER_ID = process.env.YOUR_DISCORD_USER_ID; // Updated to match your Render variable name

// In-memory key database
const validBuyerKeys = new Set(); 

// Setup Gemini API
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Setup Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// ---------------------- COMMAND DEFINITIONS ----------------------
const commands = [
    new SlashCommandBuilder()
        .setName('generate-code')
        .setDescription('Generate a new buyer key (Format: buyer-XXXX-XXXX)'),
    new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Redeem your buyer license key')
        .addStringOption(opt => opt.setName('code').setDescription('Your buyer code').setRequired(true)),
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('Post the AI Ticket Creation embed in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Nuke and rebuild the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
];

// Helper: Generate Key
function createBuyerCode() {
    const p1 = Math.floor(1000 + Math.random() * 9000);
    const p2 = Math.floor(1000 + Math.random() * 9000);
    return `buyer-${p1}-${p2}`;
}

// ---------------------- BOT INITIALIZATION ----------------------
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully registered slash commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// ---------------------- INTERACTION HANDLER ----------------------
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // Command: /generate-code
        if (commandName === 'generate-code') {
            if (interaction.user.id !== ADMIN_USER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
            }
            const newKey = createBuyerCode();
            validBuyerKeys.add(newKey);
            return interaction.reply({ content: `**New Buyer Key Generated:** \`${newKey}\``, ephemeral: true });
        }

        // Command: /redeem
        if (commandName === 'redeem') {
            const inputCode = interaction.options.getString('code').trim();
            if (validBuyerKeys.has(inputCode)) {
                validBuyerKeys.delete(inputCode);
                return interaction.reply({ content: `Success! \`${inputCode}\` redeemed. Welcome, Buyer!`, ephemeral: true });
            } else {
                return interaction.reply({ content: 'Invalid or already redeemed key.', ephemeral: true });
            }
        }

        // Command: /setup-ticket
        if (commandName === 'setup-ticket') {
            const embed = new EmbedBuilder()
                .setTitle('AI Support Desk')
                .setDescription('Click the button below to open a private ticket powered by Gemini AI.')
                .setColor(0x5865F2);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket')
                    .setLabel('Open Ticket')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
        }

        // Command: /nuke
        if (commandName === 'nuke') {
            if (interaction.user.id !== ADMIN_USER_ID && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
            }

            const currentChannel = interaction.channel;
            const position = currentChannel.position;

            await interaction.reply({ content: 'Nuking channel...' });
            
            const newChannel = await currentChannel.clone();
            await currentChannel.delete();
            await newChannel.setPosition(position);
            await newChannel.send('💥 **Channel Nuked and Rebuilt!**');
            return;
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'create_ticket') {
            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            await ticketChannel.send(`Welcome <@${interaction.user.id}>! Describe your issue below, and our **Gemini AI Assistant** will reply automatically.`);
            return interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
        }
    }
});

// ---------------------- GEMINI AI TICKET RESPONSE ----------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.channel.name.startsWith('ticket-')) {
        try {
            await message.channel.sendTyping();
            const result = await aiModel.generateContent(message.content);
            const responseText = result.response.text();

            const reply = responseText.length > 2000 ? responseText.slice(0, 1997) + '...' : responseText;
            await message.reply(reply);
        } catch (err) {
            console.error('Gemini Error:', err);
            await message.reply('⚠️ Unable to query Gemini AI service at this time.');
        }
    }
});

client.login(TOKEN);
