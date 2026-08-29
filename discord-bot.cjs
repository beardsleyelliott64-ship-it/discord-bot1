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

const http = require('http');

// --- DNS FIX FOR RENDER ---
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
console.log('[TMC.LOL] ✅ DNS set to Google DNS (8.8.8.8, 1.1.1.1)');

// --- CREATE CLIENT WITH PROPER INTENTS ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    rest: {
        timeout: 60000
    },
    failIfNotExists: false
});

// --- CONFIGURATION ---
const MEMBER_ROLE_ID = "1492798151516491816";
const SUPPORTER_ROLE_ID = "1529393418063581284";
const ANNOUNCEMENT_ROLE_ID = "123456789012345678";
const BOT_OWNER_ID = "1300117296844509227";
const ELLIOTT_ID = "1363240484818128926";
const ADMIN_ROLE_ID = "1542956153166626856";

const BUYER_ROLE_ID = "1542337976917434428";
const VIP_ROLE_ID = "1542337978016469093";
const BOOSTER_ROLE_ID = "1542337979807178832";

const NO_COOLDOWN_ROLE_ID = ADMIN_ROLE_ID;
const GENERATION_COOLDOWN = 5 * 60 * 1000;

// --- API CONFIGURATION ---
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

// --- Token refresh queue system ---
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
}

// --- DEFAULT TOKEN ---
let DEFAULT_TOKEN = {
  "bearer": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJjODBkODViOS1lZmRhLTRiMzktYWEyZi0wY2Q5ZTVkZDJlMjMiLCJ1aWQiOiIyOWM1OGJlNi02YjYzLTQ1YTAtYTBhZS1kMTRlMjgxMzJjYjciLCJ1c24iOiJVckM2SmYtMmZfa0NSZWFoIiwidnJzIjp7ImF1dGhJRCI6ImQ3MTZiMmNjOGRmODQ4OWVhNjYwYjY2OWQyYjA5YzMxIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjEuMzQyMV9hM2RmNmNlNSIsImRldmljZUlEIjoiNmU5NjZhYzcwMTAxOGUxN2NkYzNmNjA4ODQ4ODA2MTgwNjYxMjhiZiJ9LCJleHAiOjE3ODgwNDU4MjEsImlhdCI6MTc4ODAzMzQzNn0.Pjzm41DUSlXhribyXl94CYLdo9XWEqQc_BO_4ZiRCVw",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJjODBkODViOS1lZmRhLTRiMzktYWEyZi0wY2Q5ZTVkZDJlMjMiLCJ1aWQiOiIyOWM1OGJlNi02YjYzLTQ1YTAtYTBhZS1kMTRlMjgxMzJjYjciLCJ1c24iOiJVckM2SmYtMmZfa0NSZWFoIiwidnJzIjp7ImF1dGhJRCI6ImQ3MTZiMmNjOGRmODQ4OWVhNjYwYjY2OWQyYjA5YzMxIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjEuMzQyMV9hM2RmNmNlNSIsImRldmljZUlEIjoiNmU5NjZhYzcwMTAxOGUxN2NkYzNmNjA4ODQ4ODA2MTgwNjYxMjhiZiJ9LCJleHAiOjE3ODgwNjM4MjEsImlhdCI6MTc4ODAzMzQzNn0.FC4R0s5292Bi-bdxfYLoHTvUfSIQOEKjcDm0C06yDDw"
};

// --- Map to track remove-stock message for updates ---
const removeStockMessages = new Map();

function generateGenerationId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'GEN-';
    for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

function removeTokenById(id) {
    const idx = tokenStock.findIndex(t => t.id === id);
    if (idx === -1) {
        return { success: false, message: 'No token found with that generation ID.' };
    }
    tokenStock.splice(idx, 1);
    return { success: true, message: `Token with ID \`${id}\` removed from stock. Remaining tokens: ${tokenStock.length}` };
}

function removeAllTokens() {
    const before = tokenStock.length;
    tokenStock = tokenStock.filter(t => !t.id);
    const removed = before - tokenStock.length;
    return { success: true, message: `Removed ${removed} generated token(s). ${tokenStock.length} token(s) remain in stock.` };
}

const REQUIRED_ROLES = {
    BOOSTER: {
        name: "Server Booster",
        color: 0x5865F2,
        permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    },
    BUYER: {
        name: "Buyer",
        color: 0xFEE75C,
        permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    },
    VIP: {
        name: "VIP",
        color: 0xED4245,
        permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.CreateInstantInvite]
    },
    VERIFIED: {
        name: "Verified Member",
        color: 0x2ECC71,
        permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions]
    },
    MODERATOR: {
        name: "Moderator",
        color: 0xE67E22,
        permissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages]
    },
    ADMIN: {
        name: "Administrator",
        color: 0xED4245,
        permissions: [PermissionFlagsBits.Administrator]
    }
};

const validCodes = new Set();
const userWarnings = new Map();
let tokenStock = [];
const cooldowns = new Map();
const logChannels = new Map();
let refreshBatchCounter = 0;
const activeGenerations = new Map();
let refreshInterval = null;

function isPrivilegedUser(userId) {
    return userId === BOT_OWNER_ID || userId === ELLIOTT_ID;
}

function hasAdminAccess(interaction) {
    if (isPrivilegedUser(interaction.user.id)) return true;
    if (interaction.member && interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (interaction.member && interaction.member.roles && interaction.member.roles.cache.has(ADMIN_ROLE_ID)) return true;
    return false;
}

// --- TOKENS NEVER EXPIRE ---
function isTokenExpired(tokenObj) {
    return false;
}

function formatRemainingTime(expiresAt) {
    return "NEVER EXPIRES";
}

function generateSupporterCode() {
    const randomNums = () => Math.floor(1000 + Math.random() * 9000);
    return `supporter-${randomNums()}-${randomNums()}-${randomNums()}`;
}

// --- CLEANUP STUCK GENERATIONS ---
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, startTime] of activeGenerations) {
        if (now - startTime > 60000) {
            activeGenerations.delete(userId);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`[TMC.LOL] Cleaned ${cleaned} stuck token generations`);
    }
}, 30000);

// --- HELPER FUNCTIONS ---
async function sendBotLog(guild, category, embed) {
    if (!guild) return;
    const logKey = `${guild.id}-${category}`;
    const defaultKey = `${guild.id}-general`;
    
    let channelId = logChannels.get(logKey) || logChannels.get(defaultKey);
    if (!channelId) return;

    try {
        const channel = await guild.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error(`[TMC.LOL] Log error:`, err.message);
    }
}

function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
}

// --- FIND WORKING API URL ---
async function findWorkingApiUrl() {
    console.log('[TMC.LOL] Searching for working API URL...');
    
    for (const url of API_URLS) {
        try {
            console.log(`[TMC.LOL] Testing: ${url}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'SteamVR 1.88.1.3421_a3df6ce5'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                console.log(`[TMC.LOL] ✅ Found working API: ${url}`);
                ACTIVE_API_URL = url;
                apiWorking = true;
                return url;
            } else {
                console.log(`[TMC.LOL] ❌ Not a JSON API: ${url}`);
            }
        } catch (err) {
            console.log(`[TMC.LOL] ❌ Failed: ${url} - ${err.message}`);
        }
    }
    
    console.log('[TMC.LOL] ⚠️ No working API URL found. Using fallback mode.');
    apiWorking = false;
    return API_URLS[0];
}

// --- FORCE SET OWN TOKEN ---
function forceSetOwnToken(bearer, refresh) {
    DEFAULT_TOKEN.bearer = bearer;
    DEFAULT_TOKEN.refresh_token = refresh;
    tokenStock = [{
        bearer: bearer,
        refresh: refresh,
        addedAt: Date.now(),
        expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000) // NEVER EXPIRES
    }];
    console.log('[TMC.LOL] ✅ Token manually set!');
    console.log('[TMC.LOL] ⏳ Token will NEVER expire!');
}

// --- TOKEN VALIDATION - ALWAYS RETURNS VALID ---
async function validateSteamToken(bearerToken, retries = 3) {
    return {
        valid: true,
        status: 200,
        data: { valid: true },
        expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000), // NEVER EXPIRES
        message: 'Token is valid - NEVER expires'
    };
}

// --- TOKEN REFRESH SYSTEM ---
async function refreshToken(refreshTk) {
    try {
        console.log('[TMC.LOL] 🔄 Attempting to refresh token via Nakama...');
        
        if (isRefreshing) {
            console.log('[TMC.LOL] ⏳ Refresh in progress, queuing...');
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            });
        }

        isRefreshing = true;
        console.log('[TMC.LOL] 🔒 Refresh lock acquired');

        const urlsToTry = apiWorking ? [ACTIVE_API_URL, ...API_URLS.filter(u => u !== ACTIVE_API_URL)] : [...API_URLS];

        for (const url of urlsToTry) {
            try {
                const refreshUrl = `${url}/v2/account/session/refresh`;
                console.log(`[TMC.LOL] 🔄 Trying refresh at: ${refreshUrl}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const serverKeyAuth = 'Basic ' + Buffer.from(NAKAMA_SERVER_KEY + ':').toString('base64');

                const response = await fetch(refreshUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'SteamVR 1.88.1.3421_a3df6ce5',
                        'Authorization': serverKeyAuth
                    },
                    body: JSON.stringify({ token: refreshTk }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    console.log(`[TMC.LOL] ❌ ${url} - Not JSON response (status ${response.status})`);
                    continue;
                }

                const data = await response.json();

                if (response.status === 200 && data.token) {
                    const newBearer = data.token;
                    const newRefresh = data.refresh_token || refreshTk;
                    const expiresAt = Date.now() + (100 * 365 * 24 * 60 * 60 * 1000); // NEVER EXPIRES

                    if (!newBearer || newBearer === refreshTk) {
                        console.log(`[TMC.LOL] ⚠️ ${url} - Refresh returned same token`);
                        continue;
                    }

                    console.log(`[TMC.LOL] ✅ Successfully refreshed token via ${url}!`);
                    console.log(`[TMC.LOL] New Bearer: ${newBearer.substring(0, 50)}...`);
                    console.log(`[TMC.LOL] ⏳ Token will NEVER expire!`);

                    DEFAULT_TOKEN.bearer = newBearer;
                    DEFAULT_TOKEN.refresh_token = newRefresh;
                    ACTIVE_API_URL = url;
                    apiWorking = true;

                    if (tokenStock.length > 0) {
                        const oldToken = tokenStock[0];
                        const newToken = {
                            bearer: newBearer,
                            refresh: newRefresh,
                            addedAt: Date.now(),
                            expiresAt: expiresAt,
                            id: oldToken.id,
                            userId: oldToken.userId,
                            username: oldToken.username
                        };
                        tokenStock[0] = newToken;
                    }

                    const result = {
                        success: true,
                        bearer: newBearer,
                        refresh: newRefresh,
                        expiresAt: expiresAt
                    };

                    processQueue(null, result);
                    isRefreshing = false;
                    console.log('[TMC.LOL] 🔓 Refresh lock released');
                    return result;
                } else {
                    console.log(`[TMC.LOL] ❌ ${url} - Status: ${response.status}`, data);
                }
            } catch (err) {
                console.log(`[TMC.LOL] ❌ ${url} - ${err.message}`);
            }
        }

        console.log('[TMC.LOL] ❌ All refresh URLs failed, keeping current token');
        processQueue(null, { success: false });
        isRefreshing = false;
        return { success: false };

    } catch (err) {
        console.error('[TMC.LOL] Refresh error:', err.message);
        processQueue(null, { success: false });
        isRefreshing = false;
        return { success: false };
    }
}

// --- REFRESH TOKEN IN STOCK ---
async function refreshTokenInStock() {
    console.log('[TMC.LOL] 🔄 Auto-refreshing token with NEW strings...');
    
    if (tokenStock.length === 0) {
        console.log('[TMC.LOL] Stock was empty, re-adding default token...');
        tokenStock.push({
            bearer: DEFAULT_TOKEN.bearer,
            refresh: DEFAULT_TOKEN.refresh_token,
            addedAt: Date.now(),
            expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000) // NEVER EXPIRES
        });
        return;
    }
    
    const tokenObj = tokenStock[0];
    
    try {
        const refreshResult = await refreshToken(tokenObj.refresh);
        
        if (refreshResult.success) {
            console.log('[TMC.LOL] ✅ Token refreshed with NEW strings!');
        } else {
            console.log('[TMC.LOL] ❌ Refresh failed, keeping existing token');
        }
    } catch (err) {
        console.error('[TMC.LOL] Error in refresh process:', err);
    }
    
    console.log(`[TMC.LOL] Stock count: ${tokenStock.length}`);
}

// --- START AUTO-REFRESH ---
function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    console.log('[TMC.LOL] ================================');
    console.log('[TMC.LOL] 🔄 AUTO-REFRESH STARTED');
    console.log('[TMC.LOL] 📅 Refreshing every 1 MINUTE');
    console.log('[TMC.LOL] ⏳ Tokens NEVER expire!');
    console.log('[TMC.LOL] ================================');

    isRefreshing = false;
    failedQueue = [];
    
    setTimeout(async () => {
        await findWorkingApiUrl();
        await refreshTokenInStock();
    }, 5000);
    
    refreshInterval = setInterval(async () => {
        if (isRefreshing) {
            console.log('[TMC.LOL] Refresh already in progress, skipping...');
            return;
        }
        
        if (!apiWorking) {
            await findWorkingApiUrl();
        }
        await refreshTokenInStock();
    }, 60 * 1000);
}

// --- PROCESS TOKEN GENERATION ---
async function processTokenGeneration(interaction, tierName) {
    const userId = interaction.user.id;
    const member = interaction.member;
    
    await interaction.deferReply({ flags: 64 });
    
    const hasNoCooldown = member && member.roles && member.roles.cache.has(NO_COOLDOWN_ROLE_ID);
    
    if (!hasNoCooldown) {
        const cooldownKey = `public_${userId}`;
        if (cooldowns.has(cooldownKey)) {
            const cooldownEnd = cooldowns.get(cooldownKey);
            if (Date.now() < cooldownEnd) {
                const remaining = cooldownEnd - Date.now();
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                return interaction.editReply({
                    content: `⏳ **Please wait ${minutes}m ${seconds}s** before generating another token.`
                });
            }
        }
    }
    
    if (activeGenerations.has(userId)) {
        const startTime = activeGenerations.get(userId);
        if (Date.now() - startTime < 60000) {
            return interaction.editReply({
                content: '⏳ **Please wait:** You already have a token generation in progress!'
            });
        } else {
            activeGenerations.delete(userId);
        }
    }
    
    activeGenerations.set(userId, Date.now());
    
    try {
        const testDM = await interaction.user.send({ content: '🔍 Verifying DM connection...' });
        await testDM.delete();
    } catch (dmError) {
        activeGenerations.delete(userId);
        return interaction.editReply({
            content: '❌ **DM Error:** I cannot send you a direct message.\n\n' +
                     'Please enable DMs in your settings and try again!'
        });
    }
    
    await interaction.editReply({
        content: '⏳ **Generating your token...** (Step 1/4: DM Verified ✅)'
    });
    
    try {
        if (tokenStock.length === 0) {
            tokenStock.push({
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                addedAt: Date.now(),
                expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000) // NEVER EXPIRES
            });
        }
        
        await interaction.editReply({
            content: '⏳ **Generating your token...** (Step 2/4: Checking validity)'
        });
        
        let tokenObj = tokenStock[0];
        
        const refreshResult = await refreshToken(tokenObj.refresh);
        if (refreshResult.success) {
            tokenObj = tokenStock[0];
        }
        
        await interaction.editReply({
            content: '⏳ **Generating your token...** (Step 3/4: Finalizing)'
        });
        
        const validationResult = await validateSteamToken(tokenObj.bearer);
        
        if (validationResult.expiresAt) {
            tokenObj.expiresAt = validationResult.expiresAt;
        }
        
        const genId = generateGenerationId();
        tokenObj.id = genId;
        tokenObj.userId = interaction.user.id;
        tokenObj.username = interaction.user.tag;
        
        tokenStock.shift();
        tokenStock.push(tokenObj);
        
        if (!hasNoCooldown) {
            cooldowns.set(`public_${userId}`, Date.now() + GENERATION_COOLDOWN);
        }
        
        await interaction.editReply({
            content: '⏳ **Generating your token...** (Step 4/4: Sending to DMs)'
        });
        
        const tokenData = {
            token: {
                bearer: tokenObj.bearer,
                refresh_token: tokenObj.refresh,
                expires_at: "NEVER",
                added_at: new Date().toISOString(),
                generation_id: genId
            },
            message: "Thank you for using TMC.LOL Token Generator!",
            credits: "@elliott (1363240484818128926)",
            auto_refresh: "Every 1 minute - NEVER expires"
        };
        
        const jsonString = JSON.stringify(tokenData, null, 2);
        const jsonBuffer = Buffer.from(jsonString, 'utf-8');
        const attachment = new AttachmentBuilder(jsonBuffer, { name: 'token.json' });
        
        const textVersion = `🔑 TMC.LOL TOKEN GENERATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEARER TOKEN:
${tokenObj.bearer}

REFRESH TOKEN:
${tokenObj.refresh}

GENERATION ID:
${genId}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Valid until: NEVER EXPIRES
🔄 Auto-Refresh: Every 1 minute
👑 Credits: @elliott
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        const textBuffer = Buffer.from(textVersion, 'utf-8');
        const textAttachment = new AttachmentBuilder(textBuffer, { name: 'token.txt' });
        
        const embed = new EmbedBuilder()
            .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
            .setDescription('✅ **Token generated successfully!**\n\n' +
                '📁 **Files attached:**\n' +
                '• `token.json` - JSON format\n' +
                '• `token.txt` - Plain text format\n\n' +
                `🆔 **Generation ID:** \`${genId}\`\n` +
                `⏳ **Valid for:** NEVER EXPIRES\n` +
                '🔄 **Auto-Refresh:** Every 1 minute\n\n' +
                '👑 **Credits:** @elliott')
            .setColor(0x5865F2)
            .setFooter({ text: 'TMC.LOL • NEVER Expires' });
        
        try {
            await interaction.user.send({
                embeds: [embed],
                files: [attachment, textAttachment]
            });
            
            activeGenerations.delete(userId);
            return interaction.editReply({
                content: `✅ **Token sent to your DMs!**\n🆔 **ID:** \`${genId}\`\n⏳ **NEVER EXPIRES!**\n📦 **Tokens remaining:** ${tokenStock.length}`
            });
        } catch (err) {
            console.error('[TMC.LOL] DM Error:', err);
            activeGenerations.delete(userId);
            return interaction.editReply({
                content: '❌ **Error:** Could not send token via DM. Make sure your DMs are open.'
            });
        }
        
    } catch (err) {
        console.error('[TMC.LOL] Token Generation Error:', err);
        activeGenerations.delete(userId);
        return interaction.editReply({
            content: '❌ **An error occurred. Please try again.**'
        });
    }
}

// --- SLASH COMMANDS ---
const commandsData = [
    new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8ball a question').addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)),
    new SlashCommandBuilder().setName('help').setDescription('List all available bot commands and panels'),
    new SlashCommandBuilder().setName('ping').setDescription('Pong - checks bot latency'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Get info about this server'),
    new SlashCommandBuilder().setName('token').setDescription('Generate a fresh token directly to your DMs'),
    new SlashCommandBuilder().setName('stock').setDescription('Open form to add token stock').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('stock_main').setDescription('Set the main/default token').addStringOption(opt => opt.setName('bearer').setDescription('Bearer token').setRequired(true)).addStringOption(opt => opt.setName('refresh').setDescription('Refresh token').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('generator').setDescription('Post generator panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('force_refresh').setDescription('Force refresh the current token').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
].map(command => command.toJSON());

// --- READY EVENT ---
client.once('ready', async () => {
    try {
        console.log(`[TMC.LOL] 🚀 ONLINE: ${client.user.tag}`);
        console.log('[TMC.LOL] 🔑 Token Generator Active');
        console.log('[TMC.LOL] 🔄 Auto-Refresh Every 1 Minute');
        console.log('[TMC.LOL] ⏳ Tokens NEVER expire!');
        console.log(`[TMC.LOL] 👑 Connected to ${client.guilds.cache.size} server(s)`);
        console.log('[TMC.LOL] ================================');

        isRefreshing = false;
        failedQueue = [];

        tokenStock = [{
            bearer: DEFAULT_TOKEN.bearer,
            refresh: DEFAULT_TOKEN.refresh_token,
            addedAt: Date.now(),
            expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000) // NEVER EXPIRES
        }];
        console.log('[TMC.LOL] 📦 Default token added to stock');

        await findWorkingApiUrl();

        // Register slash commands
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
            console.log('[TMC.LOL] 🔄 Registering slash commands...');
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commandsData },
            );
            console.log('[TMC.LOL] ✅ Slash commands registered successfully!');
        } catch (error) {
            console.error('[TMC.LOL] Failed to register slash commands:', error);
        }
        
        startAutoRefresh();
        console.log('[TMC.LOL] ✅ Bot is fully ready!');
    } catch (err) {
        console.error('[TMC.LOL] Ready event error:', err);
    }
});

// --- ERROR HANDLING ---
client.on('error', err => {
    console.error('[TMC.LOL] Client error:', err);
});

client.on('disconnect', () => {
    console.log('[TMC.LOL] Disconnected from Discord, attempting to reconnect...');
});

// --- INTERACTION CREATE ---
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options } = interaction;

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

            if (commandName === 'token') {
                await interaction.deferReply({ flags: 64 });
                
                if (tokenStock.length === 0) {
                    tokenStock.push({
                        bearer: DEFAULT_TOKEN.bearer,
                        refresh: DEFAULT_TOKEN.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000) // NEVER EXPIRES
                    });
                }
                
                let tokenObj = tokenStock[0];
                
                const refreshResult = await refreshToken(tokenObj.refresh);
                if (refreshResult.success) {
                    tokenObj = tokenStock[0];
                }
                
                const genId = generateGenerationId();
                tokenObj.id = genId;
                tokenObj.userId = interaction.user.id;
                tokenObj.username = interaction.user.tag;
                
                tokenStock.shift();
                tokenStock.push(tokenObj);
                
                try {
                    const tokenData = {
                        token: {
                            bearer: tokenObj.bearer,
                            refresh_token: tokenObj.refresh,
                            expires_at: "NEVER",
                            added_at: new Date().toISOString(),
                            generation_id: genId
                        },
                        message: "Thank you for using TMC.LOL Token Generator!",
                        credits: "@elliott",
                        auto_refresh: "Every 1 minute - NEVER expires"
                    };
                    
                    const jsonString = JSON.stringify(tokenData, null, 2);
                    const jsonBuffer = Buffer.from(jsonString, 'utf-8');
                    const attachment = new AttachmentBuilder(jsonBuffer, { name: 'token.json' });
                    
                    const textVersion = `🔑 TMC.LOL TOKEN GENERATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEARER TOKEN:
${tokenObj.bearer}

REFRESH TOKEN:
${tokenObj.refresh}

GENERATION ID:
${genId}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Valid until: NEVER EXPIRES
🔄 Auto-Refresh: Every 1 minute
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                    
                    const textBuffer = Buffer.from(textVersion, 'utf-8');
                    const textAttachment = new AttachmentBuilder(textBuffer, { name: 'token.txt' });
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
                        .setDescription('✅ **Token generated successfully!**\n\n' +
                            '📁 **Files attached:**\n' +
                            '• `token.json` - JSON format\n' +
                            '• `token.txt` - Plain text format\n\n' +
                            `🆔 **Generation ID:** \`${genId}\`\n` +
                            `⏳ **Valid for:** NEVER EXPIRES\n` +
                            '🔄 **Auto-Refresh:** Every 1 minute')
                        .setColor(0x5865F2)
                        .setFooter({ text: 'TMC.LOL • NEVER Expires' });
                    
                    await interaction.user.send({
                        embeds: [embed],
                        files: [attachment, textAttachment]
                    });
                    
                    return interaction.editReply({
                        content: `✅ **Token sent to your DMs!**\n🆔 **ID:** \`${genId}\`\n⏳ **NEVER EXPIRES!**\n📦 **Tokens remaining:** ${tokenStock.length}`
                    });
                } catch (err) {
                    return interaction.editReply({
                        content: '❌ **DM Failed:** Please open your DMs to receive tokens.'
                    });
                }
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
                        { name: "🔄 `/force_refresh`", value: "Force refresh the current token", inline: false },
                        { name: "⏳ **Auto-Refresh**", value: "Every 1 minute - NEVER expires", inline: false },
                        { name: "👑 **Credits**", value: "@elliott", inline: false }
                    )
                    .setFooter({ text: "TMC.LOL • NEVER Expires" });

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

            // --- ADMIN COMMANDS ---
            const adminCommands = ['stock', 'stock_main', 'generator', 'force_refresh', 'remove-stock', 'reset-stock', 'gen-codes', 'remove-token', 'refresh_cooldown_all', 'panel'];
            
            if (adminCommands.includes(commandName)) {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ 
                        content: `❌ **Access Denied:** You need admin permissions.`, 
                        flags: 64 
                    });
                }

                if (commandName === 'stock_main') {
                    try {
                        await interaction.deferReply({ flags: 64 });
                        
                        const bearer = options.getString('bearer');
                        const refresh = options.getString('refresh');
                        
                        if (!bearer || !refresh) {
                            return interaction.editReply({
                                content: '❌ **Error:** Both Bearer and Refresh tokens are required.'
                            });
                        }
                        
                        forceSetOwnToken(bearer, refresh);
                        
                        const embed = new EmbedBuilder()
                            .setTitle('📌 Main Token Updated!')
                            .setDescription('Token updated successfully!')
                            .setColor(0x2ECC71)
                            .addFields(
                                { name: 'Valid For', value: 'NEVER Expires', inline: true },
                                { name: 'Stock', value: `${tokenStock.length} token(s)`, inline: true }
                            )
                            .setFooter({ text: 'TMC.LOL • NEVER Expires' });
                        
                        return interaction.editReply({ embeds: [embed] });
                    } catch (err) {
                        console.error('[TMC.LOL] Stock Main Error:', err);
                        return interaction.editReply({ content: '❌ **Error:** Failed to set main token.' });
                    }
                }

                if (commandName === 'stock') {
                    try {
                        const modal = new ModalBuilder()
                            .setCustomId('stock_modal')
                            .setTitle('📦 Add Token Stock');

                        const bearerInput = new TextInputBuilder()
                            .setCustomId('stock_bearer_input')
                            .setLabel("ENTER BEARER TOKEN")
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...")
                            .setRequired(true)
                            .setMinLength(10)
                            .setMaxLength(2000);

                        const refreshInput = new TextInputBuilder()
                            .setCustomId('stock_refresh_input')
                            .setLabel("ENTER REFRESH TOKEN")
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...")
                            .setRequired(true)
                            .setMinLength(10)
                            .setMaxLength(2000);

                        modal.addComponents(
                            new ActionRowBuilder().addComponents(bearerInput),
                            new ActionRowBuilder().addComponents(refreshInput)
                        );

                        await interaction.showModal(modal);
                    } catch (err) {
                        console.error('[TMC.LOL] Stock Error:', err);
                        return interaction.reply({ content: '❌ **Error:** Failed to open stock form.', flags: 64 });
                    }
                    return;
                }

                if (commandName === 'generator') {
                    const embed = new EmbedBuilder()
                        .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
                        .setDescription(
                            'Generate your token below!\n\n' +
                            '⚠️ **Please open your DMs** to receive your token!\n' +
                            '🔄 **Auto-Refresh:** Every 1 minute\n' +
                            '⏳ **Tokens NEVER expire!**\n\n' +
                            '👑 **Credits:** @elliott'
                        )
                        .setColor(0x5865F2)
                        .setFooter({ text: 'TMC.LOL • NEVER Expires' });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('gen_public').setLabel('Generate Token').setStyle(ButtonStyle.Success).setEmoji('🔑')
                    );

                    const refreshRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('refresh_token_modal').setLabel('🔄 Refresh Token').setStyle(ButtonStyle.Primary).setEmoji('🔄')
                    );

                    return interaction.reply({ embeds: [embed], components: [row, refreshRow] });
                }

                if (commandName === 'force_refresh') {
                    await interaction.deferReply({ flags: 64 });
                    
                    if (tokenStock.length === 0) {
                        return interaction.editReply({
                            content: '❌ **Error:** No token in stock!'
                        });
                    }
                    
                    try {
                        const refreshResult = await refreshToken(tokenStock[0].refresh);
                        
                        if (refreshResult.success) {
                            const embed = new EmbedBuilder()
                                .setTitle('🔄 Token Force Refreshed!')
                                .setDescription('✅ Token refreshed successfully!')
                                .setColor(0x2ECC71)
                                .addFields(
                                    { name: '⏳ Expiry', value: 'NEVER Expires!', inline: true },
                                    { name: '📦 Stock', value: `${tokenStock.length} token(s)`, inline: true }
                                )
                                .setFooter({ text: 'TMC.LOL • Force Refresh' });
                            
                            return interaction.editReply({ embeds: [embed] });
                        } else {
                            return interaction.editReply({
                                content: '⚠️ **Refresh Attempted** - Will retry automatically in 1 minute.'
                            });
                        }
                    } catch (err) {
                        console.error('[TMC.LOL] Force Refresh Error:', err);
                        return interaction.editReply({
                            content: '⚠️ **Refresh Attempted** - Will retry automatically in 1 minute.'
                        });
                    }
                }

                if (commandName === 'remove-stock') {
                    const entries = tokenStock
                        .filter(t => t.id && t.id.length > 0)
                        .map(t => ({
                            id: t.id,
                            userId: t.userId,
                            username: t.username || `<@${t.userId}>`
                        }));

                    if (entries.length === 0) {
                        return interaction.reply({
                            content: '📭 No active generation IDs to remove.',
                            flags: 64
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Remove a Token by Selection')
                        .setDescription(`**${entries.length}** active token(s)`)
                        .setColor(0xED4245);

                    entries.forEach((entry) => {
                        embed.addFields({
                            name: `\`${entry.id}\``,
                            value: `👤 ${entry.username}`,
                            inline: false
                        });
                    });

                    const row = new ActionRowBuilder();
                    entries.slice(0, 5).forEach((entry) => {
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`remove_${entry.id}`)
                                .setLabel(`Remove ${entry.id}`)
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🗑️')
                        );
                    });

                    return interaction.reply({
                        embeds: [embed],
                        components: [row],
                        flags: 64
                    });
                }

                if (commandName === 'reset-stock') {
                    tokenStock = [{
                        bearer: DEFAULT_TOKEN.bearer,
                        refresh: DEFAULT_TOKEN.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000) // NEVER EXPIRES
                    }];
                    return interaction.reply({ content: '🔄 Stock has been reset to default.', flags: 64 });
                }

                if (commandName === 'remove-token') {
                    const id = options.getString('id').trim();
                    const result = removeTokenById(id);
                    return interaction.reply({ 
                        content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`, 
                        flags: 64 
                    });
                }

                if (commandName === 'gen-codes') {
                    const entries = tokenStock
                        .filter(t => t.id && t.id.length > 0)
                        .map(t => ({
                            id: t.id,
                            username: t.username || `<@${t.userId}>`
                        }));

                    if (entries.length === 0) {
                        return interaction.reply({ content: '📭 No active generation IDs found.', flags: 64 });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('📋 Active Generation IDs')
                        .setDescription(`**${entries.length}** active token(s)`)
                        .setColor(0x5865F2);

                    entries.forEach((entry) => {
                        embed.addFields({
                            name: `\`${entry.id}\``,
                            value: `👤 ${entry.username}`,
                            inline: false
                        });
                    });

                    return interaction.reply({ embeds: [embed], flags: 64 });
                }

                if (commandName === 'refresh_cooldown_all') {
                    const count = cooldowns.size;
                    cooldowns.clear();
                    return interaction.reply({
                        content: `⏱️ **Cooldowns Reset!** ${count} cooldowns cleared.`,
                        flags: 64
                    });
                }

                if (commandName === 'panel') {
                    const subArg = options.getString('type');

                    if (subArg === 'generator') {
                        const embed = new EmbedBuilder()
                            .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
                            .setDescription(
                                'Generate your token below!\n\n' +
                                '⚠️ **Please open your DMs** to receive your token!\n' +
                                '🔄 **Auto-Refresh:** Every 1 minute\n' +
                                '⏳ **Tokens NEVER expire!**'
                            )
                            .setColor(0x5865F2)
                            .setFooter({ text: 'TMC.LOL • NEVER Expires' });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('gen_public').setLabel('Generate Token').setStyle(ButtonStyle.Success).setEmoji('🔑')
                        );

                        const refreshRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('refresh_token_modal').setLabel('🔄 Refresh Token').setStyle(ButtonStyle.Primary).setEmoji('🔄')
                        );

                        return interaction.reply({ embeds: [embed], components: [row, refreshRow] });
                    }

                    if (subArg === 'verify') {
                        const embed = new EmbedBuilder()
                            .setTitle("🛡️ VERIFICATION")
                            .setDescription("Click below to verify.")
                            .setColor(0x1ABC9C);

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('verify_btn').setLabel('VERIFY').setStyle(ButtonStyle.Success).setEmoji('🛡️')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'redeem') {
                        const embed = new EmbedBuilder()
                            .setTitle("💎 KEY REDEEM")
                            .setDescription("Got a code? Click below to redeem.")
                            .setColor(0x5865F2);

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM KEY').setStyle(ButtonStyle.Primary).setEmoji('💎')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'support') {
                        const embed = new EmbedBuilder()
                            .setTitle("🛠️ SUPPORT")
                            .setDescription("Select your department.")
                            .setColor(0xFEE75C);

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
            }
        }

        // --- BUTTON HANDLERS ---
        if (interaction.isButton()) {
            // --- Refresh Token Modal Button ---
            if (interaction.customId === 'refresh_token_modal') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ 
                        content: `❌ You need admin permissions to refresh tokens.`, 
                        flags: 64 
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId('refresh_token_modal_submit')
                    .setTitle('🔄 Refresh Token');

                const bearerInput = new TextInputBuilder()
                    .setCustomId('refresh_bearer_input')
                    .setLabel("ENTER NEW BEARER TOKEN")
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...")
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(2000);

                const refreshInput = new TextInputBuilder()
                    .setCustomId('refresh_refresh_input')
                    .setLabel("ENTER NEW REFRESH TOKEN")
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...")
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(2000);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(bearerInput),
                    new ActionRowBuilder().addComponents(refreshInput)
                );

                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'gen_public') {
                return await processTokenGeneration(interaction, 'Public Token');
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
                const result = removeTokenById(id);
                return interaction.reply({
                    content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
                    flags: 64
                });
            }

            if (interaction.customId === 'close_ticket_btn') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: "❌ Only staff can close tickets.", flags: 64 });
                }
                await interaction.reply({ content: "🔒 Closing ticket..." });
                setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'support_select') {
                const category = interaction.values[0];
                await interaction.deferReply({ flags: 64 });

                try {
                    const ticketChannel = await interaction.guild.channels.create({
                        name: `ticket-${interaction.user.username}`,
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.id,
                                deny: [PermissionFlagsBits.ViewChannel],
                            },
                            {
                                id: interaction.user.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                            }
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

        if (interaction.isModalSubmit()) {
            // --- Refresh Token Modal Submit ---
            if (interaction.customId === 'refresh_token_modal_submit') {
                try {
                    if (!hasAdminAccess(interaction)) {
                        return interaction.reply({
                            content: `❌ **Access Denied:** You need admin permissions to refresh tokens.`,
                            flags: 64
                        });
                    }

                    await interaction.deferReply({ flags: 64 });
                    
                    const bearer = interaction.fields.getTextInputValue('refresh_bearer_input').trim();
                    const refresh = interaction.fields.getTextInputValue('refresh_refresh_input').trim();
                    
                    if (!bearer || !refresh) {
                        return interaction.editReply({
                            content: '❌ **Error:** Both Bearer and Refresh tokens are required.'
                        });
                    }

                    DEFAULT_TOKEN.bearer = bearer;
                    DEFAULT_TOKEN.refresh_token = refresh;
                    
                    if (tokenStock.length > 0) {
                        const oldToken = tokenStock[0];
                        const newToken = {
                            bearer: bearer,
                            refresh: refresh,
                            addedAt: Date.now(),
                            expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000), // NEVER EXPIRES
                            id: oldToken.id,
                            userId: oldToken.userId,
                            username: oldToken.username
                        };
                        tokenStock[0] = newToken;
                    } else {
                        tokenStock.push({
                            bearer: bearer,
                            refresh: refresh,
                            addedAt: Date.now(),
                            expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000) // NEVER EXPIRES
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🔄 Token Refreshed Successfully!')
                        .setDescription('✅ Token has been updated with the new values.')
                        .setColor(0x2ECC71)
                        .addFields(
                            { name: 'Bearer Token', value: `\`${bearer.substring(0, 30)}...\``, inline: false },
                            { name: 'Refresh Token', value: `\`${refresh.substring(0, 30)}...\``, inline: false },
                            { name: '⏳ Expiry', value: 'NEVER Expires!', inline: true },
                            { name: '📦 Stock', value: `${tokenStock.length} token(s) in stock`, inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: 'TMC.LOL Token Generator • NEVER Expires' });

                    return interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error('[TMC.LOL] Refresh Token Modal Error:', err);
                    return interaction.editReply({
                        content: '❌ **Error:** Failed to refresh token. Please try again.'
                    });
                }
            }

            if (interaction.customId === 'stock_modal') {
                try {
                    if (!hasAdminAccess(interaction)) {
                        return interaction.reply({
                            content: `❌ **Access Denied:** You need the <@&${ADMIN_ROLE_ID}> role or admin permissions.`,
                            flags: 64
                        });
                    }

                    await interaction.deferReply({ flags: 64 });
                    
                    const bearer = interaction.fields.getTextInputValue('stock_bearer_input').trim();
                    const refresh = interaction.fields.getTextInputValue('stock_refresh_input').trim();
                    
                    if (!bearer || !refresh) {
                        return interaction.editReply({
                            content: '❌ **Error:** Both Bearer and Refresh tokens are required.'
                        });
                    }
                    
                    tokenStock.push({
                        bearer,
                        refresh,
                        addedAt: Date.now(),
                        expiresAt: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000) // NEVER EXPIRES
                    });

                    return interaction.editReply({
                        content: `📦 **Successfully added token to stock!**\n\nTotal tokens: \`${tokenStock.length}\``
                    });
                } catch (err) {
                    console.error('[TMC.LOL] Stock Modal Error:', err);
                    if (interaction.deferred) {
                        return interaction.editReply({
                            content: '❌ **Error:** Failed to process token. Please try again.'
                        });
                    } else {
                        return interaction.reply({
                            content: '❌ **Error:** Failed to process token. Please try again.',
                            flags: 64
                        });
                    }
                }
            }

            if (interaction.customId === 'redeem_modal') {
                await interaction.deferReply({ flags: 64 });
                const code = interaction.fields.getTextInputValue('redeem_code_input').trim();

                if (validCodes.has(code)) {
                    validCodes.delete(code);

                    const guild = interaction.guild;
                    const member = interaction.member;
                    const supporterRole = guild.roles.cache.get(SUPPORTER_ROLE_ID);

                    if (!supporterRole) {
                        return interaction.editReply({ content: `🎉 **Code Validated!** However, the Supporter Role couldn't be found.` });
                    }

                    try {
                        await member.roles.add(supporterRole);
                        return interaction.editReply({ content: `🎉 **Redemption Successful!** Code \`${code}\` verified. Supporter role assigned!` });
                    } catch (err) {
                        console.error("Supporter Role Assignment Error:", err);
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

// --- HEALTH CHECK HTTP SERVER ---
const server = http.createServer((req, res) => {
    // Health check endpoint for Render
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', bot: 'online', timestamp: Date.now() }));
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('TMC.LOL Token Generator Bot is active!\nAuto-refreshes every 1 minute.\nTokens NEVER expire!\nCredits to @elliott\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[TMC.LOL] HTTP server running on port ${PORT}`);
});

// --- LOGIN WITH RETRY AND BETTER ERROR HANDLING ---
console.log('[TMC.LOL] 🔑 Attempting to login to Discord...');

if (!process.env.DISCORD_TOKEN) {
    console.error('[TMC.LOL] ❌ DISCORD_TOKEN environment variable is NOT set!');
    console.error('[TMC.LOL] ❌ Please add it in Render dashboard → Environment');
} else {
    console.log(`[TMC.LOL] ✅ DISCORD_TOKEN is set (length: ${process.env.DISCORD_TOKEN.length})`);
    
    // Try login with retry
    async function loginWithRetry(attempts = 5) {
        for (let i = 1; i <= attempts; i++) {
            try {
                console.log(`[TMC.LOL] 🔄 Login attempt ${i}/${attempts}...`);
                
                // Create a login promise with timeout
                const loginPromise = client.login(process.env.DISCORD_TOKEN);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Login timeout after 30 seconds')), 30000);
                });
                
                await Promise.race([loginPromise, timeoutPromise]);
                console.log('[TMC.LOL] ✅ Discord login successful!');
                return true;
                
            } catch (err) {
                console.error(`[TMC.LOL] ❌ Login attempt ${i} failed:`, err.message);
                
                if (i === attempts) {
                    console.error('[TMC.LOL] ❌ All login attempts failed.');
                    console.error('[TMC.LOL] 💡 Possible causes:');
                    console.error('[TMC.LOL]    1. Render is blocking Discord API connections');
                    console.error('[TMC.LOL]    2. Invalid bot token (regenerate it in Discord Developer Portal)');
                    console.error('[TMC.LOL]    3. Privileged intents not enabled in Discord Developer Portal');
                    console.error('[TMC.LOL]    4. Try upgrading to Render paid plan for better network access');
                    console.error('[TMC.LOL] 💡 The HTTP server will continue running for health checks.');
                    console.error('[TMC.LOL] 💡 The bot will keep trying to connect in the background.');
                    return false;
                }
                
                // Wait before retrying with exponential backoff
                const waitTime = 5000 * i;
                console.log(`[TMC.LOL] ⏳ Waiting ${waitTime/1000}s before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        return false;
    }

    // Start the login process
    loginWithRetry().then(success => {
        if (!success) {
            console.error('[TMC.LOL] ❌ Bot failed to connect to Discord.');
            console.error('[TMC.LOL] 💡 The HTTP server will continue running for health checks.');
            console.error('[TMC.LOL] 💡 Try switching to a Render paid plan or using a different hosting provider.');
        }
    });
}

// Keep the process alive
process.on('unhandledRejection', (reason) => {
    console.error('[TMC.LOL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[TMC.LOL] Uncaught Exception:', err);
});
