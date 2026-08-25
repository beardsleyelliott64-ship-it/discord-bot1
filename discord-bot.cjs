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
    console.log(`Logged in as ${client.user.tag} - Elliott Modding Bot is active!`);
});

// --- INTERACTION HANDLER (Buttons, Dropdowns, Modals) ---
client.on('interactionCreate', async interaction => {
    // 1. Button Handling
    if (interaction.isButton()) {
        if (interaction.customId === 'verify_btn') {
            const role = interaction.guild.roles.cache.get(MEMBER_ROLE_ID);
            if (!role) return interaction.reply({ content: "❌ Error: Verification role not found.", ephemeral: true });

            if (interaction.member.roles.cache.has(role.id)) {
                return interaction.reply({ content: "You are already verified in Elliott Modding!", ephemeral: true });
            }
            await interaction.member.roles.add(role);
            return interaction.reply({ content: "✅ Welcome to TMC.LOL! You have been successfully verified.", ephemeral: true });
        }

        if (interaction.customId === 'redeem_btn') {
            const modal = new ModalBuilder()
                .setCustomId('redeem_modal')
                .setTitle('Elliott Modding - Key Redemption');

            const codeInput = new TextInputBuilder()
                .setCustomId('redeem_code_input')
                .setLabel("Enter Your Redeem Code")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("TMC-XXXX-XXXX")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'role_announcements') {
            const role = interaction.guild.roles.cache.get(ANNOUNCEMENT_ROLE_ID);
            if (!role) return interaction.reply({ content: "❌ Error: Announcement role not found.", ephemeral: true });

            if (interaction.member.roles.cache.has(role.id)) {
                await interaction.member.roles.remove(role);
                return interaction.reply({ content: "❌ Removed the **Announcements** role.", ephemeral: true });
            } else {
                await interaction.member.roles.add(role);
                return interaction.reply({ content: "✅ Added the **Announcements** role!", ephemeral: true });
            }
        }
    }

    // 2. Dropdown Handling
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'support_select') {
            const selectedValue = interaction.values[0];
            return interaction.reply({ content: `🎫 Creating your private ticket for **${selectedValue}**...`, ephemeral: true });
        }
    }

    // 3. Modal Submission Handling
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'redeem_modal') {
            const code = interaction.fields.getTextInputValue('redeem_code_input');
            return interaction.reply({ content: `🔍 Validating code: \`${code}\`...`, ephemeral: true });
        }
    }
});

// --- ADMIN COMMANDS FOR PANELS ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!panel')) return;

    // Check if user has administrator permissions
    if (!message.member.permissions.has('Administrator')) {
        return message.reply({ content: "❌ You need Administrator permissions to use this command." });
    }

    const args = message.content.split(' ');
    const panelType = args[1] ? args[1].toLowerCase() : '';
    await message.delete().catch(() => {}); // Clean up command message

    if (panelType === 'verify') {
        const embed = new EmbedBuilder()
            .setTitle("🔒 Elliott Modding - Verification")
            .setDescription("Welcome to **TMC.LOL**! Click the button below to verify your account and unlock access to the server.")
            .setColor(0x57F287);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('verify_btn').setLabel('Verify').setStyle(ButtonStyle.Success).setEmoji('✅')
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    if (panelType === 'redeem') {
        const embed = new EmbedBuilder()
            .setTitle("🎁 TMC.LOL - Key Redemption")
            .setDescription("Purchased a rank, tool, or mod? Click below to enter your key and claim your buyer status instantly.")
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('redeem_btn').setLabel('Redeem Key').setStyle(ButtonStyle.Primary).setEmoji('🔑')
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    if (panelType === 'support') {
        const embed = new EmbedBuilder()
            .setTitle("🛠️ Elliott Modding - Support Center")
            .setDescription("Need assistance? Choose a category from the dropdown menu below to open a private ticket with our team.")
            .setColor(0xFEE75C);

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('support_select')
                .setPlaceholder('Select a support category...')
                .addOptions([
                    { label: 'Mod Support', description: 'Get help with Big Scary mods, files, or tools', value: 'Mod Support', emoji: '👾' },
                    { label: 'Token/Bot Help', description: 'Assistance regarding bot tools & generators', value: 'Token/Bot Help', emoji: '🤖' },
                    { label: 'General Inquiry', description: 'Speak with Elliott Modding staff', value: 'General Inquiry', emoji: '❓' }
                ])
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    if (panelType === 'roles') {
        const embed = new EmbedBuilder()
            .setTitle("🎨 Notification Roles")
            .setDescription("Click the button below to toggle your notification pings for server updates and community announcements.")
            .setColor(0x9B59B6);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_announcements').setLabel('Announcements').setStyle(ButtonStyle.Secondary).setEmoji('📢')
        );
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    message.channel.send({ content: "❌ Unknown panel type! Choose from: `!panel verify`, `!panel redeem`, `!panel support`, `!panel roles`" });
});

// Log in using Render Environment Variables (or paste your token directly)
client.login(process.env.DISCORD_TOKEN);
