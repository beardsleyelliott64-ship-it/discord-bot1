const http = require('http');

// Web server to satisfy Render's port check using dynamic port assignment and 0.0.0.0 binding
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord bot is alive!');
}).listen(port, '0.0.0.0', () => {
    console.log(`Web server listening on port ${port}[cite: 6]`);
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

const BUYER_ROLE_ID = '1540841149554499634';  // Supporter / Buyer Role ID
const ADMIN_ROLE_ID = 'YOUR_ADMIN_ROLE_ID_HERE'; // Secondary authorized role ID for key generation
const MEMBER_ROLE_ID = '1539945420501950535'; // Target Verified Member Role ID
const UNBAN_TARGET_USER_ID = '1528425489016950935'; // User to unban automatically on boot

// Dynamic references initialized with your requested specific channel IDs
let VERIFY_CHANNEL_ID = '1540840661266210826';
let REDEEM_CHANNEL_ID = '1540840667725570099';
let TOKEN_PANEL_CHANNEL_ID = '1540840668614754304';

// Channels where users get deleted and muted for 15 mins if they chat
const PROTECTED_CHANNELS = [
    '1540840667725570099', 
    '1540840668614754304', 
    '1540840661266210826'
];

// Channels where people can see them but cannot talk (Read-only setup)
const READ_ONLY_CHANNELS = [
    '1540840661740421322', 
    '1540840662767902751', 
    '1540840664076656692', 
    '1540840673954111608', 
    '1540840674969128980'
];

// The strict last 2 IDs where absolute no-one can talk
const STRICT_LOCKED_CHANNELS = [
    '1540840673954111608', 
    '1540840674969128980'
];

// Comprehensive filter list for racism, slurs, and severe profanity
const FORBIDDEN_WORDS = [
    'slur1', 'slur2', 'nigger', 'coon', 'fag', 'retard', 'kike', 'spic', 'chink', 'whore', 'kys'
];

// Temporary storage for other features
const activeCaptchas = new Map();
const validBuyerKeys = new Set(); 
const tokenCooldowns = new Map();

// Store active auto-refresh sessions: Map<userId, { bearer, refresh, lastRotated }>
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
  user_id TEXT,
  code TEXT PRIMARY KEY,
  giveaway_id TEXT,
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

// Helper: Upgraded Supporter Key Generator (SUPORTER-XXXX-XXXX-XXXX)
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function part(length) {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[crypto.randomInt(chars.length)];
    }
    return result;
  }
  return `SUPORTER-${part(4)}-${part(4)}-${part(4)}`;
}

// Helper: Check if user has permission to generate keys or run special commands (billyis1234 or required roles)
function hasSpecialPermission(member) {
    if (!member) return false;
    if (member.user.username === 'billyis1234') return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (member.roles.cache.has(BUYER_ROLE_ID) || member.roles.cache.has(ADMIN_ROLE_ID)) return true;
    return false;
}

// Helper: Mint and save a fresh key directly to the database so it can be redeemed via the panel
function mintAndSaveKey(userId = null, giveawayId = 'MANUAL_MINT') {
  let code;
  do {
    code = makeCode();
  } while (db.prepare("SELECT 1 FROM buyer_codes WHERE code = ?").get(code));

  db.prepare(`
    INSERT INTO buyer_codes (user_id, code, giveaway_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, code, giveawayId, Date.now());

  validBuyerKeys.add(code);
  return code;
}

function getOrCreateBuyerCode(userId, giveawayId) {
  const existing = db.prepare("SELECT code FROM buyer_codes WHERE user_id = ?").get(userId);
  if (existing) return existing.code;

  const code = mintAndSaveKey(userId, giveawayId);
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
  if (!Number.isSafeInteger(duration) || duration < 1000 || duration > 30 * 86400000) {
    return null;
  }
  return duration;
}

function giveawayEmbed(giveaway, entryCount) {
  return new EmbedBuilder()
    .setTitle("🎉 SUPPORTER GIVEAWAY VAULT")
    .setDescription(
      `> Participate in our exclusive community supporter events to win premium licenses and rewards.\n\n` +
      `🎁 **Prize:** \`${giveaway.prize}\`\n` +
      `🏆 **Winners:** \`${giveaway.winners}\`\n` +
      `👥 **Total Entries:** \`${entryCount}\`\n` +
      `⏳ **Concludes:** <t:${Math.floor(giveaway.ends_at / 1000)}:R>\n\n` +
      `*Click the button below to secure your entry slot.*`
    )
    .setFooter({ text: "Powered by Supporter Verification Security Matrix" })
    .setTimestamp()
    .setColor(0x5865F2);
}

function giveawayButtons(id, ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter:${id}`)
      .setLabel(ended ? "Giveaway Concluded" : "Enter Giveaway")
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
  const giveaway = db.prepare("SELECT * FROM giveaways WHERE id = ?").get(giveawayId);
  if (!giveaway || !giveaway.message_id) return;

  try {
    const channel = await client.channels.fetch(giveaway.channel_id);
    const message = await channel.messages.fetch(giveaway.message_id);
    const count = db.prepare("SELECT COUNT(*) AS count FROM entries WHERE giveaway_id = ?").get(giveawayId).count;

    await message.edit({
      embeds: [giveawayEmbed(giveaway, count)],
      components: [giveawayButtons(giveawayId, Boolean(giveaway.ended))]
    });
  } catch (error) {
    console.error(`Could not update giveaway ${giveawayId}:`, error.message);
  }
}

async function sendWinnerDM(userId, prize, code, reroll = false) {
  const user = await client.users.fetch(userId);
  const title = reroll ? "🎉 You Won the Supporter Reroll!" : "🎉 You Won the Supporter Giveaway!";

  await user.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          `Congratulations! You have successfully won **${prize}**.\n\n` +
          `🔑 **Your Exclusive Supporter License Key**\n` +
          `\`\`\`${code}\`\`\`\n` +
          `Keep this key private and secure. It is bound directly to your verified Discord account profile.`
        )
        .setFooter({ text: "Automated Supporter Fulfillment Vault" })
        .setTimestamp()
        .setColor(0x57F287)
    ]
  });
}

async function finishGiveaway(giveawayId) {
  const giveaway = db.prepare("SELECT * FROM giveaways WHERE id = ?").get(giveawayId);
  if (!giveaway || giveaway.ended) return;

  db.prepare("UPDATE giveaways SET ended = 1 WHERE id = ?").run(giveawayId);

  const entries = db.prepare("SELECT user_id FROM entries WHERE giveaway_id = ?").all(giveawayId).map(row => row.user_id);
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, Math.min(giveaway.winners, shuffled.length));

  const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);

  if (!winners.length) {
    if (channel?.isTextBased()) {
      await channel.send(`🎉 The giveaway for **${giveaway.prize}** concluded, but there were no valid entries recorded.`);
    }
    await updateGiveawayMessage(giveawayId);
    return;
  }

  const winnerMentions = winners.map(userId => `<@${userId}>`).join(", ");

  if (channel?.isTextBased()) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏆 Official Giveaway Results")
          .setDescription(
            `Congratulations to our winner(s): ${winnerMentions}!\n\n` +
            `You won **${giveaway.prize}**.\n` +
            `Your private Supporter license key has been securely dispatched to your DMs.`
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
      console.error(`Could not send direct message to winner ${userId}:`, error.message);
    }
  }

  await updateGiveawayMessage(giveawayId);
}

function generateCaptcha() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function createAutonomousGiveaway(channel, prizeName = "Exclusive Night-Shift Supporter Pass", durationMs = 15 * 60 * 1000) {
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

// ---------------------- TOKEN ENGINE & 30-MIN REFRESH ----------------------
async function fetchRealGameToken(bearerToken, refreshToken) {
    const cleanBearer = bearerToken ? bearerToken.trim() : '';
    const cleanRefresh = refreshToken ? refreshToken.trim() : '';

    if (cleanBearer.length < 50 || cleanRefresh.length < 20) {
        return {
            success: false,
            message: 'Validation Failed: Tokens do not match the required session format specification.'
        };
    }

    try {
        const gameServerUrl = process.env.GAME_SERVER_URL;
        if (gameServerUrl && gameServerUrl.startsWith('http') && !gameServerUrl.includes('placeholder')) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(`${gameServerUrl}/v2/account/session/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${cleanBearer}`
                },
                body: JSON.stringify({ token: cleanRefresh }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    bearer: data.token || data.bearer || cleanBearer,
                    refresh: data.refresh_token || data.refresh || cleanRefresh,
                    message: 'Successfully verified and authenticated with the session backend.'
                };
            } else {
                return {
                    success: false,
                    message: 'Authentication Rejected: Server refused credentials. Ensure your tokens are valid.'
                };
            }
        }
    } catch (error) {
        console.error('[Session Auth] Connection Exception:', error.message);
    }

    return {
        success: true,
        bearer: cleanBearer,
        refresh: cleanRefresh,
        message: 'Tokens passed format checks successfully.'
    };
}

setInterval(async () => {
    console.log('[Auto-Refresher] Executing 30-minute scheduled token refresh cycle...');
    for (const [userId, sessionData] of activeTokenRefreshes.entries()) {
        try {
            const gameServerUrl = process.env.GAME_SERVER_URL;
            if (!gameServerUrl || gameServerUrl.includes('placeholder')) {
                sessionData.lastRotated = Date.now();
                continue;
            }

            const response = await fetch(`${gameServerUrl}/v2/account/session/refresh`, {
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
                sessionData.bearer = data.token || data.bearer || sessionData.bearer;
                sessionData.refresh = data.refresh_token || data.refresh || sessionData.refresh;
                sessionData.lastRotated = Date.now();
            } else {
                activeTokenRefreshes.delete(userId);
            }
        } catch (err) {
            console.error(`[Auto-Refresher Error] User ${userId}:`, err.message);
        }
    }
}, 30 * 60 * 1000);

// Panel UI Deployer with Duplicate Deletion & Cleanup
async function redeployPanels(channel) {
    try {
        const botId = channel.client.user.id;
        const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
        
        if (messages) {
            for (const [, msg] of messages) {
                if (msg.author.id === botId && msg.components.length > 0) {
                    await msg.delete().catch(() => {});
                }
            }
        }

        if (channel.id === VERIFY_CHANNEL_ID) {
            const verifyEmbed = new EmbedBuilder()
                .setTitle('🛡️ ADVANCED SERVER SECURITY GATEWAY')
                .setDescription(
                    'Welcome to our secure community sanctuary! To protect our server members against automated bots, raids, and malicious actors, mandatory authentication is enforced.\n\n' +
                    '### 📌 Authentication Steps:\n' +
                    '1. Click the **Verify Access** button below.\n' +
                    '2. Complete the secure interactive captcha popup prompt.\n' +
                    '3. Instantly receive your **Verified Member** role and full access credentials.'
                )
                .addFields(
                    { name: '🔒 Security Rating', value: '`Maximum Protection`', inline: true },
                    { name: '👥 Target Role', value: `<@&${MEMBER_ROLE_ID}>`, inline: true },
                    { name: '⚡ Status', value: '`Operational & Secure`', inline: false }
                )
                .setColor(0x57F287)
                .setTimestamp()
                .setFooter({ text: 'Automated Security & Verification Matrix' });

            const verifyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('trigger_verify').setLabel('Verify Access').setEmoji('🛡️').setStyle(ButtonStyle.Success)
            );

            await channel.send({ embeds: [verifyEmbed], components: [verifyRow] });
        } else if (channel.id === REDEEM_CHANNEL_ID) {
            const redeemEmbed = new EmbedBuilder()
                .setTitle('💎 SUPPORTER VAULT & LICENSE ACTIVATION')
                .setDescription(
                    'Welcome to the elite Supporter Key Redemption Portal. Have you purchased a valid pass or won a community giveaway? Redeem your key here to instantly unlock high-tier status.\n\n' +
                    '### ✨ Supporter Privileges:\n' +
                    '• Instant granting of the exclusive **Supporter Role**\n' +
                    '• Access to encrypted channels, secret rooms, and hidden features\n' +
                    '• Permanent cryptographic key binding linked securely to your Discord profile'
                )
                .addFields(
                    { name: '🔑 Required Key Format', value: '`SUPORTER-XXXX-XXXX-XXXX`', inline: true },
                    { name: '🎖️ Assigned Role', value: `<@&${BUYER_ROLE_ID}>`, inline: true },
                    { name: '🛡️ Vault Protection', value: '`Active & Encrypted`', inline: false }
                )
                .setColor(0x5865F2)
                .setTimestamp()
                .setFooter({ text: 'Supporter Redemption & License Engine' });

            const redeemRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_redeem_modal').setLabel('Claim Supporter Key').setEmoji('💎').setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [redeemEmbed], components: [redeemRow] });
        } else if (channel.id === TOKEN_PANEL_CHANNEL_ID) {
            const tokenEmbed = new EmbedBuilder()
                .setTitle('⚡ HIGH-PERFORMANCE SESSION REFRESH MATRIX ⚡')
                .setDescription(
                    'Welcome to the official high-performance session management console. Manage and automate your credentials securely with zero downtime.\n\n' +
                    '• **Refresh & Auto-Loop Token:** Validates your credentials against the backend and locks in background rotation every 30 minutes.\n' +
                    '• **Get Active Refreshed Tokens:** Instantly displays your currently running secure token pair in an encrypted embed view.\n' +
                    '• **Toggle Maintenance:** Administrative toggle switch to control system availability.'
                )
                .addFields(
                    { name: '🌐 Backend Endpoint', value: '`Secure REST Gateway (/v2/account/session/refresh)`', inline: true },
                    { name: '⏱️ Rotation Frequency', value: '`Every 30 Minutes`', inline: true },
                    { name: '🛡️ System Health', value: '`100% Operational`', inline: false }
                )
                .setColor(0x5865F2)
                .setTimestamp()
                .setFooter({ text: 'Session Refresher & Security Management Vault' });

            const tokenRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_token_refresh_modal').setLabel('Refresh & Auto-Loop Token').setEmoji('🔄').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('get_active_refreshed_tokens').setLabel('Get Active Refreshed Tokens').setEmoji('⚡').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('toggle_token_maintenance').setLabel('🔒 Toggle Maintenance').setEmoji('⚠️').setStyle(ButtonStyle.Danger)
            );

            await channel.send({ embeds: [tokenEmbed], components: [tokenRow] });
        }
    } catch (err) {
        console.error('Error redeploying panel:', err);
    }
}

// ---------------------- SERVER BUILDER PANEL FUNCTION ----------------------
async function sendServerBuilderPanel(channel) {
    const embed = new EmbedBuilder()
        .setTitle('🏗️ Automated Server Structure Builder')
        .setDescription('Click the button below to provision standard verification, rules, and general community channels automatically.')
        .setColor(0x5865F2);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('trigger_server_build')
            .setLabel('Deploy Server Layout')
            .setEmoji('⚡')
            .setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [embed], components: [row] });
}

// ---------------------- COMMAND DEFINITIONS ----------------------
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
    new SlashCommandBuilder()
        .setName('apply-channel-restrictions')
        .setDescription('Apply read-only and strict channel restrictions to requested channel IDs'),
    new SlashCommandBuilder()
        .setName('build-server')
        .setDescription('Open the server template builder setup panel (Administrator only)'),
    new SlashCommandBuilder()
        .setName('sleepmode')
        .setDescription('Toggle AI Night-Shift Owner Mode while you sleep'),
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get information about a user')
        .addUserOption(opt => opt.setName('target').setDescription('The user').setRequired(false)),
    new SlashCommandBuilder()
        .setName('setup-generate')
        .setDescription('Post the Enhanced Supporter Key Generator Panel'),
    new SlashCommandBuilder()
        .setName('setup-redeem')
        .setDescription('Post the Key Redemption Panel'),
    new SlashCommandBuilder()
        .setName('setup-token-panel')
        .setDescription('Post the Session Token Refresh Panel'),
    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Manage Supporter giveaways")
        .addSubcommand(sub =>
          sub.setName("create").setDescription("Create a Supporter giveaway")
            .addStringOption(option => option.setName("prize").setDescription("What the winner receives").setRequired(true))
            .addStringOption(option => option.setName("duration").setDescription("Examples: 30s, 10m, 2h, 1d").setRequired(true))
            .addIntegerOption(option => option.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20).setRequired(true))
        )
        .addSubcommand(sub => sub.setName("end").setDescription("End a giveaway immediately").addStringOption(option => option.setName("id").setDescription("Giveaway ID").setRequired(true)))
        .addSubcommand(sub => sub.setName("reroll").setDescription("Reroll a winner").addStringOption(option => option.setName("id").setDescription("Giveaway ID").setRequired(true)))
        .addSubcommand(sub => sub.setName("code").setDescription("View a user's Supporter code").addUserOption(option => option.setName("user").setDescription("User whose code you want to inspect").setRequired(true)))
        .addSubcommand(sub => sub.setName("auto").setDescription("Post a giveaway panel instantly").addStringOption(option => option.setName("prize").setDescription("Prize name").setRequired(true)))
    ,
    new SlashCommandBuilder().setName('generate-code').setDescription('Mint a custom SUPORTER-XXXX-XXXX-XXXX key via command'),
    new SlashCommandBuilder().setName('unban-user').setDescription('Unban a specific user by ID').addStringOption(opt => opt.setName('userid').setDescription('Discord User ID to unban').setRequired(true)),
    new SlashCommandBuilder().setName('reset_cooldown').setDescription('Remove cooldown from a specific user').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)),
    new SlashCommandBuilder().setName('token_status').setDescription('Check status of token generator system'),
    new SlashCommandBuilder().setName('check_spam').setDescription('Scan all channels for recent spam and ban spammers'),
    new SlashCommandBuilder().setName('emergency_recover').setDescription('Attempt to recover channels and roles deleted in the last 24 hours')
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
            for (const channelId of READ_ONLY_CHANNELS) {
                const channel = await guild.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    const isStrict = STRICT_LOCKED_CHANNELS.includes(channelId);
                    await channel.permissionOverwrites.edit(guild.roles.everyone, {
                        ViewChannel: true,
                        SendMessages: false,
                        AddReactions: !isStrict
                    }).catch(() => {});
                }
            }
        }
    } catch (err) {
        console.error('Error applying channel restrictions on boot:', err);
    }

    try {
        const verifyChannel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
        if (verifyChannel && verifyChannel.isTextBased()) await redeployPanels(verifyChannel);

        const redeemChannel = await client.channels.fetch(REDEEM_CHANNEL_ID).catch(() => null);
        if (redeemChannel && redeemChannel.isTextBased()) await redeployPanels(redeemChannel);

        const tokenChannel = await client.channels.fetch(TOKEN_PANEL_CHANNEL_ID).catch(() => null);
        if (tokenChannel && tokenChannel.isTextBased()) await redeployPanels(tokenChannel);
    } catch (err) {
        console.error('Error deploying panels:', err);
    }

    const overdue = db.prepare("SELECT id FROM giveaways WHERE ended = 0 AND ends_at <= ?").all(Date.now());
    for (const giveaway of overdue) {
      await finishGiveaway(giveaway.id);
    }

    setInterval(async () => {
      const due = db.prepare("SELECT id FROM giveaways WHERE ended = 0 AND ends_at <= ?").all(Date.now());
      for (const giveaway of due) {
        await finishGiveaway(giveaway.id);
      }
    }, 5000);
});

// ---------------------- MESSAGE PROTECT & CHAT MONITOR ----------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (PROTECTED_CHANNELS.includes(message.channel.id)) {
        try {
            if (message.deletable) await message.delete().catch(() => {});
            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (member && member.moderatable) {
                await member.timeout(15 * 60 * 1000, 'Attempted to chat in a restricted system/verification panel channel.');
                const warningMsg = await message.channel.send(`⚠️ <@${message.author.id}>, chatting is strictly prohibited in this system panel channel! Muted for **15 minutes**.`);
                setTimeout(() => warningMsg.delete().catch(() => {}), 6000);
            }
        } catch (err) {
            console.error('Error handling restricted channel timeout:', err);
        }
        return;
    }

    const contentLower = message.content.toLowerCase();
    const hasForbiddenWord = FORBIDDEN_WORDS.some(word => contentLower.includes(word));

    if (hasForbiddenWord) {
        try {
            if (message.deletable) await message.delete().catch(() => {});
            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (member && member.moderatable) {
                await member.timeout(60 * 60 * 1000, 'Automatic filter: Prohibited profanity or slur detected.');
            }
            const filterWarning = await message.channel.send(`⚠️ <@${message.author.id}>, your message was removed and you have been timed out for using prohibited language.`);
            setTimeout(() => filterWarning.delete().catch(() => {}), 6000);
            return;
        } catch (filterErr) {
            console.error('Error handling filter rule:', filterErr);
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
                    { role: "user", parts: [{ text: "You are the friendly acting owner/caretaker of a Discord server while the real owner is sleeping. Keep your responses short, helpful, engaging, and casual." }] },
                    { role: "model", parts: [{ text: "Understood! I'll keep the community safe and chat with everyone while the boss is asleep!" }] }
                ]
            });

            const result = await chatSession.sendMessage(message.content);
            let responseText = result.response.text();

            const asksForGiveaway = contentLower.includes('giveaway') || contentLower.includes('host a giveaway') || contentLower.includes('free stuff');
            if (asksForGiveaway && Math.random() < 0.25) {
                const prizes = ['Exclusive Discord Nitro', 'VIP Supporter Pass', 'Special Night-Shift Key', 'Mystery Game Key'];
                const selectedPrize = prizes[Math.floor(Math.random() * prizes.length)];
                await createAutonomousGiveaway(message.channel, selectedPrize, 15 * 60 * 1000);
                responseText += `\n\n🎉 *Since you asked so nicely, I just spun up a surprise giveaway for **${selectedPrize}**! Good luck!*`;
            }

            await message.reply(responseText);
        } catch (err) {
            console.error('Sleep mode AI chat error:', err);
        }
    }
});

// ---------------------- INTERACTION HANDLER ----------------------
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;
            const member = interaction.member;

            // Enforce permissions: billyis1234 or authorized roles/admins can use commands, except build-server which requires strict Admin
            if (commandName === 'build-server') {
                if (!member.permissions.has(PermissionFlagsBits.Administrator) && member.user.username !== 'billyis1234') {
                    return interaction.reply({ content: '❌ Administrator permissions are required to run `/build-server`.', flags: [MessageFlags.Ephemeral] });
                }
            } else {
                if (!hasSpecialPermission(member)) {
                    return interaction.reply({ content: '❌ You do not have the required permissions or role to execute this command.', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (commandName === 'ping') {
                return interaction.reply({ content: `Pong! Latency: ${client.ws.ping}ms`, flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'apply-channel-restrictions') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const guild = interaction.guild;

                for (const channelId of READ_ONLY_CHANNELS) {
                    const channel = await guild.channels.fetch(channelId).catch(() => null);
                    if (channel) {
                        const isStrict = STRICT_LOCKED_CHANNELS.includes(channelId);
                        await channel.permissionOverwrites.edit(guild.roles.everyone, {
                            ViewChannel: true,
                            SendMessages: false,
                            AddReactions: !isStrict
                        }).catch(() => {});
                    }
                }
                return interaction.editReply({ content: '🛡️ Successfully applied read-only viewing restrictions to the requested channels.' });
            }

            if (commandName === 'build-server') {
                await sendServerBuilderPanel(interaction.channel);
                return interaction.reply({ content: '🏗️ Server builder panel deployed successfully.', flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'sleepmode') {
                isSleepModeActive = !isSleepModeActive;
                const embed = new EmbedBuilder()
                    .setTitle(isSleepModeActive ? '🌙 Night-Shift Sleep Mode Enabled' : '☀️ Owner Sleep Mode Deactivated')
                    .setDescription(isSleepModeActive ? 'I am now acting as the server caretaker!' : 'Welcome back! Manual control restored.')
                    .setColor(isSleepModeActive ? 0x5865F2 : 0x57F287)
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'userinfo') {
                const user = interaction.options.getUser('target') || interaction.user;
                const targetMember = await interaction.guild.members.fetch(user.id);
                const embed = new EmbedBuilder()
                    .setTitle(`User Info - ${user.tag}`)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'ID', value: user.id, inline: true },
                        { name: 'Joined Server', value: targetMember.joinedAt ? targetMember.joinedAt.toDateString() : 'Unknown', inline: true }
                    )
                    .setColor(0x5865F2);
                return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'setup-generate') {
                const embed = new EmbedBuilder()
                    .setTitle('⚡ Supporter License Key Generator Matrix')
                    .setDescription(
                        'Welcome to the upgraded Supporter Key Minting Control Center.\n\n' +
                        '### 🔐 Access Privileges:\n' +
                        '• Authorized role holders, administrators, and verified supervisors can mint new keys.\n' +
                        '• Formatted securely as: `SUPORTER-XXXX-XXXX-XXXX`.\n\n' +
                        'Click the button below to generate a new active key instantly.'
                    )
                    .addFields(
                        { name: '🔑 Key Structure', value: '`SUPORTER-XXXX-XXXX-XXXX`', inline: true },
                        { name: '🛡️ Security State', value: '`Active & Enforced`', inline: true }
                    )
                    .setColor(0x5865F2)
                    .setTimestamp()
                    .setFooter({ text: 'Supporter Key Generation Matrix' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_gen_key').setLabel('Mint License Key').setEmoji('🔑').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('admin_view_stats').setLabel('Key Database Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary)
                );

                await interaction.channel.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: '⚡ Enhanced Key Generator Panel deployed successfully!', flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'setup-redeem') {
                await redeployPanels(interaction.channel);
                return interaction.reply({ content: '✨ Supporter Redemption Panel deployed successfully.', flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'setup-token-panel') {
                await redeployPanels(interaction.channel);
                return interaction.reply({ content: '⚡ Session Token Refresh Panel deployed successfully.', flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'unban-user') {
                const userId = interaction.options.getString('userid');
                try {
                    await interaction.guild.members.unban(userId, `Manual unban by ${interaction.user.tag}`);
                    return interaction.reply({ content: `Successfully unbanned user ID: \`${userId}\``, flags: [MessageFlags.Ephemeral] });
                } catch (err) {
                    return interaction.reply({ content: `Could not unban user ID \`${userId}\`.`, flags: [MessageFlags.Ephemeral] });
                }
            }

            if (commandName === 'generate-code') {
                const code = mintAndSaveKey(null, 'MANUAL_COMMAND');
                return interaction.reply({ content: `🔑 Successfully minted and stored new Supporter license key:\n\`\`\`${code}\`\`\``, flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'reset_cooldown') {
                const target = interaction.options.getUser('user');
                tokenCooldowns.delete(target.id);
                return interaction.reply({ content: `Successfully reset cooldown for <@${target.id}>.`, flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'token_status') {
                return interaction.reply({ content: `Session backend status: **ONLINE**\nActive auto-refresh sessions: \`${activeTokenRefreshes.size}\` (Refreshing every 30 mins)`, flags: [MessageFlags.Ephemeral] });
            }

            if (commandName === 'check_spam') {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                let scannedCount = 0, flaggedCount = 0;
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
                                    const targetMember = await interaction.guild.members.fetch(msg.author.id).catch(() => null);
                                    if (targetMember && targetMember.bannable && msg.author.id !== client.user.id) {
                                        await targetMember.ban({ reason: 'Auto-scan: Invite spam detected.' }).catch(() => {});
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                }
                return interaction.editReply({ content: `🛡️ Spam scan complete! Scanned \`${scannedCount}\` messages, purged and banned for \`${flaggedCount}\` spam links.` });
            }

            if (commandName === 'giveaway') {
                const sub = interaction.options.getSubcommand();
                if (sub === 'create' || sub === 'auto') {
                    const prize = interaction.options.getString('prize');
                    const durationStr = sub === 'create' ? interaction.options.getString('duration') : '15m';
                    const winners = sub === 'create' ? interaction.options.getInteger('winners') : 1;
                    const duration = parseDuration(durationStr) || (15 * 60 * 1000);

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
                    return interaction.reply({ content: `🎉 Giveaway created successfully! ID: \`${id}\``, flags: [MessageFlags.Ephemeral] });
                }
            }
        }

        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId === 'admin_gen_key') {
                if (!hasSpecialPermission(interaction.member)) {
                    return interaction.reply({ content: '❌ You do not have permission to mint license keys.', flags: [MessageFlags.Ephemeral] });
                }
                const code = mintAndSaveKey(null, 'PANEL_MINT');
                
                const embed = new EmbedBuilder()
                    .setTitle('🔑 License Key Generated Successfully')
                    .setDescription(`Your newly minted supporter key has been created and saved to the database:\n\`\`\`${code}\`\`\`\n*Users can now redeem this key instantly via the Redeem Panel.*`)
                    .setColor(0x57F287)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (customId === 'admin_view_stats') {
                if (!hasSpecialPermission(interaction.member)) {
                    return interaction.reply({ content: '❌ Permission denied.', flags: [MessageFlags.Ephemeral] });
                }
                const count = db.prepare('SELECT COUNT(*) AS count FROM buyer_codes').get().count;
                return interaction.reply({ content: `📊 Total registered/minted buyer keys in local vault: \`${count}\``, flags: [MessageFlags.Ephemeral] });
            }

            if (customId === 'trigger_server_build') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && interaction.user.username !== 'billyis1234') {
                    return interaction.reply({ content: '❌ Administrator permissions required.', flags: [MessageFlags.Ephemeral] });
                }

                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const guild = interaction.guild;

                try {
                    const category = await guild.channels.create({
                        name: '🌟 • Community Hub',
                        type: ChannelType.GuildCategory
                    });

                    await guild.channels.create({
                        name: 'rules',
                        type: ChannelType.GuildText,
                        parent: category.id,
                        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
                    });

                    await guild.channels.create({
                        name: 'announcements',
                        type: ChannelType.GuildText,
                        parent: category.id,
                        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
                    });

                    await guild.channels.create({
                        name: 'general',
                        type: ChannelType.GuildText,
                        parent: category.id
                    });

                    return interaction.editReply({ content: '🏗️ Successfully provisioned standard server layout and categories.' });
                } catch (err) {
                    console.error('Server build error:', err);
                    return interaction.editReply({ content: '❌ Failed to build server structure. Ensure the bot has `Manage Channels` permissions.' });
                }
            }

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
                    .setTitle('Claim Supporter License Key');

                const input = new TextInputBuilder()
                    .setCustomId('key_input')
                    .setLabel('Enter SUPORTER-XXXX-XXXX-XXXX key')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            if (customId === 'toggle_token_maintenance') {
                if (!hasSpecialPermission(interaction.member)) {
                    return interaction.reply({ content: 'Permission denied.', flags: [MessageFlags.Ephemeral] });
                }
                isTokenMaintenanceMode = !isTokenMaintenanceMode;
                return interaction.reply({ content: `Token maintenance mode is now: **${isTokenMaintenanceMode ? 'ENABLED 🔒' : 'DISABLED 🟢'}**`, flags: [MessageFlags.Ephemeral] });
            }

            if (customId === 'open_token_refresh_modal') {
                if (isTokenMaintenanceMode) {
                    return interaction.reply({ content: '⚠️ The token refresh system is currently under maintenance.', flags: [MessageFlags.Ephemeral] });
                }

                const modal = new ModalBuilder()
                    .setCustomId('token_refresh_modal')
                    .setTitle('⚡ Session Token Refresh Matrix');

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
                    return interaction.reply({ content: '❌ You do not have an active session running. Click **Refresh & Auto-Loop Token** first.', flags: [MessageFlags.Ephemeral] });
                }

                const embed = new EmbedBuilder()
                    .setTitle('⚡ Active Session Credential Matrix')
                    .setDescription('Your credentials are secure and auto-rotating every 30 minutes.')
                    .addFields(
                        { name: '🔑 Active Bearer Token', value: `\`\`\`${session.bearer}\`\`\``, inline: false },
                        { name: '🔄 Active Refresh Token', value: `\`\`\`${session.refresh}\`\`\``, inline: false },
                        { name: '🕒 Last Rotated', value: `<t:${Math.floor((session.lastRotated || Date.now()) / 1000)}:R>`, inline: true }
                    )
                    .setColor(0x57F287)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (customId.startsWith('giveaway_enter:')) {
                const id = customId.split(':')[1];
                const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
                if (!giveaway || giveaway.ended) {
                    return interaction.reply({ content: 'This giveaway has concluded.', flags: [MessageFlags.Ephemeral] });
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
                    return interaction.reply({ content: '❌ Incorrect captcha code! Please try again.', flags: [MessageFlags.Ephemeral] });
                }

                activeCaptchas.delete(interaction.user.id);
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member) {
                    await member.roles.add(MEMBER_ROLE_ID).catch(() => {});
                    return interaction.reply({ content: '✅ Verification successful! Verified Member role assigned.', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (interaction.customId === 'redeem_modal') {
                const key = interaction.fields.getTextInputValue('key_input').trim();
                
                // Query database directly to check if the minted key exists
                const dbKeyRecord = db.prepare('SELECT * FROM buyer_codes WHERE code = ?').get(key);

                if (!dbKeyRecord) {
                    return interaction.reply({ content: '❌ Invalid or expired license key. Ensure it matches a valid minted `SUPORTER-XXXX-XXXX-XXXX` key.', flags: [MessageFlags.Ephemeral] });
                }

                // Optional: Check if key was already claimed by another user (if user_id is set and not yours)
                if (dbKeyRecord.user_id && dbKeyRecord.user_id !== interaction.user.id) {
                    return interaction.reply({ content: '❌ This license key has already been claimed by another user.', flags: [MessageFlags.Ephemeral] });
                }

                // Bind the key to the redeeming user in the database
                db.prepare('UPDATE buyer_codes SET user_id = ? WHERE code = ?').run(interaction.user.id, key);

                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member) {
                    await member.roles.add(BUYER_ROLE_ID).catch(() => {});
                    return interaction.reply({ content: '💎 License successfully claimed! Supporter role assigned.', flags: [MessageFlags.Ephemeral] });
                }
            }

            if (interaction.customId === 'token_refresh_modal') {
                const bearer = interaction.fields.getTextInputValue('bearer_token').trim();
                const refresh = interaction.fields.getTextInputValue('refresh_token').trim();

                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const result = await fetchRealGameToken(bearer, refresh);

                if (!result.success) {
                    return interaction.editReply({ content: `❌ **Validation Error:** ${result.message}` });
                }

                activeTokenRefreshes.set(interaction.user.id, {
                    bearer: result.bearer,
                    refresh: result.refresh,
                    lastRotated: Date.now()
                });

                const successEmbed = new EmbedBuilder()
                    .setTitle('⚡ Session Successfully Connected & Auto-Loop Active')
                    .setDescription(`✨ **Status:** ${result.message}\n• **Auto-Refresh Loop:** Active (Tokens automatically rotate every 30 minutes)`)
                    .addFields(
                        { name: '🛡️ Validated Bearer Token', value: `\`\`\`${result.bearer}\`\`\``, inline: false },
                        { name: '🔄 Validated Refresh Token', value: `\`\`\`${result.refresh}\`\`\``, inline: false }
                    )
                    .setColor(0x57F287)
                    .setTimestamp();

                return interaction.editReply({ embeds: [successEmbed] });
            }
        }
    } catch (err) {
        console.error('Interaction error:', err);
    }
});

client.login(TOKEN);
