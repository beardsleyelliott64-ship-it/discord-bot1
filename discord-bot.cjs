const http = require('http');

// Web server to satisfy Render's port check
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord bot is alive!');
}).listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

const { 
    Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, 
    ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, 
    REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, Events 
} = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Database = require("better-sqlite3");
const crypto = require("crypto");

// ---------------------- CONFIGURATION ----------------------
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Hardcoded IDs to guarantee instant registration
const CLIENT_ID = '1539741106349146132';
const TARGET_GUILD_ID = '1539704406327693512';
const ADMIN_USER_ID = process.env.YOUR_DISCORD_USER_ID;

const BUYER_ROLE_ID = '1539706476871032922';  // Target Buyer Role ID
const MEMBER_ROLE_ID = '1539945420501950535'; // Target Verified Member Role ID
const VERIFY_CHANNEL_ID = '1540382318856765490'; // Target Verification Channel ID
const REDEEM_CHANNEL_ID = '1539797203902668820'; // Target Auto-Redeem Channel ID

// Temporary storage for other features
const activeCaptchas = new Map();
const validBuyerKeys = new Set(); 

// Setup SQLite Database for Giveaways & Buyer Codes
const db = new Database("./giveaways.sqlite");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS giveaways (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  prize TEXT NOT NULL,
  winners INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entries (
  giveaway_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (giveaway_id, user_id)
);

CREATE TABLE IF NOT EXISTS buyer_codes (
  user_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  giveaway_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// Setup Gemini AI using the stable package and current model
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const aiModel = genAI.getGenerativeModel({ model: 'gemini-3.7-flash' });

// Setup Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Helper: Enhanced Key Generator for Database
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function part(length) {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[crypto.randomInt(chars.length)];
    }
    return result;
  }

  return `BUYER-${part(4)}-${part(4)}-${part(4)}`;
}

function getOrCreateBuyerCode(userId, giveawayId) {
  const existing = db
    .prepare("SELECT code FROM buyer_codes WHERE user_id = ?")
    .get(userId);

  if (existing) return existing.code;

  let code;

  do {
    code = makeCode();
  } while (
    db.prepare("SELECT 1 FROM buyer_codes WHERE code = ?").get(code)
  );

  db.prepare(`
    INSERT INTO buyer_codes
      (user_id, code, giveaway_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, code, giveawayId, Date.now());

  validBuyerKeys.add(code);
  return code;
}

function parseDuration(input) {
  const match = /^(\d+)(s|m|h|d)$/i.exec(input.trim());

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  const multiplier = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  }[unit];

  const duration = amount * multiplier;

  if (
    !Number.isSafeInteger(duration) ||
    duration < 1000 ||
    duration > 30 * 86400000
  ) {
    return null;
  }

  return duration;
}

function giveawayEmbed(giveaway, entryCount) {
  return new EmbedBuilder()
    .setTitle("🎉 BUYER GIVEAWAY")
    .setDescription(
      `**Prize:** ${giveaway.prize}\n\n` +
      `🏆 **Winners:** ${giveaway.winners}\n` +
      `👥 **Entries:** ${entryCount}\n` +
      `⏳ **Ends:** <t:${Math.floor(giveaway.ends_at / 1000)}:R>\n\n` +
      `Click **Enter Giveaway** below to enter.`
    )
    .setFooter({
      text: "Winner receives a private Buyer code by DM."
    })
    .setTimestamp()
    .setColor(0x5865F2);
}

function giveawayButtons(id, ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter:${id}`)
      .setLabel(ended ? "Giveaway Ended" : "Enter Giveaway")
      .setEmoji("🎟️")
      .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(ended),

    new ButtonBuilder()
      .setCustomId(`giveaway_info:${id}`)
      .setLabel("View Info")
      .setEmoji("ℹ️")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function updateGiveawayMessage(giveawayId) {
  const giveaway = db
    .prepare("SELECT * FROM giveaways WHERE id = ?")
    .get(giveawayId);

  if (!giveaway || !giveaway.message_id) return;

  try {
    const channel = await client.channels.fetch(giveaway.channel_id);
    const message = await channel.messages.fetch(giveaway.message_id);

    const count = db
      .prepare(
        "SELECT COUNT(*) AS count FROM entries WHERE giveaway_id = ?"
      )
      .get(giveawayId).count;

    await message.edit({
      embeds: [giveawayEmbed(giveaway, count)],
      components: [giveawayButtons(giveawayId, Boolean(giveaway.ended))]
    });
  } catch (error) {
    console.error(
      `Could not update giveaway ${giveawayId}:`,
      error.message
    );
  }
}

async function sendWinnerDM(userId, prize, code, reroll = false) {
  const user = await client.users.fetch(userId);

  const title = reroll
    ? "🎉 You Won the Reroll!"
    : "🎉 You Won!";

  await user.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          `Congratulations! You won **${prize}**.\n\n` +
          `🔑 **Your Buyer Code**\n` +
          `\`${code}\`\n\n` +
          `Keep this code private. It is linked to your Discord account.`
        )
        .setFooter({
          text: "Buyer Giveaway System"
        })
        .setTimestamp()
        .setColor(0x57F287)
    ]
  });
}

async function finishGiveaway(giveawayId) {
  const giveaway = db
    .prepare("SELECT * FROM giveaways WHERE id = ?")
    .get(giveawayId);

  if (!giveaway || giveaway.ended) return;

  db.prepare("UPDATE giveaways SET ended = 1 WHERE id = ?")
    .run(giveawayId);

  const entries = db
    .prepare(
      "SELECT user_id FROM entries WHERE giveaway_id = ?"
    )
    .all(giveawayId)
    .map(row => row.user_id);

  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(
    0,
    Math.min(giveaway.winners, shuffled.length)
  );

  const channel = await client.channels
    .fetch(giveaway.channel_id)
    .catch(() => null);

  if (!winners.length) {
    if (channel?.isTextBased()) {
      await channel.send(
        `🎉 The giveaway for **${giveaway.prize}** ended, but there were no entries.`
      );
    }

    await updateGiveawayMessage(giveawayId);
    return;
  }

  const winnerMentions = winners
    .map(userId => `<@${userId}>`)
    .join(", ");

  if (channel?.isTextBased()) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏆 Giveaway Winner(s)!")
          .setDescription(
            `Congratulations ${winnerMentions}!\n\n` +
            `You won **${giveaway.prize}**.\n` +
            `Check your Discord DMs for your private Buyer code.`
          )
          .setTimestamp()
          .setColor(0x57F287)
      ]
    });
  }

  for (const userId of winners) {
    const code = getOrCreateBuyerCode(userId, giveawayId);

    try {
      await sendWinnerDM(userId, giveaway.prize, code);
    } catch (error) {
      console.error(
        `Could not DM winner ${userId}:`,
        error.message
      );
    }
  }

  await updateGiveawayMessage(giveawayId);
}

// Helper: Captcha Code Generator
function generateCaptcha() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ---------------------- ALL COMMAND DEFINITIONS ----------------------
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get information about a user')
        .addUserOption(opt => opt.setName('target').setDescription('The user').setRequired(false)),
    new SlashCommandBuilder()
        .setName('setup-generate')
        .setDescription('Post the Admin Key Generator Panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setup-redeem')
        .setDescription('Post the Key Redemption Panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('Post the AI Ticket Creation embed in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Manage Buyer giveaways")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
          sub
            .setName("create")
            .setDescription("Create a Buyer giveaway")
            .addStringOption(option =>
              option
                .setName("prize")
                .setDescription("What the winner receives")
                .setRequired(true)
            )
            .addStringOption(option =>
              option
                .setName("duration")
                .setDescription("Examples: 30s, 10m, 2h, 1d")
                .setRequired(true)
            )
            .addIntegerOption(option =>
              option
                .setName("winners")
                .setDescription("Number of winners")
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("end")
            .setDescription("End a giveaway immediately")
            .addStringOption(option =>
              option
                .setName("id")
                .setDescription("Giveaway ID")
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("reroll")
            .setDescription("Reroll a winner")
            .addStringOption(option =>
              option
                .setName("id")
                .setDescription("Giveaway ID")
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("code")
            .setDescription("Admin: view a user's Buyer code")
            .addUserOption(option =>
              option
                .setName("user")
                .setDescription("User whose code you want to inspect")
                .setRequired(true)
            )
        ),
    new SlashCommandBuilder()
        .setName('generate-code')
        .setDescription('Generate a custom buyer key via command')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Nuke and rebuild the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
];

// ---------------------- BOT INITIALIZATION ----------------------
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, TARGET_GUILD_ID), { body: commands });
        console.log('Successfully registered active guild commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }

    const overdue = db
      .prepare(
        "SELECT id FROM giveaways WHERE ended = 0 AND ends_at <= ?"
      )
      .all(Date.now());

    for (const giveaway of overdue) {
      await finishGiveaway(giveaway.id);
    }

    setInterval(async () => {
      const due = db
        .prepare(
          "SELECT id FROM giveaways WHERE ended = 0 AND ends_at <= ?"
        )
        .all(Date.now());

      for (const giveaway of due) {
        await finishGiveaway(giveaway.id);
      }
    }, 5000);

    // Auto-Deploy Enhanced Verification Panel
    try {
        const verifyChannel = await client.channels.fetch(VERIFY_CHANNEL_ID);
        if (verifyChannel && verifyChannel.isTextBased()) {
            const messages = await verifyChannel.messages.fetch({ limit: 10 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            if (botMessages.size > 0) await verifyChannel.bulkDelete(botMessages);

            const verifyEmbed = new EmbedBuilder()
                .setTitle('🛡️ Server Security & Access Portal')
                .setDescription(
                    'Welcome to the community! To protect our server against automated raids and unauthorized entry, manual verification is required.\n\n' +
                    '### 📌 How to Verify:\n' +
                    '1. Click the **Verify Access** button below.\n' +
                    '2. A secure popup will display a unique captcha code.\n' +
                    '3. Enter the exact string to instantly unlock the **Verified Member** role and gain full server access.'
                )
                .addFields(
                    { name: '🔒 Status', value: '`Protected & Active`', inline: true },
                    { name: '👥 Assigned Role', value: `<@&${MEMBER_ROLE_ID}>`, inline: true }
                )
                .setColor(0x2B2D31)
                .setTimestamp()
                .setFooter({ text: 'Security Verification System' });

            const verifyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('trigger_verify').setLabel('Verify Access').setEmoji('🛡️').setStyle(ButtonStyle.Success)
            );

            await verifyChannel.send({ embeds: [verifyEmbed], components: [verifyRow] });
        }
    } catch (err) {
        console.error('Error deploying verification panel:', err);
    }

    // Auto-Deploy Enhanced Redemption Panel
    try {
        const redeemChannel = await client.channels.fetch(REDEEM_CHANNEL_ID);
        if (redeemChannel && redeemChannel.isTextBased()) {
            const messages = await redeemChannel.messages.fetch({ limit: 10 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            if (botMessages.size > 0) await redeemChannel.bulkDelete(botMessages);

            const redeemEmbed = new EmbedBuilder()
                .setTitle('✨ Vault Access & License Activation')
                .setDescription(
                    'Have you purchased a valid pass or received an exclusive license key? Redeem it here to automatically unlock your privileged status.\n\n' +
                    '### 💎 Benefits of Activation:\n' +
                    '• Instant delivery of the **Buyer Role**\n' +
                    '• Access to private channels, giveaways, and hidden features\n' +
                    '• Permanent account binding for security'
                )
                .addFields(
                    { name: '🔑 Key Format', value: '`BUYER-XXXX-XXXX-XXXX`', inline: true },
                    { name: '🎖️ Target Role', value: `<@&${BUYER_ROLE_ID}>`, inline: true }
                )
                .setColor(0x5865F2)
                .setTimestamp()
                .setFooter({ text: 'Automated License Vault' });

            const redeemRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_redeem_modal').setLabel('Claim License').setEmoji('💎').setStyle(ButtonStyle.Primary)
            );

            await redeemChannel.send({ embeds: [redeemEmbed], components: [redeemRow] });
        }
    } catch (err) {
        console.error('Error deploying redemption panel:', err);
    }
});

// ---------------------- INTERACTION HANDLER ----------------------
client.on('interactionCreate', async (interaction) => {

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'ping') {
            return interaction.reply({ content: `Pong! Latency: ${client.ws.ping}ms`, flags: [MessageFlags.Ephemeral] });
        }

        if (commandName === 'userinfo') {
            const user = interaction.options.getUser('target') || interaction.user;
            const member = await interaction.guild.members.fetch(user.id);
            const embed = new EmbedBuilder()
                .setTitle(`User Info - ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: 'ID', value: user.id, inline: true },
                    { name: 'Joined Server', value: member.joinedAt ? member.joinedAt.toDateString() : 'Unknown', inline: true }
                )
                .setColor(0x5865F2);
            return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }

        if (commandName === 'setup-generate') {
            const embed = new EmbedBuilder()
                .setTitle('⚡ License Key Generator Portal')
                .setDescription('Admin Access Only. Use the controls below to mint new license keys.')
                .setColor(0x5865F2);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_gen_key').setLabel('Mint License Key').setEmoji('🔑').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('admin_view_stats').setLabel('Key Database Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '⚡ Admin Key Generator Panel deployed!', flags: [MessageFlags.Ephemeral] });
        }

        if (commandName === 'setup-redeem') {
            const embed = new EmbedBuilder()
                .setTitle('✨ Vault Access & License Activation')
                .setDescription('Click the button below to submit your valid license key.')
                .setColor(0x2F3136);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_redeem_modal').setLabel('Claim License').setEmoji('💎').setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✨ Redemption Panel deployed successfully!', flags: [MessageFlags.Ephemeral] });
        }

        if (commandName === 'setup-ticket') {
            const embed = new EmbedBuilder()
                .setTitle('📩 Support Desk')
                .setDescription('Click the button below to open a private support ticket.')
                .setColor(0x5865F2);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('create_ticket').setLabel('Open Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: 'Ticket panel posted.', flags: [MessageFlags.Ephemeral] });
        }

        if (commandName === 'giveaway') {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === "create") {
                const prize = interaction.options.getString("prize", true);
                const durationText = interaction.options.getString("duration", true);
                const winners = interaction.options.getInteger("winners", true);

                const duration = parseDuration(durationText);

                if (!duration) {
                  return interaction.reply({
                    content: "❌ Invalid duration. Use `30s`, `10m`, `2h`, or `1d` (maximum 30 days).",
                    flags: [MessageFlags.Ephemeral]
                  });
                }

                const id = crypto.randomUUID().slice(0, 8);
                const endsAt = Date.now() + duration;

                db.prepare(`
                  INSERT INTO giveaways
                    (id, channel_id, prize, winners, ends_at)
                  VALUES (?, ?, ?, ?, ?)
                `).run(id, interaction.channelId, prize, winners, endsAt);

                const giveaway = db.prepare("SELECT * FROM giveaways WHERE id = ?").get(id);

                const message = await interaction.reply({
                  embeds: [giveawayEmbed(giveaway, 0)],
                  components: [giveawayButtons(id)],
                  fetchReply: true
                });

                db.prepare("UPDATE giveaways SET message_id = ? WHERE id = ?").run(message.id, id);
                return;
            }

            if (subcommand === "end") {
                const id = interaction.options.getString("id", true);
                const giveaway = db.prepare("SELECT * FROM giveaways WHERE id = ?").get(id);

                if (!giveaway) {
                  return interaction.reply({ content: "❌ Giveaway not found.", flags: [MessageFlags.Ephemeral] });
                }

                if (giveaway.ended) {
                  return interaction.reply({ content: "❌ That giveaway has already ended.", flags: [MessageFlags.Ephemeral] });
                }

                await interaction.reply({ content: "⏳ Ending giveaway...", flags: [MessageFlags.Ephemeral] });
                await finishGiveaway(id);
                return;
            }

            if (subcommand === "code") {
                const user = interaction.options.getUser("user", true);
                const row = db.prepare("SELECT code FROM buyer_codes WHERE user_id = ?").get(user.id);

                return interaction.reply({
                  content: row ? `🔑 Buyer code for ${user}: \`${row.code}\`` : `❌ ${user} does not have a Buyer code.`,
                  flags: [MessageFlags.Ephemeral]
                });
            }

            if (subcommand === "reroll") {
                const id = interaction.options.getString("id", true);
                const giveaway = db.prepare("SELECT * FROM giveaways WHERE id = ?").get(id);

                if (!giveaway) {
                  return interaction.reply({ content: "❌ Giveaway not found.", flags: [MessageFlags.Ephemeral] });
                }

                if (!giveaway.ended) {
                  return interaction.reply({ content: "❌ End the giveaway before rerolling.", flags: [MessageFlags.Ephemeral] });
                }

                const previousWinners = db.prepare(`
                    SELECT user_id FROM buyer_codes WHERE giveaway_id = ?
                  `).all(id).map(row => row.user_id);

                const eligible = db.prepare(`
                    SELECT user_id FROM entries WHERE giveaway_id = ?
                  `).all(id).map(row => row.user_id).filter(userId => !previousWinners.includes(userId));

                if (!eligible.length) {
                  return interaction.reply({ content: "❌ No eligible users remain for a reroll.", flags: [MessageFlags.Ephemeral] });
                }

                const winnerId = eligible[crypto.randomInt(eligible.length)];
                const code = getOrCreateBuyerCode(winnerId, id);

                try {
                  await sendWinnerDM(winnerId, giveaway.prize, code, true);
                  await interaction.reply(`🏆 Rerolled winner: <@${winnerId}>`);
                } catch (error) {
                  console.error(`Could not DM reroll winner ${winnerId}:`, error.message);
                  await interaction.reply({
                    content: `🏆 New winner: <@${winnerId}>, but I couldn't send their DM. Their code is available with \`/giveaway code\`.`,
                    flags: [MessageFlags.Ephemeral]
                  });
                }
                return;
            }
        }

        if (commandName === 'generate-code') {
            if (interaction.user.id !== ADMIN_USER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'Unauthorized.', flags: [MessageFlags.Ephemeral] });
            }
            const newKey = makeCode();
            validBuyerKeys.add(newKey);
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ New License Key Minted').setDescription(`\`\`\`${newKey}\`\`\``).setColor(0x57F287)], flags: [MessageFlags.Ephemeral] });
        }

        if (commandName === 'nuke') {
            if (interaction.user.id !== ADMIN_USER_ID && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.reply({ content: 'Unauthorized.', flags: [MessageFlags.Ephemeral] });
            }
            const currentChannel = interaction.channel;
            const position = currentChannel.position;
            await interaction.reply({ content: 'Nuking channel...' });
            const newChannel = await currentChannel.clone();
            await currentChannel.delete();
            await newChannel.setPosition(position);
            await newChannel.send('💥 **Channel Nuked and Rebuilt!**');
            return;
        }
    }

    if (interaction.isButton()) {

        if (interaction.customId.startsWith("giveaway_")) {
            const [action, giveawayId] = interaction.customId.split(":");
            const giveaway = db.prepare("SELECT * FROM giveaways WHERE id = ?").get(giveawayId);

            if (!giveaway) {
                return interaction.reply({ content: "❌ Giveaway not found.", flags: [MessageFlags.Ephemeral] });
            }

            if (action === "giveaway_info") {
                const count = db.prepare(`
                    SELECT COUNT(*) AS count FROM entries WHERE giveaway_id = ?
                  `).get(giveawayId).count;

                return interaction.reply({
                  content:
                    `🎉 **${giveaway.prize}**\n` +
                    `🏆 Winners: **${giveaway.winners}**\n` +
                    `👥 Entries: **${count}**\n` +
                    `⏳ Ends: <t:${Math.floor(giveaway.ends_at / 1000)}:F>\n` +
                    `🆔 ID: \`${giveawayId}\``,
                  flags: [MessageFlags.Ephemeral]
                });
            }

            if (action === "giveaway_enter") {
                if (giveaway.ended || Date.now() >= giveaway.ends_at) {
                  return interaction.reply({ content: "❌ This giveaway has already ended.", flags: [MessageFlags.Ephemeral] });
                }

                const result = db.prepare(`
                    INSERT OR IGNORE INTO entries (giveaway_id, user_id) VALUES (?, ?)
                  `).run(giveawayId, interaction.user.id);

                if (result.changes === 0) {
                  return interaction.reply({ content: "ℹ️ You're already entered!", flags: [MessageFlags.Ephemeral] });
                }

                await interaction.reply({ content: "🎟️ You're in! Good luck!", flags: [MessageFlags.Ephemeral] });
                await updateGiveawayMessage(giveawayId);
                return;
            }
        }

        if (interaction.customId === 'trigger_verify') {
            const captcha = generateCaptcha();
            activeCaptchas.set(interaction.user.id, captcha);

            const modal = new ModalBuilder().setCustomId('verify_modal').setTitle('Human Verification Security');
            const captchaInput = new TextInputBuilder()
                .setCustomId('captcha_code')
                .setLabel(`Security Code: ${captcha}`)
                .setPlaceholder(`Type "${captcha}" to verify`)
                .setStyle(TextInputStyle.Short)
                .setMinLength(6)
                .setMaxLength(6)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(captchaInput));
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'admin_gen_key') {
            if (interaction.user.id !== ADMIN_USER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '🚫 Admin required.', flags: [MessageFlags.Ephemeral] });
            }
            const newKey = makeCode();
            validBuyerKeys.add(newKey);
            const createdEmbed = new EmbedBuilder()
                .setTitle('✅ New License Key Minted')
                .setDescription(`\`\`\`${newKey}\`\`\``)
                .setColor(0x57F287);
            return interaction.reply({ embeds: [createdEmbed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.customId === 'admin_view_stats') {
            if (interaction.user.id !== ADMIN_USER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '🚫 Unauthorized.', flags: [MessageFlags.Ephemeral] });
            }
            const statsEmbed = new EmbedBuilder()
                .setTitle('📊 Key System Intelligence')
                .addFields({ name: 'Active Unredeemed Keys', value: `\`${validBuyerKeys.size}\` keys loaded`, inline: true })
                .setColor(0x00FFA3);
            return interaction.reply({ embeds: [statsEmbed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.customId === 'open_redeem_modal') {
            const modal = new ModalBuilder().setCustomId('redeem_modal').setTitle('License Key Redemption');
            const keyInput = new TextInputBuilder().setCustomId('key_input').setLabel('Enter Your License Key').setPlaceholder('BUYER-XXXX-XXXX').setStyle(TextInputStyle.Short).setMinLength(10).setMaxLength(25).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
            return await interaction.showModal(modal);
        }

        if (interaction.customId === 'create_ticket') {
            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const ticketEmbed = new EmbedBuilder()
                .setTitle(`Ticket: ${interaction.user.username}`)
                .setDescription(`Welcome <@${interaction.user.id}>!\nDescribe your issue below. Our **Gemini AI Assistant** will reply automatically, or click **Claim Ticket** to wait for staff.`)
                .setColor(0x5865F2);

            const ticketControls = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setEmoji('🙋‍♂️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ embeds: [ticketEmbed], components: [ticketControls] });
            return interaction.reply({ content: `Ticket created: ${ticketChannel}`, flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.customId === 'claim_ticket') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({ content: '🚫 Staff permission required to claim tickets.', flags: [MessageFlags.Ephemeral] });
            }
            const claimedEmbed = new EmbedBuilder()
                .setDescription(`🙋‍♂️ **Ticket Claimed:** <@${interaction.user.id}> is now handling this ticket.`)
                .setColor(0x00FFA3);
            return interaction.reply({ embeds: [claimedEmbed] });
        }

        if (interaction.customId === 'close_ticket') {
            await interaction.reply({ content: '🔒 **Closing ticket in 5 seconds...**' });
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {
                    console.error('Failed to delete channel:', e);
                }
            }, 5000);
            return;
        }
    }

    if (interaction.isModalSubmit()) {

        if (interaction.customId === 'verify_modal') {
            const inputCaptcha = interaction.fields.getTextInputValue('captcha_code').toUpperCase().trim();
            const expectedCaptcha = activeCaptchas.get(interaction.user.id);

            if (expectedCaptcha && inputCaptcha === expectedCaptcha) {
                activeCaptchas.delete(interaction.user.id);

                const memberRole = interaction.guild.roles.cache.get(MEMBER_ROLE_ID);
                if (memberRole) await interaction.member.roles.add(memberRole);

                const verifiedEmbed = new EmbedBuilder()
                    .setTitle('✅ Verification Successful')
                    .setDescription('Your identity has been confirmed! Your **Verified Member** role has been assigned.')
                    .setColor(0x57F287);

                return interaction.reply({ embeds: [verifiedEmbed], flags: [MessageFlags.Ephemeral] });
            } else {
                activeCaptchas.delete(interaction.user.id);
                const failEmbed = new EmbedBuilder()
                    .setTitle('❌ Verification Failed')
                    .setDescription('The security code entered was incorrect. Please try again.')
                    .setColor(0xED4245);
                return interaction.reply({ embeds: [failEmbed], flags: [MessageFlags.Ephemeral] });
            }
        }

        if (interaction.customId === 'redeem_modal') {
            const inputCode = interaction.fields.getTextInputValue('key_input').trim().toUpperCase();
            if (validBuyerKeys.has(inputCode)) {
                validBuyerKeys.delete(inputCode);
                const buyerRole = interaction.guild.roles.cache.get(BUYER_ROLE_ID);
                if (buyerRole) await interaction.member.roles.add(buyerRole);

                const successEmbed = new EmbedBuilder()
                    .setTitle('🎉 Activation Successful!')
                    .setDescription(`Welcome aboard! Your key \`${inputCode}\` has been validated and your **Buyer Role** is granted.`)
                    .setColor(0x57F287);
                return interaction.reply({ embeds: [successEmbed], flags: [MessageFlags.Ephemeral] });
            } else {
                const failEmbed = new EmbedBuilder()
                    .setTitle('❌ Activation Failed')
                    .setDescription(`The key \`${inputCode}\` is invalid, expired, or already redeemed.`)
                    .setColor(0xED4245);
                return interaction.reply({ embeds: [failEmbed], flags: [MessageFlags.Ephemeral] });
            }
        }
    }
});

// ---------------------- GEMINI AI TICKET RESPONSE ----------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.channel.name.startsWith('ticket-')) {
        try {
            await message.channel.sendTyping();
            
            const result = await aiModel.generateContent(message.content);
            const responseText = result.response.text();

            const reply = responseText.length > 2000 ? responseText.slice(0, 1997) + '...' : responseText;
            await message.reply(reply);
        } catch (err) {
            console.error('Gemini Error:', err);
            await message.reply('⚠️ Unable to query Gemini AI service at this time.');
        }
    }
});

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(TOKEN);
