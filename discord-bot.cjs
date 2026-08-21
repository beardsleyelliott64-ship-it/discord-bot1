client.once('clientReady', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  
  try {
    // 1. Wipe server-specific commands (replace YOUR_GUILD_ID with your actual Server ID)
    await rest.put(Routes.applicationGuildCommands(client.user.id, 'YOUR_GUILD_ID'), { body: [] });

    // 2. Overwrite global commands with ONLY the active ones
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    
    console.log('Successfully cleaned up old commands!');
  } catch (err) {
    console.error('Registration failed:', err);
  }
});
