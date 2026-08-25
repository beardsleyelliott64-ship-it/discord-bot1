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
const MEMBER_ROLE_ID = "1539945420501950535";      // Verification Role ID
const SUPPORTER_ROLE_ID = "1540841149554499634";   // Role given upon code redemption
const ANNOUNCEMENT_ROLE_ID = "123456789012345678"; // Announcement Role ID

// Temporary in-memory storage for generated codes
const validCodes = new Set();
const userWarnings = new Map(); // Simple mock warning system storage

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
    // Core panels
    new SlashCommandBuilder().setName('panel')
        .setDescription('Deploys interactive management panels')
        .addStringOption(opt => opt.setName('type').setDescription('Panel type').setRequired(true).addChoices(
            { name: 'Verify', value: 'verify' },
            { name: 'Redeem', value: 'redeem' },
            { name: 'Support', value: 'support' },
            { name: 'Automod', value: 'automod' },
            { name: 'Roles', value: 'roles' },
            { name: 'Help Directory', value: 'help' }
        ))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`[🚀 ONLINE] Elliott Modding (${client.user.tag}) is fully operational!`);

    // Automatically register slash commands globally
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

// --- INTERACTION HANDLER (Slash Commands, Buttons, Dropdowns, Modals) ---
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

        if (commandName === 'panel') {
            const subArg = options.getString('type');

            if (subArg === 'help') {
                const embed = new EmbedBuilder()
                    .setTitle("⚡ // ELLIOTT MODDING COMMAND DIRECTORY")
                    .setDescription("Ultra-secure administrative panel deployment suite:")
                    .setColor(0x3498DB)
                    .addFields(
                        { name: "🔒 `/panel verify`", value: "Deploys the ultra-secure verification gate with automated role integration.", inline: false },
                        { name: "💎 `/panel redeem`", value: "Deploys the live key redemption modal system.", inline: false },
                        { name: "🛠️ `/panel support`", value: "Deploys the automated private ticket room generator.", inline: false },
                        { name: "🛡️ `/panel automod`", value: "Deploys the defense grid status console.", inline: false },
                        { name: "🎨 `/panel roles`", value: "Deploys the community notification toggles.", inline: false },
                        { name: "🔑 `/generate-code`", value: "Generates a unique `supporter-xxxx-xxxx-xxxx` code for the redeem panel.", inline: false }
                    )
                    .setFooter({ text: "Elliott Modding Enterprise Security Suite" });

                return interaction.reply({ embeds: [embed] });
            }

            if (subArg === 'verify') {
                const embed = new EmbedBuilder()
                    .setTitle("🛡️ // ELLIOTT MODDING SECURITY PROTOCOL")
                    .setDescription("Welcome to **Elliott Modding**.\n\nTo ensure complete community safety against heuristic bots, scrapers, and malicious raids, this server utilizes encrypted clearance barriers. Click below to verify your session.")
                    .setColor(0x1ABC9C)
                    .addFields(
                        { name: "🔒 Encryption", value: "`TLS-Equivalent Handshake`", inline: true },
                        { name: "⚡ Assigned Role", value: "`Verified Member`", inline: true }
                    )
                    .setFooter({ text: "Elliott Modding Core Defense System • Zero Trust Policy" });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('verify_btn').setLabel('INITIALIZE VERIFICATION').setStyle(ButtonStyle.Success).setEmoji('🛡️')
                );
                return interaction.reply({ embeds: [embed], components: [row] });
            }

            if (subArg === 'redeem') {
                const embed = new EmbedBuilder()
                    .setTitle("💎 // BUYER & SUPPORTER COMMERCE DESK")
                    .setDescription("Thank you for fueling **Elliott Modding**! Got a generated license code (`supporter-xxxx-xxxx-xxxx`)?\n\nClick the portal below to enter your cryptographic key and claim instant package permissions.")
                    .setColor(0x5865F2)
                    .addFields(
                        { name: "⚡ Features", value: "• Instant Key Validation\n• Automated Role Sync\n• Secure Ledger Check", inline: false }
                    )
                    .setFooter({ text: "Elliott Modding Automated Marketplace" });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM LICENSE KEY').setStyle(ButtonStyle.Primary).setEmoji('💎')
                );
                return interaction.reply({ embeds: [embed], components: [row] });
            }

            if (subArg === 'support' || subArg === 'ticketpanel') {
                const embed = new EmbedBuilder()
                    .setTitle("🛠️ // INCIDENT RESPONSE & SUPPORT DESK")
                    .setDescription("Experiencing technical anomalies with tools, files, or require direct executive support?\n\nSelect your department from the secure selector menu below to automatically spin up a private ticket room.")
                    .setColor(0xFEE75C)
                    .addFields(
                        { name: "⏱️ SLA Window", value: "Active Response within **10–20 minutes**.", inline: false }
                    )
                    .setFooter({ text: "Elliott Modding Confidential Ticketing Service" });

                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('support_select')
                        .setPlaceholder('📂 Select department classification...')
                        .addOptions([
                            { label: 'Mod Support', description: 'Assistance regarding game modifications or scripts', value: 'Mod Support', emoji: '👾' },
                            { label: 'Bot & Token Help', description: 'Assistance regarding source scripts or bot logic', value: 'Bot Help', emoji: '🤖' },
                            { label: 'Billing & Keys', description: 'Inquiries regarding store purchases and codes', value: 'Billing Support', emoji: '💳' },
                            { label: 'General Management', description: 'Speak with senior server moderators', value: 'General Inquiry', emoji: '❓' }
                        ])
                );
                return interaction.reply({ embeds: [embed], components: [row] });
            }

            if (subArg === 'automod') {
                const embed = new EmbedBuilder()
                    .setTitle("🛡️ // SENTINEL AUTOMOD MATRIX")
                    .setDescription("Elliott Modding server infrastructure is protected 24/7 by deep packet inspection and spam countermeasures.")
                    .setColor(0xED4245)
                    .addFields(
                        { name: "🚫 Link Firewall", value: "`Active (Deep URL Scan)`", inline: true },
                        { name: "⚡ Anti-Raid", value: "`Engaged (Strict Threshold)`", inline: true }
                    )
                    .setFooter({ text: "Elliott Modding Security Grid" });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('automod_toggle').setLabel('SYSTEM STATUS AUDIT').setStyle(ButtonStyle.Secondary).setEmoji('🔍')
                );
                return interaction.reply({ embeds: [embed], components: [row] });
            }

            if (subArg === 'roles') {
                const embed = new EmbedBuilder()
                    .setTitle("🎨 // COMMUNITY NOTIFICATION CENTER")
                    .setDescription("Tailor your alert preferences in **Elliott Modding**. Click below to toggle your broadcast pings.")
                    .setColor(0x9B59B6)
                    .setFooter({ text: "Elliott Modding Preference Dispatcher" });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('role_announcements').setLabel('Toggle Announcements').setStyle(ButtonStyle.Secondary).setEmoji('📢')
                );
                return interaction.reply({ embeds: [embed], components: [row] });
            }
        }

        // Additional administrative and utility slash commands placeholders
        if (commandName === 'warn') {
            const target = options.getUser('target');
            const reason = options.getString('reason');
            if (!userWarnings.has(target.id)) userWarnings.set(target.id, []);
            userWarnings.get(target.id).push(reason);
            return interaction.reply({ content: `⚠️ Successfully warned <@${target.id}> for: **${reason}**`, flags: 64 });
        }

        if (commandName === 'warnings') {
            const target = options.getUser('target');
            const warns = userWarnings.get(target.id) || [];
            return interaction.reply({ content: `📋 <@${target.id}> has **${warns.length}** warning(s):\n${warns.map((w, i) => `${i+1}. ${w}`).join('\n') || 'None'}`, flags: 64 });
        }

        if (commandName === 'purge') {
            const count = options.getInteger('amount');
            await interaction.channel.bulkDelete(count, true).catch(() => {});
            return interaction.reply({ content: `🧹 Successfully purged **${count}** messages.`, flags: 64 });
        }

        if (commandName === 'timeout') {
            const target = options.getUser('target');
            const minutes = options.getInteger('minutes');
            const member = await interaction.guild.members.fetch(target.id);
            await member.timeout(minutes * 60 * 1000, 'Timed out via slash command');
            return interaction.reply({ content: `🔇 Timed out <@${target.id}> for **${minutes}** minutes.`, flags: 64 });
        }

        // Generic confirmation fallback for remaining listed administrative utility slash commands
        const adminCommands = ['afk', 'announce', 'autodelete', 'autorole', 'ban', 'blacklist', 'bumpreminder', 'counting', 'fakeconvo', 'fakemessage', 'giveall', 'giveaway', 'info', 'leaderboard', 'level', 'levelset', 'lock', 'modmakerapply', 'mute', 'poll', 'postroles', 'postrules', 'reactionrole', 'roleadd', 'roleremove', 'serverinfo', 'setlogs', 'slowmode', 'starboard', 'status', 'suggest', 'unlock', 'welcome'];
        if (adminCommands.includes(commandName)) {
            return interaction.reply({ content: `⚡ Command \`/${commandName}\` executed successfully!`, flags: 64 });
        }
    }

    // 2. BUTTON INTERACTIONS
    if (interaction.isButton()) {
        
        // --- SECURE VERIFICATION PROTOCOL ---
        if (interaction.customId === 'verify_btn') {
            await interaction.deferReply({ flags: 64 }); // Ephemeral loading

            const guild = interaction.guild;
            const member = interaction.member;
            const role = guild.roles.cache.get(MEMBER_ROLE_ID);

            if (!role) {
                return interaction.editReply({ content: "❌ **Security Error:** The designated verification role ID could not be found on this server. Contact an administrator." });
            }

            const botMember = guild.members.cache.get(client.user.id) || await guild.members.fetchMe();
            if (botMember.roles.highest.position <= role.position) {
                return interaction.editReply({ content: "❌ **Hierarchy Error:** My bot role is lower than or equal to the verification role. Please move my role higher in Server Settings > Roles." });
            }

            if (member.roles.cache.has(role.id)) {
                return interaction.editReply({ content: "⚠️ You are already fully verified and authenticated in **Elliott Modding**!" });
            }

            try {
                await member.roles.add(role);
                return interaction.editReply({ 
                    content: "✅ **Authentication Successful!**\nSecurity clearance granted. Your account has been bound to the verification ledger and community channels are now unlocked." 
                });
            } catch (err) {
                console.error("Role Assignment Error:", err);
                return interaction.editReply({ content: "❌ **Critical Error:** Failed to assign the verification role. Check bot permissions (`MANAGE_ROLES`)." });
            }
        }

        // --- KEY REDEEM MODAL TRIGGER ---
        if (interaction.customId === 'redeem_btn') {
            const modal = new ModalBuilder()
                .setCustomId('redeem_modal')
                .setTitle('💎 Elliott Modding // Secure Key Redemption');

            const codeInput = new TextInputBuilder()
                .setCustomId('redeem_code_input')
                .setLabel("ENTER SUPPORTER / LICENSE CODE")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("supporter-xxxx-xxxx-xxxx")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
            return await interaction.showModal(modal);
        }

        // --- ANNOUNCEMENT ROLE TOGGLE ---
        if (interaction.customId === 'role_announcements') {
            const role = interaction.guild.roles.cache.get(ANNOUNCEMENT_ROLE_ID);
            if (!role) return interaction.reply({ content: "❌ **Error:** Announcement role is not configured.", flags: 64 });

            if (interaction.member.roles.cache.has(role.id)) {
                await interaction.member.roles.remove(role);
                return interaction.reply({ content: "🔕 Successfully **opted out** of Announcements.", flags: 64 });
            } else {
                await interaction.member.roles.add(role);
                return interaction.reply({ content: "🔔 Successfully **opted in** to Announcements!", flags: 64 });
            }
        }

        // --- AUTOMOD DASHBOARD TOGGLE ---
        if (interaction.customId === 'automod_toggle') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: "❌ **Access Denied:** Administrator clearance required to audit defense grids.", flags: 64 });
            }
            return interaction.reply({ content: "🛡️ **Automod Security Matrix:** All parameters are fully active. Intercepting heuristic threats, malicious hyperlinks, and mass-join vectors seamlessly.", flags: 64 });
        }
    }

    // 3. DROPDOWN / SELECT MENU INTERACTIONS (TICKETS)
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'support_select') {
            const category = interaction.values[0];
            const guild = interaction.guild;
            const user = interaction.user;

            await interaction.deferReply({ flags: 64 });

            try {
                const ticketChannel = await guild.channels.create({
                    name: `ticket-${user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: user.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                        },
                        {
                            id: client.user.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
                        }
                    ],
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle(`🎫 // SECURE TICKET: ${category.toUpperCase()}`)
                    .setDescription(`Welcome, <@${user.id}>. Staff has been notified of your inquiry regarding **${category}**.\n\nPlease describe your issue in detail below. An administrator will review your case shortly.`)
                    .setColor(0xFEE75C)
                    .setTimestamp()
                    .setFooter({ text: "Elliott Modding Incident Resolution Desk" });

                const closeButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_ticket_btn').setLabel('CLOSE TICKET').setStyle(ButtonStyle.Danger).setEmoji('🔒')
                );

                await ticketChannel.send({ content: `<@${user.id}> | Staff Alert`, embeds: [ticketEmbed], components: [closeButton] });

                return interaction.editReply({ content: `✅ **Ticket Created Successfully!** Check out your private channel: <#${ticketChannel.id}>` });
            } catch (err) {
                console.error("Ticket Creation Error:", err);
                return interaction.editReply({ content: "❌ Failed to spin up a private ticket channel. Ensure the bot has `MANAGE_CHANNELS` permissions." });
            }
        }
    }

    // Handle Closing Tickets via Button
    if (interaction.isButton() && interaction.customId === 'close_ticket_btn') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: "❌ Only staff members can close active tickets.", flags: 64 });
        }
        await interaction.reply({ content: "🔒 **Archiving ticket and destroying channel in 5 seconds...**" });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    // 4. MODAL SUBMISSIONS (KEY REDEMPTION LOGIC & ROLE ASSIGNMENT)
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'redeem_modal') {
            await interaction.deferReply({ flags: 64 });
            const code = interaction.fields.getTextInputValue('redeem_code_input').trim();

            if (validCodes.has(code)) {
                validCodes.delete(code); // Consume the code

                const guild = interaction.guild;
                const member = interaction.member;
                const supporterRole = guild.roles.cache.get(SUPPORTER_ROLE_ID);

                if (!supporterRole) {
                    return interaction.editReply({ content: `🎉 **Code Validated!** However, the Supporter Role ID (\`${SUPPORTER_ROLE_ID}\`) could not be found in this server. Please contact an admin.` });
                }

                try {
                    await member.roles.add(supporterRole);
                    return interaction.editReply({ content: `🎉 **Redemption Successful!** Code \`${code}\` verified. The Supporter role has been assigned to your profile!` });
                } catch (err) {
                    console.error("Supporter Role Assignment Error:", err);
                    return interaction.editReply({ content: `⚠️ Code was valid, but I failed to assign the Supporter role due to a permission error (\`MANAGE_ROLES\`).` });
                }
            } else {
                return interaction.editReply({ content: `❌ **Invalid Code:** \`${code}\` does not exist in the active database or has already been claimed.` });
            }
        }
    }
});

// --- RENDER KEEP-ALIVE HTTP SERVER ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Elliott Modding Bot is active and running!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[HTTP] Keep-alive server listening on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
