const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits,
    SlashCommandBuilder,
    REST,
    Routes
} = require('discord.js');

const http = require('http');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- CONFIGURATION ---
const MEMBER_ROLE_ID = "1539945420501950535";      // Verification Role ID[cite: 6]
const SUPPORTER_ROLE_ID = "1540841149554499634";   // Role given upon code redemption[cite: 6]
const ANNOUNCEMENT_ROLE_ID = "123456789012345678"; // Announcement Role ID[cite: 6]

// Role IDs provided in exact order: Buyer, VIP, Server Booster[cite: 6]
const BUYER_ROLE_ID = "1542207847889375364";[cite: 6]
const VIP_ROLE_ID = "1542207848413667530";[cite: 6]
const BOOSTER_ROLE_ID = "1542207847004119192";[cite: 6]

// Role Names to Auto-Create if Missing[cite: 6]
const REQUIRED_ROLES = {
    BOOSTER: "Server Booster",
    BUYER: "Buyer",
    VIP: "VIP"
};

// Temporary in-memory storage for generated codes, stock, cooldowns, and log channels[cite: 6]
const validCodes = new Set();
const userWarnings = new Map(); // Simple mock warning system storage[cite: 6]
const tokenStock = []; // Array to hold loaded token objects { bearer, refresh }[cite: 6]
const cooldowns = new Map(); // Tracks user cooldown timestamps per token type[cite: 6]
const logChannels = new Map(); // Stores category-specific log channel IDs per guild (e.g., guildId-category -> channelId)[cite: 6]

// --- HELPER: LOGGING SYSTEM ---
async function sendBotLog(guild, category, embed) {
    if (!guild) return;
    const logKey = `${guild.id}-${category}`;
    const defaultKey = `${guild.id}-general`;
    
    let channelId = logChannels.get(logKey) || logChannels.get(defaultKey);
    if (!channelId) return; // No log channel configured[cite: 6]

    try {
        const channel = await guild.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error(`[Logging Error] Could not send log to channel ${channelId}:`, err.message);
    }
}

// --- REGISTER SLASH COMMAND DEFINITIONS ---
const commandsData = [
    new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8ball a question').addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)),
    new SlashCommandBuilder().setName('afk').setDescription('Set yourself as AFK with an optional reason').addStringOption(opt => opt.setName('reason').setDescription('AFK reason')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('announce').setDescription('Post a formatted announcement embed to a channel').addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true)).addStringOption(opt => opt.setName('message').setDescription('Announcement content').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('autodelete').setDescription('Auto-delete messages in a channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('autorole').setDescription('Automatically give a role to new members').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ban').setDescription('Ban a member from the server').addUserOption(opt => opt.setName('target').setDescription('Member to ban').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('blacklist').setDescription("Strip a member's roles and give them the Blacklisted role").addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('bumpreminder').setDescription('Set up bump reminders for Disboard').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'),
    new SlashCommandBuilder().setName('counting').setDescription('Set up or manage the counting channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('fakeconvo').setDescription('Generate a fake Discord conversation image').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('fakemessage').setDescription('Generate a fake Discord message image').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('generate-code').setDescription('Generates a unique supporter code for the redeem panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('giveall').setDescription('Give every member in the server a role').addRoleOption(opt => opt.setName('role').setDescription('Role to give').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('giveaway').setDescription('Manage giveaways').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('help').setDescription('List all available bot commands and panels'),
    new SlashCommandBuilder().setName('info').setDescription('Get info about a user').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('leaderboard').setDescription('View the server XP leaderboard'),
    new SlashCommandBuilder().setName('level').setDescription('Check your level and XP'),
    new SlashCommandBuilder().setName('levelset').setDescription("Set a member's level").addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('level').setDescription('Level').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('lock').setDescription("Lock this channel so members can't send messages").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('marco').setDescription('Marco...'),
    new SlashCommandBuilder().setName('modmakerapply').setDescription('Apply to become a mod maker in this server').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('mute').setDescription('Toggle the Muted role on a member').addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ping').setDescription('Pong - checks bot latency'),
    new SlashCommandBuilder().setName('poll').setDescription('Create a poll for members to vote on').addStringOption(opt => opt.setName('question').setDescription('Poll question').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('postroles').setDescription('Post the role list as formatted embeds').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('postrules').setDescription('Post all server rules as formatted embeds').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('purge').setDescription('Bulk delete messages in this channel').addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('reactionrole').setDescription('Set up reaction roles').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('roleadd').setDescription('Add a role to a member').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('roleremove').setDescription('Remove a role from a member').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('rps').setDescription('Play rock paper scissors against Queen Bee').addStringOption(opt => opt.setName('choice').setDescription('rock, paper, or scissors').setRequired(true).addChoices(
        { name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' }
    )),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Get info about this server'),
    new SlashCommandBuilder().setName('setlogs').setDescription('Configure the logging channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    // --- /setup-botlog COMMAND ---
    new SlashCommandBuilder()
        .setName('setup-botlog')
        .setDescription('Configure category-specific log channels for bot panels')
        .addChannelOption(opt => opt.setName('channel').setDescription('Target log channel').setRequired(true))
        .addStringOption(opt => opt.setName('category').setDescription('Log category').setRequired(true).addChoices(
            { name: 'General / All Logs', value: 'general' },
            { name: 'Generator Success Logs', value: 'generator_success' },
            { name: 'Unauthorized Button / Cooldown Logs', value: 'generator_unauthorized' },
            { name: 'Stock & Admin Actions', value: 'stock' }
        ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode in this channel').addIntegerOption(opt => opt.setName('seconds').setDescription('Seconds').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('starboard').setDescription('Set up or manage the starboard').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('status').setDescription("Set the bot's online status").addStringOption(opt => opt.setName('text').setDescription('Status text').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('suggest').setDescription('Submit a suggestion or set suggestions channel').addStringOption(opt => opt.setName('suggestion').setDescription('Your suggestion').setRequired(true)),
    new SlashCommandBuilder().setName('ticketpanel').setDescription('Post the ticket-creation panel in this channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('timeout').setDescription('Timeout a member for a set number of minutes').addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unlock').setDescription('Unlock this channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warn').setDescription('Warn a member').addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warnings').setDescription("Check a member's warnings").addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('welcome').setDescription('Configure welcome messages for new members').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    // Custom /build server generator command[cite: 6]
    new SlashCommandBuilder()
        .setName('build')
        .setDescription('Builds a full theme layout with panels and categorized community/gaming channels')
        .addStringOption(opt => opt.setName('theme').setDescription('The theme/name for your server layout').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Generator & Token Commands[cite: 6]
    new SlashCommandBuilder().setName('token').setDescription('Generate a fresh token directly to your DMs'),[cite: 6]
    new SlashCommandBuilder().setName('stock').setDescription('Open form to add token stock').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),[cite: 6]
    new SlashCommandBuilder().setName('generator').setDescription('Post clean generator panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),[cite: 6]
    new SlashCommandBuilder().setName('force_refresh').setDescription('Manually force-refresh the current active token in stock').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),[cite: 6]
    new SlashCommandBuilder().setName('remove_stock').setDescription('Remove or clear tokens from stock queue').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),[cite: 6]
    new SlashCommandBuilder().setName('refresh_cooldown_all').setDescription('Reset token generation cooldown for everyone').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),[cite: 6]
    new SlashCommandBuilder().setName('refresh_cooldown_user').setDescription('Reset token generation cooldown for a specific user').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),[cite: 6]
    new SlashCommandBuilder().setName('refresh_user').setDescription('Reset token generation cooldown for a specific user').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),[cite: 6]
    new SlashCommandBuilder().setName('logs').setDescription('Set log channel').addChannelOption(opt => opt.setName('channel').setDescription('Log channel').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),[cite: 6]
    new SlashCommandBuilder().setName('servers').setDescription('List all servers the bot is currently in').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),[cite: 6]

    // Core panels[cite: 6]
    new SlashCommandBuilder().setName('panel')
        .setDescription('Deploys interactive management panels')
        .addStringOption(opt => opt.setName('type').setDescription('Panel type').setRequired(true).addChoices(
            { name: 'Verify', value: 'verify' },
            { name: 'Redeem', value: 'redeem' },
            { name: 'Support', value: 'support' },
            { name: 'Automod', value: 'automod' },
            { name: 'Roles', value: 'roles' },
            { name: 'Help Directory', value: 'help' },
            { name: 'Generator', value: 'generator' }
        ))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`[🚀 ONLINE] Elliott Modding (${client.user.tag}) is fully operational![cite: 2, 6]`);

    // --- AUTO-CREATE MISSING ROLES ACROSS ALL SERVERS ---
    for (const guild of client.guilds.cache.values()) {
        for (const roleName of Object.values(REQUIRED_ROLES)) {
            const exists = guild.roles.cache.some(r => r.name === roleName);
            if (!exists) {
                try {
                    await guild.roles.create({
                        name: roleName,
                        reason: "Automated Setup: Missing required token generator role."
                    });
                    console.log(`[Role Setup] Created missing role '${roleName}' in guild: ${guild.name}`);
                } catch (err) {
                    console.error(`[Role Setup Error] Could not create role '${roleName}' in ${guild.name}:`, err.message);
                }
            }
        }
    }

    // Automatically register slash commands globally[cite: 2, 6]
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('[Slash Commands] Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsData },
        );
        console.log('[Slash Commands] Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
    }
});

// --- HELPER: GENERATE RANDOM CODE ---
function generateSupporterCode() {
    const randomNums = () => Math.floor(1000 + Math.random() * 9000);
    return `supporter-${randomNums()}-${randomNums()}-${randomNums()}`;
}

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {

    // 1. SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'ping') {
            return interaction.reply({ content: `Pong! Latency is \`${client.ws.ping}ms\`.`, flags: 64 });
        }

        if (commandName === 'marco') {
            return interaction.reply({ content: 'Polo! 🤿' });
        }

        if (commandName === 'setup-botlog') {
            const channel = options.getChannel('channel');
            const category = options.getString('category');
            logChannels.set(`${interaction.guild.id}-${category}`, channel.id);

            const embed = new EmbedBuilder()
                .setTitle('🛠️ Bot Log Channel Configured')
                .setDescription(`Successfully bound category **\`${category}\`** to <#${channel.id}>.`)
                .setColor(0x2ECC71);

            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (commandName === '8ball') {
            const question = options.getString('question');
            const answers = ['Yes.', 'No.', 'Maybe.', 'Definitely.', 'Ask again later.', 'Outlook not so good.'];
            const ans = answers[Math.floor(Math.random() * answers.length)];
            const embed = new EmbedBuilder().setTitle('🎱 Magic 8-Ball').addFields({ name: 'Question', value: question }, { name: 'Answer', value: ans }).setColor(0x3498DB);
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'coinflip') {
            const result = Math.random() < 0.5 ? 'Heads 🪙' : 'Tails 🪙';
            return interaction.reply({ content: `The coin landed on: **${result}**` });
        }

        if (commandName === 'rps') {
            const userChoice = options.getString('choice');
            const choices = ['rock', 'paper', 'scissors'];
            const botChoice = choices[Math.floor(Math.random() * choices.length)];
            let outcome = '';

            if (userChoice === botChoice) outcome = "It's a tie!";
            else if (
                (userChoice === 'rock' && botChoice === 'scissors') ||
                (userChoice === 'paper' && botChoice === 'rock') ||
                (userChoice === 'scissors' && botChoice === 'paper')
            ) outcome = 'You win! 🎉';
            else outcome = 'Queen Bee wins! 🐝';

            return interaction.reply({ content: `You chose **${userChoice}**, Queen Bee chose **${botChoice}**. ${outcome}` });
        }

        // --- /BUILD COMMAND WITH ORGANIZED CATEGORIES ---[cite: 6]
        if (commandName === 'build') {
            const theme = options.getString('theme');
            await interaction.deferReply({ flags: 64 });

            try {
                const guild = interaction.guild;
                const formattedTheme = theme.toUpperCase();

                const welcomeCategory = await guild.channels.create({
                    name: `📌・${formattedTheme} - WELCOME`,
                    type: ChannelType.GuildCategory,
                });

                const verifyChannel = await guild.channels.create({
                    name: 'verification',
                    type: ChannelType.GuildText,
                    parent: welcomeCategory.id,
                });
                const verifyEmbed = new EmbedBuilder()
                    .setTitle("🛡️ // SECURITY PROTOCOL")
                    .setDescription(`Welcome to **${theme}**. Click below to verify your session and unlock community channels.`)
                    .setColor(0x1ABC9C);
                const verifyRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('verify_btn').setLabel('VERIFY').setStyle(ButtonStyle.Success).setEmoji('🛡️')
                );
                await verifyChannel.send({ embeds: [verifyEmbed], components: [verifyRow] });

                const redeemChannel = await guild.channels.create({
                    name: 'redeem',
                    type: ChannelType.GuildText,
                    parent: welcomeCategory.id,
                });
                const redeemEmbed = new EmbedBuilder()
                    .setTitle("💎 // KEY REDEEM DESK")
                    .setDescription(`Got a key for **${theme}**? Click below to submit your license code and claim package permissions instantly.`)
                    .setColor(0x5865F2);
                const redeemRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM KEY').setStyle(ButtonStyle.Primary).setEmoji('💎')
                );
                await redeemChannel.send({ embeds: [redeemEmbed], components: [redeemRow] });

                const supportChannel = await guild.channels.create({
                    name: 'support',
                    type: ChannelType.GuildText,
                    parent: welcomeCategory.id,
                });
                const supportEmbed = new EmbedBuilder()
                    .setTitle("🛠️ // SUPPORT DESK")
                    .setDescription(`Need assistance with **${theme}**? Select your department below to spin up a private ticket room.`)
                    .setColor(0xFEE75C);
                const supportRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('support_select')
                        .setPlaceholder('📂 Select department...')
                        .addOptions([
                            { label: 'General Support', description: 'Assistance regarding theme setup', value: 'General Inquiry', emoji: '❓' },
                            { label: 'Billing & Keys', description: 'Store purchases and codes', value: 'Billing Support', emoji: '💳' }
                        ])
                );
                await supportChannel.send({ embeds: [supportEmbed], components: [supportRow] });

                const communityCategory = await guild.channels.create({
                    name: `💬・${formattedTheme} - COMMUNITY`,
                    type: ChannelType.GuildCategory,
                });

                await guild.channels.create({ name: 'rules', type: ChannelType.GuildText, parent: communityCategory.id });
                await guild.channels.create({ name: 'announcements', type: ChannelType.GuildText, parent: communityCategory.id });
                await guild.channels.create({ name: 'general', type: ChannelType.GuildText, parent: communityCategory.id });
                await guild.channels.create({ name: 'media-share', type: ChannelType.GuildText, parent: communityCategory.id });

                const gamingCategory = await guild.channels.create({
                    name: `🎮・${formattedTheme} - GAMING`,
                    type: ChannelType.GuildCategory,
                });

                await guild.channels.create({ name: 'gaming-chat', type: ChannelType.GuildText, parent: gamingCategory.id });
                await guild.channels.create({ name: 'General Lounge', type: ChannelType.GuildVoice, parent: gamingCategory.id });
                await guild.channels.create({ name: 'Squad Voice', type: ChannelType.GuildVoice, parent: gamingCategory.id });

                const botCategory = await guild.channels.create({
                    name: `🤖・${formattedTheme} - BOT ROOMS`,
                    type: ChannelType.GuildCategory,
                });

                await guild.channels.create({ name: 'bot-commands', type: ChannelType.GuildText, parent: botCategory.id });
                await guild.channels.create({ name: 'generator', type: ChannelType.GuildText, parent: botCategory.id });

                return interaction.editReply({ content: `✅ Successfully built the structured **${theme}** server layout containing your verification, redeem, support panels, plus categorized community and gaming rooms!` });
            } catch (err) {
                console.error("Build Command Error:", err);
                return interaction.editReply({ content: "❌ Failed to build server layout. Ensure the bot has `MANAGE_CHANNELS` permissions." });
            }
        }

        if (commandName === 'generate-code') {
            const newCode = generateSupporterCode();
            validCodes.add(newCode);

            const codeEmbed = new EmbedBuilder()
                .setTitle("🔑 // GENERATED SUPPORTER KEY")
                .setDescription(`A new redeemable key has been generated and linked to the **Redeem Panel** database.`)
                .setColor(0x2ECC71)
                .addFields(
                    { name: "Generated Code", value: `\`\`\`${newCode}\`\`\``, inline: false },
                    { name: "Status", value: "`Active & Unclaimed`", inline: true }
                )
                .setFooter({ text: "Elliott Modding Automated License Generator" });

            return interaction.reply({ embeds: [codeEmbed], flags: 64 });
        }

        if (commandName === 'token') {
            if (tokenStock.length === 0) {
                return interaction.reply({ content: '❌ **Out of Stock:** There are currently no tokens available in the database. Ask an admin to add stock.', flags: 64 });
            }
            const tokenObj = tokenStock.shift();
            try {
                const tokenEmbed = new EmbedBuilder()
                    .setTitle('TOKENS BY ELLIOTT')
                    .setDescription('🛠️ **Your Generated EIC Token:**\n\n' +
                        '**Bearer Token:**\n```ini\n' + tokenObj.bearer + '\n```\n' +
                        '**Refresh Token:**\n```ini\n' + tokenObj.refresh + '\n
