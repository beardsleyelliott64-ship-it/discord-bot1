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
    TextInputStyle 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- CONFIGURATION (Replace with your actual IDs) ---
const MEMBER_ROLE_ID = "123456789012345678";      // Verification Role ID
const ANNOUNCEMENT_ROLE_ID = "123456789012345678"; // Announcement Role ID

client.once('ready', () => {
    console.log(`[🚀 ONLINE] Elliott Modding (` + client.user.tag + `) is fully operational!`);
});

// --- INTERACTION HANDLER (Buttons, Dropdowns, Modals) ---
client.on('interactionCreate', async interaction => {
    
    // 1. BUTTON INTERACTIONS
    if (interaction.isButton()) {
        // Verification
        if (interaction.customId === 'verify_btn') {
            const role = interaction.guild.roles.cache.get(MEMBER_ROLE_ID);
            if (!role) return interaction.reply({ content: "❌ **Error:** Verification role is not configured.", ephemeral: true });

            if (interaction.member.roles.cache.has(role.id)) {
                return interaction.reply({ content: "⚠️ You are already verified in **Elliott Modding**!", ephemeral: true });
            }
            await interaction.member.roles.add(role);
            return interaction.reply({ content: "✅ **Success!** Welcome to Elliott Modding. Server access unlocked.", ephemeral: true });
        }

        // Key Redeem Modal Trigger
        if (interaction.customId === 'redeem_btn') {
            const modal = new ModalBuilder()
                .setCustomId('redeem_modal')
                .setTitle('💎 Elliott Modding // Key Redemption');

            const codeInput = new TextInputBuilder()
                .setCustomId('redeem_code_input')
                .setLabel("ENTER LICENSE OR REDEEM CODE")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("EM-XXXX-XXXX-YYYY")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
            return await interaction.showModal(modal);
        }

        // Announcement Role Toggle
        if (interaction.customId === 'role_announcements') {
            const role = interaction.guild.roles.cache.get(ANNOUNCEMENT_ROLE_ID);
            if (!role) return interaction.reply({ content: "❌ **Error:** Role not found.", ephemeral: true });

            if (interaction.member.roles.cache.has(role.id)) {
                await interaction.member.roles.remove(role);
                return interaction.reply({ content: "🔕 Successfully **opted out** of Announcements.", ephemeral: true });
            } else {
                await interaction.member.roles.add(role);
                return interaction.reply({ content: "🔔 Successfully **opted in** to Announcements!", ephemeral: true });
            }
        }

        // Automod Security Lockdown Toggle
        if (interaction.customId === 'automod_toggle') {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: "❌ Access Denied: Administrator rights required.", ephemeral: true });
            }
            return interaction.reply({ content: "🛡️ **Automod Status:** Active filters are currently intercepting suspicious links, mass invites, and spam vectors.", ephemeral: true });
        }
    }

    // 2. DROPDOWN / SELECT MENU INTERACTIONS
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'support_select') {
            const category = interaction.values[0];
            return interaction.reply({ content: `🎫 **Ticket Initialized:** Opening a secure channel for **[ ${category} ]**. Please stand by, staff will be with you shortly.`, ephemeral: true });
        }
    }

    // 3. MODAL SUBMISSIONS
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'redeem_modal') {
            const code = interaction.fields.getTextInputValue('redeem_code_input');
            return interaction.reply({ content: `🔄 **Processing Key:** \`${code}\`\n*Verifying against database records... Please check your DMs for confirmation.*`, ephemeral: true });
        }
    }
});

// --- PREFIX COMMAND SYSTEM (`!panel`) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!panel')) return;

    if (!message.member.permissions.has('Administrator')) {
        return message.reply({ content: "❌ You do not have permission to execute panel commands." });
    }

    const args = message.content.split(' ');
    const type = args[1] ? args[1].toLowerCase() : '';
    await message.delete().catch(() => {});

    // ----------------------------------------------------
    // 0. HELP MENU PANEL (NEW)
    // ----------------------------------------------------
    if (type === 'help') {
        const embed = new EmbedBuilder()
            .setTitle("⚙️ // ELLIOTT MODDING PANEL DIRECTORY")
            .setDescription("Here is the list of all available administrator panel commands, their names, and descriptions:")
            .setColor(0x3498DB)
            .addFields(
                { name: "🔒 `!panel verify`", value: "Deploys the secure account verification gate. Users click to unlock member roles.", inline: false },
                { name: "💎 `!panel redeem`", value: "Deploys the license key modal launcher for buyers and supporters.", inline: false },
                { name: "🛠️ `!panel support`", value: "Deploys the categorized dropdown menu for opening user support tickets.", inline: false },
                { name: "🛡️ `!panel automod`", value: "Deploys the live security dashboard displaying active filters and protection status.", inline: false },
                { name: "🎨 `!panel roles`", value: "Deploys the community notification hub for toggling alert roles.", inline: false }
            )
            .setFooter({ text: "Elliott Modding Management Suite • Administrator Use Only" });

        return message.channel.send({ embeds: [embed] });
    }

    // ----------------------------------------------------
    // 1. VERIFICATION PANEL
    // ----------------------------------------------------
    if (type === 'verify') {
        const embed = new EmbedBuilder()
            .setTitle("🔒 // SERVER VERIFICATION PROTOCOL")
            .setDescription("Welcome to **Elliott Modding**.\n\nTo combat automated spam bots and raids, this server requires manual clearance. Click the secure button below to authenticate your account and unlock community channels.")
            .setColor(0x2B2D31)
            .addFields(
                { name: "🛡️ Security Level", value: "`High (Standard Check)`", inline: true },
                { name: "⚡ Status", value: "`Operational`", inline: true }
            )
            .setFooter({ text: "Elliott Modding Security Systems • Protected Environment" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('verify_btn').setLabel('VERIFY ACCOUNT').setStyle(ButtonStyle.Success).setEmoji('🔓')
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // ----------------------------------------------------
    // 2. REDEMPTION PANEL
    // ----------------------------------------------------
    if (type === 'redeem') {
        const embed = new EmbedBuilder()
            .setTitle("💎 // BUYER & SUPPORTER REDEMPTION")
            .setDescription("Thank you for supporting **Elliott Modding**! Purchased a custom tool, private mod, or supporter rank?\n\nClick the button below to launch the secure key entry modal and claim your perks automatically.")
            .setColor(0x5865F2)
            .addFields(
                { name: "🔑 Available Actions", value: "• Redeem License Keys\n• Claim Buyer Roles\n• Sync Package Access", inline: false }
            )
            .setFooter({ text: "Elliott Modding Automated Commerce • Instant Delivery" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM LICENSE KEY').setStyle(ButtonStyle.Primary).setEmoji('⚡')
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // ----------------------------------------------------
    // 3. SUPPORT CENTER PANEL
    // ----------------------------------------------------
    if (type === 'support') {
        const embed = new EmbedBuilder()
            .setTitle("🛠️ // ELLIOTT MODDING SUPPORT DESK")
            .setDescription("Encountering an issue with a mod, tool generator, or need direct assistance from staff? \n\nSelect your inquiry type from the interactive menu below to spin up a private ticket room.")
            .setColor(0xFEE75C)
            .addFields(
                { name: "⏱️ Response Window", value: "Usually within **15–30 minutes**.", inline: false }
            )
            .setFooter({ text: "Elliott Modding Ticketing System • Confidential Support" });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('support_select')
                .setPlaceholder('📂 Select your department...')
                .addOptions([
                    { label: 'Mod Support', description: 'Assistance regarding Big Scary mods, files, or tools', value: 'Mod Support', emoji: '👾' },
                    { label: 'Token/Bot Help', description: 'Issues with generator scripts or source logic', value: 'Token/Bot Help', emoji: '🤖' },
                    { label: 'Billing / Buyer Issues', description: 'Problems claiming purchased items or keys', value: 'Billing Support', emoji: '💳' },
                    { label: 'General Inquiry', description: 'Speak with staff regarding general server topics', value: 'General Inquiry', emoji: '❓' }
                ])
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // ----------------------------------------------------
    // 4. AUTOMOD & SECURITY DASHBOARD
    // ----------------------------------------------------
    if (type === 'automod') {
        const embed = new EmbedBuilder()
            .setTitle("🛡️ // SYSTEM SECURITY & AUTOMOD")
            .setDescription("Elliott Modding servers are monitored 24/7 by advanced automated defense protocols to ensure a safe environment.")
            .setColor(0xED4245)
            .addFields(
                { name: "🚫 Link Filtering", value: "`Active (Blocks IP grabbers & malware)`", inline: true },
                { name: "⚡ Anti-Spam", value: "`Strict (Raid mitigation enabled)`", inline: true },
                { name: "🔒 Invite Blocker", value: "`Active (Auto-deletes unauthorized ads)`", inline: true }
            )
            .setFooter({ text: "Elliott Modding Defense Grid • Zero Tolerance Policy" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('automod_toggle').setLabel('SYSTEM STATUS').setStyle(ButtonStyle.Secondary).setEmoji('🔍')
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // ----------------------------------------------------
    // 5. ROLES & NOTIFICATIONS PANEL
    // ----------------------------------------------------
    if (type === 'roles') {
        const embed = new EmbedBuilder()
            .setTitle("🎨 // COMMUNITY NOTIFICATION HUBS")
            .setDescription("Customize your experience in **Elliott Modding**. Click below to toggle your notification pings so you never miss a drop, update, or community event.")
            .setColor(0x9B59B6)
            .setFooter({ text: "Elliott Modding Preference Center • Opt-in / Opt-out Anytime" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_announcements').setLabel('Announcements Ping').setStyle(ButtonStyle.Secondary).setEmoji('📢')
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    message.channel.send({ content: "❌ **Unknown panel option.** Type `!panel help` to see all available panels." });
});

client.login(process.env.DISCORD_TOKEN);
