const { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  REST, 
  Routes, 
  Events 
} = require('discord.js');

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
  const currentUnix = Math.floor(Date.now() / 1000);
  return new EmbedBuilder()
    .setTitle('🛡️ Server Verification Gate')
    .setDescription(
      'To access channels and participate in this server, complete verification below.\n\n' +
      '**Steps to verify:**\n' +
      '1️⃣ Click **Verify Now**.\n' +
      '2️⃣ Solve the security text code.\n' +
      '3️⃣ Gain full access instantly.\n\n' +
      `*Auto-refreshed: <t:${currentUnix}:R>*`
    )
    .setColor(0x2B2D31);
}

function createRedeemEmbed() {
  const currentUnix = Math.floor(Date.now() / 1000);
  return new EmbedBuilder()
    .setTitle('🎁 Buyer Role Verification')
    .setDescription(
      'Redeem your unique buyer key below to claim your Discord role.\n\n' +
      '**How to Redeem:**\n' +
      '1️⃣ Click **Redeem Code**.\n' +
      '2️⃣ Paste your key (`BUYER-XXXX-XXXX`).\n' +
      '3️⃣ Click **Submit** to claim your role.\n\n' +
      `*Auto-refreshed: <t:${currentUnix}:R>*`
    )
    .setColor(0x5865F2);
}

function createTicketEmbed() {
  return new EmbedBuilder()
    .setTitle('🎫 Support & Help Desk')
    .setDescription('Need help? Click below to open a private support ticket.\n\nOur team will assist you immediately.')
    .setColor(0x57F287);
}

function createVerifyRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_verify_modal').setLabel('Verify Now').setEmoji('🛡️').setStyle(ButtonStyle.Primary)
  );
}

function createRedeemRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_redeem_modal').setLabel('Redeem Code').setEmoji('🔑').setStyle(ButtonStyle.Success)
  );
}

function createTicketRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_ticket').setLabel('Create Ticket').setEmoji('📩').setStyle(ButtonStyle.Secondary)
  );
}

// Slash Commands Definition
const commands = [
  new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Setup server verification panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-redeem')
    .setDescription('Setup buyer role redemption panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-ticket')
    .setDescription('Setup ticket support panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('nuke-and-rebuild')
    .setDescription('Deletes all channels (except protected IDs) and creates a standard gaming setup')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// Register Slash Commands
client.once(Events.ClientReady, async (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(c.user.id),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

// Interaction Handling
client.on(Events.InteractionCreate, async (interaction) => {
  // 1. Slash Commands
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'setup-verify') {
      verifyChannelId = interaction.channelId;
      await interaction.reply({ content: 'Creating verification panel...', ephemeral: true });
      await interaction.channel.send({
        embeds: [createVerifyEmbed()],
        components: [createVerifyRow()]
      });
    }

    if (commandName === 'setup-redeem') {
      redeemChannelId = interaction.channelId;
      await interaction.reply({ content: 'Creating buyer panel...', ephemeral: true });
      await interaction.channel.send({
        embeds: [createRedeemEmbed()],
        components: [createRedeemRow()]
      });
    }

    if (commandName === 'setup-ticket') {
      await interaction.reply({ content: 'Creating ticket panel...', ephemeral: true });
      await interaction.channel.send({
        embeds: [createTicketEmbed()],
        components: [createTicketRow()]
      });
    }

    if (commandName === 'nuke-and-rebuild') {
      const keepChannelIds = [
        '1540060774800564294',
        '1539797201876689006',
        '1539797202908749964',
        '1539797203902668820'
      ];

      await interaction.reply({ content: '⚙️ Starting server cleanup and channel setup...', ephemeral: true });

      const guild = interaction.guild;
      const allChannels = await guild.channels.fetch();

      // Delete unprotected channels
      for (const [id, channel] of allChannels) {
        if (channel && !keepChannelIds.includes(id)) {
          try {
            await channel.delete('Nuke and Rebuild Command');
          } catch (err) {
            console.error(`Failed to delete channel ${id}:`, err);
          }
        }
      }

      // Information Category
      const infoCat = await guild.channels.create({ name: '📌 Information', type: ChannelType.GuildCategory });
      await guild.channels.create({ name: 'rules', type: ChannelType.GuildText, parent: infoCat.id });
      await guild.channels.create({ name: 'announcements', type: ChannelType.GuildText, parent: infoCat.id });

      // Text Channels Category
      const textCat = await guild.channels.create({ name: '💬 Text Channels', type: ChannelType.GuildCategory });
      await guild.channels.create({ name: 'general', type: ChannelType.GuildText, parent: textCat.id });
      await guild.channels.create({ name: 'bot-commands', type: ChannelType.GuildText, parent: textCat.id });
      await guild.channels.create({ name: 'memes', type: ChannelType.GuildText, parent: textCat.id });

      // Gaming Category
      const gamingCat = await guild.channels.create({ name: '🎮 Gaming', type: ChannelType.GuildCategory });
      await guild.channels.create({ name: 'gaming-chat', type: ChannelType.GuildText, parent: gamingCat.id });
      await guild.channels.create({ name: 'clips-and-highlights', type: ChannelType.GuildText, parent: gamingCat.id });
      await guild.channels.create({ name: 'looking-for-group', type: ChannelType.GuildText, parent: gamingCat.id });

      // Voice Channels Category
      const voiceCat = await guild.channels.create({ name: '🔊 Voice Channels', type: ChannelType.GuildCategory });
      await guild.channels.create({ name: 'General VC', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await guild.channels.create({ name: 'Gaming Lounge 1', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await guild.channels.create({ name: 'Gaming Lounge 2', type: ChannelType.GuildVoice, parent: voiceCat.id });

      await interaction.followUp({ content: '✅ Server setup complete! Protected channels were kept.', ephemeral: true });
    }
  }

  // 2. Button Handlers
  if (interaction.isButton()) {
    if (interaction.customId === 'open_verify_modal') {
      const captchaText = Math.random().toString(36).substring(2, 8).toUpperCase();
      activeCaptchas.set(interaction.user.id, captchaText);

      const modal = new ModalBuilder()
        .setCustomId('verify_modal')
        .setTitle(`Verification Code: ${captchaText}`);

      const input = new TextInputBuilder()
        .setCustomId('captcha_input')
        .setLabel(`Type exact code: ${captchaText}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'open_redeem_modal') {
      const modal = new ModalBuilder()
        .setCustomId('redeem_code_modal')
        .setTitle('Redeem Buyer Code');

      const input = new TextInputBuilder()
        .setCustomId('buyer_code_input')
        .setLabel('Enter key (BUYER-XXXX-XXXX)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'open_ticket') {
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
        ],
      });

      await ticketChannel.send({
        content: `Welcome <@${interaction.user.id}>! Support will be with you shortly.`,
      });

      await interaction.reply({ content: `✅ Created ticket channel: ${ticketChannel}`, ephemeral: true });
    }
  }

  // 3. Modal Submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'verify_modal') {
      const enteredCaptcha = interaction.fields.getTextInputValue('captcha_input').trim().toUpperCase();
      const expectedCaptcha = activeCaptchas.get(interaction.user.id);
      activeCaptchas.delete(interaction.user.id);

      if (!expectedCaptcha || enteredCaptcha !== expectedCaptcha) {
        return interaction.reply({ content: '❌ Incorrect verification code.', ephemeral: true });
      }

      const roleId = verificationRoles.get(interaction.guildId);
      if (!roleId) {
        return interaction.reply({ content: '⚠️ Configure role with `/setup-verify`.', ephemeral: true });
      }

      try {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) await interaction.member.roles.add(role);
        await interaction.reply({ content: '✅ Verified!', ephemeral: true });
      } catch (err) {
        await interaction.reply({ content: '⚠️ Failed to give role.', ephemeral: true });
      }
    }

    if (interaction.customId === 'redeem_code_modal') {
      const enteredCode = interaction.fields.getTextInputValue('buyer_code_input').trim();
      const codeData = validCodes.get(enteredCode);

      if (!codeData) {
        return interaction.reply({ content: '❌ Invalid code.', ephemeral: true });
      }
      if (codeData.claimedBy) {
        return interaction.reply({ content: '❌ Code already claimed.', ephemeral: true });
      }

      codeData.claimedBy = interaction.user.id;
      await interaction.reply({ content: '✅ Code redeemed successfully!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
