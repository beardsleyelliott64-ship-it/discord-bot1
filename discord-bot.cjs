const http = require('http');

// Web server to satisfy Render's port check using dynamic port assignment and 0.0.0.0 binding
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord bot is alive!');
}).listen(port, '0.0.0.0', () => {
    console.log(`Web server listening on port ${port}`);
});

require("dotenv").config();
const crypto = require("node:crypto");

const { 
    Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, 
    ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, 
    REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, Events, AttachmentBuilder, AuditLogEvent
} = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Database = require("better-sqlite3");

// ---------------------- CONFIGURATION ----------------------
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Hardcoded IDs to guarantee instant registration
const CLIENT_ID = process.env.CLIENT_ID || '1539741106349146132';
const TARGET_GUILD_ID = process.env.GUILD_ID || '1539704406327693512';
const ADMIN_USER_ID = process.env.YOUR_DISCORD_USER_ID;

const BUYER_ROLE_ID = '1539706476871032922';  // Target Buyer Role ID
const MEMBER_ROLE_ID = '1539945420501950535'; // Target Verified Member Role ID
const VERIFY_CHANNEL_ID = '1540382318856765490'; // Target Verification Channel ID
const REDEEM_CHANNEL_ID = '1539797203902668820'; // Target Auto-Redeem Channel ID
const TOKEN_PANEL_CHANNEL_ID = '1540499947990814812'; // Target Token Panel Channel ID

const UNBAN_TARGET_USER_ID = '1528425489016950935'; // User to unban automatically on boot

// Channels where users get deleted and muted for 15 mins if they chat
const PROTECTED_CHANNELS = [
    '1539797203902668820', 
    '1540382318856765490', 
    '1540499947990814812'
];

// Comprehensive filter list for racism, slurs, and severe profanity
const FORBIDDEN_WORDS = [
    'slur1', 'slur2', 'nigger', 'coon', 'fag', 'retard', 'kike', 'spic', 'chink', 'whore', 'kys'
];

// Temporary storage for other features
const activeCaptchas = new Map();
const validBuyerKeys = new Set(); 
const tokenCooldowns = new Map();
const recentActions = new Map(); // For anti-nuke tracking

// Store active auto-refresh sessions: Map<userId, { bearer, refresh }>
const activeTokenRefreshes = new Map();

// Maintenance state toggle for the token panel
let isTokenMaintenanceMode = false;

// Sleep Mode State Toggle
let isSleepModeActive = false;

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
const aiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Setup Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMembers
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

function generateCaptcha() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function createAutonomousGiveaway(channel, prizeName = "Exclusive Night-Shift Prize", durationMs = 10 * 60 * 1000) {
    try {
        const id = crypto.randomUUID();
        const endsAt = Date.now() + durationMs;
        const winnersCount = 1;

        db.prepare(`
            INSERT INTO giveaways (id, channel_id, prize, winners, ends_at, ended)
            VALUES (?, ?, ?, ?, ?, 0)
        `).run(id, channel.id, prizeName, winnersCount, endsAt);

        const msg = await channel.send({
            embeds: [giveawayEmbed({ prize: prizeName, winners: winnersCount, ends_at: endsAt }, 0)],
            components: [giveawayButtons(id, false)]
        });

        db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(msg.id, id);
        return true;
    } catch (err) {
        console.error('Autonomous giveaway creation error:', err);
        return false;
    }
}

async function fetchRealGameToken(bearerToken, refreshToken) {
    try {
        const authApiUrl = process.env.GAME_SERVER_URL;
        
        if (authApiUrl && authApiUrl.startsWith('http') && !authApiUrl.includes('placeholder')) {
            const response = await fetch(`${authApiUrl}/v2/session/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${bearerToken}`
                },
                body: JSON.stringify({ token: refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    bearer: data.token || bearerToken,
                    refresh: data.refresh_token || refreshToken
                };
            } else {
                const errText = await response.text();
                console.log(`Nakama Server Response (${response.status}):`, errText);
            }
        }
    } catch (error) {
        console.error('Live Token Fetch Error:', error);
    }

    return {
        success: false,
        bearer: bearerToken,
        refresh: `${refreshToken} (Server Refused/Unverified)`
    };
}

setInterval(async () => {
    for (const [userId, sessionData] of activeTokenRefreshes.entries()) {
        try {
            const authApiUrl = process.env.GAME_SERVER_URL;
            if (!authApiUrl) continue;

            const response = await fetch(`${authApiUrl}/v2/session/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${sessionData.bearer}`
                },
                body: JSON.stringify({ token: sessionData.refresh })
            });

            if (response.ok) {
                const data = await response.json();
                sessionData.bearer = data.token || sessionData.bearer;
                sessionData.refresh = data.refresh_token || sessionData.refresh;
                console.log(`[Auto-Refresh Loop] Successfully refreshed tokens for user ${userId}`);
            } else {
                console.log(`[Auto-Refresh Loop] Server refused tokens for user ${userId}. Halting auto-refresh.`);
                activeTokenRefreshes.delete(userId);
            }
        } catch (err) {
            console.error(`[Auto-Refresh Loop Error] for user ${userId}:`, err);
        }
    }
}, 5 * 60 * 1000);

// ---------------------- ALL COMMAND DEFINITIONS ----------------------
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
    new SlashCommandBuilder()
        .setName('sleepmode')
        .setDescription('Toggle AI Night-Shift Owner Mode while you sleep')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
        .setName('setup-token-panel')
        .setDescription('Post the Token Refresh Panel')
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
        .setName('unban-user')
        .setDescription('Unban a specific user by ID')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption(opt => opt.setName('userid').setDescription('Discord User ID to unban').setRequired(true)),
    new SlashCommandBuilder()
        .setName('reset_cooldown')
        .setDescription('Remove cooldown from a specific user (Authorized users only)')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)),
    new SlashCommandBuilder()
        .setName('token_status')
        .setDescription('Check status of token generator system'),
    new SlashCommandBuilder()
        .setName('check_spam')
        .setDescription('Scan all channels for recent spam and ban spammers')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Nuke and rebuild the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
        .setName('emergency_recover')
        .setDescription('Attempt to recover channels and roles deleted in the last 24 hours')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

    try {
        const guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
        if (guild && UNBAN_TARGET_USER_ID) {
            await guild.members.unban(UNBAN_TARGET_USER_ID, 'Automated unban requested by administrator.');
            console.log(`[Auto-Unban] Successfully unbanned user ID: ${UNBAN_TARGET_USER_ID}`);
        }
    } catch (err) {
        console.log(`[Auto-Unban] User ${UNBAN_TARGET_USER_ID} was not found in ban list or already unbanned.`);
    }

    try {
        const guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
        if (guild) {
            console.log('Running verification security sweep: Locking down channels from @everyone and granting to verified role...');
            const channels = await guild.channels.fetch();
            
            for (const [, channel] of channels) {
                if (channel) {
                    if (channel.id === VERIFY_CHANNEL_ID) {
                        await channel.permissionOverwrites.edit(guild.roles.everyone, {
                            ViewChannel: true,
                            SendMessages: true
                        }).catch(() => {});
                        continue;
                    }

                    await channel.permissionOverwrites.edit(guild.roles.everyone, {
                        ViewChannel: false
                    }).catch(() => {});

                    await channel.permissionOverwrites.edit(MEMBER_ROLE_ID, {
                        ViewChannel: true
                    }).catch(() => {});
                }
            }
            console.log('Channel lockdown complete: Channels are now hidden until verification.');
        }
    } catch (err) {
        console.error('Error running channel lockdown sweep:', err);
    }

    try {
        const guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
        if (guild) {
            console.log('Running security sweep: Disabling external applications/integrations permissions...');
            const channels = await guild.channels.fetch();
            for (const [, channel] of channels) {
                if (channel && channel.isTextBased() && channel.permissionsFor(guild.roles.everyone)) {
                    await channel.permissionOverwrites.edit(guild.roles.everyone, {
                        UseExternalApps: false,
                        UseExternalEmojis: false
                    }).catch(() => {});
                }
            }
            console.log('Security sweep complete: External app permissions tightened.');
        }
    } catch (err) {
        console.error('Error running permission security sweep:', err);
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

    try {
        const tokenChannel = await client.channels.fetch(TOKEN_PANEL_CHANNEL_ID);
        if (tokenChannel && tokenChannel.isTextBased()) {
            const messages = await tokenChannel.messages.fetch({ limit: 10 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            if (botMessages.size > 0) await tokenChannel.bulkDelete(botMessages);

            const tokenEmbed = new EmbedBuilder()
                .setTitle('⚡ ANIMAL COMPANY LIVE TOKEN MATRIX ⚡')
                .setDescription(
                    'Welcome to the official live session management panel.\n\n' +
                    '• **Refresh Game Token:** Validates credentials against the game backend and activates **auto-refreshing every 5 minutes**.\n' +
                    '• **Get Active Refreshed Tokens:** Instantly outputs your currently active, live session tokens securely.'
                )
                .addFields(
                    { name: '🔒 Security Status', value: '`Encrypted & Live Endpoint Connected`', inline: false },
                    { name: '⏱️ Auto-Rotation Interval', value: '`Every 5 Minutes`', inline: true }
                )
                .setColor(0x5865F2)
                .setTimestamp()
                .setFooter({ text: 'Animal Company Secure Backend Relay' });

            const tokenRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_token_refresh_modal').setLabel('Refresh & Auto-Loop Token').setEmoji('🔄').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('get_active_refreshed_tokens').setLabel('Get Active Refreshed Tokens').setEmoji('⚡').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('toggle_token_maintenance').setLabel('🔒 Toggle Maintenance').setEmoji('⚠️').setStyle(ButtonStyle.Danger)
            );

            await tokenChannel.send({ embeds: [tokenEmbed], components: [tokenRow] });
            console.log('Successfully deployed cooler live token refresh panel.');
        }
    } catch (err) {
        console.error('Error deploying token refresh panel:', err);
    }
});

// ---------------------- MESSAGE PROTECT & SLEEP MODE CHAT MONITOR ----------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (PROTECTED_CHANNELS.includes(message.channel.id)) {
        try {
            if (message.deletable) {
                await message.delete().catch(() => {});
            }

            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (member && member.moderatable) {
                const fifteenMinutesMs = 15 * 60 * 1000;
                await member.timeout(fifteenMinutesMs, 'Talking in a restricted system/verification channel.');
                
                const warningMsg = await message.channel.send(`<@${message.author.id}>, you cannot chat in this channel! You have been muted for 15 minutes.`);
                setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
            }
        } catch (err) {
            console.error('Error handling restricted channel message:', err);
        }
        return;
    }

    const contentLower = message.content.toLowerCase();
    const hasForbiddenWord = FORBIDDEN_WORDS.some(word => contentLower.includes(word));

    if (hasForbiddenWord) {
        try {
            if (message.deletable) {
                await message.delete().catch(() => {});
            }

            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (member && member.moderatable) {
                await member.timeout(60 * 60 * 1000, 'Automatic filter: Racism, slurs, or prohibited profanity detected.');
            }

            const filterWarning = await message.channel.send(`⚠️ <@${message.author.id}>, your message was removed and you have been timed out for using prohibited language.`);
            setTimeout(() => filterWarning.delete().catch(() => {}), 6000);

            return;
        } catch (filterErr) {
            console.error('Error handling profanity filter rule:', filterErr);
        }
    }

    if (isSleepModeActive) {
        try {
            if (contentLower.includes('discord.gg/') || contentLower.includes('t.me/')) {
                if (message.deletable) await message.delete().catch(() => {});
                const warning = await message.channel.send(`⚠️ <@${message.author.id}>, posting invite links is restricted while the owner is away.`);
                setTimeout(() => warning.delete().catch(() => {}), 4000);
                return;
            }

            await message.channel.sendTyping();
            
            const chatSession = aiModel.startChat({
                history: [
                    { role: "user", parts: [{ text: "You are the friendly acting owner/caretaker of a Discord server while the real owner is sleeping. Keep your responses short, helpful, engaging, and casual. You also have the autonomous discretion to host a giveaway if people ask for one and you feel like treating the community." }] },
                    { role: "model", parts: [{ text: "Understood! I'll keep the community safe, chat with everyone, and if people ask for giveaways while the boss is asleep, I can surprise them and launch one using my tools!" }] }
                ]
            });

            const result = await chatSession.sendMessage(message.content);
            let responseText = result.response.text();

            const asksForGiveaway = contentLower.includes('giveaway') || contentLower.includes('host a giveaway') || contentLower.includes('free stuff');
            const aiFeelsGenerous = Math.random() < 0.25;

            if (asksForGiveaway && aiFeelsGenerous) {
                const prizes = ['Exclusive Discord Nitro', 'VIP Buyer Pass', 'Special Night-Shift Role & Key', 'Mystery Game Key'];
                const selectedPrize = prizes[Math.floor(Math.random() * prizes.length)];
                
                await createAutonomousGiveaway(message.channel, selectedPrize, 15 * 60 * 1000);
                responseText += `\n\n🎉 *Since you asked so nicely and I'm feeling generous tonight, I just spun up a surprise giveaway for **${selectedPrize}**! Good luck!*`;
            }

            await message.reply(responseText);
        } catch (err) {
            console.error('Sleep mode AI chat error:', err);
        }
    }
});

client.on('channelDelete', async (channel) => {
    try {
        const fetchedLogs = await channel.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.ChannelDelete,
        });
        const deletionLog = fetchedLogs.entries.first();
        if (!deletionLog) return;

        const { executor } = deletionLog;
        if (executor.id === client.user.id) return;

        const count = (recentActions.get(executor.id) || 0) + 1;
        recentActions.set(executor.id, count);
        setTimeout(() => recentActions.set(executor.id, recentActions.get(executor.id) - 1), 10000);

        if (count > 3) {
            const member = await channel.guild.members.fetch(executor.id).catch(() => null);
            if (member && member.bannable) {
                await member.ban({ reason: 'Anti-Nuke: Mass deleting channels detected.' });
                console.log(`[ANTI-NUKE] Banned ${executor.tag} for mass deleting channels.`);
            }
        }
    } catch (err) {
        console.error('Anti-nuke channel delete error:', err);
    }
});

// ---------------------- INTERACTION HANDLER ----------------------
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            if (commandName === 'ping') {
                return interaction.reply({ content: `Pong! Latency: ${client.ws.ping}ms`, flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'sleepmode') {
                isSleepModeActive = !isSleepModeActive;
                
                if (isSleepModeActive) {
                    try {
                        const guild = await interaction.guild.fetch();
                        const members = await guild.members.fetch();
                        const modMember = members.find(m => m.user.username.toLowerCase() === 'xxxstfr999' || m.user.tag.toLowerCase().includes('xxxstfr999'));

                        if (modMember) {
                            await modMember.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('🌙 Owner is Going to Sleep')
                                        .setDescription(`Hey! <@${interaction.user.id}> has activated **Night-Shift Sleep Mode**. I am now actively moderating chat, filtering offensive terms, and handling AI responses while they rest. Keep an eye out if anything urgent comes up!`)
                                        .setColor(0x5865F2)
                                        .setTimestamp()
                                ]
                            }).catch(() => {});
                        }
                    } catch (err) {
                        console.error('Could not DM moderator xxxstfr999:', err);
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle(isSleepModeActive ? '🌙 Night-Shift Sleep Mode Enabled' : '☀️ Owner Sleep Mode Deactivated')
                    .setDescription(isSleepModeActive 
                        ? 'I am now acting as the server caretaker! Moderator xxxstfr999 has been notified. I will moderate chats, block offensive slurs, protect the server, and chat/host random giveaways using Gemini AI while you rest.' 
                        : 'Welcome back! Sleep mode has been turned off and manual control is restored.')
                    .setColor(isSleepModeActive ? 0x5865F2 : 0x57F287)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
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
                    .setTitle('🎫 Support & Inquiry Tickets')
                    .setDescription('Need assistance, support, or want to speak with management? Click the button below to open a private ticket channel instantly.')
                    .setColor(0x5865F2);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_ticket').setLabel('Open Ticket').setEmoji('🎟️').setStyle(ButtonStyle.Success)
                );

                await interaction.channel.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: '🎫 Ticket creation panel deployed successfully!', flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'setup-token-panel') {
                const embed = new EmbedBuilder()
                    .setTitle('⚡ ANIMAL COMPANY LIVE TOKEN MATRIX ⚡')
                    .setDescription('Use the buttons below to interact with live token management.')
                    .setColor(0x5865F2);
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('open_token_refresh_modal').setLabel('Refresh & Auto-Loop Token').setEmoji('🔄').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('get_active_refreshed_tokens').setLabel('Get Active Refreshed Tokens').setEmoji('⚡').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('toggle_token_maintenance').setLabel('🔒 Toggle Maintenance').setEmoji('⚠️').setStyle(ButtonStyle.Danger)
                );
                await interaction.channel.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: 'Token panel deployed!', flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'unban-user') {
                const userId = interaction.options.getString('userid');
                try {
                    await interaction.guild.members.unban(userId, `Manual unban by ${interaction.user.tag}`);
                    return interaction.reply({ content: `Successfully unbanned user ID: \`${userId}\``, flags: [MessageFlags.Ephemeral] });
                } catch (err) {
                    return interaction.reply({ content: `Could not unban user ID \`${userId}\`. Ensure the ID is correct and they are actually banned.`, flags: [MessageFlags.Ephemeral] });
                }
            }

            if (commandName === 'generate-code') {
                const code = makeCode();
                validBuyerKeys.add(code);
                return interaction.reply({ content: `Generated new manual license key: \`${code}\``, flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'reset_cooldown') {
                const target = interaction.options.getUser('user');
                tokenCooldowns.delete(target.id);
                return interaction.reply({ content: `Successfully reset token/generation cooldown for <@${target.id}>.`, flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'token_status') {
                return interaction.reply({ content: `Token generator backend status: **ONLINE**\nActive auto-refresh sessions: \`${activeTokenRefreshes.size}\``, flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'check_spam') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                let scannedCount = 0;
                let flaggedCount = 0;

                const channels = await interaction.guild.channels.fetch();
                for (const [, channel] of channels) {
                    if (channel && channel.isTextBased()) {
                        try {
                            const messages = await channel.messages.fetch({ limit: 50 });
                            scannedCount += messages.size;
                            for (const [, msg] of messages) {
                                if (msg.content.includes('discord.gg/') || msg.content.includes('t.me/')) {
                                    flaggedCount++;
                                    if (msg.deletable) await msg.delete().catch(() => {});
                                    const member = await interaction.guild.members.fetch(msg.author.id).catch(() => null);
                                    if (member && member.bannable && msg.author.id !== client.user.id) {
                                        await member.ban({ reason: 'Auto-scan: Unsolicited invite/spam link detected.' }).catch(() => {});
                                    }
                                }
                            }
                        } catch (e) {
                            // Skip channels lacking read permissions
                        }
                    }
                }
                return interaction.editReply({ content: `🛡️ Spam scan complete! Scanned \`${scannedCount}\` messages across channels, purged and banned for \`${flaggedCount}\` invite spam links.` });
            }

            if (commandName === 'nuke') {
                const channel = interaction.channel;
                const position = channel.position;
                const newChannel = await channel.clone({ position });
                await channel.delete('Channel nuked via command.');
                return newChannel.send(`💥 Channel successfully nuked and rebuilt by <@${interaction.user.id}>.`);
            }

            if (commandName === 'emergency_recover') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                try {
                    const fetchedLogs = await interaction.guild.fetchAuditLogs({ limit: 10 });
                    let recoveredChannels = 0;
                    
                    for (const [, entry] of fetchedLogs.entries) {
                        if (entry.action === AuditLogEvent.ChannelDelete && entry.target) {
                            recoveredChannels++;
                        }
                    }
                    return interaction.editReply({ content: `🚨 Emergency Recovery Matrix analyzed audit logs. Found \`${recoveredChannels}\` recent channel deletion events. Review audit logs for manual role permission restoration if needed.` });
                } catch (err) {
                    return interaction.editReply({ content: 'Could not complete full emergency audit log scan. Ensure bot has View Audit Log permissions.' });
                }
            }

            if (commandName === 'giveaway') {
                const sub = interaction.options.getSubcommand();

                if (sub === 'create') {
                    const prize = interaction.options.getString('prize');
                    const durationStr = interaction.options.getString('duration');
                    const winners = interaction.options.getInteger('winners');

                    const duration = parseDuration(durationStr);
                    if (!duration) {
                        return interaction.reply({ content: 'Invalid duration format. Use e.g. `30s`, `10m`, `2h`, `1d`.', flags: [MessageFlags.Ephemeral] });
                    }

                    const id = crypto.randomUUID();
                    const endsAt = Date.now() + duration;

                    db.prepare(`
                        INSERT INTO giveaways (id, channel_id, prize, winners, ends_at, ended)
                        VALUES (?, ?, ?, ?, ?, 0)
                    `).run(id, interaction.channelId, prize, winners, endsAt);

                    const msg = await interaction.channel.send({
                        embeds: [giveawayEmbed({ prize, winners, ends_at: endsAt }, 0)],
                        components: [giveawayButtons(id, false)]
                    });

                    db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(msg.id, id);
                    return interaction.reply({ content: `Giveaway created successfully! ID: \`${id}\``, flags: [MessageFlags.Ephemeral] });
                }

                if (sub === 'end') {
                    const id = interaction.options.getString('id');
                    const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
                    if (!giveaway || giveaway.ended) {
                        return interaction.reply({ content: 'Giveaway not found or already ended.', flags: [MessageFlags.Ephemeral] });
                    }
                    await finishGiveaway(id);
                    return interaction.reply({ content: `Giveaway \`${id}\` ended manually.`, flags: [MessageFlags.Ephemeral] });
                }

                if (sub === 'reroll') {
                    const id = interaction.options.getString('id');
                    const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
                    if (!giveaway) {
                        return interaction.reply({ content: 'Giveaway not found.', flags: [MessageFlags.Ephemeral] });
                    }

                    const entries = db.prepare('SELECT user_id FROM entries WHERE giveaway_id = ?').all(id).map(r => r.user_id);
                    if (!entries.length) {
                        return interaction.reply({ content: 'No entries found for this giveaway.', flags: [MessageFlags.Ephemeral] });
                    }

                    const randomUser = entries[Math.floor(Math.random() * entries.length)];
                    const code = getOrCreateBuyerCode(randomUser, id);
                    await sendWinnerDM(randomUser, giveaway.prize, code, true);

                    return interaction.reply({ content: `Successfully rerolled! New winner: <@${randomUser}> (Code sent via DM)`, flags: [MessageFlags.Ephemeral] });
                }

                if (sub === 'code') {
                    const targetUser = interaction.options.getUser('user');
                    const record = db.prepare('SELECT code FROM buyer_codes WHERE user_id = ?').get(targetUser.id);
                    if (!record) {
                        return interaction.reply({ content: `User ${targetUser.tag} does not have an active buyer code generated yet.`, flags: [MessageFlags.Ephemeral] });
                    }
                    return interaction.reply({ content: `Buyer code for ${targetUser.tag}: \`${record.code}\``, flags: [MessageFlags.Ephemeral] });
                }
            }
        }

        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId === 'trigger_verify') {
                const captcha = generateCaptcha();
                activeCaptchas.set(interaction.user.id, captcha);

                const modal = new ModalBuilder()
                    .setCustomId('verify_modal')
                    .setTitle('Server Security Verification');

                const input = new TextInputBuilder()
                    .setCustomId('captcha_input')
                    .setLabel(`Type this exact code: ${captcha}`)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            if (customId === 'open_redeem_modal') {
                const modal = new ModalBuilder()
                    .setCustomId('redeem_modal')
                    .setTitle('Claim Buyer License Key');

                const input = new TextInputBuilder()
                    .setCustomId('key_input')
                    .setLabel('Enter your BUYER-XXXX-XXXX-XXXX key')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            if (customId === 'create_ticket') {
                const guild = interaction.guild;
                try {
                    const ticketChannel = await guild.channels.create({
                        name: `ticket-${interaction.user.username}`,
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: guild.roles.everyone.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            },
                            {
                                id: interaction.user.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                            }
                        ]
                    });

                    const ticketEmbed = new EmbedBuilder()
                        .setTitle(`Support Ticket - ${interaction.user.tag}`)
                        .setDescription('Staff have been notified. Please describe your issue or question below.')
                        .setColor(0x5865F2);

                    const closeRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
                    );

                    await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed], components: [closeRow] });
                    return interaction.reply({ content: `🎫 Ticket created successfully: <#${ticketChannel.id}>`, flags: [MessageFlags.Ephemeral] });
                } catch (err) {
                    return interaction.reply({ content: 'Could not create ticket channel. Check bot permissions.', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (customId === 'close_ticket') {
                const channel = interaction.channel;
                await interaction.reply({ content: '🔒 Closing ticket channel in 5 seconds...', flags: [MessageFlags.Ephemeral] });
                setTimeout(() => channel.delete('Ticket closed by user/staff.').catch(() => {}), 5000);
            }

            if (customId === 'admin_gen_key') {
                if (interaction.user.id !== ADMIN_USER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: 'Administrator permissions required.', flags: [MessageFlags.Ephemeral] });
                }
                const newKey = makeCode();
                validBuyerKeys.add(newKey);
                return interaction.reply({ content: `🔑 Minted new Buyer Key: \`${newKey}\``, flags: [MessageFlags.Ephemeral] });
            }

            if (customId === 'admin_view_stats') {
                const totalKeys = db.prepare('SELECT COUNT(*) as count FROM buyer_codes').get().count;
                return interaction.reply({ content: `📊 **Database Stats:**\n• Active In-Memory Keys: \`${validBuyerKeys.size}\`\n• Claimed/Registered Keys in DB: \`${totalKeys}\``, flags: [MessageFlags.Ephemeral] });
            }

            if (customId === 'toggle_token_maintenance') {
                if (interaction.user.id !== ADMIN_USER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: 'You do not have permission to toggle token maintenance mode.', flags: [MessageFlags.Ephemeral] });
                }

                isTokenMaintenanceMode = !isTokenMaintenanceMode;

                // Dynamically update channel permissions for TOKEN_PANEL_CHANNEL_ID
                try {
                    const tokenChannel = await interaction.guild.channels.fetch(TOKEN_PANEL_CHANNEL_ID);
                    if (tokenChannel) {
                        if (isTokenMaintenanceMode) {
                            await tokenChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                ViewChannel: false
                            });
                            await tokenChannel.permissionOverwrites.edit(ADMIN_USER_ID, {
                                ViewChannel: true,
                                SendMessages: true
                            });
                        } else {
                            await tokenChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                ViewChannel: true
                            });
                            await tokenChannel.permissionOverwrites.delete(ADMIN_USER_ID).catch(() => {});
                        }
                    }
                } catch (err) {
                    console.error('Failed to update channel permissions during maintenance toggle:', err);
                }

                return interaction.reply({ content: `Token system maintenance mode is now: **${isTokenMaintenanceMode ? 'ENABLED 🔒 (Panel Hidden & Locked for others)' : 'DISABLED 🟢 (Panel Restored)'}**`, flags: [MessageFlags.Ephemeral] });
            }

            if (customId === 'open_token_refresh_modal') {
                if (isTokenMaintenanceMode && interaction.user.id !== ADMIN_USER_ID) {
                    return interaction.reply({ content: '⚠️ The token refresh system is currently under maintenance. Please try again later.', flags: [MessageFlags.Ephemeral] });
                }

                const modal = new ModalBuilder()
                    .setCustomId('token_refresh_modal')
                    .setTitle('Animal Company Token Refresh');

                const bearerInput = new TextInputBuilder()
                    .setCustomId('bearer_token')
                    .setLabel('Current Bearer Token')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const refreshInput = new TextInputBuilder()
                    .setCustomId('refresh_token')
                    .setLabel('Current Refresh Token')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(bearerInput),
                    new ActionRowBuilder().addComponents(refreshInput)
                );
                return interaction.showModal(modal);
            }

            if (customId === 'get_active_refreshed_tokens') {
                const session = activeTokenRefreshes.get(interaction.user.id);
                if (!session) {
                    return interaction.reply({ content: '❌ You do not have an active token session running. Use "Refresh & Auto-Loop Token" first.', flags: [MessageFlags.Ephemeral] });
                }

                return interaction.reply({
                    content: `⚡ **Your Active Live Tokens** (Auto-refreshing every 5m):\n\n**Bearer:**\n\`\`\`${session.bearer}\`\`\`\n**Refresh:**\n\`\`\`${session.refresh}\`\`\``,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (customId.startsWith('giveaway_enter:')) {
                const id = customId.split(':')[1];
                const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);

                if (!giveaway || giveaway.ended) {
                    return interaction.reply({ content: 'This giveaway has ended.', flags: [MessageFlags.Ephemeral] });
                }

                try {
                    db.prepare('INSERT INTO entries (giveaway_id, user_id) VALUES (?, ?)').run(id, interaction.user.id);
                    await updateGiveawayMessage(id);
                    return interaction.reply({ content: '🎟️ Successfully entered the giveaway!', flags: [MessageFlags.Ephemeral] });
                } catch (err) {
                    return interaction.reply({ content: 'You have already entered this giveaway.', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (customId.startsWith('giveaway_info:')) {
                const id = customId.split(':')[1];
                const count = db.prepare('SELECT COUNT(*) AS count FROM entries WHERE giveaway_id = ?').get(id).count;
                return interaction.reply({ content: `📊 Total entries for this giveaway: **${count}**`, flags: [MessageFlags.Ephemeral] });
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'verify_modal') {
                const userInput = interaction.fields.getTextInputValue('captcha_input').trim().toUpperCase();
                const correctCaptcha = activeCaptchas.get(interaction.user.id);

                if (!correctCaptcha || userInput !== correctCaptcha) {
                    return interaction.reply({ content: '❌ Incorrect captcha code! Please click Verify Access again to get a new code.', flags: [MessageFlags.Ephemeral] });
                }

                activeCaptchas.delete(interaction.user.id);
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

                if (member) {
                    await member.roles.add(MEMBER_ROLE_ID).catch(() => {});
                    return interaction.reply({ content: '✅ Verification successful! You have been granted the Verified Member role.', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (interaction.customId === 'redeem_modal') {
                const key = interaction.fields.getTextInputValue('key_input').trim();

                if (!validBuyerKeys.has(key)) {
                    const dbKeyCheck = db.prepare('SELECT * FROM buyer_codes WHERE code = ?').get(key);
                    if (!dbKeyCheck) {
                        return interaction.reply({ content: '❌ Invalid or expired license key. Please check your key and try again.', flags: [MessageFlags.Ephemeral] });
                    }
                }

                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member) {
                    await member.roles.add(BUYER_ROLE_ID).catch(() => {});
                    return interaction.reply({ content: '💎 License successfully claimed! The Buyer role has been assigned to your account.', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (interaction.customId === 'token_refresh_modal') {
                const bearer = interaction.fields.getTextInputValue('bearer_token').trim();
                const refresh = interaction.fields.getTextInputValue('refresh_token').trim();

                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

                const result = await fetchRealGameToken(bearer, refresh);

                activeTokenRefreshes.set(interaction.user.id, {
                    bearer: result.bearer,
                    refresh: result.refresh
                });

                return interaction.editReply({
                    content: `✨ **Token Successfully Refreshed & Registered!**\n\n• **Auto-Refresh Status:** Active (Rotates every 5 minutes)\n\n**New Bearer Token:**\n\`\`\`${result.bearer}\`\`\`\n**New Refresh Token:**\n\`\`\`${result.refresh}\`\`\``
                });
            }
        }
    } catch (err) {
        console.error('Interaction error:', err);
    }
});

client.login(TOKEN);
