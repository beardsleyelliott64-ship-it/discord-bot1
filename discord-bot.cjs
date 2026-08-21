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

// Active Panels & Channels Store
let verifyPanelMsg = null;
let verifyChannelId = null;

let redeemPanelMsg = null;
let redeemChannelId = null;

// Helper to generate buyer codes
function generateBuyerCode() {
  const seg1 = Math.floor(1000 + Math.random() * 9000);
  const seg2 = Math.floor(1000 + Math.random() * 9000);
  return `BUYER-${seg1}-${seg2}`;
}

// Helper: Verification Embed Creator
function createVerifyEmbed() {
  return new EmbedBuilder()
    .setTitle('🛡️ Server Verification Gate')
    .setDescription(
      'To access channels and participate in this server, complete verification below.\n\n' +
      '**Steps to verify:**\n' +
      '1️⃣ Click **Verify Now**.\n' +
      '2️⃣ Solve the security text code.\n' +
      '3️⃣ Gain full access instantly.\n\n' +
      `*Auto-refreshed: <t:${Math.floor(Date.now() / 1000)}:R>*</small>`
    )
    .setColor(0x2B2D31);
}

// Helper: Redeem Embed Creator
function createRedeemEmbed() {
  return new EmbedBuilder()
    .setTitle('🎁 Buyer Role Verification')
    .setDescription(
      'Redeem your unique buyer key below to claim your Discord role.\n\n' +
      '**How to Redeem:**\n' +
      '1️⃣ Click **Redeem Code**.\n' +
      '2️⃣ Paste your key (`BUYER-XXXX-XXXX`).\n' +
      '3️⃣ Click **Submit** to claim your role.\n\n' +
      `*Auto-refreshed: <t:${Math.floor(Date.now() / 1000)}:R>*</small>`
    )
    .setColor(0x5865F2);
}

// Helper: Components Builders
function createVerifyRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_verify_modal').setLabel('Verify Now').setEmoji('✅').setStyle(ButtonStyle.Primary)
  );
}

function createRedeemRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_redeem_modal').setLabel('Redeem Code').setEmoji('🔑').setStyle(ButtonStyle.Success)
  );
}

// 3. Command Definitions
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

  new SlashCommandBuilder().setName('ping').setDescription('Check bot response speed'),
  new SlashCommandBuilder().setName('userinfo').setDescription('Get information about a user').addUserOption(opt => opt.setName('target').setDescription('User to check').setRequired(false)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a user').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('purge').setDescription('Bulk delete messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(opt => opt.setName('amount').setDescription('Number (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
].map(cmd => cmd.toJSON());

// 4. Startup & 5-Minute Refresh/Re-creation Loop
client.once('clientReady', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    for (const guild of client.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: [] });
    }
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Commands synced successfully!');
  } catch (err) {
    console.error('Registration failed:', err);
  }

  // 🔄 Refresh or Respawn Panels every 5 minutes (300,000 ms)
  setInterval(async () => {
    // Check & Respawn Verification Panel
    if (verifyChannelId) {
      try {
        const channel = await client.channels.fetch(verifyChannelId);
        if (channel) {
          if (verifyPanelMsg) {
            try {
              await verifyPanelMsg.edit({ embeds: [createVerifyEmbed()] });
            } catch (err) {
              // Message was deleted — send a new one
              verifyPanelMsg = await channel.send({ embeds: [createVerifyEmbed()], components: [createVerifyRow()] });
            }
          } else {
            verifyPanelMsg = await channel.send({ embeds: [createVerifyEmbed()], components: [createVerifyRow()] });
          }
        }
      } catch (e) {
        console.error('Verify channel check failed:', e);
      }
    }

    // Check & Respawn Redeem Panel
    if (redeemChannelId) {
      try {
        const channel = await client.channels.fetch(redeemChannelId);
        if (channel) {
          if (redeemPanelMsg) {
            try {
              await redeemPanelMsg.edit({ embeds: [createRedeemEmbed()] });
            } catch (err) {
              // Message was deleted — send a new one
              redeemPanelMsg = await channel.send({ embeds: [createRedeemEmbed()], components: [createRedeemRow()] });
            }
          } else {
            redeemPanelMsg = await channel.send({ embeds: [createRedeemEmbed()], components: [createRedeemRow()] });
          }
        }
      } catch (e) {
        console.error('Redeem channel check failed:', e);
      }
    }
  }, 5 * 60 * 1000);
});

// 5. Auto-Role on Join
client.on('guildMemberAdd', async member => {
  const roleId = verificationRoles.get(member.guild.id);
  if (!roleId) return;
  try {
    const role = member.guild.roles.cache.get(roleId);
    if (role) await member.roles.add(role);
  } catch (err) {
    console.error(`Failed auto-role:`, err);
  }
});

// 6. Command & Interaction Handlers
client.on('interactionCreate', async interaction => {
  
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setup-verify') {
      const verifyRole = interaction.options.getRole('role');
      verificationRoles.set(interaction.guildId, verifyRole.id);

      // Save channel ID for respawning
      verifyChannelId = interaction.channelId;

      // Delete existing panel if present
      if (verifyPanelMsg) {
        try { await verifyPanelMsg.delete(); } catch (e) {}
      }

      await interaction.reply({ content: 'Creating verification panel...', ephemeral: true });
      verifyPanelMsg = await interaction.channel.send({ embeds: [createVerifyEmbed()], components: [createVerifyRow()] });
    }

    if (commandName === 'setup-redeem') {
      // Save channel ID for respawning
      redeemChannelId = interaction.channelId;

      // Delete existing panel if present
      if (redeemPanelMsg) {
        try { await redeemPanelMsg.delete(); } catch (e) {}
      }

      await interaction.reply({ content: 'Creating buyer panel...', ephemeral: true });
      redeemPanelMsg = await interaction.channel.send({ embeds: [createRedeemEmbed()], components: [createRedeemRow()] });
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

    if (commandName === 'ping') await interaction.reply({ content: `🏓 Latency: \`${client.ws.ping}ms\``, ephemeral: true });

    if (commandName === 'userinfo') {
      const targetUser = interaction.options.getUser('target') || interaction.user;
      const member = interaction.guild.members.cache.get(targetUser.id);
      const embed = new EmbedBuilder().setTitle(`👤 User Info - ${targetUser.tag}`).setThumbnail(targetUser.displayAvatarURL()).addFields({ name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }, { name: 'Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true }).setColor(0x57F287);
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'kick') {
      const target = interaction.options.getMember('target');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      if (!target || !target.kickable) return interaction.reply({ content: '❌ Cannot kick target.', ephemeral: true });
      await target.kick(reason);
      await interaction.reply({ content: `✅ Kicked **${target.user.tag}** | Reason: ${reason}` });
    }

    if (commandName === 'ban') {
      const target = interaction.options.getMember('target');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      if (!target || !target.bannable) return interaction.reply({ content: '❌ Cannot ban target.', ephemeral: true });
      await target.ban({ reason });
      await interaction.reply({ content: `🔨 Banned **${target.user.tag}** | Reason: ${reason}` });
    }

    if (commandName === 'purge') {
      const amount = interaction.options.getInteger('amount');
      await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `🧹 Cleared **${amount}** messages.`, ephemeral: true });
    }
  }

  // Button & Modal Interaction Handlers
  if (interaction.isButton() && interaction.customId === 'open_verify_modal') {
    const captchaText = Math.random().toString(36).substring(2, 7).toUpperCase();
    activeCaptchas.set(interaction.user.id, captchaText);
    const modal = new ModalBuilder().setCustomId('verify_modal').setTitle('Security Gate');
    const input = new TextInputBuilder().setCustomId('captcha_input').setLabel(`Type code: ${captchaText}`).setPlaceholder(captchaText).setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  if (interaction.isButton() && interaction.customId === 'open_redeem_modal') {
    const modal = new ModalBuilder().setCustomId('redeem_code_modal').setTitle('Claim Buyer Role');
    const codeInput = new TextInputBuilder().setCustomId('buyer_code_input').setLabel('Enter code').setPlaceholder('BUYER-XXXX-XXXX').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
    const enteredCaptcha = interaction.fields.getTextInputValue('captcha_input').trim().toUpperCase();
    const expectedCaptcha = activeCaptchas.get(interaction.user.id);
    activeCaptchas.delete(interaction.user.id);

    if (!expectedCaptcha || enteredCaptcha !== expectedCaptcha) return interaction.reply({ content: '❌ Incorrect code.', ephemeral: true });
    const roleId = verificationRoles.get(interaction.guildId);
    if (!roleId) return interaction.reply({ content: '⚠️ Configure role with `/setup-verify`.', ephemeral: true });

    try {
      const role = interaction.guild.roles.cache.get(roleId);
      if (role) {
        await interaction.member.roles.add(role);
        await interaction.reply({ content: '✅ Verified!', ephemeral: true });
      }
    } catch (err) {
      await interaction.reply({ content: '⚠️ Failed to give role.', ephemeral: true });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'redeem_code_modal') {
    const enteredCode = interaction.fields.getTextInputValue('buyer_code_input').trim();
    const codeData = validCodes.get(enteredCode);

    if (!codeData) return interaction.reply({ content: '❌ Invalid code.', ephemeral: true });
    if (codeData.claimedBy) return interaction.reply({ content: '❌ Code already claimed.', ephemeral: true });

    try {
      const role = interaction.guild.roles.cache.get(codeData.roleId);
      if (role) {
        await interaction.member.roles.add(role);
        codeData.claimedBy = interaction.member.id;
        await interaction.reply({ content: `🎉 Received ${role} role!`, ephemeral: true });
      }
    } catch (err) {
      await interaction.reply({ content: '⚠️ Failed to give role.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
