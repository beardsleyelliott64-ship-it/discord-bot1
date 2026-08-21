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

// Web Server for Render
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('System Active!\n');
}).listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Store active codes: { "BUYER-1234-5678": { roleId: "...", claimedBy: null } }
const validCodes = new Map();

function generateBuyerCode() {
  const seg1 = Math.floor(1000 + Math.random() * 9000);
  const seg2 = Math.floor(1000 + Math.random() * 9000);
  return `BUYER-${seg1}-${seg2}`;
}

const commands = [
  new SlashCommandBuilder()
    .setName('setup-redeem')
    .setDescription('Posts redemption panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('generate-code')
    .setDescription('Generates a new buyer code')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(opt => opt.setName('role').setDescription('Role to grant').setRequired(true))
].map(cmd => cmd.toJSON());

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

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
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
