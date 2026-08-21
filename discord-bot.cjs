const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const http = require('http');

// 1. Web Server for Render Keep-Alive
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('System Active!\n');
}).listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// 2. Client Initialization
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers 
  ] 
});

// Memory Stores
const validCodes = new Map();
const activeCaptchas = new Map();
const verificationRoles = new Map();

// Helper to generate buyer codes
function generateBuyerCode() {
  const seg1 = Math.floor(1000 + Math.random() * 9000);
  const seg2 = Math.floor(1000 + Math.random() * 9000);
  return `BUYER-${seg1}-${seg2}`;
}

// 3. Command Definitions (ONLY requested commands retained)
const commands = [
  new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Posts server verification gate panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(opt => opt.setName('role').setDescription('Role to give verified members').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setup-redeem')
    .setDescription('Posts buyer redemption panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('generate-code')
    .setDescription('Generates a new buyer code')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(opt => opt.setName('role').setDescription('Role to grant').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot response speed'),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption(opt => opt.setName('target').setDescription('User to check').setRequired(false)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(opt => opt.setName('target').setDescription('Member to kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for kick').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt => opt.setName('target').setDescription('User to ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for ban').setRequired(false)),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages from this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
].map(cmd => cmd.toJSON());

// 4. Overwrite Slash Commands on Startup
client.once('clientReady', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    // Sending this array overwrites all global commands, wiping out any unlisted ones
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Commands successfully updated!');
  } catch (err) {
    console.error('Registration failed:', err);
  }
});

// 5. Auto-Role on Join Event
client.on('guildMemberAdd', async member => {
  const roleId = verificationRoles.get(member.guild.id);
  if (!roleId) return;

  try {
    const role = member.guild.roles.cache.get(roleId);
    if (role) {
      await member.roles.add(role);
    }
  } catch (err) {
    console.error(`Failed to auto-assign role to ${member.user.tag}:`, err);
  }
});

// 6. Command & Button Handlers
client.on('interactionCreate', async interaction => {
  
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setup-verify') {
      const verifyRole = interaction.options.getRole('role');
      verificationRoles.set(interaction.guildId, verifyRole.id);

      const embed = new EmbedBuilder()
        .setTitle('🛡️ Server Verification Gate')
        .setDescription(
          'To access channels and participate in this server, you must complete verification.\n\n' +
          '**Steps to verify:**\n' +
          '1️⃣ Click the **Verify Now** button below.\n' +
          '2️⃣ Solve the security text code.\n' +
          '3️⃣ Gain full access instantly.'
        )
        .setColor(0x2B2D31)
        .setFooter({ text: 'Security Verification System' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_verify_modal')
          .setLabel('Verify Now')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ content: 'Verification panel created below:', ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    if (commandName === 'setup-redeem') {
      const embed = new EmbedBuilder()
        .setTitle('🎁 Buyer Role Verification')
        .setDescription(
          'Welcome! Redeem your unique buyer key below to claim your Discord role.\n\n' +
          '**How to Redeem:**\n' +
          '1️⃣ Click **Redeem Code**.\n' +
          '2️⃣ Paste your key (`BUYER-XXXX-XXXX`).\n' +
          '3️⃣ Click **Submit** to receive your role.\n'
        )
        .setColor(0x5865F2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_redeem_modal')
          .setLabel('Redeem Code')
          .setEmoji('🔑')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ content: 'Panel created below:', ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    if (commandName === 'generate-code') {
      const targetRole = interaction.options.getRole('role');
      const newCode = generateBuyerCode();
      validCodes.set(newCode, { roleId: targetRole.id, claimedBy: null });

      const genEmbed = new EmbedBuilder()
        .setTitle('⚡ New Code Generated')
        .addFields(
          { name: 'Buyer Code', value: `\`${newCode}\``, inline: true },
          { name: 'Target Role', value: `${targetRole}`, inline: true }
        )
        .setColor(0x57F287);

      await interaction.reply({ embeds: [genEmbed], ephemeral: true });
    }

    if (commandName === 'ping') {
      await interaction.reply({ content: `🏓 Pong! Latency: \`${client.ws.ping}ms\``, ephemeral: true });
    }

    if (commandName === 'userinfo') {
      const targetUser = interaction.options.getUser('target') || interaction.user;
      const member = interaction.guild.members.cache.get(targetUser.id);

      const embed = new EmbedBuilder()
        .setTitle(`👤 User Info - ${targetUser.tag}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true }
        )
        .setColor(0x57F287);

      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'kick') {
      const target = interaction.options.getMember('target');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (!target) return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
      if (!target.kickable) return interaction.reply({ content: '❌ I cannot kick this user.', ephemeral: true });

      await target.kick(reason);
      await interaction.reply({ content: `✅ Kicked **${target.user.tag}** | Reason: ${reason}` });
    }

    if (commandName === 'ban') {
      const target = interaction.options.getMember('target');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (!target) return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: '❌ I cannot ban this user.', ephemeral: true });

      await target.ban({ reason });
      await interaction.reply({ content: `🔨 Banned **${target.user.tag}** | Reason: ${reason}` });
    }

    if (commandName === 'purge') {
      const amount = interaction.options.getInteger('amount');
      await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `🧹 Cleared **${amount}** messages.`, ephemeral: true });
    }
  }

  // --- BUTTON HANDLERS ---
  if (interaction.isButton() && interaction.customId === 'open_verify_modal') {
    const captchaText = Math.random().toString(36).substring(2, 7).toUpperCase();
    activeCaptchas.set(interaction.user.id, captchaText);

    const modal = new ModalBuilder()
      .setCustomId('verify_modal')
      .setTitle('Security Gate');

    const input = new TextInputBuilder()
      .setCustomId('captcha_input')
      .setLabel(`Type this code to verify: ${captchaText}`)
      .setPlaceholder(captchaText)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(5)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  if (interaction.isButton() && interaction.customId === 'open_redeem_modal') {
    const modal = new ModalBuilder()
      .setCustomId('redeem_code_modal')
      .setTitle('Claim Buyer Role');

    const codeInput = new TextInputBuilder()
      .setCustomId('buyer_code_input')
      .setLabel('Enter your code')
      .setPlaceholder('BUYER-XXXX-XXXX')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
    await interaction.showModal(modal);
  }

  // --- MODAL SUBMISSIONS ---
  if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
    const enteredCaptcha = interaction.fields.getTextInputValue('captcha_input').trim().toUpperCase();
    const expectedCaptcha = activeCaptchas.get(interaction.user.id);
    activeCaptchas.delete(interaction.user.id);

    if (!expectedCaptcha || enteredCaptcha !== expectedCaptcha) {
      return interaction.reply({ content: '❌ Incorrect verification code.', ephemeral: true });
    }

    const roleId = verificationRoles.get(interaction.guildId);
    if (!roleId) {
      return interaction.reply({ content: '⚠️ Server verification role is not configured. Ask an admin to run `/setup-verify`.', ephemeral: true });
    }

    try {
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: '⚠️ Verification role no longer exists.', ephemeral: true });

      await interaction.member.roles.add(role);
      await interaction.reply({ content: '✅ You have successfully verified and unlocked access!', ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: '⚠️ Bot failed to grant role.', ephemeral: true });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'redeem_code_modal') {
    const enteredCode = interaction.fields.getTextInputValue('buyer_code_input').trim();
    const codeData = validCodes.get(enteredCode);

    if (!codeData) {
      return interaction.reply({ content: '❌ Invalid or mistyped code.', ephemeral: true });
    }
    if (codeData.claimedBy) {
      return interaction.reply({ content: '❌ Code has already been used.', ephemeral: true });
    }

    try {
      const role = interaction.guild.roles.cache.get(codeData.roleId);
      if (!role) return interaction.reply({ content: '⚠️ Role no longer exists.', ephemeral: true });

      await interaction.member.roles.add(role);
      codeData.claimedBy = interaction.member.id;

      await interaction.reply({ content: `🎉 Verified! Received the ${role} role.`, ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: '⚠️ Failed to add role.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
