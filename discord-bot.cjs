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
  PermissionFlagsBits,
  ChannelType
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

// Memory Stores
const validCodes = new Map();
const activeCaptchas = new Map();
const verificationRoles = new Map();

// Saved Channel Tracking
let verifyChannelId = null;
let redeemChannelId = null;

// UI Embed Creators
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

function createTicketEmbed() {
  return new EmbedBuilder()
    .setTitle('📩 Support & Help Desk')
    .setDescription('Need help? Click below to open a private support ticket.\n\nOur automated agent will assist immediately.')
    .setColor(0x57F287);
}

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
  new SlashCommandBuilder().setName('setup-verify').setDescription('Posts server verification panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addRoleOption(opt => opt.setName('role').setDescription('Role to give').setRequired(true)),
  new SlashCommandBuilder().setName('setup-redeem').setDescription('Posts buyer redemption panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setup-tickets').setDescription('Posts support ticket creation panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('generate-code').setDescription('Generates a new buyer code').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addRoleOption(opt => opt.setName('role').setDescription('Role to grant').setRequired(true)),
  new SlashCommandBuilder().setName('ping').setDescription('Check bot response speed')
].map(cmd => cmd.toJSON());

// 4. Startup & Resilient 5-Minute Refresh Loop
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

  // 🔄 Refresh or Respawn Panels Every 5 Minutes
  setInterval(async () => {
    // 1. Check Verification Panel
    if (verifyChannelId) {
      try {
        const channel = await client.channels.fetch(verifyChannelId);
        if (channel) {
          const messages = await channel.messages.fetch({ limit: 10 });
          const existingMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('Verification Gate'));

          if (existingMsg) {
            await existingMsg.edit({ embeds: [createVerifyEmbed()], components: [createVerifyRow()] });
          } else {
            await channel.send({ embeds: [createVerifyEmbed()], components: [createVerifyRow()] });
          }
        }
      } catch (e) {
        console.error('Error refreshing verification panel:', e);
      }
    }

    // 2. Check Redeem Panel
    if (redeemChannelId) {
      try {
        const channel = await client.channels.fetch(redeemChannelId);
        if (channel) {
          const messages = await channel.messages.fetch({ limit: 10 });
          const existingMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('Buyer Role Verification'));

          if (existingMsg) {
            await existingMsg.edit({ embeds: [createRedeemEmbed()], components: [createRedeemRow()] });
          } else {
            await channel.send({ embeds: [createRedeemEmbed()], components: [createRedeemRow()] });
          }
        }
      } catch (e) {
        console.error('Error refreshing redeem panel:', e);
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
  } catch (err) {}
});

// 6. Interaction Handlers
client.on('interactionCreate', async interaction => {
  
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setup-verify') {
      verificationRoles.set(interaction.guildId, interaction.options.getRole('role').id);
      verifyChannelId = interaction.channelId;

      await interaction.reply({ content: 'Creating verification panel...', ephemeral: true });
      await interaction.channel.send({ embeds: [createVerifyEmbed()], components: [createVerifyRow()] });
    }

    if (commandName === 'setup-redeem') {
      redeemChannelId = interaction.channelId;

      await interaction.reply({ content: 'Creating buyer panel...', ephemeral: true });
      await interaction.channel.send({ embeds: [createRedeemEmbed()], components: [createRedeemRow()] });
    }

    if (commandName === 'setup-tickets') {
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Open Ticket').setEmoji('📩').setStyle(ButtonStyle.Secondary));
      await interaction.reply({ content: 'Creating ticket panel...', ephemeral: true });
      await interaction.channel.send({ embeds: [createTicketEmbed()], components: [row] });
    }

    if (commandName === 'generate-code') {
      const targetRole = interaction.options.getRole('role');
      const newCode = `BUYER-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;
      validCodes.set(newCode, { roleId: targetRole.id, claimedBy: null });

      const genEmbed = new EmbedBuilder().setTitle('⚡ New Code Generated').addFields({ name: 'Buyer Code', value: `\`${newCode}\``, inline: true }, { name: 'Target Role', value: `${targetRole}`, inline: true }).setColor(0x57F287);
      await interaction.reply({ embeds: [genEmbed], ephemeral: true });
    }

    if (commandName === 'ping') await interaction.reply({ content: `🏓 Latency: \`${client.ws.ping}ms\``, ephemeral: true });
  }

  // Button Interactions
  if (interaction.isButton()) {
    if (interaction.customId === 'open_verify_modal') {
      const captchaText = Math.random().toString(36).substring(2, 7).toUpperCase();
      activeCaptchas.set(interaction.user.id, captchaText);
      const modal = new ModalBuilder().setCustomId('verify_modal').setTitle('Security Gate');
      const input = new TextInputBuilder().setCustomId('captcha_input').setLabel(`Type code: ${captchaText}`).setPlaceholder(captchaText).setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'open_redeem_modal') {
      const modal = new ModalBuilder().setCustomId('redeem_code_modal').setTitle('Claim Buyer Role');
      const codeInput = new TextInputBuilder().setCustomId('buyer_code_input').setLabel('Enter code').setPlaceholder('BUYER-XXXX-XXXX').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'create_ticket') {
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });

      const ticketEmbed = new EmbedBuilder().setTitle(`🎫 Ticket: ${interaction.user.username}`).setDescription('Welcome! Describe your issue below. An automated assistant will answer common questions.').setColor(0x5865F2);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setEmoji('✋').setStyle(ButtonStyle.Success)
      );

      await ticketChannel.send({ content: `${interaction.user}`, embeds: [ticketEmbed], components: [row] });
      await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    if (interaction.customId === 'claim_ticket') {
      await interaction.reply({ content: `✋ Ticket claimed by ${interaction.user}!` });
    }
  }

  // Modal Submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'verify_modal') {
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

    if (interaction.customId === 'redeem_code_modal') {
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
  }
});

// Auto AI Ticket Responder & Backup Commands
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Prefix fallback for tickets panel
  if (message.content === '!tickets' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Open Ticket').setEmoji('📩').setStyle(ButtonStyle.Secondary));
    await message.channel.send({ embeds: [createTicketEmbed()], components: [row] });
    return message.delete().catch(() => {});
  }

  // AI Support Responses inside Tickets
  if (message.channel.name.startsWith('ticket-')) {
    const query = message.content.toLowerCase();
    let autoReply = '';

    if (query.includes('code') || query.includes('redeem') || query.includes('key')) {
      autoReply = '🤖 **Auto Help:** To redeem a code, go to the buyer redemption channel and click **Redeem Code**.';
    } else if (query.includes('verify') || query.includes('access')) {
      autoReply = '🤖 **Auto Help:** Head to the verification channel and click **Verify Now** to solve the captcha.';
    } else if (query.includes('buy') || query.includes('purchase')) {
      autoReply = '🤖 **Auto Help:** Check our announcements channel for purchase details!';
    }

    if (autoReply) await message.reply(autoReply);
  }
});

client.login(process.env.DISCORD_TOKEN);
