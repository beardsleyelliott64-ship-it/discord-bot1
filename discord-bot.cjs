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
make a better ui and working redeem system and generate buyer-random number codes
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
