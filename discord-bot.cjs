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

// Active Panels & Channels Store
let verifyPanelMsg = null, verifyChannelId = null;
let redeemPanelMsg = null, redeemChannelId = null;
let ticketPanelMsg = null, ticketChannelId = null;

// Helpers
function generateBuyerCode() {
  const seg1 = Math.floor(1000 + Math.random() * 9000);
  const seg2 = Math.floor(1000 + Math.random() * 9000);
  return `BUYER-${seg1}-${seg2}`;
}

// UI Embed Creators
function createVerifyEmbed() {
  return new EmbedBuilder()
    .setTitle('🛡️ Server Verification Gate')
    .setDescription('To access channels, complete verification below.\n\n1️⃣ Click **Verify Now**.\n2️⃣ Solve the security text code.\n3️⃣ Gain full access instantly.')
    .setColor(0x2B2D31);
}

function createRedeemEmbed() {
  return new EmbedBuilder()
    .setTitle('🎁 Buyer Role Verification')
    .setDescription('Redeem your unique buyer key below to claim your role.\n\n1️⃣ Click **Redeem Code**.\n2️⃣ Paste your key (`BUYER-XXXX-XXXX`).\n3️⃣ Click **Submit**.')
    .setColor(0x5865F2);
}

function createTicketEmbed() {
  return new EmbedBuilder()
    .setTitle('📩 Support & Help Desk')
    .setDescription('Need help or have questions? Click the button below to open a private support ticket.\n\nOur automated support agent will assist you immediately, and staff can jump in if needed.')
    .setColor(0x57F287);
}

// Command Definitions
const commands = [
  new SlashCommandBuilder().setName('setup-verify').setDescription('Posts server verification panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addRoleOption(opt => opt.setName('role').setDescription('Role to give').setRequired(true)),
  new SlashCommandBuilder().setName('setup-redeem').setDescription('Posts buyer redemption panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setup-tickets').setDescription('Posts the support ticket creation panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('generate-code').setDescription('Generates a new buyer code').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addRoleOption(opt => opt.setName('role').setDescription('Role to grant').setRequired(true)),
  new SlashCommandBuilder().setName('ping').setDescription('Check bot response speed')
].map(cmd => cmd.toJSON());

// Startup Sync
client.once('clientReady', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    for (const guild of client.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: [] });
    }
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (err) {
    console.error('Registration failed:', err);
  }
});

// Auto-Role on Join
client.on('guildMemberAdd', async member => {
  const roleId = verificationRoles.get(member.guild.id);
  if (!roleId) return;
  try {
    const role = member.guild.roles.cache.get(roleId);
    if (role) await member.roles.add(role);
  } catch (err) {}
});

// Interaction Handling
client.on('interactionCreate', async interaction => {
  
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setup-verify') {
      verificationRoles.set(interaction.guildId, interaction.options.getRole('role').id);
      verifyChannelId = interaction.channelId;
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_verify_modal').setLabel('Verify Now').setEmoji('✅').setStyle(ButtonStyle.Primary));
      await interaction.reply({ content: 'Creating verification panel...', ephemeral: true });
      verifyPanelMsg = await interaction.channel.send({ embeds: [createVerifyEmbed()], components: [row] });
    }

    if (commandName === 'setup-redeem') {
      redeemChannelId = interaction.channelId;
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_redeem_modal').setLabel('Redeem Code').setEmoji('🔑').setStyle(ButtonStyle.Success));
      await interaction.reply({ content: 'Creating buyer panel...', ephemeral: true });
      redeemPanelMsg = await interaction.channel.send({ embeds: [createRedeemEmbed()], components: [row] });
    }

    if (commandName === 'setup-tickets') {
      ticketChannelId = interaction.channelId;
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Open Ticket').setEmoji('📩').setStyle(ButtonStyle.Secondary));
      await interaction.reply({ content: 'Creating ticket panel...', ephemeral: true });
      ticketPanelMsg = await interaction.channel.send({ embeds: [createTicketEmbed()], components: [row] });
    }

    if (commandName === 'generate-code') {
      const targetRole = interaction.options.getRole('role');
      const newCode = generateBuyerCode();
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

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 Ticket: ${interaction.user.username}`)
        .setDescription('Welcome! Describe your question or issue below.\n\n🤖 **AI Assistant:** Type your question in this channel to get instant automated help.')
        .setColor(0x5865F2);

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

// Automatic AI-Style Ticket Answers
client.on('messageCreate', async message => {
  if (message.author.bot || !message.channel.name.startsWith('ticket-')) return;

  const query = message.content.toLowerCase();

  let autoReply = '';

  if (query.includes('code') || query.includes('redeem') || query.includes('key')) {
    autoReply = '🤖 **Auto Help:** To redeem a code, go to the buyer redemption channel and click the **Redeem Code** button.';
  } else if (query.includes('verify') || query.includes('access')) {
    autoReply = '🤖 **Auto Help:** Head to the verification channel and click **Verify Now** to solve the captcha.';
  } else if (query.includes('buy') || query.includes('purchase')) {
    autoReply = '🤖 **Auto Help:** Check our announcements or pricing channels for purchase details!';
  }

  if (autoReply) {
    await message.reply(autoReply);
  }
});

client.login(process.env.DISCORD_TOKEN);
