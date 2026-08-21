const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder 
} = require('discord.js');
const http = require('http');

// 1. Keep Render happy (HTTP Server)
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!\n');
}).listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// 2. Initialize Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 3. Define Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('setup-redeem')
    .setDescription('Posts the buyer redemption panel')
].map(cmd => cmd.toJSON());

// 4. Ready Event & Command Registration
client.once('clientReady', async () => {
  console.log(`Bot logged in successfully as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Slash commands registered successfully!');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

// 5. Handle Interactions (Commands & Buttons)
client.on('interactionCreate', async interaction => {
  // Handle /setup-redeem command
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup-redeem') {
      const embed = new EmbedBuilder()
        .setTitle('Redeem your buyer code')
        .setDescription('Have a buyer code? Claim your buyer role here.\n\n**How it works**\n1. Click **Redeem code**.\n2. Enter the code you received from staff.\n3. Your code is permanently linked to your Discord account.')
        .setColor(0x2b2d31);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('redeem_btn')
          .setLabel('Redeem code')
          .setEmoji('🎁')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  // Handle "Redeem code" button click
  if (interaction.isButton()) {
    if (interaction.customId === 'redeem_btn') {
      await interaction.reply({ 
        content: 'Please enter your code using the redemption system.', 
        ephemeral: true 
      });
    }
  }
});

// 6. Log in to Discord
client.login(process.env.DISCORD_TOKEN);
