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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 2. Memory Stores
const validCodes = new Map();
const activeCaptchas = new Map();
const verificationRoles = new Map();

// Helper to generate buyer codes
function generateBuyerCode() {
  const seg1 = Math.floor(1000 + Math.random() * 9000);
  const seg2 = Math.floor(1000 + Math.random() * 9000);
  return `BUYER-${seg1}-${seg2}`;
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
    .addRoleOption(opt => opt.setName('role').setDescription('Role to grant').setRequired(true))
].map(cmd => cmd.toJSON());

// 4. Register Commands on Ready
client.once('clientReady', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands registered successfully!');
  } catch (err) {
    console.error('Registration failed:', err);
  }
});

// 5. Unified Interaction Listener
client.on('interactionCreate', async interaction => {
  
  // --- SLASH COMMANDS ---
  if (interaction.isChatInputCommand()) {

    // Command: /setup-verify
    if (interaction.commandName === 'setup-verify') {
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

    // Command: /setup-redeem
    if (interaction.commandName === 'setup-redeem') {
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

    // Command: /generate-code
    if (interaction.commandName === 'generate-code') {
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
  }

  // --- BUTTON HANDLERS ---

  // Open Captcha Modal
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

  // Open Redeem Modal
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

  // Handle Captcha Submission
  if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
    const enteredCaptcha = interaction.fields.getTextInputValue('captcha_input').trim().toUpperCase();
    const expectedCaptcha = activeCaptchas.get(interaction.user.id);
    activeCaptchas.delete(interaction.user.id);

    if (!expectedCaptcha || enteredCaptcha !== expectedCaptcha) {
      return interaction.reply({ content: '❌ Incorrect verification code. Click the button and try again.', ephemeral: true });
    }

    const roleId = verificationRoles.get(interaction.guildId);
    if (!roleId) {
      return interaction.reply({ content: '⚠️ Server verification role is not configured. Ask an admin to run `/setup-verify`.', ephemeral: true });
    }

    try {
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: '⚠️ The verification role no longer exists.', ephemeral: true });

      await interaction.member.roles.add(role);
      await interaction.reply({ content: '✅ You have successfully verified and unlocked server access!', ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: '⚠️ Bot failed to grant role. Ensure bot permissions and role hierarchy are correct.', ephemeral: true });
    }
  }

  // Handle Code Redeem Submission
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
      await interaction.reply({ content: '⚠️ Failed to add role. Check bot role hierarchy.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
