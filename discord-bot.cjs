const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits,
    SlashCommandBuilder,
    REST,
    Routes,
    AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const dns = require('dns');

// ─── DNS FIX ────────────────────────────────────────────────────────────────
dns.setServers(['8.8.8.8', '1.1.1.1']);
console.log('[TMC.LOL] ✅ DNS set to Google DNS (8.8.8.8, 1.1.1.1)');

// ─── CLIENT ─────────────────────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    rest: { timeout: 60000 },
    failIfNotExists: false
});

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const MEMBER_ROLE_ID = "1492798151516491816";
const SUPPORTER_ROLE_ID = "1529393418063581284";
const BOT_OWNER_ID = "1300117296844509227";
const ELLIOTT_ID = "1363240484818128926";
const ADMIN_ROLE_ID = "1542956153166626856";

const BUYER_ROLE_ID = "1542337976917434428";
const VIP_ROLE_ID = "1542337978016469093";
const BOOSTER_ROLE_ID = "1542337979807178832";

const NO_COOLDOWN_ROLE_ID = ADMIN_ROLE_ID;
const GENERATION_COOLDOWN = 5 * 60 * 1000;

const NAKAMA_SERVER = 'https://animalcompany.us-east1.nakamacloud.io';
const NAKAMA_SERVER_KEY = '6URuTSlDKKfYbuDW';
const API_URLS = [ NAKAMA_SERVER ];
let ACTIVE_API_URL = API_URLS[0];
let apiWorking = false;

const hasServerKey = NAKAMA_SERVER_KEY && NAKAMA_SERVER_KEY.length > 0 && NAKAMA_SERVER_KEY !== 'Key';
if (!hasServerKey) {
    console.log('[TMC.LOL] ⚠️ NAKAMA_SERVER_KEY not set - token refresh will fail with "Server key required"');
} else {
    console.log('[TMC.LOL] ✅ NAKAMA_SERVER_KEY is set! Token refresh should work.');
}

// ─── STORAGE (replaces storage.py) ────────────────────────────────────────
const STORAGE_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

const TOKEN_FILE = path.join(STORAGE_DIR, 'token_data.json');
const DONATIONS_FILE = path.join(STORAGE_DIR, 'donations.json');

// Helper: read/write JSON
function readJSON(file, defaultVal = {}) {
    try {
        if (fs.existsSync(file)) {
            const data = fs.readFileSync(file, 'utf8');
            return JSON.parse(data);
        }
    } catch (_) { /* ignore */ }
    return defaultVal;
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Token data (public token pool)
function getPublicTokenRaw() {
    return readJSON(TOKEN_FILE, { token: '', refresh_token: '', label: '' });
}
function setPublicTokenRaw(data) {
    writeJSON(TOKEN_FILE, data);
}

// Donations per user
function getDonations() {
    return readJSON(DONATIONS_FILE, {});
}
function saveDonations(donations) {
    writeJSON(DONATIONS_FILE, donations);
}

function getDonated(userId) {
    const all = getDonations();
    return all[userId] || [];
}
function setDonated(userId, tokens) {
    const all = getDonations();
    all[userId] = tokens;
    saveDonations(all);
}
function addDonated(targetId, token, refreshToken, givenBy) {
    const existing = getDonated(targetId);
    existing.push({
        token,
        refresh_token: refreshToken,
        given_by: givenBy,
        given_at: Date.now()
    });
    setDonated(targetId, existing);
}
function revokeDonated(targetId) {
    const existing = getDonated(targetId);
    if (existing.length === 0) return 0;
    setDonated(targetId, []);
    return existing.length;
}

// Cooldowns (in-memory, resets on restart)
const cooldowns = new Map();
function checkCooldown(userId, action, seconds) {
    const key = `${userId}:${action}`;
    const expiry = cooldowns.get(key);
    if (expiry && Date.now() < expiry) {
        return { onCooldown: true, remaining: expiry - Date.now() };
    }
    return { onCooldown: false };
}
function setCooldown(userId, action, seconds) {
    const key = `${userId}:${action}`;
    cooldowns.set(key, Date.now() + seconds * 1000);
}
function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

// ─── JWT HELPERS ──────────────────────────────────────────────────────────
function decodeJwt(token) {
    try {
        const part = (token || '').split('.')[1];
        if (!part) return null;
        const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(normalized + '===', 'base64').toString('utf-8');
        return JSON.parse(json);
    } catch (_) { return null; }
}
function getTokenExpiryMs(token) {
    const p = decodeJwt(token);
    if (p && typeof p.exp === 'number') return p.exp * 1000;
    return Date.now() + (100 * 365 * 24 * 60 * 60 * 1000); // fallback 100y
}
function isExpired(token, bufferSeconds = 0) {
    const exp = getTokenExpiryMs(token);
    return Date.now() >= exp - bufferSeconds * 1000;
}
function secondsUntilExpiry(token) {
    const exp = getTokenExpiryMs(token);
    return Math.max(0, Math.floor((exp - Date.now()) / 1000));
}
function humanExpiry(expiresAt) {
    const diff = expiresAt - Date.now();
    if (diff > 1000 * 365 * 24 * 60 * 60 * 1000) return 'NEVER EXPIRES';
    if (diff <= 0) return 'EXPIRED';
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

// ─── LOAD ACCOUNTS FROM ENV ──────────────────────────────────────────────
function loadAccounts() {
    const accounts = [];
    let i = 1;
    while (true) {
        const token = (process.env[`TOKEN_${i}`] || '').trim();
        const refresh = (process.env[`REFRESH_TOKEN_${i}`] || '').trim();
        if (!token || !refresh) break;
        accounts.push({ token, refresh_token: refresh, label: `account_${i}` });
        i++;
    }
    // legacy fallback
    if (accounts.length === 0) {
        const token = (process.env.INITIAL_TOKEN || '').trim();
        const refresh = (process.env.INITIAL_REFRESH_TOKEN || '').trim();
        if (token && refresh) {
            accounts.push({ token, refresh_token: refresh, label: 'account_1 (legacy)' });
        }
    }
    return accounts;
}

// ─── TOKEN MANAGEMENT (multi‑account) ──────────────────────────────────
let accounts = [];
let currentToken = null; // { token, refresh_token, label }

function getActiveAccount(accountsList) {
    for (const acc of accountsList) {
        if (!isExpired(acc.refresh_token, 60)) {
            return acc;
        }
    }
    return null;
}

function loadTokens() {
    const stored = getPublicTokenRaw();
    // If stored token is still valid, use it
    if (stored.token && stored.refresh_token && !isExpired(stored.token, 60)) {
        console.log('[REFRESH] ✅ Tokens loaded from storage');
        return { token: stored.token, refresh_token: stored.refresh_token, label: stored.label || 'stored' };
    }

    // Otherwise pick first valid account
    const acc = getActiveAccount(accounts);
    if (!acc) {
        throw new Error('❌ No valid accounts found. Set TOKEN_1/REFRESH_TOKEN_1 in Railway Variables.');
    }
    console.log(`[REFRESH] ⚡ Loading from env — using ${acc.label}`);
    const data = { token: acc.token, refresh_token: acc.refresh_token, label: acc.label };
    setPublicTokenRaw(data);
    return data;
}

function switchToNextAccount(currentLabel) {
    // Find accounts after current, then wrap around
    let start = -1;
    for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].label === currentLabel) {
            start = i;
            break;
        }
    }
    for (let offset = 1; offset <= accounts.length; offset++) {
        const idx = (start + offset) % accounts.length;
        const acc = accounts[idx];
        if (!isExpired(acc.refresh_token, 60)) {
            console.log(`[REFRESH] 🔀 Switching to ${acc.label}`);
            return { token: acc.token, refresh_token: acc.refresh_token, label: acc.label };
        }
    }
    return null;
}

// ─── REFRESH LOGIC (multi‑account) ─────────────────────────────────────
async function doRefresh(tokens) {
    console.log(`\n[REFRESH] 🔄 Refreshing token (${tokens.label})...`);

    if (!NAKAMA_SERVER_KEY) {
        throw new Error('Server key required');
    }
    const basic = Buffer.from(`${NAKAMA_SERVER_KEY}:`).toString('base64');
    const body = JSON.stringify({ token: tokens.refresh_token });

    const refreshUrl = `${ACTIVE_API_URL}/v2/session/refresh`;
    const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${basic}`
        },
        body,
        timeout: 15000
    });

    if (!response.ok) {
        const text = await response.text();
        let errMsg = `HTTP ${response.status}`;
        try {
            const json = JSON.parse(text);
            errMsg = json.message || errMsg;
        } catch (_) {}
        const error = new Error(errMsg);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    const newToken = data.token || data.access_token || null;
    const newRefresh = data.refresh_token || tokens.refresh_token;
    if (!newToken) {
        throw new Error('No token in response');
    }

    const newData = {
        token: newToken,
        refresh_token: newRefresh,
        label: tokens.label
    };
    setPublicTokenRaw(newData);
    currentToken = newData;

    const expMs = getTokenExpiryMs(newToken);
    console.log(`[REFRESH] ✅ Token refreshed! Expires: ${new Date(expMs).toUTCString()} (${humanExpiry(expMs)})`);
    return newData;
}

async function refreshWithFallback(forceNew = false) {
    // Load current token, or create one
    if (!currentToken || forceNew) {
        try {
            currentToken = loadTokens();
        } catch (e) {
            console.error('[REFRESH]', e.message);
            return null;
        }
    }

    let tries = 0;
    const maxTries = accounts.length;
    let current = { ...currentToken };

    while (tries < maxTries) {
        try {
            const result = await doRefresh(current);
            currentToken = result;
            return result;
        } catch (err) {
            console.error(`[REFRESH] ❌ Refresh failed (${current.label}):`, err.message);
            // If auth error (401/403) or token expired, try next account
            if (err.status === 401 || err.status === 403 || err.message.includes('refresh') || err.message.includes('expired')) {
                const next = switchToNextAccount(current.label);
                if (next) {
                    current = next;
                    setPublicTokenRaw(next);
                    tries++;
                    continue;
                } else {
                    console.error('[REFRESH] ❌ No more valid accounts.');
                    return null;
                }
            } else {
                // Other errors (network, etc.) – return null, will retry later
                return null;
            }
        }
    }
    console.error('[REFRESH] ❌ All accounts exhausted.');
    return null;
}

// ─── AUTO‑REFRESH LOOP ──────────────────────────────────────────────────
let refreshInterval = null;
const REFRESH_BEFORE_MS = 5 * 60 * 1000;
const MIN_REFRESH_MS = 60 * 1000;
const MAX_REFRESH_MS = 30 * 60 * 1000;

function scheduleNextRefresh() {
    if (refreshInterval) {
        clearTimeout(refreshInterval);
        refreshInterval = null;
    }

    let delay = MAX_REFRESH_MS;
    if (currentToken) {
        const remaining = getTokenExpiryMs(currentToken.token) - Date.now();
        const untilRefresh = remaining - REFRESH_BEFORE_MS;
        delay = Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, untilRefresh));
        if (delay <= 0) delay = MIN_REFRESH_MS;
    }

    refreshInterval = setTimeout(async () => {
        refreshInterval = null;
        await refreshWithFallback(false);
        scheduleNextRefresh();
    }, delay);
    console.log(`[TMC.LOL] ⏱️ Next auto-refresh in ${Math.round(delay/1000)}s`);
}

function startAutoRefresh() {
    accounts = loadAccounts();
    console.log(`[TMC.LOL] 🔄 Auto-Refresh started (${accounts.length} accounts)`);
    // Initial load
    try {
        currentToken = loadTokens();
    } catch (e) {
        console.error('[TMC.LOL]', e.message);
        // fallback: use first account
        if (accounts.length > 0) {
            currentToken = { token: accounts[0].token, refresh_token: accounts[0].refresh_token, label: accounts[0].label };
            setPublicTokenRaw(currentToken);
        }
    }
    // Do a refresh immediately
    setTimeout(async () => {
        await refreshWithFallback(true);
        scheduleNextRefresh();
    }, 5000);
}

// ─── OTHER HELPERS ──────────────────────────────────────────────────────
function generateGenerationId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'GEN-';
    for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
}

function hasAdminAccess(interaction) {
    if ([BOT_OWNER_ID, ELLIOTT_ID].includes(interaction.user.id)) return true;
    if (interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID)) return true;
    return false;
}

// ─── SLASH COMMANDS ────────────────────────────────────────────────────
const commandsData = [
    new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8ball a question').addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)),
    new SlashCommandBuilder().setName('help').setDescription('List all available bot commands and panels'),
    new SlashCommandBuilder().setName('ping').setDescription('Pong - checks bot latency'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Get info about this server'),
    new SlashCommandBuilder().setName('token').setDescription('Generate a fresh token directly to your DMs'),
    new SlashCommandBuilder().setName('generator').setDescription('Post generator panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('remove-stock').setDescription('Remove a token by selection').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('reset-stock').setDescription('Reset stock to default token').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('gen-codes').setDescription('List all active generation IDs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('remove-token').setDescription('Remove a specific token by ID').addStringOption(opt => opt.setName('id').setDescription('Generation ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('refresh_cooldown_all').setDescription('Reset cooldown for everyone').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('panel').setDescription('Deploys interactive panels').addStringOption(opt => opt.setName('type').setDescription('Panel type').setRequired(true).addChoices(
        { name: 'Verify', value: 'verify' },
        { name: 'Redeem', value: 'redeem' },
        { name: 'Support', value: 'support' },
        { name: 'Generator', value: 'generator' }
    )).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // DONATION COMMANDS
    new SlashCommandBuilder().setName('donate-token').setDescription('[ADMIN] Gift a token to a specific user')
        .addUserOption(opt => opt.setName('user').setDescription('Discord user to receive the token').setRequired(true))
        .addStringOption(opt => opt.setName('token').setDescription('JWT bearer token').setRequired(true))
        .addStringOption(opt => opt.setName('refresh_token').setDescription('JWT refresh token').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('my-tokens').setDescription('See all tokens gifted to you'),
    new SlashCommandBuilder().setName('revoke-token').setDescription('[ADMIN] Remove all donated tokens from a user')
        .addUserOption(opt => opt.setName('user').setDescription('User whose donated tokens to revoke').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(cmd => cmd.toJSON());

// ─── READY EVENT ──────────────────────────────────────────────────────
client.once('ready', async () => {
    try {
        console.log(`[TMC.LOL] 🚀 ONLINE: ${client.user.tag}`);
        console.log('[TMC.LOL] 🔑 Token Generator Active (Multi‑Account)');
        console.log(`[TMC.LOL] 👑 Connected to ${client.guilds.cache.size} server(s)`);
        console.log('[TMC.LOL] ================================');

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
            console.log('[TMC.LOL] 🔄 Registering slash commands...');
            await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
            console.log('[TMC.LOL] ✅ Slash commands registered successfully!');
        } catch (error) {
            console.error('[TMC.LOL] Failed to register slash commands:', error);
        }

        // Start the multi‑account refresh
        startAutoRefresh();
        console.log('[TMC.LOL] ✅ Bot is fully ready!');
    } catch (err) {
        console.error('[TMC.LOL] Ready event error:', err);
    }
});

// ─── INTERACTION HANDLER ──────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options } = interaction;

            // ── Public commands ──
            if (commandName === 'ping') {
                return interaction.reply({ content: `🏓 Pong! Latency: \`${client.ws.ping}ms\``, flags: 64 });
            }
            if (commandName === '8ball') {
                const question = options.getString('question');
                const answers = ['Yes.', 'No.', 'Maybe.', 'Definitely.', 'Ask again later.', 'Outlook not so good.'];
                const ans = answers[Math.floor(Math.random() * answers.length)];
                const embed = new EmbedBuilder().setTitle('🎱 Magic 8-Ball').addFields({ name: 'Question', value: question }, { name: 'Answer', value: ans }).setColor(0x3498DB);
                return interaction.reply({ embeds: [embed] });
            }
            if (commandName === 'help') {
                const embed = new EmbedBuilder()
                    .setTitle("⚡ TMC.LOL COMMAND DIRECTORY")
                    .setDescription("Token Generator Bot Commands:")
                    .setColor(0x3498DB)
                    .addFields(
                        { name: "🎮 `/token`", value: "Generate a fresh token directly to your DMs", inline: false },
                        { name: "🔑 `/generator`", value: "Post the token generator panel", inline: false },
                        { name: "📋 `/gen-codes`", value: "List all active generation IDs", inline: false },
                        { name: "🗑️ `/remove-stock`", value: "Remove a token by selection", inline: false },
                        { name: "🎁 `/donate-token`", value: "[Admin] Gift a token to a user", inline: false },
                        { name: "👤 `/my-tokens`", value: "View tokens gifted to you", inline: false },
                        { name: "🗑️ `/revoke-token`", value: "[Admin] Revoke all tokens from a user", inline: false },
                        { name: "⏳ **Auto-Refresh**", value: "Every few minutes", inline: false },
                        { name: "👑 **Credits**", value: "@elliott", inline: false }
                    )
                    .setFooter({ text: "TMC.LOL" });
                return interaction.reply({ embeds: [embed], flags: 64 });
            }
            if (commandName === 'serverinfo') {
                const guild = interaction.guild;
                const embed = new EmbedBuilder()
                    .setTitle(`📊 Server Info: ${guild.name}`)
                    .setThumbnail(guild.iconURL())
                    .addFields(
                        { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
                        { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>`, inline: true },
                        { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true }
                    )
                    .setColor(0x3498DB)
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            // ── /token (generate) ──
            if (commandName === 'token') {
                await interaction.deferReply({ flags: 64 });
                // Ensure we have a token
                if (!currentToken) {
                    try { currentToken = loadTokens(); } catch (_) {}
                    if (!currentToken) {
                        return interaction.editReply({ content: '❌ No token available. Contact admin.' });
                    }
                }

                // Refresh if needed
                if (isExpired(currentToken.token, 300)) {
                    await refreshWithFallback(true);
                }

                const tokenObj = {
                    bearer: currentToken.token,
                    refresh: currentToken.refresh_token,
                    expiresAt: getTokenExpiryMs(currentToken.token)
                };
                const genId = generateGenerationId();
                tokenObj.id = genId;
                tokenObj.userId = interaction.user.id;
                tokenObj.username = interaction.user.tag;

                // Store in stock (for /gen-codes etc.) - we'll keep a simple array
                // We'll reuse tokenStock from previous version
                if (!global.tokenStock) global.tokenStock = [];
                global.tokenStock.push(tokenObj);
                // limit size
                if (global.tokenStock.length > 100) global.tokenStock.shift();

                const expiryText = humanExpiry(tokenObj.expiresAt);
                const warnNote = (isExpired(tokenObj.bearer, 0))
                    ? '\n\n⚠️ **WARNING:** This token may NOT work. The refresh token may be invalid — contact admin.'
                    : '';

                try {
                    const tokenData = {
                        token: {
                            bearer: tokenObj.bearer,
                            refresh_token: tokenObj.refresh,
                            expires_at: new Date(tokenObj.expiresAt).toISOString(),
                            added_at: new Date().toISOString(),
                            generation_id: genId
                        },
                        message: "Thank you for using TMC.LOL Token Generator!",
                        credits: "@elliott",
                        auto_refresh: "Refreshed automatically before expiry"
                    };
                    const jsonString = JSON.stringify(tokenData, null, 2);
                    const jsonBuffer = Buffer.from(jsonString, 'utf-8');
                    const attachment = new AttachmentBuilder(jsonBuffer, { name: 'token.json' });

                    const textVersion = `🔑 TMC.LOL TOKEN GENERATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEARER TOKEN:
${tokenObj.bearer}

REFRESH TOKEN:
${tokenObj.refresh}

GENERATION ID:
${genId}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Valid until: ${expiryText}
🔄 Auto-Refresh: Before expiry
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${warnNote}`;
                    const textBuffer = Buffer.from(textVersion, 'utf-8');
                    const textAttachment = new AttachmentBuilder(textBuffer, { name: 'token.txt' });

                    const embed = new EmbedBuilder()
                        .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
                        .setDescription('✅ **Token generated successfully!**\n\n' +
                            '📁 **Files attached:**\n• `token.json` - JSON format\n• `token.txt` - Plain text format\n\n' +
                            `🆔 **Generation ID:** \`${genId}\`\n` +
                            `⏳ **Valid for:** ${expiryText}\n` +
                            '🔄 **Auto-Refresh:** Before expiry\n\n👑 **Credits:** @elliott' +
                            (warnNote ? '\n\n⚠️ **This token may not work** — contact admin.' : ''))
                        .setColor(isExpired(tokenObj.bearer, 0) ? 0xED4245 : 0x5865F2)
                        .setFooter({ text: 'TMC.LOL • Auto-Refresh' });

                    await interaction.user.send({ embeds: [embed], files: [attachment, textAttachment] });
                    return interaction.editReply({
                        content: `✅ **Token sent to your DMs!**\n🆔 **ID:** \`${genId}\`\n⏳ **${expiryText}**\n📦 **Tokens generated:** ${global.tokenStock.length}` +
                            (warnNote ? '\n\n⚠️ **Warning:** token may not work — contact admin.' : '')
                    });
                } catch (err) {
                    return interaction.editReply({ content: '❌ **DM Failed:** Please open your DMs to receive tokens.' });
                }
            }

            // ── ADMIN COMMANDS ──
            const adminCommands = ['generator', 'remove-stock', 'reset-stock', 'gen-codes', 'remove-token', 'refresh_cooldown_all', 'panel', 'donate-token', 'revoke-token'];
            if (adminCommands.includes(commandName)) {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: `❌ **Access Denied:** You need admin permissions.`, flags: 64 });
                }

                if (commandName === 'generator') {
                    const embed = new EmbedBuilder()
                        .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
                        .setDescription('Generate your token below!\n\n⚠️ **Please open your DMs** to receive your token!\n🔄 **Auto-Refresh:** Every few minutes\n\n👑 **Credits:** @elliott')
                        .setColor(0x5865F2)
                        .setFooter({ text: 'TMC.LOL' });
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('gen_public').setLabel('Generate Token').setStyle(ButtonStyle.Success).setEmoji('🔑')
                    );
                    return interaction.reply({ embeds: [embed], components: [row] });
                }

                if (commandName === 'remove-stock') {
                    const entries = (global.tokenStock || [])
                        .filter(t => t.id && t.id.length > 0)
                        .map(t => ({ id: t.id, username: t.username || `<@${t.userId}>` }));
                    if (entries.length === 0) {
                        return interaction.reply({ content: '📭 No active generation IDs to remove.', flags: 64 });
                    }
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Remove a Token by Selection')
                        .setDescription(`**${entries.length}** active token(s)`)
                        .setColor(0xED4245);
                    entries.forEach(entry => {
                        embed.addFields({ name: `\`${entry.id}\``, value: `👤 ${entry.username}`, inline: false });
                    });
                    const row = new ActionRowBuilder();
                    entries.slice(0, 5).forEach(entry => {
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`remove_${entry.id}`)
                                .setLabel(`Remove ${entry.id}`)
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🗑️')
                        );
                    });
                    return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
                }

                if (commandName === 'reset-stock') {
                    global.tokenStock = [];
                    return interaction.reply({ content: '🔄 Stock has been reset.', flags: 64 });
                }

                if (commandName === 'remove-token') {
                    const id = options.getString('id').trim();
                    const idx = (global.tokenStock || []).findIndex(t => t.id === id);
                    if (idx === -1) {
                        return interaction.reply({ content: `❌ No token found with ID \`${id}\`.`, flags: 64 });
                    }
                    global.tokenStock.splice(idx, 1);
                    return interaction.reply({ content: `✅ Token \`${id}\` removed. Remaining: ${global.tokenStock.length}`, flags: 64 });
                }

                if (commandName === 'gen-codes') {
                    const entries = (global.tokenStock || [])
                        .filter(t => t.id && t.id.length > 0)
                        .map(t => ({ id: t.id, username: t.username || `<@${t.userId}>` }));
                    if (entries.length === 0) {
                        return interaction.reply({ content: '📭 No active generation IDs found.', flags: 64 });
                    }
                    const embed = new EmbedBuilder()
                        .setTitle('📋 Active Generation IDs')
                        .setDescription(`**${entries.length}** active token(s)`)
                        .setColor(0x5865F2);
                    entries.forEach(entry => {
                        embed.addFields({ name: `\`${entry.id}\``, value: `👤 ${entry.username}`, inline: false });
                    });
                    return interaction.reply({ embeds: [embed], flags: 64 });
                }

                if (commandName === 'refresh_cooldown_all') {
                    const count = cooldowns.size;
                    cooldowns.clear();
                    return interaction.reply({ content: `⏱️ **Cooldowns Reset!** ${count} cooldowns cleared.`, flags: 64 });
                }

                if (commandName === 'panel') {
                    const subArg = options.getString('type');
                    if (subArg === 'generator') {
                        const embed = new EmbedBuilder()
                            .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
                            .setDescription('Generate your token below!\n\n⚠️ **Please open your DMs** to receive your token!\n🔄 **Auto-Refresh:** Every few minutes')
                            .setColor(0x5865F2)
                            .setFooter({ text: 'TMC.LOL' });
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('gen_public').setLabel('Generate Token').setStyle(ButtonStyle.Success).setEmoji('🔑')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }
                    if (subArg === 'verify') {
                        const embed = new EmbedBuilder().setTitle("🛡️ VERIFICATION").setDescription("Click below to verify.").setColor(0x1ABC9C);
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('verify_btn').setLabel('VERIFY').setStyle(ButtonStyle.Success).setEmoji('🛡️')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }
                    if (subArg === 'redeem') {
                        const embed = new EmbedBuilder().setTitle("💎 KEY REDEEM").setDescription("Got a code? Click below to redeem.").setColor(0x5865F2);
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM KEY').setStyle(ButtonStyle.Primary).setEmoji('💎')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }
                    if (subArg === 'support') {
                        const embed = new EmbedBuilder().setTitle("🛠️ SUPPORT").setDescription("Select your department.").setColor(0xFEE75C);
                        const row = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('support_select')
                                .setPlaceholder('📂 Select department...')
                                .addOptions([
                                    { label: 'General Support', value: 'General Inquiry', emoji: '❓' },
                                    { label: 'Token Help', value: 'Token Help', emoji: '🔑' }
                                ])
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }
                }

                // ── DONATE TOKEN ──
                if (commandName === 'donate-token') {
                    const user = options.getUser('user');
                    const token = options.getString('token');
                    const refreshToken = options.getString('refresh_token');

                    if (!token.startsWith('ey') || !refreshToken.startsWith('ey')) {
                        return interaction.reply({ content: '❌ **Invalid tokens** — must be JWT strings starting with `ey...`', flags: 64 });
                    }
                    if (isExpired(token, 60)) {
                        const ttl = secondsUntilExpiry(token);
                        return interaction.reply({ content: `❌ **Token already expired** (${ttl}s remaining).`, flags: 64 });
                    }

                    addDonated(user.id, token, refreshToken, interaction.user.id);
                    const ttl = secondsUntilExpiry(token);
                    return interaction.reply({
                        content: `🎁 **Token donated to ${user}**\n\`\`\`json\n${JSON.stringify({ expires_in: ttl, recipient: user.id, given_by: interaction.user.id }, null, 2)}\n\`\`\`\n>>> They can claim it with \`/my-tokens\`.`,
                        flags: 64
                    });
                }

                // ── REVOKE TOKEN ──
                if (commandName === 'revoke-token') {
                    const user = options.getUser('user');
                    const count = revokeDonated(user.id);
                    return interaction.reply({
                        content: count > 0 ? `🗑️ **Revoked \`${count}\` donated token(s)** from ${user}.` : `ℹ️ **${user} had no donated tokens** to revoke.`,
                        flags: 64
                    });
                }
            }

            // ── /my-tokens (non‑admin) ──
            if (commandName === 'my-tokens') {
                const userId = interaction.user.id;
                const onCd = checkCooldown(userId, 'my_tokens', 60);
                if (onCd.onCooldown) {
                    return interaction.reply({
                        content: `⏱️ Slow down — try again in \`${formatTime(onCd.remaining)}\`.`,
                        flags: 64
                    });
                }
                setCooldown(userId, 'my_tokens', 60);

                const donated = getDonated(userId);
                if (!donated || donated.length === 0) {
                    return interaction.reply({ content: '🎁 **No gifted tokens** — ask an admin to run `/donate-token` for you.', flags: 64 });
                }

                const valid = donated.filter(t => !isExpired(t.token, 0));
                const expiredCount = donated.length - valid.length;
                if (valid.length === 0) {
                    return interaction.reply({
                        content: `⚠️ **All ${expiredCount} gifted token(s) have expired** — ask an admin for a new one.`,
                        flags: 64
                    });
                }

                const payload = valid.map((t, i) => ({
                    gift: i + 1,
                    token: t.token,
                    refresh_token: t.refresh_token,
                    expires_in: secondsUntilExpiry(t.token),
                    given_by: t.given_by
                }));

                const raw = JSON.stringify(payload, null, 2);
                const header = `🎁 **Your Gifted Tokens** — \`${valid.length}\` valid, \`${expiredCount}\` expired\n`;
                if (header.length + raw.length + 10 <= 1990) {
                    return interaction.reply({
                        content: `${header}\`\`\`json\n${raw}\n\`\`\``,
                        flags: 64
                    });
                } else {
                    await interaction.reply({ content: `${header}*(Sending ${valid.length} token(s) separately)*`, flags: 64 });
                    for (const entry of payload) {
                        await interaction.followUp({ content: `\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\``, flags: 64 });
                    }
                    return;
                }
            }
        }

        // ─── BUTTON HANDLERS ──────────────────────────────────────────
        if (interaction.isButton()) {
            if (interaction.customId === 'gen_public') {
                // Reuse /token logic via a helper
                // We'll simulate a command execution
                const fakeInteraction = { ...interaction, commandName: 'token', options: { getString: () => null } };
                // We'll just call the token generation block manually
                // For simplicity, we'll create a new handler
                await handleTokenGeneration(interaction);
                return;
            }

            if (interaction.customId === 'verify_btn') {
                await interaction.deferReply({ flags: 64 });
                const role = interaction.guild.roles.cache.get(MEMBER_ROLE_ID);
                if (!role) return interaction.editReply({ content: "❌ Role not found." });
                if (interaction.member.roles.cache.has(role.id)) {
                    return interaction.editReply({ content: "⚠️ You are already verified!" });
                }
                try {
                    await interaction.member.roles.add(role);
                    return interaction.editReply({ content: "✅ **Verified!**" });
                } catch (err) {
                    return interaction.editReply({ content: "❌ Failed to verify." });
                }
            }

            if (interaction.customId === 'redeem_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('redeem_modal')
                    .setTitle('💎 Secure Key Redemption');
                const codeInput = new TextInputBuilder()
                    .setCustomId('redeem_code_input')
                    .setLabel("ENTER CODE")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder("supporter-xxxx-xxxx-xxxx")
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId.startsWith('remove_')) {
                const id = interaction.customId.replace('remove_', '');
                const idx = (global.tokenStock || []).findIndex(t => t.id === id);
                if (idx === -1) {
                    return interaction.reply({ content: `❌ No token found with ID \`${id}\`.`, flags: 64 });
                }
                global.tokenStock.splice(idx, 1);
                return interaction.reply({ content: `✅ Token \`${id}\` removed. Remaining: ${global.tokenStock.length}`, flags: 64 });
            }

            if (interaction.customId === 'close_ticket_btn') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: "❌ Only staff can close tickets.", flags: 64 });
                }
                await interaction.reply({ content: "🔒 Closing ticket..." });
                setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            }
        }

        // ─── SELECT MENU ─────────────────────────────────────────────
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'support_select') {
                const category = interaction.values[0];
                await interaction.deferReply({ flags: 64 });
                try {
                    const ticketChannel = await interaction.guild.channels.create({
                        name: `ticket-${interaction.user.username}`,
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                        ],
                    });
                    const embed = new EmbedBuilder()
                        .setTitle(`🎫 TICKET: ${category.toUpperCase()}`)
                        .setDescription(`Welcome, <@${interaction.user.id}>.`)
                        .setColor(0xFEE75C)
                        .setTimestamp();
                    const closeButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('close_ticket_btn').setLabel('CLOSE').setStyle(ButtonStyle.Danger).setEmoji('🔒')
                    );
                    await ticketChannel.send({ embeds: [embed], components: [closeButton] });
                    return interaction.editReply({ content: `✅ Ticket created: <#${ticketChannel.id}>` });
                } catch (err) {
                    return interaction.editReply({ content: "❌ Failed to create ticket." });
                }
            }
        }

        // ─── MODALS ─────────────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'redeem_modal') {
                await interaction.deferReply({ flags: 64 });
                const code = interaction.fields.getTextInputValue('redeem_code_input').trim();
                // For simplicity, we only support static codes – you can add your own validation
                if (code === 'supporter-1234-5678-9012') { // example
                    const supporterRole = interaction.guild.roles.cache.get(SUPPORTER_ROLE_ID);
                    if (!supporterRole) {
                        return interaction.editReply({ content: `🎉 **Code Validated!** However, the Supporter Role couldn't be found.` });
                    }
                    try {
                        await interaction.member.roles.add(supporterRole);
                        return interaction.editReply({ content: `🎉 **Redemption Successful!** Code \`${code}\` verified. Supporter role assigned!` });
                    } catch (err) {
                        return interaction.editReply({ content: `⚠️ Code valid, but failed to assign role.` });
                    }
                } else {
                    return interaction.editReply({ content: `❌ **Invalid Code:** \`${code}\` does not exist or has been claimed.` });
                }
            }
        }
    } catch (err) {
        console.error(`[TMC.LOL] Interaction Error:`, err);
        if (!interaction.replied && !interaction.deferred) {
            interaction.reply({ content: "❌ An error occurred. Please try again.", flags: 64 }).catch(() => {});
        }
    }
});

// ─── TOKEN GENERATION HELPER (for button) ─────────────────────────────
async function handleTokenGeneration(interaction) {
    // Same logic as /token command but without deferReply (already deferred by button)
    await interaction.deferReply({ flags: 64 });
    if (!currentToken) {
        try { currentToken = loadTokens(); } catch (_) {}
        if (!currentToken) {
            return interaction.editReply({ content: '❌ No token available. Contact admin.' });
        }
    }
    if (isExpired(currentToken.token, 300)) {
        await refreshWithFallback(true);
    }
    const tokenObj = {
        bearer: currentToken.token,
        refresh: currentToken.refresh_token,
        expiresAt: getTokenExpiryMs(currentToken.token)
    };
    const genId = generateGenerationId();
    tokenObj.id = genId;
    tokenObj.userId = interaction.user.id;
    tokenObj.username = interaction.user.tag;
    if (!global.tokenStock) global.tokenStock = [];
    global.tokenStock.push(tokenObj);
    if (global.tokenStock.length > 100) global.tokenStock.shift();

    const expiryText = humanExpiry(tokenObj.expiresAt);
    const warnNote = (isExpired(tokenObj.bearer, 0))
        ? '\n\n⚠️ **WARNING:** This token may NOT work. The refresh token may be invalid — contact admin.'
        : '';

    try {
        const tokenData = {
            token: {
                bearer: tokenObj.bearer,
                refresh_token: tokenObj.refresh,
                expires_at: new Date(tokenObj.expiresAt).toISOString(),
                added_at: new Date().toISOString(),
                generation_id: genId
            },
            message: "Thank you for using TMC.LOL Token Generator!",
            credits: "@elliott",
            auto_refresh: "Refreshed automatically before expiry"
        };
        const jsonString = JSON.stringify(tokenData, null, 2);
        const jsonBuffer = Buffer.from(jsonString, 'utf-8');
        const attachment = new AttachmentBuilder(jsonBuffer, { name: 'token.json' });

        const textVersion = `🔑 TMC.LOL TOKEN GENERATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEARER TOKEN:
${tokenObj.bearer}

REFRESH TOKEN:
${tokenObj.refresh}

GENERATION ID:
${genId}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Valid until: ${expiryText}
🔄 Auto-Refresh: Before expiry
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${warnNote}`;
        const textBuffer = Buffer.from(textVersion, 'utf-8');
        const textAttachment = new AttachmentBuilder(textBuffer, { name: 'token.txt' });

        const embed = new EmbedBuilder()
            .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
            .setDescription('✅ **Token generated successfully!**\n\n' +
                '📁 **Files attached:**\n• `token.json` - JSON format\n• `token.txt` - Plain text format\n\n' +
                `🆔 **Generation ID:** \`${genId}\`\n` +
                `⏳ **Valid for:** ${expiryText}\n` +
                '🔄 **Auto-Refresh:** Before expiry\n\n👑 **Credits:** @elliott' +
                (warnNote ? '\n\n⚠️ **This token may not work** — contact admin.' : ''))
            .setColor(isExpired(tokenObj.bearer, 0) ? 0xED4245 : 0x5865F2)
            .setFooter({ text: 'TMC.LOL • Auto-Refresh' });

        await interaction.user.send({ embeds: [embed], files: [attachment, textAttachment] });
        return interaction.editReply({
            content: `✅ **Token sent to your DMs!**\n🆔 **ID:** \`${genId}\`\n⏳ **${expiryText}**\n📦 **Tokens generated:** ${global.tokenStock.length}` +
                (warnNote ? '\n\n⚠️ **Warning:** token may not work — contact admin.' : '')
        });
    } catch (err) {
        return interaction.editReply({ content: '❌ **DM Failed:** Please open your DMs to receive tokens.' });
    }
}

// ─── ERROR HANDLING ────────────────────────────────────────────────────
client.on('error', err => console.error('[TMC.LOL] Client error:', err));
client.on('disconnect', () => console.log('[TMC.LOL] Disconnected from Discord, attempting to reconnect...'));

// ─── HEALTH CHECK ──────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', bot: 'online', timestamp: Date.now() }));
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('TMC.LOL Token Generator Bot is active!\nAuto-refreshes with multi‑account fallback.\nCredits to @elliott\n');
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[TMC.LOL] HTTP server running on port ${PORT}`);
});

// ─── LOGIN ─────────────────────────────────────────────────────────────
if (!process.env.DISCORD_TOKEN) {
    console.error('[TMC.LOL] ❌ DISCORD_TOKEN environment variable is NOT set!');
} else {
    console.log(`[TMC.LOL] ✅ DISCORD_TOKEN is set (length: ${process.env.DISCORD_TOKEN.length})`);
    async function loginWithRetry(attempts = 5) {
        for (let i = 1; i <= attempts; i++) {
            try {
                console.log(`[TMC.LOL] 🔄 Login attempt ${i}/${attempts}...`);
                await Promise.race([
                    client.login(process.env.DISCORD_TOKEN),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Login timeout')), 30000))
                ]);
                console.log('[TMC.LOL] ✅ Discord login successful!');
                return true;
            } catch (err) {
                console.error(`[TMC.LOL] ❌ Login attempt ${i} failed:`, err.message);
                if (i === attempts) break;
                await new Promise(resolve => setTimeout(resolve, 5000 * i));
            }
        }
        console.error('[TMC.LOL] ❌ All login attempts failed.');
        return false;
    }
    loginWithRetry();
}

process.on('unhandledRejection', (reason) => {
    console.error('[TMC.LOL] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[TMC.LOL] Uncaught Exception:', err);
});
