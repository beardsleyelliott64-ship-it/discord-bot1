const http = require('http');

// Web server to satisfy Render's port check
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord bot is alive!');
}).listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

const { 
    Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, 
    ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, 
    REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ---------------------- CONFIGURATION ----------------------
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_USER_ID = process.env.YOUR_DISCORD_USER_ID;

// In-memory key database
const validBuyerKeys = new Set(); 

// Setup Gemini API
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const aiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Setup Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// ---------------------- ALL COMMAND DEFINITIONS ----------------------
const commands = [
    // General & Setup Panels
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get information about a user')
        .addUserOption(opt => opt.setName('target').setDescription('The user').setRequired(false)),
    new SlashCommandBuilder()
        .setName('setup-redeem')
        .setDescription('Post the key redemption panel in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('Post the AI Ticket Creation embed in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Code & Key Management
    new SlashCommandBuilder()
        .setName('generate-code')
        .setDescription('Generate a new buyer key (Format: buyer-XXXX-XXXX)'),
    new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Redeem your buyer license key via slash command')
        .addStringOption(opt => opt.setName('code').setDescription('Your buyer code').setRequired(true)),

    // Moderation & Admin
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete bulk messages')
        .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(opt => opt.setName('target').setDescription('User to kick').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for kick'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(opt => opt.setName('target').setDescription('User to ban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for ban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
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
        console.log('Successfully registered all slash commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// ---------------------- INTERACTION HANDLER ----------------------
client.on('interactionCreate', async (interaction) => {

    // 1. Slash Command Processing
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // Command: /ping
        if (commandName === 'ping') {
            return interaction.reply({ content: `Pong! Latency: ${client.ws.ping}ms`, ephemeral: true });
        }

        // Command: /userinfo
        if (commandName === 'userinfo') {
            const user = interaction.options.getUser('target') || interaction.user;
            const member = await interaction.guild.members.fetch(user.id);
            const embed = new EmbedBuilder()
                .setTitle(`User Info - ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: 'ID', value: user.id, inline: true },
                    { name: 'Joined Server', value: member.joinedAt ? member.joinedAt.toDateString() : 'Unknown', inline: true }
                )
                .setColor(0x5865F2);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Command: /setup-redeem
        if (commandName === 'setup-redeem') {
            const embed = new EmbedBuilder()
                .setTitle('🔑 License Key Redemption')
                .setDescription('Click the button below to redeem your buyer license key.')
                .setColor(0x2F3136);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_redeem_modal')
                    .setLabel('Redeem Key')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: 'Redemption panel created!', ephemeral: true });
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

        // Command: /generate-code
        if (commandName === 'generate-code') {
            if (interaction.user.id !== ADMIN_USER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
            }
            const newKey = createBuyerCode();
            validBuyerKeys.add(newKey);
            return interaction.reply({ content: `**New Buyer Key Generated:** \`${newKey}\``, ephemeral: true });
        }

        // Command: /redeem (Slash command alternative)
        if (commandName === 'redeem') {
            const inputCode = interaction.options.getString('code').trim();
            if (validBuyerKeys.has(inputCode)) {
                validBuyerKeys.delete(inputCode);
                const buyerRole = interaction.guild.roles.cache.find(r => r.name === 'Buyer');
                if (buyerRole) await interaction.member.roles.add(buyerRole);
                return interaction.reply({ content: `Success! \`${inputCode}\` redeemed. Welcome, Buyer!`, ephemeral: true });
            } else {
                return interaction.reply({ content: 'Invalid or already redeemed key.', ephemeral: true });
            }
        }

        // Command: /purge
        if (commandName === 'purge') {
            const amount = interaction.options.getInteger('amount');
            if (amount < 1 || amount > 100) return interaction.reply({ content: 'Amount must be between 1 and 100.', ephemeral: true });
            
            await interaction.channel.bulkDelete(amount, true);
            return interaction.reply({ content: `Deleted ${amount} messages.`, ephemeral: true });
        }

        // Command: /kick
        if (commandName === 'kick') {
            const target = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = await interaction.guild.members.fetch(target.id);

            await member.kick(reason);
            return interaction.reply({ content: `Kicked ${target.tag}. Reason: ${reason}` });
        }

        // Command: /ban
        if (commandName === 'ban') {
            const target = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = await interaction.guild.members.fetch(target.id);

            await member.ban({ reason });
            return interaction.reply({ content: `Banned ${target.tag}. Reason: ${reason}` });
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

    // 2. Button Interactions
    if (interaction.isButton()) {
        // Ticket Creation
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

        // Redeem Modal Button Trigger
        if (interaction.customId === 'open_redeem_modal') {
            const modal = new ModalBuilder()
                .setCustomId('redeem_modal')
                .setTitle('Redeem License Key');

            const keyInput = new TextInputBuilder()
                .setCustomId('key_input')
                .setLabel('Enter your buyer code')
                .setPlaceholder('buyer-XXXX-XXXX')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(keyInput);
            modal.addComponents(row);

            return await interaction.showModal(modal);
        }
    }

    // 3. Modal Form Submissions
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'redeem_modal') {
            const inputCode = interaction.fields.getTextInputValue('key_input').trim();

            if (validBuyerKeys.has(inputCode)) {
                validBuyerKeys.delete(inputCode);

                const buyerRole = interaction.guild.roles.cache.find(r => r.name === 'Buyer');
                if (buyerRole) {
                    await interaction.member.roles.add(buyerRole);
                }

                return interaction.reply({ 
                    content: `✅ **Success!** License \`${inputCode}\` redeemed. Your buyer role has been granted!`, 
                    ephemeral: true 
                });
            } else {
                return interaction.reply({ 
                    content: '❌ **Invalid Code:** That key is incorrect or has already been redeemed.', 
                    ephemeral: true 
                });
            }
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
