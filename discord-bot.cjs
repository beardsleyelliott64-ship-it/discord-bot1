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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- CONFIGURATION ---
const MEMBER_ROLE_ID = "1492798151516491816";
const SUPPORTER_ROLE_ID = "1529393418063581284";
const ANNOUNCEMENT_ROLE_ID = "123456789012345678";
const BOT_OWNER_ID = "1300117296844509227";
const ELLIOTT_ID = "1363240484818128926";
const ADMIN_ROLE_ID = "1542956153166626856"; // Role that has full admin access

const BUYER_ROLE_ID = "1542337976917434428";
const VIP_ROLE_ID = "1542337978016469093";
const BOOSTER_ROLE_ID = "1542337979807178832";

// Reuse ADMIN_ROLE_ID as no-cooldown role as well (they are the same)
const NO_COOLDOWN_ROLE_ID = ADMIN_ROLE_ID;

const GENERATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

// --- API CONFIGURATION ---
const NAKAMA_SERVER = 'https://animalcompany.us-east1.nakamacloud.io';
const NAKAMA_SERVER_KEY = process.env.NAKAMA_SERVER_KEY || 'defaultkey';
const API_URLS = [
    NAKAMA_SERVER
];

let ACTIVE_API_URL = API_URLS[0];
let apiWorking = false;

const hasServerKey = NAKAMA_SERVER_KEY && NAKAMA_SERVER_KEY.length > 0;
if (!hasServerKey) {
    console.log('[TMC.LOL] ⚠️ NAKAMA_SERVER_KEY not set - token refresh will fail with "Server key required"');
}

// --- Token refresh queue system ---
let isRefreshing = false;
let failedQueue = [];
let currentRefreshPromise = null;

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
  "bearer": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJiNjAyZTBhNy1mYTZlLTQxOTAtYTNjZS01YTc2ZWM5OThhNjciLCJ1aWQiOiJjOGQ5MjMyNS1mNTE3LTQzOTQtYmYwMi1iODNiZTI5OTY4ODYiLCJ1c24iOiJvMHcyc0dGdDc1ZUtqZ0F3IiwidnJzIjp7ImF1dGhJRCI6ImY2MDRkNDRlY2E1MDRiNjNhNGZjMDhlZjVmZDFiZjY3IiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjEuMzQyMV9hM2RmNmNlNSIsImRldmljZUlEIjoiNmU5NjZhYzcwMTAxOGUxN2NkYzNmNjA4ODQ4ODA2MTgwNjYxMjhiZiJ9LCJleHAiOjE3ODc5NDk2NjYsImlhdCI6MTc4NzkwNDg1OX0.KLVTl2B8YAMOjEBT164qxa10VtVXLzz1iCRMgYVua-8",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJiNjAyZTBhNy1mYTZlLTQxOTAtYTNjZS01YTc2ZWM5OThhNjciLCJ1aWQiOiJjOGQ5MjMyNS1mNTE3LTQzOTQtYmYwMi1iODNiZTI5OTY4ODYiLCJ1c24iOiJvMHcyc0dGdDc1ZUtqZ0F3IiwidnJzIjp7ImF1dGhJRCI6ImY2MDRkNDRlY2E1MDRiNjNhNGZjMDhlZjVmZDFiZjY3IiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjEuMzQyMV9hM2RmNmNlNSIsImRldmljZUlEIjoiNmU5NjZhYzcwMTAxOGUxN2NkYzNmNjA4ODQ4ODA2MTgwNjYxMjhiZiJ9LCJleHAiOjE3ODc5Njc2NjYsImlhdCI6MTc4NzkwNDg1OX0.9jskHSo5XXgQitiPVi-829pyIsrD-AaauxKbCM_e7Fs"
};

// --- Pagination state for /gen-codes and /remove-stock ---
const genCodePages = new Map();
const removeStockPages = new Map();

// --- Helper to generate a unique ID for a generation ---
function generateGenerationId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'GEN-';
    for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// --- Remove token by ID (searches tokenStock directly) ---
function removeTokenById(id) {
    const idx = tokenStock.findIndex(t => t.id === id);
    if (idx === -1) {
        return { success: false, message: 'No token found with that generation ID.' };
    }
    tokenStock.splice(idx, 1);
    return { success: true, message: `Token with ID \`${id}\` removed from stock. Remaining tokens: ${tokenStock.length}` };
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

// --- CHECK IF USER IS ELLIOTT OR BOT OWNER ---
function isPrivilegedUser(userId) {
    return userId === BOT_OWNER_ID || userId === ELLIOTT_ID;
}

// --- NEW: Check if user has admin access (owner, admin perm, or special role) ---
function hasAdminAccess(interaction) {
    if (isPrivilegedUser(interaction.user.id)) return true;
    if (interaction.member && interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (interaction.member && interaction.member.roles && interaction.member.roles.cache.has(ADMIN_ROLE_ID)) return true;
    return false;
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

function formatRemainingTime(expiresAt) {
    const timeLeftMs = expiresAt - Date.now();
    if (timeLeftMs <= 0) return "Expired";

    const totalSeconds = Math.floor(timeLeftMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s left`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s left`;
    if (minutes > 0) return `${minutes}m ${seconds}s left`;
    return `${seconds}s left`;
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

// ============================================
// FORCE SET OWN TOKEN (BYPASS API)
// ============================================
function forceSetOwnToken(bearer, refresh) {
    DEFAULT_TOKEN.bearer = bearer;
    DEFAULT_TOKEN.refresh_token = refresh;
    tokenStock = [{
        bearer: bearer,
        refresh: refresh,
        addedAt: Date.now(),
        expiresAt: Date.now() + (60 * 60 * 1000)
    }];
    console.log('[TMC.LOL] ✅ Token manually set!');
    console.log(`[TMC.LOL] Bearer: ${bearer.substring(0, 30)}...`);
    console.log(`[TMC.LOL] Refresh: ${refresh.substring(0, 30)}...`);
}

// --- TOKEN VALIDATION ---
async function validateSteamToken(bearerToken, retries = 3) {
    if (!bearerToken || bearerToken.length < 10) {
        return {
            valid: false,
            status: 400,
            data: null,
            expiresAt: null,
            message: 'Invalid token format - Token is empty or too short'
        };
    }

    const brickedPatterns = [
        'undefined', 'null', 'NaN', 'bricked', 'corrupted',
        'invalid', 'expired', 'error', 'failed', 'bad_token',
        'token_error', 'invalid_token', 'malformed', 'broken',
        'dead', 'revoked', 'blacklisted', 'banned'
    ];
    
    const lowerToken = bearerToken.toLowerCase();
    for (const pattern of brickedPatterns) {
        if (lowerToken.includes(pattern)) {
            console.log(`[TMC.LOL] ❌ Token appears bricked/corrupted: contains "${pattern}"`);
            return {
                valid: false,
                status: 400,
                data: null,
                expiresAt: null,
                message: `Token appears bricked/corrupted - Contains "${pattern}"`
            };
        }
    }

    let payload = null;
    let expTime = null;

    try {
        const parts = bearerToken.split('.');
        if (parts.length !== 3) {
            console.log('[TMC.LOL] ❌ Invalid JWT format');
            return {
                valid: false,
                status: 400,
                data: null,
                expiresAt: null,
                message: 'Invalid token format - Not a valid JWT'
            };
        }
        
        payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        
        if (payload.exp) {
            expTime = payload.exp * 1000;
            console.log(`[TMC.LOL] JWT expires at: ${new Date(expTime).toISOString()}`);
            
            if (Date.now() > expTime) {
                console.log('[TMC.LOL] ❌ Token expired based on JWT claim');
                return {
                    valid: false,
                    status: 401,
                    data: payload,
                    expiresAt: expTime,
                    message: 'Token expired - JWT claim expired'
                };
            }
        }
        
        const payloadString = JSON.stringify(payload).toLowerCase();
        for (const pattern of brickedPatterns) {
            if (payloadString.includes(pattern)) {
                console.log(`[TMC.LOL] ❌ Token payload contains corrupted data: "${pattern}"`);
                return {
                    valid: false,
                    status: 400,
                    data: payload,
                    expiresAt: null,
                    message: `Token payload contains corrupted data - "${pattern}"`
                };
            }
        }
        
    } catch (err) {
        console.log('[TMC.LOL] ❌ Could not decode JWT:', err.message);
        return {
            valid: false,
            status: 400,
            data: null,
            expiresAt: null,
            message: 'Invalid token format - Could not decode JWT'
        };
    }

    if (!apiWorking) {
        console.log('[TMC.LOL] ⚠️ API not reachable - Using local JWT validation only');
        if (payload && payload.exp) {
            const expTime = payload.exp * 1000;
            if (Date.now() < expTime) {
                console.log(`[TMC.LOL] ⚠️ JWT not expired locally (${new Date(expTime).toISOString()}) - treating as valid`);
                return {
                    valid: true,
                    status: 200,
                    data: { locally_valid: true },
                    expiresAt: expTime,
                    message: 'Token appears valid locally - API unreachable for full validation'
                };
            }
        }
        return {
            valid: false,
            status: 0,
            data: { bypassed: true },
            expiresAt: null,
            message: 'Cannot validate token - API unreachable and token may be expired.'
        };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const validateUrl = `${ACTIVE_API_URL}/v2/account`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(validateUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'SteamVR 1.88.1.3421_a3df6ce5'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.log('[TMC.LOL] ⚠️ Response is not JSON, bypassing...');
                return {
                    valid: true,
                    status: 200,
                    data: { bypassed: true },
                    expiresAt: Date.now() + (60 * 60 * 1000),
                    message: 'Validation bypassed - API not responding with JSON'
                };
            }
            
            let responseData = {};
            try {
                responseData = await response.json();
            } catch (e) {
                console.log('[TMC.LOL] ⚠️ Could not parse JSON, bypassing...');
                return {
                    valid: true,
                    status: 200,
                    data: { bypassed: true },
                    expiresAt: Date.now() + (60 * 60 * 1000),
                    message: 'Validation bypassed - Invalid JSON response'
                };
            }
            
            console.log(`[TMC.LOL] Validation attempt ${attempt + 1}: Status ${response.status}`);
            
            if (response.status === 401 || response.status === 403) {
                return {
                    valid: false,
                    status: response.status,
                    data: responseData,
                    expiresAt: Date.now(),
                    message: responseData.message || 'Token expired or invalid'
                };
            }
            
            const isValid = response.status === 200;
            let expiresAt = Date.now() + (60 * 60 * 1000);
            
            apiWorking = true;
            
            return {
                valid: isValid,
                status: response.status,
                data: responseData,
                expiresAt: expiresAt,
                message: responseData.message || responseData.error || (isValid ? 'Valid token' : 'Invalid token')
            };
            
        } catch (err) {
            console.error(`[TMC.LOL] Validation attempt ${attempt + 1} failed:`, err.message);
            
            if (attempt === retries) {
                console.log('[TMC.LOL] ⚠️ API unreachable - BYPASSING with 1-hour limit.');
                return {
                    valid: true,
                    status: 200,
                    data: { bypassed: true },
                    expiresAt: Date.now() + (60 * 60 * 1000),
                    message: 'Validation bypassed - API unreachable (1-hour limit applied)'
                };
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
    }
    
    return {
        valid: false,
        status: 500,
        data: { bypassed: true },
        expiresAt: Date.now(),
        message: 'Validation failed - Unknown error'
    };
}

// ============================================
// TOKEN REFRESH SYSTEM WITH QUEUE
// ============================================
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
                    const expiresAt = Date.now() + (60 * 60 * 1000);

                    if (!newBearer || newBearer === refreshTk) {
                        console.log(`[TMC.LOL] ⚠️ ${url} - Refresh returned same token`);
                        continue;
                    }

                    console.log(`[TMC.LOL] ✅ Successfully refreshed token via ${url}!`);
                    console.log(`[TMC.LOL] New Bearer: ${newBearer.substring(0, 50)}...`);

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

        console.log('[TMC.LOL] ❌ All refresh URLs failed');
        processQueue(new Error('All refresh URLs failed'), null);
        isRefreshing = false;
        return { success: false };

    } catch (err) {
        console.error('[TMC.LOL] Refresh error:', err.message);
        processQueue(err, null);
        isRefreshing = false;
        return { success: false };
    }
}

// --- REFRESH TOKEN IN STOCK (Every 5 minutes) ---
async function refreshTokenInStock() {
    console.log('[TMC.LOL] 🔄 Auto-refreshing token with NEW strings...');
    
    if (tokenStock.length === 0) {
        console.log('[TMC.LOL] Stock was empty, re-adding default token...');
        tokenStock.push({
            bearer: DEFAULT_TOKEN.bearer,
            refresh: DEFAULT_TOKEN.refresh_token,
            addedAt: Date.now(),
            expiresAt: Date.now() + (60 * 60 * 1000)
        });
        return;
    }
    
    const tokenObj = tokenStock[0];
    
    try {
        const refreshResult = await refreshToken(tokenObj.refresh);
        
        if (refreshResult.success) {
            console.log('[TMC.LOL] ✅ Token refreshed with NEW strings!');
            console.log(`[TMC.LOL] New Bearer: ${tokenStock[0].bearer.substring(0, 50)}...`);
            console.log(`[TMC.LOL] Expires: ${new Date(tokenStock[0].expiresAt).toISOString()}`);
            console.log(`[TMC.LOL] ⏳ Lifespan extended to 1 hour!`);
        } else {
            console.log('[TMC.LOL] ❌ Refresh failed, keeping existing token');
            tokenStock[0].expiresAt = Date.now() + (60 * 60 * 1000);
            tokenStock[0].addedAt = Date.now();
        }
    } catch (err) {
        console.error('[TMC.LOL] Error in refresh process:', err);
        console.log('[TMC.LOL] ❌ Keeping existing token - refresh failed');
    }
    
    if (tokenStock.length === 0) {
        tokenStock.push({
            bearer: DEFAULT_TOKEN.bearer,
            refresh: DEFAULT_TOKEN.refresh_token,
            addedAt: Date.now(),
            expiresAt: Date.now() + (60 * 60 * 1000)
        });
    }
    
    console.log(`[TMC.LOL] Stock count: ${tokenStock.length}`);
    console.log(`[TMC.LOL] Next refresh in 5 minutes...`);
}

// --- START AUTO-REFRESH (Every 5 minutes) ---
function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    console.log('[TMC.LOL] ================================');
    console.log('[TMC.LOL] 🔄 AUTO-REFRESH STARTED');
    console.log('[TMC.LOL] 📅 Refreshing every 5 minutes');
    console.log('[TMC.LOL] 🔑 Same account - NEW strings');
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
    }, 5 * 60 * 1000);
}

// --- SLASH COMMANDS ---
const commandsData = [
    new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8ball a question').addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)),
    new SlashCommandBuilder().setName('afk').setDescription('Set yourself as AFK with an optional reason').addStringOption(opt => opt.setName('reason').setDescription('AFK reason')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('announce').setDescription('Post a formatted announcement embed to a channel').addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true)).addStringOption(opt => opt.setName('message').setDescription('Announcement content').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('autodelete').setDescription('Auto-delete messages in a channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('autorole').setDescription('Automatically give a role to new members').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ban').setDescription('Ban a member from the server').addUserOption(opt => opt.setName('target').setDescription('Member to ban').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('blacklist').setDescription("Strip a member's roles and give them the Blacklisted role").addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('bumpreminder').setDescription('Set up bump reminders for Disboard').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'),
    new SlashCommandBuilder().setName('counting').setDescription('Set up or manage the counting channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('fakeconvo').setDescription('Generate a fake Discord conversation image').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('fakemessage').setDescription('Generate a fake Discord message image').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('generate-code').setDescription('Generates a unique supporter code for the redeem panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('giveall').setDescription('Give every member in the server a role').addRoleOption(opt => opt.setName('role').setDescription('Role to give').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('giveaway').setDescription('Manage giveaways').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('help').setDescription('List all available bot commands and panels'),
    new SlashCommandBuilder().setName('info').setDescription('Get info about a user').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('leaderboard').setDescription('View the server XP leaderboard'),
    new SlashCommandBuilder().setName('level').setDescription('Check your level and XP'),
    new SlashCommandBuilder().setName('levelset').setDescription("Set a member's level").addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('level').setDescription('Level').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('lock').setDescription("Lock this channel so members can't send messages").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('marco').setDescription('Marco...'),
    new SlashCommandBuilder().setName('modmakerapply').setDescription('Apply to become a mod maker in this server').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('mute').setDescription('Toggle the Muted role on a member').addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ping').setDescription('Pong - checks bot latency'),
    new SlashCommandBuilder().setName('poll').setDescription('Create a poll for members to vote on').addStringOption(opt => opt.setName('question').setDescription('Poll question').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('postroles').setDescription('Post the role list as formatted embeds').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('postrules').setDescription('Post all server rules as formatted embeds').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('purge').setDescription('Bulk delete messages in this channel').addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('reactionrole').setDescription('Set up reaction roles').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('roleadd').setDescription('Add a role to a member').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('roleremove').setDescription('Remove a role from a member').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('rps').setDescription('Play rock paper scissors against Queen Bee').addStringOption(opt => opt.setName('choice').setDescription('rock, paper, or scissors').setRequired(true).addChoices(
        { name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' }
    )),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Get info about this server'),
    new SlashCommandBuilder().setName('setlogs').setDescription('Configure the logging channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('setup-botlog')
        .setDescription('Configure category-specific log channels for bot panels')
        .addChannelOption(opt => opt.setName('channel').setDescription('Target log channel').setRequired(true))
        .addStringOption(opt => opt.setName('category').setDescription('Log category').setRequired(true).addChoices(
            { name: 'General / All Logs', value: 'general' },
            { name: 'Generator Success Logs', value: 'generator_success' },
            { name: 'Unauthorized Button / Cooldown Logs', value: 'generator_unauthorized' },
            { name: 'Stock & Admin Actions', value: 'stock' }
        ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode in this channel').addIntegerOption(opt => opt.setName('seconds').setDescription('Seconds').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('starboard').setDescription('Set up or manage the starboard').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('status').setDescription("Set the bot's online status").addStringOption(opt => opt.setName('text').setDescription('Status text').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('suggest').setDescription('Submit a suggestion or set suggestions channel').addStringOption(opt => opt.setName('suggestion').setDescription('Your suggestion').setRequired(true)),
    new SlashCommandBuilder().setName('ticketpanel').setDescription('Post the ticket-creation panel in this channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('timeout').setDescription('Timeout a member for a set number of minutes').addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('unlock').setDescription('Unlock this channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warn').setDescription('Warn a member').addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warnings').setDescription("Check a member's warnings").addUserOption(opt => opt.setName('target').setDescription('Member').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('welcome').setDescription('Configure welcome messages for new members').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('build')
        .setDescription('Builds a full theme layout with panels and categorized community/gaming channels')
        .addStringOption(opt => opt.setName('theme').setDescription('The theme/name for your server layout').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('token').setDescription('Generate a fresh token directly to your DMs'),
    new SlashCommandBuilder().setName('stock').setDescription('Open form to add token stock').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('stock_main').setDescription('Set the main/default token for the bot').addStringOption(opt => opt.setName('bearer').setDescription('Bearer token').setRequired(true)).addStringOption(opt => opt.setName('refresh').setDescription('Refresh token').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('generator').setDescription('Post clean generator panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('force_refresh').setDescription('Force refresh the current token').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('remove-stock').setDescription('Open interactive list to remove a token by selection').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('reset-stock').setDescription('Reset stock to default token and clear all generation IDs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('gen-codes').setDescription('List all active generation IDs with user info (paginated)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('remove-token').setDescription('Remove a specific token by typing its ID (direct)').addStringOption(opt => opt.setName('id').setDescription('Generation ID (e.g., GEN-ABC123)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('refresh_cooldown_all').setDescription('Reset token generation cooldown for everyone').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('refresh_cooldown_user').setDescription('Reset token generation cooldown for a specific user').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('refresh_user').setDescription('Reset token generation cooldown for a specific user').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('logs').setDescription('Set log channel').addChannelOption(opt => opt.setName('channel').setDescription('Log channel').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('servers').setDescription('List all servers the bot is currently in').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('refresh_batch').setDescription('Manually trigger auto-refresh of invalid tokens').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('panel')
        .setDescription('Deploys interactive management panels')
        .addStringOption(opt => opt.setName('type').setDescription('Panel type').setRequired(true).addChoices(
            { name: 'Verify', value: 'verify' },
            { name: 'Redeem', value: 'redeem' },
            { name: 'Support', value: 'support' },
            { name: 'Automod', value: 'automod' },
            { name: 'Roles', value: 'roles' },
            { name: 'Help Directory', value: 'help' },
            { name: 'Generator', value: 'generator' }
        ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

// --- READY EVENT ---
client.once('ready', async () => {
    console.log(`[TMC.LOL] 🚀 ONLINE: ${client.user.tag}`);
    console.log('[TMC.LOL] 🔑 Token Generator Active');
    console.log('[TMC.LOL] 🔄 Auto-Refresh Every 5 Minutes');
    console.log('[TMC.LOL] 📦 Always in Stock');
    console.log(`[TMC.LOL] 👑 Elliott ID: ${ELLIOTT_ID} has full access`);
    console.log(`[TMC.LOL] 🛡️ Admin Role ID: ${ADMIN_ROLE_ID} has full access`);
    console.log('[TMC.LOL] ================================');

    isRefreshing = false;
    failedQueue = [];

    tokenStock = [{
        bearer: DEFAULT_TOKEN.bearer,
        refresh: DEFAULT_TOKEN.refresh_token,
        addedAt: Date.now(),
        expiresAt: Date.now() + (60 * 60 * 1000)
    }];
    console.log('[TMC.LOL] 📦 Default token added to stock');

    await findWorkingApiUrl();
    
    if (apiWorking) {
        console.log(`[TMC.LOL] ✅ API is working: ${ACTIVE_API_URL}`);
    } else {
        console.log('[TMC.LOL] ⚠️ API not reachable - Using fallback mode');
        console.log('[TMC.LOL] 💡 To set your own token, use: /stock_main');
    }

    // Setup roles
    for (const guild of client.guilds.cache.values()) {
        for (const [key, roleConfig] of Object.entries(REQUIRED_ROLES)) {
            const exists = guild.roles.cache.some(r => r.name === roleConfig.name);
            if (!exists) {
                try {
                    await guild.roles.create({
                        name: roleConfig.name,
                        color: roleConfig.color,
                        permissions: roleConfig.permissions,
                        reason: `TMC.LOL Auto Setup: ${roleConfig.name}`
                    });
                    console.log(`[TMC.LOL] Created role '${roleConfig.name}' in ${guild.name}`);
                } catch (err) {
                    console.error(`[TMC.LOL] Could not create role '${roleConfig.name}':`, err.message);
                }
            }
        }

        const supporterExists = guild.roles.cache.some(r => r.id === SUPPORTER_ROLE_ID || r.name === "Supporter");
        if (!supporterExists) {
            try {
                await guild.roles.create({
                    name: "Supporter",
                    color: 0x9B59B6,
                    permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                    reason: "TMC.LOL Auto Setup: Supporter role"
                });
                console.log(`[TMC.LOL] Created 'Supporter' role in ${guild.name}`);
            } catch (err) {
                console.error(`[TMC.LOL] Could not create Supporter role:`, err.message);
            }
        }

        const verifiedExists = guild.roles.cache.some(r => r.id === MEMBER_ROLE_ID || r.name === "Verified Member");
        if (!verifiedExists) {
            try {
                await guild.roles.create({
                    name: "Verified Member",
                    color: 0x2ECC71,
                    permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
                    reason: "TMC.LOL Auto Setup: Verified Member role"
                });
                console.log(`[TMC.LOL] Created 'Verified Member' role in ${guild.name}`);
            } catch (err) {
                console.error(`[TMC.LOL] Could not create Verified Member role:`, err.message);
            }
        }
    }

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
});

function generateSupporterCode() {
    const randomNums = () => Math.floor(1000 + Math.random() * 9000);
    return `supporter-${randomNums()}-${randomNums()}-${randomNums()}`;
}

function isTokenExpired(tokenObj) {
    if (!tokenObj.expiresAt) {
        return false;
    }
    return Date.now() > tokenObj.expiresAt;
}

// --- PROCESS TOKEN GENERATION WITH JSON FILE ---
async function processTokenGeneration(interaction, tierName) {
    const userId = interaction.user.id;
    const member = interaction.member;
    
    const hasNoCooldown = member && member.roles && member.roles.cache.has(NO_COOLDOWN_ROLE_ID);
    
    if (!hasNoCooldown) {
        const cooldownKey = `public_${userId}`;
        if (cooldowns.has(cooldownKey)) {
            const cooldownEnd = cooldowns.get(cooldownKey);
            if (Date.now() < cooldownEnd) {
                const remaining = cooldownEnd - Date.now();
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                return interaction.reply({
                    content: `⏳ **Please wait ${minutes}m ${seconds}s** before generating another token. (5-minute cooldown)`,
                    flags: 64
                });
            }
        }
    }
    
    if (activeGenerations.has(userId)) {
        const startTime = activeGenerations.get(userId);
        if (Date.now() - startTime < 60000) {
            return interaction.reply({
                content: '⏳ **Please wait:** You already have a token generation in progress!',
                flags: 64
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
        return interaction.reply({
            content: '❌ **DM Error:** I cannot send you a direct message.\n\n' +
                     'Please enable DMs:\n' +
                     '1. Go to **User Settings** (⚙️)\n' +
                     '2. Click **Privacy & Safety**\n' +
                     '3. Enable **"Allow direct messages from server members"**\n' +
                     '4. Try again!',
            flags: 64
        });
    }
    
    await interaction.reply({
        content: '⏳ **Generating your token...** (Step 1/4: DM Verified ✅)',
        flags: 64
    });
    
    try {
        if (tokenStock.length === 0) {
            tokenStock.push({
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                addedAt: Date.now(),
                expiresAt: Date.now() + (60 * 60 * 1000)
            });
            console.log('[TMC.LOL] Stock was empty, re-added default token');
        }
        
        await interaction.editReply({
            content: '⏳ **Generating your token...** (Step 2/4: Checking token validity)'
        });
        
        let tokenObj = tokenStock[0];
        
        if (tokenObj.expiresAt && isTokenExpired(tokenObj)) {
            const refreshResult = await refreshToken(tokenObj.refresh);
            if (refreshResult.success) {
                tokenObj = tokenStock[0];
            } else {
                tokenStock[0] = {
                    bearer: DEFAULT_TOKEN.bearer,
                    refresh: DEFAULT_TOKEN.refresh_token,
                    addedAt: Date.now(),
                    expiresAt: Date.now() + (60 * 60 * 1000)
                };
                tokenObj = tokenStock[0];
            }
        }
        
        await interaction.editReply({
            content: '⏳ **Generating your token...** (Step 3/4: Finalizing)'
        });
        
        const validationResult = await validateSteamToken(tokenObj.bearer);
        
        if (!validationResult.valid) {
            const refreshResult = await refreshToken(tokenObj.refresh);
            if (refreshResult.success) {
                tokenObj = tokenStock[0];
                const newValidation = await validateSteamToken(tokenObj.bearer);
                if (!newValidation.valid) {
                    activeGenerations.delete(userId);
                    return interaction.editReply({
                        content: '❌ **Token Expired!** Refresh succeeded but the new token is still invalid.\n\n' +
                                 '🔑 **Fix:** An admin needs to run `/stock_main` with a fresh bearer + refresh token.\n' +
                                 '💡 The current tokens in stock are expired and cannot be auto-refreshed.'
                    });
                }
            } else {
                tokenStock[0] = {
                    bearer: DEFAULT_TOKEN.bearer,
                    refresh: DEFAULT_TOKEN.refresh_token,
                    addedAt: Date.now(),
                    expiresAt: Date.now() + (60 * 60 * 1000)
                };
                tokenObj = tokenStock[0];
                activeGenerations.delete(userId);
                return interaction.editReply({
                    content: '❌ **Token Expired!** Could not refresh the token.\n\n' +
                             '🔑 **Fix:** An admin needs to run `/stock_main` with a fresh bearer + refresh token.\n' +
                             '💡 The current tokens in stock are expired and no working API was found to refresh them.'
                });
            }
            tokenObj = tokenStock[0];
        }
        
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
                expires_at: new Date(tokenObj.expiresAt).toISOString(),
                added_at: new Date().toISOString(),
                generation_id: genId
            },
            message: "Thank you for using TMC.LOL Token Generator!",
            credits: "@elliott (1363240484818128926)",
            auto_refresh: "Every 5 minutes - NEW strings, SAME account"
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
⏳ Valid until: ${new Date(tokenObj.expiresAt).toLocaleString()}
⏳ Time left: ${formatRemainingTime(tokenObj.expiresAt)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Auto-Refresh: Every 5 minutes (NEW strings, SAME account)
👑 Credits: @elliott (1363240484818128926)
Made by TMC.LOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        const textBuffer = Buffer.from(textVersion, 'utf-8');
        const textAttachment = new AttachmentBuilder(textBuffer, { name: 'token.txt' });
        
        const embed = new EmbedBuilder()
            .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
            .setDescription('✅ **Token generated successfully!**\n\n' +
                '📁 **Files attached:**\n' +
                '• `token.json` - JSON format (for developers)\n' +
                '• `token.txt` - Plain text format\n\n' +
                `🆔 **Generation ID:** \`${genId}\`\n` +
                `⏳ **Valid for:** ${formatRemainingTime(tokenObj.expiresAt)}\n` +
                '🔄 **Auto-Refresh:** Every 5 minutes (NEW strings, SAME account)\n\n' +
                '👑 **Credits:** @elliott (1363240484818128926)\n' +
                '**Made by TMC.LOL**')
            .setColor(0x5865F2)
            .setFooter({ text: 'TMC.LOL Token Generator • Auto-Refreshed Every 5 Min • Credits to @elliott' });
        
        try {
            await interaction.user.send({
                embeds: [embed],
                files: [attachment, textAttachment]
            });
            
            const successLog = new EmbedBuilder()
                .setTitle('✅ Token Generated Successfully')
                .setDescription(`User: <@${userId}> (${userId})\nTier: ${tierName}\nGeneration ID: ${genId}\nTokens in Rotation: ${tokenStock.length}`)
                .setColor(0x2ECC71)
                .setTimestamp();
            await sendBotLog(interaction.guild, 'generator_success', successLog);
            
            activeGenerations.delete(userId);
            return interaction.editReply({
                content: `✅ **Token sent to your DMs!** (Tier: **${tierName}**)\n🆔 **ID:** \`${genId}\`\n📁 **Files attached:** token.json & token.txt\n⏳ **Valid for:** ${formatRemainingTime(tokenObj.expiresAt)}\n📦 **Tokens remaining in stock:** ${tokenStock.length}`
            });
        } catch (err) {
            console.error('[TMC.LOL] DM Error:', err);
            activeGenerations.delete(userId);
            return interaction.editReply({
                content: '❌ **Error:** Could not send token via DM. Make sure your direct messages are open.'
            });
        }
        
    } catch (err) {
        console.error('[TMC.LOL] Token Generation Error:', err);
        activeGenerations.delete(userId);
        return interaction.editReply({
            content: '❌ **An error occurred while generating your token. Please try again.**'
        });
    }
}

// --- INTERACTION CREATE ---
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options } = interaction;

            // --- PUBLIC COMMANDS ---
            if (commandName === 'ping') {
                return interaction.reply({ content: `🏓 Pong! Latency: \`${client.ws.ping}ms\``, flags: 64 });
            }

            if (commandName === 'marco') {
                return interaction.reply({ content: 'Polo! 🤿' });
            }

            if (commandName === '8ball') {
                const question = options.getString('question');
                const answers = ['Yes.', 'No.', 'Maybe.', 'Definitely.', 'Ask again later.', 'Outlook not so good.'];
                const ans = answers[Math.floor(Math.random() * answers.length)];
                const embed = new EmbedBuilder().setTitle('🎱 Magic 8-Ball').addFields({ name: 'Question', value: question }, { name: 'Answer', value: ans }).setColor(0x3498DB);
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'coinflip') {
                const result = Math.random() < 0.5 ? 'Heads 🪙' : 'Tails 🪙';
                return interaction.reply({ content: `The coin landed on: **${result}**` });
            }

            if (commandName === 'rps') {
                const userChoice = options.getString('choice');
                const choices = ['rock', 'paper', 'scissors'];
                const botChoice = choices[Math.floor(Math.random() * choices.length)];
                let outcome = '';

                if (userChoice === botChoice) outcome = "It's a tie!";
                else if (
                    (userChoice === 'rock' && botChoice === 'scissors') ||
                    (userChoice === 'paper' && botChoice === 'rock') ||
                    (userChoice === 'scissors' && botChoice === 'paper')
                ) outcome = 'You win! 🎉';
                else outcome = 'TMC.LOL wins! 🤖';

                return interaction.reply({ content: `You chose **${userChoice}**, I chose **${botChoice}**. ${outcome}` });
            }

            if (commandName === 'token') {
                if (tokenStock.length === 0) {
                    tokenStock.push({
                        bearer: DEFAULT_TOKEN.bearer,
                        refresh: DEFAULT_TOKEN.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: Date.now() + (60 * 60 * 1000)
                    });
                }
                
                let tokenObj = tokenStock[0];
                
                if (tokenObj.expiresAt && isTokenExpired(tokenObj)) {
                    const refreshResult = await refreshToken(tokenObj.refresh);
                    if (refreshResult.success) {
                        tokenObj = tokenStock[0];
                    } else {
                        tokenStock[0] = {
                            bearer: DEFAULT_TOKEN.bearer,
                            refresh: DEFAULT_TOKEN.refresh_token,
                            addedAt: Date.now(),
                            expiresAt: Date.now() + (60 * 60 * 1000)
                        };
                        tokenObj = tokenStock[0];
                    }
                }
                
                const validationResult = await validateSteamToken(tokenObj.bearer);
                
                if (!validationResult.valid) {
                    const refreshResult = await refreshToken(tokenObj.refresh);
                    if (refreshResult.success) {
                        tokenObj = tokenStock[0];
                    } else {
                        return interaction.reply({
                            content: '❌ **Token Expired!** Could not refresh the token.\n\n' +
                                     '🔑 **Fix:** An admin needs to run `/stock_main` with a fresh bearer + refresh token.\n' +
                                     '💡 The current tokens in stock are expired and no working API was found to refresh them.',
                            flags: 64
                        });
                    }
                }
                
                if (validationResult.expiresAt) {
                    tokenObj.expiresAt = validationResult.expiresAt;
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
                            expires_at: new Date(tokenObj.expiresAt).toISOString(),
                            added_at: new Date().toISOString(),
                            generation_id: genId
                        },
                        message: "Thank you for using TMC.LOL Token Generator!",
                        credits: "@elliott (1363240484818128926)",
                        auto_refresh: "Every 5 minutes - NEW strings, SAME account"
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
⏳ Valid until: ${new Date(tokenObj.expiresAt).toLocaleString()}
⏳ Time left: ${formatRemainingTime(tokenObj.expiresAt)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Auto-Refresh: Every 5 minutes (NEW strings, SAME account)
👑 Credits: @elliott (1363240484818128926)
Made by TMC.LOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                    
                    const textBuffer = Buffer.from(textVersion, 'utf-8');
                    const textAttachment = new AttachmentBuilder(textBuffer, { name: 'token.txt' });
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
                        .setDescription('✅ **Token generated successfully!**\n\n' +
                            '📁 **Files attached:**\n' +
                            '• `token.json` - JSON format (for developers)\n' +
                            '• `token.txt` - Plain text format\n\n' +
                            `🆔 **Generation ID:** \`${genId}\`\n` +
                            `⏳ **Valid for:** ${formatRemainingTime(tokenObj.expiresAt)}\n` +
                            '🔄 **Auto-Refresh:** Every 5 minutes (NEW strings, SAME account)\n\n' +
                            '👑 **Credits:** @elliott (1363240484818128926)\n' +
                            '**Made by TMC.LOL**')
                        .setColor(0x5865F2)
                        .setFooter({ text: 'TMC.LOL Token Generator • Auto-Refreshed Every 5 Min • Credits to @elliott' });
                    
                    await interaction.user.send({
                        embeds: [embed],
                        files: [attachment, textAttachment]
                    });
                    
                    return interaction.reply({
                        content: `✅ **Token sent to your DMs!**\n🆔 **ID:** \`${genId}\`\n📁 **Files attached:** token.json & token.txt\n⏳ **Valid for:** ${formatRemainingTime(tokenObj.expiresAt)}\n📦 **Tokens remaining in stock:** ${tokenStock.length}`,
                        flags: 64
                    });
                } catch (err) {
                    return interaction.reply({
                        content: '❌ **DM Failed:** Please open your DMs to receive tokens.\n\n' +
                                 'Go to **User Settings > Privacy & Safety** and enable **"Allow direct messages from server members"**',
                        flags: 64
                    });
                }
            }

            if (commandName === 'suggest') {
                const suggestion = options.getString('suggestion');
                const embed = new EmbedBuilder()
                    .setTitle('💡 Suggestion Submitted')
                    .setDescription(suggestion)
                    .setColor(0x3498DB)
                    .setFooter({ text: `Submitted by ${interaction.user.tag}` })
                    .setTimestamp();
                return interaction.reply({ content: '✅ Your suggestion has been submitted!', flags: 64 });
            }

            if (commandName === 'help') {
                const embed = new EmbedBuilder()
                    .setTitle("⚡ TMC.LOL MODDING COMMAND DIRECTORY")
                    .setDescription("Ultra-secure administrative panel deployment suite:")
                    .setColor(0x3498DB)
                    .addFields(
                        { name: "🔨 `/build [theme]`", value: "Generates full server layout categories with panels, rules, community chat, and voice rooms.", inline: false },
                        { name: "🔒 `/panel verify`", value: "Deploys the ultra-secure verification gate with automated role integration.", inline: false },
                        { name: "💎 `/panel redeem`", value: "Deploys the live key redemption modal system.", inline: false },
                        { name: "🛠️ `/panel support`", value: "Deploys the automated private ticket room generator.", inline: false },
                        { name: "🛡️ `/panel automod`", value: "Deploys the defense grid status console.", inline: false },
                        { name: "🎨 `/panel roles`", value: "Deploys the community notification toggles.", inline: false },
                        { name: "⚡ `/panel generator`", value: "Deploys the Tokens by TMC.LOL Generator interface panel.", inline: false },
                        { name: "🔑 `/generate-code`", value: "Generates a unique `supporter-xxxx-xxxx-xxxx` code for the redeem panel.", inline: false },
                        { name: "🎮 `/token`", value: "Generate a fresh token directly to your DMs.", inline: false },
                        { name: "📋 `/gen-codes`", value: "List all active generation IDs with user info (paginated).", inline: false },
                        { name: "🗑️ `/remove-stock`", value: "Opens an interactive list to pick a token to remove (no typing).", inline: false },
                        { name: "🗑️ `/remove-token [id]`", value: "Remove a specific token by ID (direct typing).", inline: false },
                        { name: "🔄 `/reset-stock`", value: "Reset stock to default and clear all IDs (use with caution).", inline: false },
                        { name: "🔄 `/refresh_batch`", value: "Manually trigger auto-refresh of invalid tokens.", inline: false },
                        { name: "🔁 **Auto-Refresh**", value: "Token automatically refreshes every 5 minutes with NEW strings (SAME account)", inline: false },
                        { name: "📌 `/stock_main`", value: "Set the main/default token for the bot", inline: false },
                        { name: "🛡️ **Admin Role**", value: `<@&${ADMIN_ROLE_ID}> has full access to all commands.`, inline: false },
                        { name: "⚠️ **DM Required**", value: "Please enable DMs to receive tokens!", inline: false },
                        { name: "👑 **Credits**", value: "@elliott (1363240484818128926) - Bot Creator & Developer", inline: false }
                    )
                    .setFooter({ text: "TMC.LOL Modding Enterprise Security Suite • Credits to @elliott" });

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
                        { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                        { name: '📝 Channels', value: `${guild.channels.cache.size}`, inline: true },
                        { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true }
                    )
                    .setColor(0x3498DB)
                    .setTimestamp()
                    .setFooter({ text: 'TMC.LOL • Credits to @elliott' });
                return interaction.reply({ embeds: [embed] });
            }

            // --- ADMIN ONLY COMMANDS (now using hasAdminAccess) ---
            const adminCommands = ['stock', 'stock_main', 'generator', 'force_refresh', 'remove-stock', 'reset-stock', 'remove-token', 'gen-codes', 'refresh_cooldown_all', 'refresh_cooldown_user', 'refresh_user', 'logs', 'servers', 'setup-botlog', 'build', 'panel', 'generate-code', 'warn', 'warnings', 'purge', 'timeout', 'afk', 'announce', 'autodelete', 'autorole', 'ban', 'blacklist', 'bumpreminder', 'counting', 'fakeconvo', 'fakemessage', 'giveall', 'giveaway', 'info', 'leaderboard', 'level', 'levelset', 'lock', 'modmakerapply', 'mute', 'poll', 'postroles', 'postrules', 'reactionrole', 'roleadd', 'roleremove', 'setlogs', 'slowmode', 'starboard', 'status', 'ticketpanel', 'unlock', 'welcome', 'refresh_batch'];
            
            if (adminCommands.includes(commandName)) {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ 
                        content: `❌ **Access Denied:** You need Administrator permissions, be @elliott, or have the <@&${ADMIN_ROLE_ID}> role to use this command.`, 
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
                            .setDescription(`The main/default token has been updated successfully.`)
                            .setColor(0x2ECC71)
                            .addFields(
                                { name: 'Token Status', value: `✅ Manually Set`, inline: true },
                                { name: 'Valid For', value: `1 Hour`, inline: true },
                                { name: 'Stock Status', value: `✅ ${tokenStock.length} token(s) in stock`, inline: true }
                            )
                            .setTimestamp()
                            .setFooter({ text: 'TMC.LOL Token Generator • Manual Mode • Credits to @elliott' });
                        
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
                            `**Public Token** – everyone | cooldown: 5 minutes (bypass with <@&${NO_COOLDOWN_ROLE_ID}> role)\n\n` +
                            '*Tokens are only visible to you.*\n' +
                            '*Ephemeral — only you can see your token*\n\n' +
                            '⚠️ **Please open your DMs** to receive your token!\n' +
                            '🔄 **Auto-Refresh:** Every 5 minutes (NEW strings, SAME account)\n' +
                            '🆔 **You will receive a Generation ID** – share with admins to remove that token.\n\n' +
                            '👑 **Credits:** @elliott (1363240484818128926)\n' +
                            '**Made by TMC.LOL**'
                        )
                        .setColor(0x5865F2)
                        .setFooter({ text: 'TMC.LOL Token Generator • Credits to @elliott' });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('gen_public').setLabel('Generate Token').setStyle(ButtonStyle.Success).setEmoji('🔑')
                    );

                    return interaction.reply({ embeds: [embed], components: [row] });
                }

                if (commandName === 'force_refresh') {
                    if (tokenStock.length === 0) {
                        tokenStock.push({
                            bearer: DEFAULT_TOKEN.bearer,
                            refresh: DEFAULT_TOKEN.refresh_token,
                            addedAt: Date.now(),
                            expiresAt: Date.now() + (60 * 60 * 1000)
                        });
                    }
                    
                    const refreshResult = await refreshToken(tokenStock[0].refresh);
                    
                    if (refreshResult.success) {
                        return interaction.reply({
                            content: `🔄 **Token Force Refreshed!**\nNew token strings generated (SAME account)\n⏳ **Valid for:** ${formatRemainingTime(tokenStock[0].expiresAt)}`,
                            flags: 64
                        });
                    } else {
                        return interaction.reply({
                            content: '❌ **Failed to refresh token.** Please try again later.',
                            flags: 64
                        });
                    }
                }

                // --- remove-stock interactive list ---
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
                            content: '📭 No active generation IDs to remove.\n' +
                                     'Generate a token first using the generator panel or `/token`.\n' +
                                     'If you already have tokens, try running `/reset-stock` and generate a new one.',
                            flags: 64
                        });
                    }

                    entries.sort((a, b) => a.id.localeCompare(b.id));

                    const itemsPerPage = 5;
                    const totalPages = Math.ceil(entries.length / itemsPerPage);
                    let page = 0;

                    const generateEmbedAndButtons = (page) => {
                        const start = page * itemsPerPage;
                        const end = Math.min(start + itemsPerPage, entries.length);
                        const pageEntries = entries.slice(start, end);
                        const embed = new EmbedBuilder()
                            .setTitle('🗑️ Remove a Token by Selection')
                            .setDescription(`Page ${page+1} of ${totalPages} (${entries.length} total)\nClick the **Remove** button next to the token you want to delete.`)
                            .setColor(0xED4245)
                            .setFooter({ text: 'TMC.LOL • Click Remove to delete the token' });

                        pageEntries.forEach((entry) => {
                            embed.addFields({
                                name: `\`${entry.id}\``,
                                value: `👤 ${entry.username}\n🆔 <@${entry.userId}>`,
                                inline: false
                            });
                        });

                        const row = new ActionRowBuilder();
                        pageEntries.forEach((entry) => {
                            row.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`remove_${entry.id}`)
                                    .setLabel(`Remove ${entry.id}`)
                                    .setStyle(ButtonStyle.Danger)
                                    .setEmoji('🗑️')
                            );
                        });

                        const navRow = new ActionRowBuilder();
                        if (totalPages > 1) {
                            navRow.addComponents(
                                new ButtonBuilder()
                                    .setCustomId('remove_stock_prev')
                                    .setLabel('◀ Previous')
                                    .setStyle(ButtonStyle.Primary)
                                    .setDisabled(page === 0),
                                new ButtonBuilder()
                                    .setCustomId('remove_stock_next')
                                    .setLabel('Next ▶')
                                    .setStyle(ButtonStyle.Primary)
                                    .setDisabled(page === totalPages - 1)
                            );
                        }

                        const components = [row];
                        if (totalPages > 1) {
                            components.push(navRow);
                        }
                        return { embed, components };
                    };

                    const { embed, components } = generateEmbedAndButtons(0);
                    const reply = await interaction.reply({
                        embeds: [embed],
                        components: components,
                        flags: 64
                    });

                    const messageId = reply.id;
                    removeStockPages.set(messageId, {
                        userId: interaction.user.id,
                        page: 0,
                        entries: entries,
                        totalPages: totalPages,
                        messageId: messageId
                    });
                }

                if (commandName === 'reset-stock') {
                    tokenStock = [{
                        bearer: DEFAULT_TOKEN.bearer,
                        refresh: DEFAULT_TOKEN.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: Date.now() + (60 * 60 * 1000)
                    }];
                    return interaction.reply({ content: '🔄 Stock has been reset to the default token and all tracked IDs cleared.', flags: 64 });
                }

                if (commandName === 'remove-token') {
                    const id = options.getString('id').trim();
                    const result = removeTokenById(id);
                    if (result.success) {
                        return interaction.reply({ content: `✅ ${result.message}`, flags: 64 });
                    } else {
                        return interaction.reply({ content: `❌ ${result.message}`, flags: 64 });
                    }
                }

                if (commandName === 'gen-codes') {
                    const entries = tokenStock
                        .filter(t => t.id && t.id.length > 0)
                        .map(t => ({
                            id: t.id,
                            userId: t.userId,
                            username: t.username || `<@${t.userId}>`
                        }));

                    if (entries.length === 0) {
                        return interaction.reply({ content: '📭 No active generation IDs found.', flags: 64 });
                    }

                    entries.sort((a, b) => a.id.localeCompare(b.id));

                    const itemsPerPage = 10;
                    const totalPages = Math.ceil(entries.length / itemsPerPage);
                    let page = 0;

                    const generateEmbed = (page) => {
                        const start = page * itemsPerPage;
                        const end = Math.min(start + itemsPerPage, entries.length);
                        const pageEntries = entries.slice(start, end);
                        const embed = new EmbedBuilder()
                            .setTitle('📋 Active Generation IDs')
                            .setDescription(`Page ${page+1} of ${totalPages} (${entries.length} total)\n\nUse \`/remove-token <ID>\` to remove a token.`)
                            .setColor(0x5865F2)
                            .setFooter({ text: 'TMC.LOL • Click buttons to navigate' });
                        pageEntries.forEach((entry) => {
                            embed.addFields({
                                name: `\`${entry.id}\``,
                                value: `👤 ${entry.username}\n🆔 <@${entry.userId}>`,
                                inline: false
                            });
                        });
                        return embed;
                    };

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('gen_codes_prev').setLabel('◀ Previous').setStyle(ButtonStyle.Primary).setDisabled(true),
                        new ButtonBuilder().setCustomId('gen_codes_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(totalPages <= 1)
                    );

                    const reply = await interaction.reply({
                        embeds: [generateEmbed(0)],
                        components: [row],
                        flags: 64
                    });

                    const messageId = reply.id;
                    genCodePages.set(messageId, {
                        userId: interaction.user.id,
                        page: 0,
                        entries: entries,
                        totalPages: totalPages
                    });
                }

                if (commandName === 'refresh_cooldown_all') {
                    const cooldownCount = cooldowns.size;
                    cooldowns.clear();
                    return interaction.reply({
                        content: `⏱️ **Cooldowns Reset!**\n${cooldownCount} cooldowns were cleared.`,
                        flags: 64
                    });
                }

                if (commandName === 'refresh_cooldown_user' || commandName === 'refresh_user') {
                    const target = options.getUser('target');
                    let count = 0;
                    for (const key of cooldowns.keys()) {
                        if (key.startsWith(target.id)) {
                            cooldowns.delete(key);
                            count++;
                        }
                    }
                    return interaction.reply({
                        content: `⏱️ Cooldown reset for <@${target.id}>. (${count} cooldowns cleared)`,
                        flags: 64
                    });
                }

                if (commandName === 'refresh_batch') {
                    await refreshTokenInStock();
                    return interaction.reply({
                        content: `🔄 **Token Refreshed!**\nToken has been refreshed with NEW strings (SAME account)\n⏳ **Valid for:** ${formatRemainingTime(tokenStock[0].expiresAt)}`,
                        flags: 64
                    });
                }

                if (commandName === 'logs') {
                    const channel = options.getChannel('channel');
                    logChannels.set(`${interaction.guild.id}-general`, channel.id);
                    return interaction.reply({ content: `📝 Log channel configured to <#${channel.id}>.`, flags: 64 });
                }

                if (commandName === 'servers') {
                    const serverCount = client.guilds.cache.size;
                    const serverList = client.guilds.cache.map(g => `• **${g.name}** (${g.memberCount} members)`).join('\n');
                    return interaction.reply({ content: `🌐 **Connected Servers (${serverCount}):**\n${serverList}`, flags: 64 });
                }

                if (commandName === 'setup-botlog') {
                    const channel = options.getChannel('channel');
                    const category = options.getString('category');
                    logChannels.set(`${interaction.guild.id}-${category}`, channel.id);

                    const embed = new EmbedBuilder()
                        .setTitle('🛠️ Bot Log Channel Configured')
                        .setDescription(`Bound category **\`${category}\`** to <#${channel.id}>.`)
                        .setColor(0x2ECC71);

                    return interaction.reply({ embeds: [embed], flags: 64 });
                }

                if (commandName === 'build') {
                    const theme = options.getString('theme');
                    await interaction.deferReply({ flags: 64 });

                    try {
                        const guild = interaction.guild;
                        const formattedTheme = theme.toUpperCase();

                        const welcomeCategory = await guild.channels.create({
                            name: `📌・${formattedTheme} - WELCOME`,
                            type: ChannelType.GuildCategory,
                        });

                        const verifyChannel = await guild.channels.create({
                            name: 'verification',
                            type: ChannelType.GuildText,
                            parent: welcomeCategory.id,
                        });
                        const verifyEmbed = new EmbedBuilder()
                            .setTitle("🛡️ SECURITY PROTOCOL")
                            .setDescription(`Welcome to **${theme}**. Click below to verify your session.`)
                            .setColor(0x1ABC9C)
                            .setFooter({ text: 'TMC.LOL • Credits to @elliott' });
                        const verifyRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('verify_btn').setLabel('VERIFY').setStyle(ButtonStyle.Success).setEmoji('🛡️')
                        );
                        await verifyChannel.send({ embeds: [verifyEmbed], components: [verifyRow] });

                        const redeemChannel = await guild.channels.create({
                            name: 'redeem',
                            type: ChannelType.GuildText,
                            parent: welcomeCategory.id,
                        });
                        const redeemEmbed = new EmbedBuilder()
                            .setTitle("💎 KEY REDEEM DESK")
                            .setDescription(`Got a key for **${theme}**? Click below to redeem.`)
                            .setColor(0x5865F2)
                            .setFooter({ text: 'TMC.LOL • Credits to @elliott' });
                        const redeemRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM KEY').setStyle(ButtonStyle.Primary).setEmoji('💎')
                        );
                        await redeemChannel.send({ embeds: [redeemEmbed], components: [redeemRow] });

                        const supportChannel = await guild.channels.create({
                            name: 'support',
                            type: ChannelType.GuildText,
                            parent: welcomeCategory.id,
                        });
                        const supportEmbed = new EmbedBuilder()
                            .setTitle("🛠️ SUPPORT DESK")
                            .setDescription(`Need assistance with **${theme}**? Select your department.`)
                            .setColor(0xFEE75C)
                            .setFooter({ text: 'TMC.LOL • Credits to @elliott' });
                        const supportRow = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('support_select')
                                .setPlaceholder('📂 Select department...')
                                .addOptions([
                                    { label: 'General Support', value: 'General Inquiry', emoji: '❓' },
                                    { label: 'Token Help', value: 'Token Help', emoji: '🔑' },
                                    { label: 'Billing & Keys', value: 'Billing Support', emoji: '💳' }
                                ])
                        );
                        await supportChannel.send({ embeds: [supportEmbed], components: [supportRow] });

                        const communityCategory = await guild.channels.create({
                            name: `💬・${formattedTheme} - COMMUNITY`,
                            type: ChannelType.GuildCategory,
                        });

                        await guild.channels.create({ name: 'rules', type: ChannelType.GuildText, parent: communityCategory.id });
                        await guild.channels.create({ name: 'announcements', type: ChannelType.GuildText, parent: communityCategory.id });
                        await guild.channels.create({ name: 'general', type: ChannelType.GuildText, parent: communityCategory.id });
                        await guild.channels.create({ name: 'media-share', type: ChannelType.GuildText, parent: communityCategory.id });

                        const gamingCategory = await guild.channels.create({
                            name: `🎮・${formattedTheme} - GAMING`,
                            type: ChannelType.GuildCategory,
                        });

                        await guild.channels.create({ name: 'gaming-chat', type: ChannelType.GuildText, parent: gamingCategory.id });
                        await guild.channels.create({ name: 'General Lounge', type: ChannelType.GuildVoice, parent: gamingCategory.id });
                        await guild.channels.create({ name: 'Squad Voice', type: ChannelType.GuildVoice, parent: gamingCategory.id });

                        const botCategory = await guild.channels.create({
                            name: `🤖・${formattedTheme} - BOT ROOMS`,
                            type: ChannelType.GuildCategory,
                        });

                        await guild.channels.create({ name: 'bot-commands', type: ChannelType.GuildText, parent: botCategory.id });
                        await guild.channels.create({ name: 'generator', type: ChannelType.GuildText, parent: botCategory.id });

                        return interaction.editReply({ content: `✅ Successfully built the structured **${theme}** server layout!` });
                    } catch (err) {
                        console.error("[TMC.LOL] Build Error:", err);
                        return interaction.editReply({ content: "❌ Failed to build server layout." });
                    }
                }

                if (commandName === 'panel') {
                    const subArg = options.getString('type');

                    if (subArg === 'generator') {
                        const embed = new EmbedBuilder()
                            .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
                            .setDescription(
                                'Generate your token below!\n\n' +
                                `**Public Token** – everyone | cooldown: 5 minutes (bypass with <@&${NO_COOLDOWN_ROLE_ID}> role)\n\n` +
                                '*Tokens are only visible to you.*\n' +
                                '*Ephemeral — only you can see your token*\n\n' +
                                '⚠️ **Please open your DMs** to receive your token!\n' +
                                '🔄 **Auto-Refresh:** Every 5 minutes (NEW strings, SAME account)\n' +
                                '🆔 **You will receive a Generation ID** – share with admins to remove that token.\n\n' +
                                '👑 **Credits:** @elliott (1363240484818128926)\n' +
                                '**Made by TMC.LOL**'
                            )
                            .setColor(0x5865F2)
                            .setFooter({ text: 'TMC.LOL Token Generator • Credits to @elliott' });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('gen_public').setLabel('Generate Token').setStyle(ButtonStyle.Success).setEmoji('🔑')
                        );

                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'verify') {
                        const embed = new EmbedBuilder()
                            .setTitle("🛡️ VERIFICATION PROTOCOL")
                            .setDescription("Click below to verify your session.")
                            .setColor(0x1ABC9C)
                            .setFooter({ text: "TMC.LOL Security System • Credits to @elliott" });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('verify_btn').setLabel('VERIFY').setStyle(ButtonStyle.Success).setEmoji('🛡️')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'redeem') {
                        const embed = new EmbedBuilder()
                            .setTitle("💎 KEY REDEEM DESK")
                            .setDescription("Got a license code? Click below to redeem it.")
                            .setColor(0x5865F2)
                            .setFooter({ text: "TMC.LOL Marketplace • Credits to @elliott" });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM KEY').setStyle(ButtonStyle.Primary).setEmoji('💎')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'support') {
                        const embed = new EmbedBuilder()
                            .setTitle("🛠️ SUPPORT DESK")
                            .setDescription("Select your department to spin up a private ticket room.")
                            .setColor(0xFEE75C)
                            .setFooter({ text: "TMC.LOL Support System • Credits to @elliott" });

                        const row = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('support_select')
                                .setPlaceholder('📂 Select department...')
                                .addOptions([
                                    { label: 'General Support', value: 'General Inquiry', emoji: '❓' },
                                    { label: 'Token Help', value: 'Token Help', emoji: '🔑' },
                                    { label: 'Billing & Keys', value: 'Billing Support', emoji: '💳' }
                                ])
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'automod') {
                        const embed = new EmbedBuilder()
                            .setTitle("🛡️ AUTOMOD MATRIX")
                            .setDescription("Server infrastructure is protected 24/7.")
                            .setColor(0xED4245)
                            .addFields(
                                { name: "🚫 Link Firewall", value: "`Active`", inline: true },
                                { name: "⚡ Anti-Raid", value: "`Engaged`", inline: true }
                            )
                            .setFooter({ text: "TMC.LOL Security Grid • Credits to @elliott" });

                        return interaction.reply({ embeds: [embed] });
                    }

                    if (subArg === 'roles') {
                        const embed = new EmbedBuilder()
                            .setTitle("🎨 COMMUNITY NOTIFICATION CENTER")
                            .setDescription("Toggle your notification preferences.")
                            .setColor(0x9B59B6)
                            .setFooter({ text: "TMC.LOL Preferences • Credits to @elliott" });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('role_announcements').setLabel('Toggle Announcements').setStyle(ButtonStyle.Secondary).setEmoji('📢')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'help') {
                        const embed = new EmbedBuilder()
                            .setTitle("⚡ TMC.LOL COMMAND DIRECTORY")
                            .setDescription("Ultra-secure administrative panel deployment suite:")
                            .addFields(
                                { name: "🔨 `/build [theme]`", value: "Generates full server layout categories.", inline: false },
                                { name: "🔒 `/panel verify`", value: "Deploys verification gate.", inline: false },
                                { name: "💎 `/panel redeem`", value: "Deploys key redemption system.", inline: false },
                                { name: "🛠️ `/panel support`", value: "Deploys ticket generator.", inline: false },
                                { name: "🛡️ `/panel automod`", value: "Deploys defense grid console.", inline: false },
                                { name: "🎨 `/panel roles`", value: "Deploys notification toggles.", inline: false },
                                { name: "⚡ `/panel generator`", value: "Deploys Tokens by TMC.LOL panel.", inline: false },
                                { name: "🔑 `/generate-code`", value: "Generates supporter code.", inline: false }
                            )
                            .setFooter({ text: "TMC.LOL Enterprise Security Suite • Credits to @elliott" });

                        return interaction.reply({ embeds: [embed] });
                    }
                }

                if (commandName === 'generate-code') {
                    const newCode = generateSupporterCode();
                    validCodes.add(newCode);

                    const codeEmbed = new EmbedBuilder()
                        .setTitle("🔑 GENERATED SUPPORTER KEY")
                        .setDescription(`\`\`\`${newCode}\`\`\``)
                        .setColor(0x2ECC71)
                        .addFields(
                            { name: "Status", value: "`Active & Unclaimed`", inline: true }
                        )
                        .setFooter({ text: "TMC.LOL License Generator • Credits to @elliott" });

                    return interaction.reply({ embeds: [codeEmbed], flags: 64 });
                }

                if (commandName === 'warn') {
                    const target = options.getUser('target');
                    const reason = options.getString('reason');
                    if (!userWarnings.has(target.id)) userWarnings.set(target.id, []);
                    userWarnings.get(target.id).push(reason);
                    return interaction.reply({ content: `⚠️ Warned <@${target.id}>: **${reason}**`, flags: 64 });
                }

                if (commandName === 'warnings') {
                    const target = options.getUser('target');
                    const warns = userWarnings.get(target.id) || [];
                    return interaction.reply({ content: `📋 <@${target.id}> has **${warns.length}** warning(s):\n${warns.map((w, i) => `${i+1}. ${w}`).join('\n') || 'None'}`, flags: 64 });
                }

                if (commandName === 'purge') {
                    const count = options.getInteger('amount');
                    await interaction.channel.bulkDelete(count, true).catch(() => {});
                    return interaction.reply({ content: `🧹 Purged **${count}** messages.`, flags: 64 });
                }

                if (commandName === 'timeout') {
                    const target = options.getUser('target');
                    const minutes = options.getInteger('minutes');
                    const member = await interaction.guild.members.fetch(target.id);
                    await member.timeout(minutes * 60 * 1000, 'Timed out via slash command');
                    return interaction.reply({ content: `🔇 Timed out <@${target.id}> for **${minutes}** minutes.`, flags: 64 });
                }

                return interaction.reply({ content: `⚡ Command \`/${commandName}\` executed!`, flags: 64 });
            }
        }

        // --- BUTTON HANDLERS ---
        if (interaction.isButton()) {
            // --- Handle remove buttons from remove-stock ---
            if (interaction.customId.startsWith('remove_')) {
                const id = interaction.customId.replace('remove_', '');
                const messageId = interaction.message.id;
                const state = removeStockPages.get(messageId);
                if (!state) {
                    return interaction.reply({ content: '❌ This removal session has expired. Please run `/remove-stock` again.', flags: 64 });
                }
                if (state.userId !== interaction.user.id) {
                    return interaction.reply({ content: '❌ You did not initiate this removal list.', flags: 64 });
                }

                const result = removeTokenById(id);
                if (result.success) {
                    // Update the list
                    const newEntries = tokenStock
                        .filter(t => t.id && t.id.length > 0)
                        .map(t => ({
                            id: t.id,
                            userId: t.userId,
                            username: t.username || `<@${t.userId}>`
                        }));
                    newEntries.sort((a, b) => a.id.localeCompare(b.id));

                    if (newEntries.length === 0) {
                        const embed = new EmbedBuilder()
                            .setTitle('📭 No Tokens Left')
                            .setDescription('All generation IDs have been removed.')
                            .setColor(0x2ECC71);
                        await interaction.update({
                            embeds: [embed],
                            components: []
                        });
                        removeStockPages.delete(messageId);
                        await interaction.followUp({
                            content: `✅ ${result.message}`,
                            flags: 64
                        });
                        return;
                    }

                    state.entries = newEntries;
                    const totalPages = Math.ceil(newEntries.length / 5);
                    state.totalPages = totalPages;
                    if (state.page >= totalPages) state.page = totalPages - 1;
                    if (state.page < 0) state.page = 0;
                    removeStockPages.set(messageId, state);

                    const generateEmbedAndButtons = (page) => {
                        const start = page * 5;
                        const end = Math.min(start + 5, newEntries.length);
                        const pageEntries = newEntries.slice(start, end);
                        const embed = new EmbedBuilder()
                            .setTitle('🗑️ Remove a Token by Selection')
                            .setDescription(`Page ${page+1} of ${totalPages} (${newEntries.length} total)\nClick the **Remove** button next to the token you want to delete.`)
                            .setColor(0xED4245)
                            .setFooter({ text: 'TMC.LOL • Click Remove to delete the token' });

                        pageEntries.forEach((entry) => {
                            embed.addFields({
                                name: `\`${entry.id}\``,
                                value: `👤 ${entry.username}\n🆔 <@${entry.userId}>`,
                                inline: false
                            });
                        });

                        const row = new ActionRowBuilder();
                        pageEntries.forEach((entry) => {
                            row.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`remove_${entry.id}`)
                                    .setLabel(`Remove ${entry.id}`)
                                    .setStyle(ButtonStyle.Danger)
                                    .setEmoji('🗑️')
                            );
                        });

                        const navRow = new ActionRowBuilder();
                        if (totalPages > 1) {
                            navRow.addComponents(
                                new ButtonBuilder()
                                    .setCustomId('remove_stock_prev')
                                    .setLabel('◀ Previous')
                                    .setStyle(ButtonStyle.Primary)
                                    .setDisabled(page === 0),
                                new ButtonBuilder()
                                    .setCustomId('remove_stock_next')
                                    .setLabel('Next ▶')
                                    .setStyle(ButtonStyle.Primary)
                                    .setDisabled(page === totalPages - 1)
                            );
                        }

                        const components = [row];
                        if (totalPages > 1) {
                            components.push(navRow);
                        }
                        return { embed, components };
                    };

                    const { embed, components } = generateEmbedAndButtons(state.page);
                    await interaction.update({
                        embeds: [embed],
                        components: components
                    });
                    await interaction.followUp({
                        content: `✅ ${result.message}`,
                        flags: 64
                    });
                } else {
                    await interaction.reply({
                        content: `❌ ${result.message}`,
                        flags: 64
                    });
                    // Refresh the list anyway
                    const newEntries = tokenStock
                        .filter(t => t.id && t.id.length > 0)
                        .map(t => ({
                            id: t.id,
                            userId: t.userId,
                            username: t.username || `<@${t.userId}>`
                        }));
                    if (newEntries.length === 0) {
                        const embed = new EmbedBuilder()
                            .setTitle('📭 No Tokens Left')
                            .setDescription('All generation IDs have been removed.')
                            .setColor(0x2ECC71);
                        await interaction.editReply({
                            embeds: [embed],
                            components: []
                        });
                        removeStockPages.delete(messageId);
                    } else {
                        state.entries = newEntries;
                        const totalPages = Math.ceil(newEntries.length / 5);
                        state.totalPages = totalPages;
                        if (state.page >= totalPages) state.page = totalPages - 1;
                        if (state.page < 0) state.page = 0;
                        removeStockPages.set(messageId, state);
                        const generateEmbedAndButtons = (page) => {
                            const start = page * 5;
                            const end = Math.min(start + 5, newEntries.length);
                            const pageEntries = newEntries.slice(start, end);
                            const embed = new EmbedBuilder()
                                .setTitle('🗑️ Remove a Token by Selection')
                                .setDescription(`Page ${page+1} of ${totalPages} (${newEntries.length} total)\nClick the **Remove** button next to the token you want to delete.`)
                                .setColor(0xED4245)
                                .setFooter({ text: 'TMC.LOL • Click Remove to delete the token' });

                            pageEntries.forEach((entry) => {
                                embed.addFields({
                                    name: `\`${entry.id}\``,
                                    value: `👤 ${entry.username}\n🆔 <@${entry.userId}>`,
                                    inline: false
                                });
                            });

                            const row = new ActionRowBuilder();
                            pageEntries.forEach((entry) => {
                                row.addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`remove_${entry.id}`)
                                        .setLabel(`Remove ${entry.id}`)
                                        .setStyle(ButtonStyle.Danger)
                                        .setEmoji('🗑️')
                                );
                            });

                            const navRow = new ActionRowBuilder();
                            if (totalPages > 1) {
                                navRow.addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('remove_stock_prev')
                                        .setLabel('◀ Previous')
                                        .setStyle(ButtonStyle.Primary)
                                        .setDisabled(page === 0),
                                    new ButtonBuilder()
                                        .setCustomId('remove_stock_next')
                                        .setLabel('Next ▶')
                                        .setStyle(ButtonStyle.Primary)
                                        .setDisabled(page === totalPages - 1)
                                );
                            }

                            const components = [row];
                            if (totalPages > 1) {
                                components.push(navRow);
                            }
                            return { embed, components };
                        };
                        const { embed, components } = generateEmbedAndButtons(state.page);
                        await interaction.editReply({
                            embeds: [embed],
                            components: components
                        });
                    }
                }
                return;
            }

            // --- Pagination for remove-stock ---
            if (interaction.customId === 'remove_stock_prev' || interaction.customId === 'remove_stock_next') {
                const messageId = interaction.message.id;
                const state = removeStockPages.get(messageId);
                if (!state) {
                    return interaction.reply({ content: '❌ This removal session has expired. Please run `/remove-stock` again.', flags: 64 });
                }
                if (state.userId !== interaction.user.id) {
                    return interaction.reply({ content: '❌ You did not initiate this removal list.', flags: 64 });
                }

                let newPage = state.page;
                if (interaction.customId === 'remove_stock_prev') newPage--;
                else if (interaction.customId === 'remove_stock_next') newPage++;
                if (newPage < 0 || newPage >= state.totalPages) {
                    return interaction.reply({ content: '❌ You are already at the edge of the list.', flags: 64 });
                }
                state.page = newPage;
                removeStockPages.set(messageId, state);

                const entries = state.entries;
                const totalPages = state.totalPages;
                const generateEmbedAndButtons = (page) => {
                    const start = page * 5;
                    const end = Math.min(start + 5, entries.length);
                    const pageEntries = entries.slice(start, end);
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Remove a Token by Selection')
                        .setDescription(`Page ${page+1} of ${totalPages} (${entries.length} total)\nClick the **Remove** button next to the token you want to delete.`)
                        .setColor(0xED4245)
                        .setFooter({ text: 'TMC.LOL • Click Remove to delete the token' });

                    pageEntries.forEach((entry) => {
                        embed.addFields({
                            name: `\`${entry.id}\``,
                            value: `👤 ${entry.username}\n🆔 <@${entry.userId}>`,
                            inline: false
                        });
                    });

                    const row = new ActionRowBuilder();
                    pageEntries.forEach((entry) => {
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`remove_${entry.id}`)
                                .setLabel(`Remove ${entry.id}`)
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🗑️')
                        );
                    });

                    const navRow = new ActionRowBuilder();
                    if (totalPages > 1) {
                        navRow.addComponents(
                            new ButtonBuilder()
                                .setCustomId('remove_stock_prev')
                                .setLabel('◀ Previous')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(page === 0),
                            new ButtonBuilder()
                                .setCustomId('remove_stock_next')
                                .setLabel('Next ▶')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(page === totalPages - 1)
                        );
                    }

                    const components = [row];
                    if (totalPages > 1) {
                        components.push(navRow);
                    }
                    return { embed, components };
                };

                const { embed, components } = generateEmbedAndButtons(newPage);
                await interaction.update({
                    embeds: [embed],
                    components: components
                });
                return;
            }

            // --- gen_public button ---
            if (interaction.customId === 'gen_public') {
                return await processTokenGeneration(interaction, 'Public Token (5m cooldown)');
            }

            // --- verify button ---
            if (interaction.customId === 'verify_btn') {
                await interaction.deferReply({ flags: 64 });

                const guild = interaction.guild;
                const member = interaction.member;
                const role = guild.roles.cache.get(MEMBER_ROLE_ID);

                if (!role) {
                    return interaction.editReply({ content: "❌ Verification role could not be found." });
                }

                const botMember = guild.members.cache.get(client.user.id) || await guild.members.fetchMe();
                if (botMember.roles.highest.position <= role.position) {
                    return interaction.editReply({ content: "❌ Hierarchy Error: My role is lower than the verification role." });
                }

                if (member.roles.cache.has(role.id)) {
                    return interaction.editReply({ content: "⚠️ You are already verified!" });
                }

                try {
                    await member.roles.add(role);
                    return interaction.editReply({ content: "✅ **Authentication Successful!**" });
                } catch (err) {
                    console.error("Role Assignment Error:", err);
                    return interaction.editReply({ content: "❌ Failed to assign verification role." });
                }
            }

            // --- redeem button ---
            if (interaction.customId === 'redeem_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('redeem_modal')
                    .setTitle('💎 Secure Key Redemption');

                const codeInput = new TextInputBuilder()
                    .setCustomId('redeem_code_input')
                    .setLabel("ENTER SUPPORTER / LICENSE CODE")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder("supporter-xxxx-xxxx-xxxx")
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
                return await interaction.showModal(modal);
            }

            // --- role announcements button ---
            if (interaction.customId === 'role_announcements') {
                const role = interaction.guild.roles.cache.get(ANNOUNCEMENT_ROLE_ID);
                if (!role) return interaction.reply({ content: "❌ Announcement role not configured.", flags: 64 });

                if (interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.remove(role);
                    return interaction.reply({ content: "🔕 Opted out of Announcements.", flags: 64 });
                } else {
                    await interaction.member.roles.add(role);
                    return interaction.reply({ content: "🔔 Opted in to Announcements!", flags: 64 });
                }
            }

            // --- automod toggle button ---
            if (interaction.customId === 'automod_toggle') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: `❌ You need the <@&${ADMIN_ROLE_ID}> role or admin permissions.`, flags: 64 });
                }
                return interaction.reply({ content: "🛡️ **Automod Security Matrix:** All parameters active.", flags: 64 });
            }

            // --- close ticket button ---
            if (interaction.customId === 'close_ticket_btn') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: "❌ Only staff can close tickets.", flags: 64 });
                }
                await interaction.reply({ content: "🔒 Archiving ticket in 5 seconds..." });
                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            }

            // --- Pagination buttons for /gen-codes ---
            if (interaction.customId === 'gen_codes_prev' || interaction.customId === 'gen_codes_next') {
                const messageId = interaction.message.id;
                const state = genCodePages.get(messageId);
                if (!state) {
                    return interaction.reply({ content: '❌ Pagination session expired.', flags: 64 });
                }
                if (state.userId !== interaction.user.id) {
                    return interaction.reply({ content: '❌ You are not the one who requested this list.', flags: 64 });
                }

                const { entries, totalPages } = state;
                let newPage = state.page;
                if (interaction.customId === 'gen_codes_prev') newPage--;
                else if (interaction.customId === 'gen_codes_next') newPage++;
                if (newPage < 0 || newPage >= totalPages) {
                    return interaction.reply({ content: '❌ You are already at the edge of the list.', flags: 64 });
                }
                state.page = newPage;
                genCodePages.set(messageId, state);

                const generateEmbed = (page) => {
                    const start = page * 10;
                    const end = Math.min(start + 10, entries.length);
                    const pageEntries = entries.slice(start, end);
                    const embed = new EmbedBuilder()
                        .setTitle('📋 Active Generation IDs')
                        .setDescription(`Page ${page+1} of ${totalPages} (${entries.length} total)\n\nUse \`/remove-token <ID>\` to remove a token.`)
                        .setColor(0x5865F2)
                        .setFooter({ text: 'TMC.LOL • Click buttons to navigate' });
                    pageEntries.forEach((entry) => {
                        embed.addFields({
                            name: `\`${entry.id}\``,
                            value: `👤 ${entry.username}\n🆔 <@${entry.userId}>`,
                            inline: false
                        });
                    });
                    return embed;
                };

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('gen_codes_prev').setLabel('◀ Previous').setStyle(ButtonStyle.Primary).setDisabled(newPage === 0),
                    new ButtonBuilder().setCustomId('gen_codes_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(newPage === totalPages - 1)
                );

                await interaction.update({
                    embeds: [generateEmbed(newPage)],
                    components: [row]
                });
                return;
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'support_select') {
                const category = interaction.values[0];
                const guild = interaction.guild;
                const user = interaction.user;

                await interaction.deferReply({ flags: 64 });

                try {
                    const ticketChannel = await guild.channels.create({
                        name: `ticket-${user.username}`,
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: guild.id,
                                deny: [PermissionFlagsBits.ViewChannel],
                            },
                            {
                                id: user.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                            },
                            {
                                id: client.user.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
                            }
                        ],
                    });

                    const ticketEmbed = new EmbedBuilder()
                        .setTitle(`🎫 SECURE TICKET: ${category.toUpperCase()}`)
                        .setDescription(`Welcome, <@${user.id}>. Staff has been notified.`)
                        .setColor(0xFEE75C)
                        .setTimestamp()
                        .setFooter({ text: "TMC.LOL Incident Resolution • Credits to @elliott" });

                    const closeButton = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('close_ticket_btn').setLabel('CLOSE TICKET').setStyle(ButtonStyle.Danger).setEmoji('🔒')
                    );

                    await ticketChannel.send({ content: `<@${user.id}> | Staff Alert`, embeds: [ticketEmbed], components: [closeButton] });

                    return interaction.editReply({ content: `✅ Ticket created: <#${ticketChannel.id}>` });
                } catch (err) {
                    console.error("Ticket Creation Error:", err);
                    return interaction.editReply({ content: "❌ Failed to create ticket." });
                }
            }
        }

        if (interaction.isModalSubmit()) {
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
                        expiresAt: Date.now() + (60 * 60 * 1000)
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
        if (err.code !== 3000 && !interaction.replied && !interaction.deferred) {
            interaction.reply({ content: "❌ An unexpected error occurred. Please try again.", flags: 64 }).catch(() => {});
        }
    }
});

// --- HTTP SERVER ---
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('TMC.LOL Token Generator Bot is active!\nAuto-refreshes every 5 minutes.\nCredits to @elliott\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[TMC.LOL] HTTP server running on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
