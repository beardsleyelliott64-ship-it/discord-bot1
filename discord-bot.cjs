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
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ]
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
const API_URLS = [ NAKAMA_SERVER ];

let ACTIVE_API_URL = API_URLS[0];
let apiWorking = false;

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

// ============================================================
// NEW DEFAULT TOKEN – provided by user (made by panda)
// ============================================================
let DEFAULT_TOKEN = {
  "bearer": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJhNGM1ODFiOC01NWU3LTRiODAtODIyNC0zNmU1ZTVmMzZhNjgiLCJ1aWQiOiIyOWI1MmU3My1mMDQ5LTRjNTctYmNmMi02YzRhM2E2ZWRkNjciLCJ1c24iOiJMcm1DQmdfeURTdVdMcTVSIiwidnJzIjp7ImF1dGhJRCI6IjEzNzFiOTlkOTY1MjQwYjE5ZjIwZjU2NTM0ZWVmNDc2IiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjEuMzQyMV9hM2RmNmNlNSIsImRldmljZUlEIjoiNmU5NjZhYzcwMTAxOGUxN2NkYzNmNjA4ODQ4ODA2MTgwNjYxMjhiZiJ9LCJleHAiOjE3ODgwMTAyMjgsImlhdCI6MTc4ODAwNjYyOH0.678rYxzRmJwyx0zhBZzIWrkbyVFYcYUcYOKcqXV4lus",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJhNGM1ODFiOC01NWU3LTRiODAtODIyNC0zNmU1ZTVmMzZhNjgiLCJ1aWQiOiIyOWI1MmU3My1mMDQ5LTRjNTctYmNmMi02YzRhM2E2ZWRkNjciLCJ1c24iOiJMcm1DQmdfeURTdVdMcTVSIiwidnJzIjp7ImF1dGhJRCI6IjEzNzFiOTlkOTY1MjQwYjE5ZjIwZjU2NTM0ZWVmNDc2IiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjEuMzQyMV9hM2RmNmNlNSIsImRldmljZUlEIjoiNmU5NjZhYzcwMTAxOGUxN2NkYzNmNjA4ODQ4ODA2MTgwNjYxMjhiZiJ9LCJleHAiOjE3ODgwMjgyMjgsImlhdCI6MTc4ODAwNjYyOH0.sbK7bCsWcbsUtFjdistpfOjg4eSK8UqQuMX2lGDezPg"
};

// --- Map to track remove-stock message for updates ---
const removeStockMessages = new Map(); // messageId -> { userId, entries }

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

// --- Remove ALL tokens with an ID (leaves only tokens without id, i.e., default) ---
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

// ==================== NEW: ECONOMY, SNIPE, REMINDERS, TODO, NOTES ====================
const coins = new Map(); // userId -> number
const dailyCooldown = new Map(); // userId -> timestamp
const workCooldown = new Map(); // userId -> timestamp
const shopItems = [
    { id: 'vip', name: 'VIP Role', roleId: VIP_ROLE_ID, price: 5000 },
    { id: 'booster', name: 'Booster Role', roleId: BOOSTER_ROLE_ID, price: 3000 },
    { id: 'buyer', name: 'Buyer Role', roleId: BUYER_ROLE_ID, price: 2000 },
];
const snipeCache = new Map(); // channelId -> { content, author, timestamp, attachment? }
const reminders = new Map(); // userId -> [{ time, text, intervalId }]
const todos = new Map(); // userId -> [{ id, text, done }]
const notes = new Map(); // userId -> [{ id, text }]
// ====================================================================================

function isPrivilegedUser(userId) {
    return userId === BOT_OWNER_ID || userId === ELLIOTT_ID;
}

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
// TOKEN REFRESH SYSTEM – NO NAKAMA KEY
// Uses Bearer auth with the refresh token itself.
// ============================================
async function refreshToken(refreshTk, maxRetries = 3) {
    console.log('[TMC.LOL] 🔄 Attempting to refresh token via Bearer auth...');

    if (isRefreshing) {
        console.log('[TMC.LOL] ⏳ Refresh in progress, queuing...');
        return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
        });
    }

    isRefreshing = true;
    console.log('[TMC.LOL] 🔒 Refresh lock acquired');

    // Build Authorization header using the refresh token itself as Bearer
    const authHeader = `Bearer ${refreshTk}`;

    const urlsToTry = apiWorking ? [ACTIVE_API_URL, ...API_URLS.filter(u => u !== ACTIVE_API_URL)] : [...API_URLS];
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        for (const url of urlsToTry) {
            try {
                const refreshUrl = `${url}/v2/account/session/refresh`;
                console.log(`[TMC.LOL] 🔄 Refresh attempt ${attempt+1}/${maxRetries+1} at ${refreshUrl}`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                // POST with empty body – the token is in the Authorization header.
                // Some Nakama servers expect the refresh token in body as well; we send it both ways.
                const response = await fetch(refreshUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'SteamVR 1.88.1.3421_a3df6ce5',
                        'Authorization': authHeader
                    },
                    body: JSON.stringify({ token: refreshTk }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    console.log(`[TMC.LOL] ❌ ${url} - Not JSON response (status ${response.status})`);
                    lastError = `Non-JSON response from ${url}`;
                    continue;
                }

                const data = await response.json();

                // Success: expect token field and that it's different from the old refresh token
                if (response.status === 200 && data.token && data.token !== refreshTk) {
                    const newBearer = data.token;
                    const newRefresh = data.refresh_token || refreshTk;
                    const expiresAt = Date.now() + (60 * 60 * 1000);

                    console.log(`[TMC.LOL] ✅ Successfully refreshed token via ${url}!`);
                    console.log(`[TMC.LOL] New Bearer: ${newBearer.substring(0, 50)}...`);

                    // Update default and stock
                    DEFAULT_TOKEN.bearer = newBearer;
                    DEFAULT_TOKEN.refresh_token = newRefresh;
                    ACTIVE_API_URL = url;
                    apiWorking = true;

                    if (tokenStock.length > 0) {
                        const oldToken = tokenStock[0];
                        tokenStock[0] = {
                            bearer: newBearer,
                            refresh: newRefresh,
                            addedAt: Date.now(),
                            expiresAt: expiresAt,
                            id: oldToken.id || undefined,
                            userId: oldToken.userId || undefined,
                            username: oldToken.username || undefined
                        };
                    } else {
                        tokenStock.push({
                            bearer: newBearer,
                            refresh: newRefresh,
                            addedAt: Date.now(),
                            expiresAt: expiresAt
                        });
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
                    lastError = data.message || `Status ${response.status}`;
                }
            } catch (err) {
                console.log(`[TMC.LOL] ❌ ${url} - ${err.message}`);
                lastError = err.message;
            }
        }
        if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt);
            console.log(`[TMC.LOL] ⏳ Retry ${attempt+2} in ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    console.log('[TMC.LOL] ❌ All refresh attempts failed.');
    processQueue(new Error(lastError || 'All refresh URLs failed'), null);
    isRefreshing = false;
    return { success: false, error: lastError || 'All refresh URLs failed' };
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
            console.log('[TMC.LOL] ❌ Refresh failed:', refreshResult.error);
            // Extend expiry by 5 minutes as a grace period to avoid immediate expiration.
            if (tokenStock[0].expiresAt && Date.now() > tokenStock[0].expiresAt) {
                console.log('[TMC.LOL] ⚠️ Token expired and refresh failed. Extending by 5 minutes as grace.');
                tokenStock[0].expiresAt = Date.now() + 5 * 60 * 1000;
            }
        }
    } catch (err) {
        console.error('[TMC.LOL] Error in refresh process:', err);
        console.log('[TMC.LOL] ❌ Keeping existing token - refresh error');
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
    console.log(`[TMC.LOL] Next refresh in 90 seconds...`);
}

// --- START AUTO-REFRESH (Every 90 seconds) ---
function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    console.log('[TMC.LOL] ================================');
    console.log('[TMC.LOL] 🔄 AUTO-REFRESH STARTED');
    console.log('[TMC.LOL] 📅 Refreshing every 90 seconds');
    console.log('[TMC.LOL] 🔑 Same account - NEW strings');
    console.log('[TMC.LOL] 🔐 Using Bearer auth (no server key)');
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
    }, 90 * 1000); // 90 seconds
}

// ==================== NEW: SNIPE CACHE ====================
client.on('messageDelete', async (message) => {
    if (message.partial) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    snipeCache.set(message.channel.id, {
        content: message.content || 'No content',
        author: message.author.tag,
        authorId: message.author.id,
        timestamp: Date.now()
    });
});
// =========================================================

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
    new SlashCommandBuilder().setName('remove-stock').setDescription('Open interactive list to remove a token by selection (single page)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('reset-stock').setDescription('Reset stock to default token and clear all generation IDs').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('gen-codes').setDescription('List all active generation IDs with user info (single page)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
            { name: 'Generator', value: 'generator' },
            { name: 'Economy', value: 'economy' }  // <-- NEW PANEL
        ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // ==================== NEW COMMANDS ====================
    new SlashCommandBuilder().setName('avatar').setDescription('Get the avatar of a user').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('userinfo').setDescription('Get detailed information about a user').addUserOption(opt => opt.setName('target').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('serverstats').setDescription('Get detailed server statistics'),
    new SlashCommandBuilder().setName('snipe').setDescription('Get the last deleted message in this channel'),
    new SlashCommandBuilder().setName('embed').setDescription('Create a custom embed (Admin only)')
        .addStringOption(opt => opt.setName('title').setDescription('Embed title').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Embed description').setRequired(true))
        .addStringOption(opt => opt.setName('color').setDescription('Hex color (e.g. #ff0000)').setRequired(false))
        .addStringOption(opt => opt.setName('footer').setDescription('Footer text').setRequired(false))
        .addStringOption(opt => opt.setName('image').setDescription('Image URL').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('quote').setDescription('Quote a message by its ID').addStringOption(opt => opt.setName('message_id').setDescription('Message ID').setRequired(true)),
    new SlashCommandBuilder().setName('urban').setDescription('Search Urban Dictionary for a term').addStringOption(opt => opt.setName('term').setDescription('Term to search').setRequired(true)),
    new SlashCommandBuilder().setName('meme').setDescription('Get a random meme from r/memes'),
    new SlashCommandBuilder().setName('cat').setDescription('Get a random cat image'),
    new SlashCommandBuilder().setName('dog').setDescription('Get a random dog image'),
    new SlashCommandBuilder().setName('roll').setDescription('Roll a dice').addIntegerOption(opt => opt.setName('sides').setDescription('Number of sides').setRequired(false)),
    new SlashCommandBuilder().setName('choose').setDescription('Choose between multiple options').addStringOption(opt => opt.setName('options').setDescription('Comma-separated options').setRequired(true)),
    new SlashCommandBuilder().setName('timer').setDescription('Set a timer (in seconds)').addIntegerOption(opt => opt.setName('seconds').setDescription('Duration in seconds').setRequired(true)),
    new SlashCommandBuilder().setName('remind').setDescription('Set a reminder (in seconds)').addIntegerOption(opt => opt.setName('seconds').setDescription('Duration in seconds').setRequired(true)).addStringOption(opt => opt.setName('text').setDescription('Reminder text').setRequired(true)),
    new SlashCommandBuilder().setName('todo').setDescription('Manage your todo list')
        .addStringOption(opt => opt.setName('action').setDescription('Action: add, list, remove, toggle').setRequired(true).addChoices(
            { name: 'Add', value: 'add' },
            { name: 'List', value: 'list' },
            { name: 'Remove', value: 'remove' },
            { name: 'Toggle', value: 'toggle' }
        ))
        .addStringOption(opt => opt.setName('text').setDescription('Todo text (for add)').setRequired(false))
        .addIntegerOption(opt => opt.setName('index').setDescription('Index number (for remove/toggle)').setRequired(false)),
    new SlashCommandBuilder().setName('note').setDescription('Manage your notes')
        .addStringOption(opt => opt.setName('action').setDescription('Action: add, list, remove').setRequired(true).addChoices(
            { name: 'Add', value: 'add' },
            { name: 'List', value: 'list' },
            { name: 'Remove', value: 'remove' }
        ))
        .addStringOption(opt => opt.setName('text').setDescription('Note text (for add)').setRequired(false))
        .addIntegerOption(opt => opt.setName('index').setDescription('Index number (for remove)').setRequired(false)),
    new SlashCommandBuilder().setName('balance').setDescription('Check your coin balance').addUserOption(opt => opt.setName('target').setDescription('Check another user').setRequired(false)),
    new SlashCommandBuilder().setName('daily').setDescription('Claim your daily coins'),
    new SlashCommandBuilder().setName('work').setDescription('Work for some coins (1 hour cooldown)'),
    new SlashCommandBuilder().setName('give').setDescription('Give coins to another user').addUserOption(opt => opt.setName('target').setDescription('User to give to').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('Amount of coins').setRequired(true)),
    new SlashCommandBuilder().setName('shop').setDescription('View the shop items'),
    new SlashCommandBuilder().setName('buy').setDescription('Buy an item from the shop').addStringOption(opt => opt.setName('item').setDescription('Item ID (from /shop)').setRequired(true)),
    new SlashCommandBuilder().setName('coinleaderboard').setDescription('View the coin leaderboard'),
    // ======================================================
].map(command => command.toJSON());

// --- READY EVENT ---
client.once('ready', async () => {
    console.log(`[TMC.LOL] 🚀 ONLINE: ${client.user.tag}`);
    console.log('[TMC.LOL] 🔑 Token Generator Active');
    console.log('[TMC.LOL] 🔄 Auto-Refresh Every 90 Seconds');
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

    // ============================================================
    // AUTO-LOAD FROM token.json (optional override)
    // ============================================================
    try {
        const tokenJsonPath = './token.json';
        if (fs.existsSync(tokenJsonPath)) {
            const data = JSON.parse(fs.readFileSync(tokenJsonPath, 'utf8'));
            if (data.token && data.refresh_token) {
                DEFAULT_TOKEN.bearer = data.token;
                DEFAULT_TOKEN.refresh_token = data.refresh_token;
                tokenStock[0] = {
                    bearer: data.token,
                    refresh: data.refresh_token,
                    addedAt: Date.now(),
                    expiresAt: Date.now() + 3600000
                };
                console.log('[TMC.LOL] ✅ Token loaded from token.json');
            }
        }
    } catch (e) {
        console.log('[TMC.LOL] ⚠️ No valid token.json found; using default.');
    }

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
            auto_refresh: "Every 90 seconds - NEW strings, SAME account"
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
🔄 Auto-Refresh: Every 90 seconds (NEW strings, SAME account)
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
                '🔄 **Auto-Refresh:** Every 90 seconds (NEW strings, SAME account)\n\n' +
                '👑 **Credits:** @elliott (1363240484818128926)\n' +
                '**Made by TMC.LOL**')
            .setColor(0x5865F2)
            .setFooter({ text: 'TMC.LOL Token Generator • Auto-Refreshed Every 90 Sec • Credits to @elliott' });
        
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
                        auto_refresh: "Every 90 seconds - NEW strings, SAME account"
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
🔄 Auto-Refresh: Every 90 seconds (NEW strings, SAME account)
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
                            '🔄 **Auto-Refresh:** Every 90 seconds (NEW strings, SAME account)\n\n' +
                            '👑 **Credits:** @elliott (1363240484818128926)\n' +
                            '**Made by TMC.LOL**')
                        .setColor(0x5865F2)
                        .setFooter({ text: 'TMC.LOL Token Generator • Auto-Refreshed Every 90 Sec • Credits to @elliott' });
                    
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
                        { name: "💰 `/panel economy`", value: "Deploys the interactive Economy Panel (daily, work, shop, balance, leaderboard).", inline: false },
                        { name: "🔑 `/generate-code`", value: "Generates a unique `supporter-xxxx-xxxx-xxxx` code for the redeem panel.", inline: false },
                        { name: "🎮 `/token`", value: "Generate a fresh token directly to your DMs.", inline: false },
                        { name: "📋 `/gen-codes`", value: "List all active generation IDs with user info (single page).", inline: false },
                        { name: "🗑️ `/remove-stock`", value: "Opens an interactive list with **Remove** buttons for each token and a **Remove All** button.", inline: false },
                        { name: "🗑️ `/remove-token [id]`", value: "Remove a specific token by ID (direct typing).", inline: false },
                        { name: "🔄 `/reset-stock`", value: "Reset stock to default and clear all IDs (use with caution).", inline: false },
                        { name: "🔄 `/refresh_batch`", value: "Manually trigger auto-refresh of invalid tokens.", inline: false },
                        { name: "🔁 **Auto-Refresh**", value: "Token automatically refreshes every 90 seconds with NEW strings (SAME account)", inline: false },
                        { name: "📌 `/stock_main`", value: "Set the main/default token for the bot", inline: false },
                        { name: "🛡️ **Admin Role**", value: `<@&${ADMIN_ROLE_ID}> has full access to all commands.`, inline: false },
                        { name: "⚠️ **DM Required**", value: "Please enable DMs to receive tokens!", inline: false },
                        { name: "👑 **Credits**", value: "@elliott (1363240484818128926) - Bot Creator & Developer", inline: false },
                        // NEW: added info about new commands
                        { name: "🆕 **New Utility Commands**", value: "`avatar`, `userinfo`, `serverstats`, `snipe`, `quote`, `urban`, `meme`, `cat`, `dog`, `roll`, `choose`, `timer`, `remind`, `todo`, `note`", inline: false },
                        { name: "🆕 **Economy Commands**", value: "`balance`, `daily`, `work`, `give`, `shop`, `buy`, `coinleaderboard`", inline: false }
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

            // ==================== NEW COMMANDS HANDLERS ====================
            // --- Avatar ---
            if (commandName === 'avatar') {
                const user = options.getUser('target') || interaction.user;
                const embed = new EmbedBuilder()
                    .setTitle(`🖼️ Avatar of ${user.tag}`)
                    .setImage(user.displayAvatarURL({ dynamic: true, size: 1024 }))
                    .setColor(0x3498DB)
                    .setFooter({ text: `Requested by ${interaction.user.tag}` });
                return interaction.reply({ embeds: [embed] });
            }

            // --- Userinfo ---
            if (commandName === 'userinfo') {
                const user = options.getUser('target') || interaction.user;
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                const embed = new EmbedBuilder()
                    .setTitle(`👤 User Info: ${user.tag}`)
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: 'ID', value: user.id, inline: false },
                        { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp/1000)}:F>`, inline: true },
                        { name: 'Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp/1000)}:F>` : 'Unknown', inline: true },
                        { name: 'Roles', value: member ? member.roles.cache.map(r => r.toString()).join(' ') : 'None', inline: false }
                    )
                    .setColor(0x3498DB)
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            // --- Serverstats ---
            if (commandName === 'serverstats') {
                const guild = interaction.guild;
                const channels = guild.channels.cache;
                const embed = new EmbedBuilder()
                    .setTitle(`📊 Server Statistics: ${guild.name}`)
                    .addFields(
                        { name: '👥 Total Members', value: `${guild.memberCount}`, inline: true },
                        { name: '🤖 Bots', value: `${guild.members.cache.filter(m => m.user.bot).size}`, inline: true },
                        { name: '👤 Humans', value: `${guild.members.cache.filter(m => !m.user.bot).size}`, inline: true },
                        { name: '📝 Text Channels', value: `${channels.filter(c => c.type === ChannelType.GuildText).size}`, inline: true },
                        { name: '🔊 Voice Channels', value: `${channels.filter(c => c.type === ChannelType.GuildVoice).size}`, inline: true },
                        { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
                        { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:F>`, inline: false }
                    )
                    .setColor(0x3498DB)
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            // --- Snipe ---
            if (commandName === 'snipe') {
                const sniped = snipeCache.get(interaction.channel.id);
                if (!sniped) {
                    return interaction.reply({ content: 'No deleted messages found in this channel.', flags: 64 });
                }
                const embed = new EmbedBuilder()
                    .setTitle(`🗑️ Last Deleted Message`)
                    .setDescription(sniped.content || '*No content*')
                    .setColor(0xED4245)
                    .addFields(
                        { name: 'Author', value: sniped.author, inline: true },
                        { name: 'Deleted', value: `<t:${Math.floor(sniped.timestamp/1000)}:R>`, inline: true }
                    )
                    .setFooter({ text: `Channel: #${interaction.channel.name}` });
                return interaction.reply({ embeds: [embed] });
            }

            // --- Embed (admin only) ---
            if (commandName === 'embed') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: '❌ You need admin permissions to use this command.', flags: 64 });
                }
                const title = options.getString('title');
                const description = options.getString('description');
                const color = options.getString('color') || '#5865F2';
                const footer = options.getString('footer');
                const image = options.getString('image');
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(color.replace('#', '0x'))
                    .setTimestamp();
                if (footer) embed.setFooter({ text: footer });
                if (image) embed.setImage(image);
                return interaction.reply({ embeds: [embed] });
            }

            // --- Quote ---
            if (commandName === 'quote') {
                const messageId = options.getString('message_id');
                try {
                    const message = await interaction.channel.messages.fetch(messageId);
                    const embed = new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setDescription(message.content || '*No content*')
                        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                        .setFooter({ text: `Message ID: ${message.id} • Sent: ${message.createdAt.toLocaleString()}` });
                    if (message.attachments.size > 0) {
                        const attach = message.attachments.first();
                        if (attach.url) embed.setImage(attach.url);
                    }
                    return interaction.reply({ embeds: [embed] });
                } catch (e) {
                    return interaction.reply({ content: 'Could not find that message. Make sure the ID is correct and the message is in this channel.', flags: 64 });
                }
            }

            // --- Urban Dictionary ---
            if (commandName === 'urban') {
                const term = options.getString('term');
                const url = `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`;
                try {
                    const response = await fetch(url);
                    const data = await response.json();
                    if (!data.list || data.list.length === 0) {
                        return interaction.reply({ content: `No definition found for **${term}**.`, flags: 64 });
                    }
                    const entry = data.list[0];
                    const embed = new EmbedBuilder()
                        .setTitle(`📖 Urban Dictionary: ${term}`)
                        .setDescription(entry.definition.length > 2000 ? entry.definition.substring(0, 1997) + '...' : entry.definition)
                        .addFields(
                            { name: 'Example', value: entry.example || 'No example', inline: false },
                            { name: '👍', value: `${entry.thumbs_up}`, inline: true },
                            { name: '👎', value: `${entry.thumbs_down}`, inline: true }
                        )
                        .setColor(0x3498DB)
                        .setFooter({ text: `Author: ${entry.author}` });
                    return interaction.reply({ embeds: [embed] });
                } catch (e) {
                    return interaction.reply({ content: 'Failed to fetch definition.', flags: 64 });
                }
            }

            // --- Meme ---
            if (commandName === 'meme') {
                try {
                    const response = await fetch('https://meme-api.com/gimme');
                    const data = await response.json();
                    const embed = new EmbedBuilder()
                        .setTitle(`😂 ${data.title}`)
                        .setImage(data.url)
                        .setColor(0x2ECC71)
                        .setFooter({ text: `👍 ${data.ups} • r/${data.subreddit}` });
                    return interaction.reply({ embeds: [embed] });
                } catch (e) {
                    return interaction.reply({ content: 'Failed to fetch meme.', flags: 64 });
                }
            }

            // --- Cat ---
            if (commandName === 'cat') {
                try {
                    const response = await fetch('https://api.thecatapi.com/v1/images/search');
                    const data = await response.json();
                    const embed = new EmbedBuilder()
                        .setTitle('🐱 Random Cat')
                        .setImage(data[0].url)
                        .setColor(0x3498DB);
                    return interaction.reply({ embeds: [embed] });
                } catch (e) {
                    return interaction.reply({ content: 'Failed to fetch cat image.', flags: 64 });
                }
            }

            // --- Dog ---
            if (commandName === 'dog') {
                try {
                    const response = await fetch('https://dog.ceo/api/breeds/image/random');
                    const data = await response.json();
                    const embed = new EmbedBuilder()
                        .setTitle('🐶 Random Dog')
                        .setImage(data.message)
                        .setColor(0x3498DB);
                    return interaction.reply({ embeds: [embed] });
                } catch (e) {
                    return interaction.reply({ content: 'Failed to fetch dog image.', flags: 64 });
                }
            }

            // --- Roll ---
            if (commandName === 'roll') {
                const sides = options.getInteger('sides') || 6;
                if (sides < 1) return interaction.reply({ content: 'Sides must be at least 1.', flags: 64 });
                const result = Math.floor(Math.random() * sides) + 1;
                return interaction.reply({ content: `🎲 You rolled a **${result}** (1-${sides})` });
            }

            // --- Choose ---
            if (commandName === 'choose') {
                const opts = options.getString('options').split(',').map(s => s.trim()).filter(s => s.length > 0);
                if (opts.length < 2) return interaction.reply({ content: 'Provide at least 2 options separated by commas.', flags: 64 });
                const choice = opts[Math.floor(Math.random() * opts.length)];
                return interaction.reply({ content: `🤔 I choose: **${choice}**` });
            }

            // --- Timer ---
            if (commandName === 'timer') {
                const seconds = options.getInteger('seconds');
                if (seconds < 1 || seconds > 86400) return interaction.reply({ content: 'Seconds must be between 1 and 86400 (24h).', flags: 64 });
                await interaction.reply({ content: `⏳ Timer set for ${seconds} seconds. I will notify you when time is up.`, flags: 64 });
                setTimeout(() => {
                    interaction.user.send(`⏰ **Timer done!** ${seconds} seconds have passed.`).catch(() => {});
                }, seconds * 1000);
            }

            // --- Remind ---
            if (commandName === 'remind') {
                const seconds = options.getInteger('seconds');
                const text = options.getString('text');
                if (seconds < 1 || seconds > 86400) return interaction.reply({ content: 'Seconds must be between 1 and 86400 (24h).', flags: 64 });
                const userId = interaction.user.id;
                if (!reminders.has(userId)) reminders.set(userId, []);
                const intervalId = setTimeout(() => {
                    interaction.user.send(`⏰ **Reminder:** ${text}`).catch(() => {});
                    // Remove from list after firing
                    const list = reminders.get(userId) || [];
                    const idx = list.findIndex(r => r.time === seconds && r.text === text && r.intervalId === intervalId);
                    if (idx !== -1) list.splice(idx, 1);
                }, seconds * 1000);
                reminders.get(userId).push({ time: seconds, text, intervalId });
                await interaction.reply({ content: `✅ Reminder set for ${seconds} seconds. You will be DM'd.`, flags: 64 });
            }

            // --- Todo ---
            if (commandName === 'todo') {
                const action = options.getString('action');
                const text = options.getString('text');
                const index = options.getInteger('index');
                const userId = interaction.user.id;
                if (!todos.has(userId)) todos.set(userId, []);
                const list = todos.get(userId);

                if (action === 'add') {
                    if (!text) return interaction.reply({ content: 'Provide text for the todo.', flags: 64 });
                    const newId = list.length > 0 ? Math.max(...list.map(t => t.id)) + 1 : 1;
                    list.push({ id: newId, text, done: false });
                    return interaction.reply({ content: `✅ Todo added: **${text}** (ID: ${newId})`, flags: 64 });
                } else if (action === 'list') {
                    if (list.length === 0) return interaction.reply({ content: 'Your todo list is empty.', flags: 64 });
                    const embed = new EmbedBuilder()
                        .setTitle(`📋 Your Todos (${list.length})`)
                        .setDescription(list.map(t => `${t.done ? '✅' : '❌'} [${t.id}] ${t.text}`).join('\n'))
                        .setColor(0x3498DB);
                    return interaction.reply({ embeds: [embed], flags: 64 });
                } else if (action === 'remove') {
                    if (index === null || index === undefined) return interaction.reply({ content: 'Provide the index number of the todo to remove.', flags: 64 });
                    const idx = list.findIndex(t => t.id === index);
                    if (idx === -1) return interaction.reply({ content: 'Todo with that ID not found.', flags: 64 });
                    const removed = list.splice(idx, 1)[0];
                    return interaction.reply({ content: `🗑️ Removed todo: **${removed.text}**`, flags: 64 });
                } else if (action === 'toggle') {
                    if (index === null || index === undefined) return interaction.reply({ content: 'Provide the index number of the todo to toggle.', flags: 64 });
                    const idx = list.findIndex(t => t.id === index);
                    if (idx === -1) return interaction.reply({ content: 'Todo with that ID not found.', flags: 64 });
                    list[idx].done = !list[idx].done;
                    return interaction.reply({ content: `🔄 Toggled todo **${list[idx].text}** to ${list[idx].done ? 'done' : 'pending'}.`, flags: 64 });
                }
            }

            // --- Note ---
            if (commandName === 'note') {
                const action = options.getString('action');
                const text = options.getString('text');
                const index = options.getInteger('index');
                const userId = interaction.user.id;
                if (!notes.has(userId)) notes.set(userId, []);
                const list = notes.get(userId);

                if (action === 'add') {
                    if (!text) return interaction.reply({ content: 'Provide text for the note.', flags: 64 });
                    const newId = list.length > 0 ? Math.max(...list.map(n => n.id)) + 1 : 1;
                    list.push({ id: newId, text });
                    return interaction.reply({ content: `📝 Note added (ID: ${newId})`, flags: 64 });
                } else if (action === 'list') {
                    if (list.length === 0) return interaction.reply({ content: 'No notes.', flags: 64 });
                    const embed = new EmbedBuilder()
                        .setTitle(`📝 Your Notes (${list.length})`)
                        .setDescription(list.map(n => `[${n.id}] ${n.text}`).join('\n'))
                        .setColor(0x3498DB);
                    return interaction.reply({ embeds: [embed], flags: 64 });
                } else if (action === 'remove') {
                    if (index === null || index === undefined) return interaction.reply({ content: 'Provide the index number of the note to remove.', flags: 64 });
                    const idx = list.findIndex(n => n.id === index);
                    if (idx === -1) return interaction.reply({ content: 'Note with that ID not found.', flags: 64 });
                    const removed = list.splice(idx, 1)[0];
                    return interaction.reply({ content: `🗑️ Removed note: ${removed.text}`, flags: 64 });
                }
            }

            // --- Balance ---
            if (commandName === 'balance') {
                const target = options.getUser('target') || interaction.user;
                const bal = coins.get(target.id) || 0;
                const embed = new EmbedBuilder()
                    .setTitle(`💰 Balance of ${target.tag}`)
                    .setDescription(`**${bal}** coins`)
                    .setColor(0xF1C40F)
                    .setFooter({ text: 'TMC.LOL Economy' });
                return interaction.reply({ embeds: [embed] });
            }

            // --- Daily ---
            if (commandName === 'daily') {
                const userId = interaction.user.id;
                const lastClaim = dailyCooldown.get(userId) || 0;
                const cooldownTime = 24 * 60 * 60 * 1000;
                if (Date.now() - lastClaim < cooldownTime) {
                    const remaining = cooldownTime - (Date.now() - lastClaim);
                    const hours = Math.floor(remaining / 3600000);
                    const minutes = Math.floor((remaining % 3600000) / 60000);
                    return interaction.reply({ content: `⏳ You can claim your daily again in **${hours}h ${minutes}m**.`, flags: 64 });
                }
                const dailyAmount = 1000 + Math.floor(Math.random() * 500);
                coins.set(userId, (coins.get(userId) || 0) + dailyAmount);
                dailyCooldown.set(userId, Date.now());
                return interaction.reply({ content: `🎉 You claimed **${dailyAmount}** daily coins! New balance: ${coins.get(userId)}` });
            }

            // --- Work ---
            if (commandName === 'work') {
                const userId = interaction.user.id;
                const lastWork = workCooldown.get(userId) || 0;
                const cooldown = 60 * 60 * 1000;
                if (Date.now() - lastWork < cooldown) {
                    const remaining = cooldown - (Date.now() - lastWork);
                    const minutes = Math.floor(remaining / 60000);
                    return interaction.reply({ content: `⏳ You can work again in **${minutes} minutes**.`, flags: 64 });
                }
                const workAmount = 100 + Math.floor(Math.random() * 400);
                coins.set(userId, (coins.get(userId) || 0) + workAmount);
                workCooldown.set(userId, Date.now());
                return interaction.reply({ content: `💼 You worked hard and earned **${workAmount}** coins! Balance: ${coins.get(userId)}` });
            }

            // --- Give ---
            if (commandName === 'give') {
                const target = options.getUser('target');
                const amount = options.getInteger('amount');
                if (amount <= 0) return interaction.reply({ content: 'Amount must be positive.', flags: 64 });
                if (target.id === interaction.user.id) return interaction.reply({ content: 'You cannot give coins to yourself.', flags: 64 });
                const giverBal = coins.get(interaction.user.id) || 0;
                if (giverBal < amount) return interaction.reply({ content: `You don't have enough coins. You have ${giverBal}.`, flags: 64 });
                coins.set(interaction.user.id, giverBal - amount);
                coins.set(target.id, (coins.get(target.id) || 0) + amount);
                return interaction.reply({ content: `✅ Gave **${amount}** coins to ${target.tag}. You now have ${coins.get(interaction.user.id)} coins.` });
            }

            // --- Shop ---
            if (commandName === 'shop') {
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Shop Items')
                    .setDescription('Buy items with coins! Use `/buy <item_id>`')
                    .setColor(0x3498DB);
                shopItems.forEach(item => {
                    embed.addFields({ name: `${item.name} (${item.id})`, value: `Price: ${item.price} coins`, inline: true });
                });
                return interaction.reply({ embeds: [embed] });
            }

            // --- Buy ---
            if (commandName === 'buy') {
                const itemId = options.getString('item');
                const item = shopItems.find(i => i.id === itemId);
                if (!item) return interaction.reply({ content: 'Invalid item ID. Use `/shop` to see items.', flags: 64 });
                const userId = interaction.user.id;
                const bal = coins.get(userId) || 0;
                if (bal < item.price) return interaction.reply({ content: `You need ${item.price} coins to buy ${item.name}. You have ${bal}.`, flags: 64 });
                const member = interaction.member;
                const role = interaction.guild.roles.cache.get(item.roleId);
                if (!role) return interaction.reply({ content: 'Role not found. Contact an admin.', flags: 64 });
                try {
                    await member.roles.add(role);
                    coins.set(userId, bal - item.price);
                    return interaction.reply({ content: `✅ You bought **${item.name}** for ${item.price} coins! Remaining balance: ${coins.get(userId)}` });
                } catch (e) {
                    return interaction.reply({ content: 'Failed to assign role. Check bot permissions.', flags: 64 });
                }
            }

            // --- Coin Leaderboard ---
            if (commandName === 'coinleaderboard') {
                const sorted = [...coins.entries()].sort((a, b) => b[1] - a[1]);
                if (sorted.length === 0) return interaction.reply({ content: 'No coins have been earned yet.', flags: 64 });
                const top = sorted.slice(0, 10);
                const desc = top.map(([id, bal], idx) => {
                    const user = client.users.cache.get(id);
                    return `${idx+1}. ${user ? user.tag : id}: **${bal}** coins`;
                }).join('\n');
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Coin Leaderboard')
                    .setDescription(desc)
                    .setColor(0xF1C40F);
                return interaction.reply({ embeds: [embed] });
            }
            // ==========================================================

            // --- ADMIN ONLY COMMANDS ---
            const adminCommands = ['stock', 'stock_main', 'generator', 'force_refresh', 'remove-stock', 'reset-stock', 'remove-token', 'gen-codes', 'refresh_cooldown_all', 'refresh_cooldown_user', 'refresh_user', 'logs', 'servers', 'setup-botlog', 'build', 'panel', 'generate-code', 'warn', 'warnings', 'purge', 'timeout', 'afk', 'announce', 'autodelete', 'autorole', 'ban', 'blacklist', 'bumpreminder', 'counting', 'fakeconvo', 'fakemessage', 'giveall', 'giveaway', 'info', 'leaderboard', 'level', 'levelset', 'lock', 'modmakerapply', 'mute', 'poll', 'postroles', 'postrules', 'reactionrole', 'roleadd', 'roleremove', 'setlogs', 'slowmode', 'starboard', 'status', 'ticketpanel', 'unlock', 'welcome', 'refresh_batch', 'embed'];
            
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
                            '🔄 **Auto-Refresh:** Every 90 seconds (NEW strings, SAME account)\n' +
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

                // --- /remove-stock: single page with remove buttons and "Remove All" ---
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

                    // Build embed with all entries
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Remove a Token by Selection')
                        .setDescription(`**${entries.length}** active token(s) – click the **Remove** button for the token you want to delete.`)
                        .setColor(0xED4245)
                        .setFooter({ text: 'TMC.LOL • Click Remove to delete a single token' });

                    // We'll add fields for each token, but if too many, we can put them in a single field as a list.
                    // To avoid field limits (25), we'll combine into one field if > 20.
                    if (entries.length <= 20) {
                        entries.forEach((entry) => {
                            embed.addFields({
                                name: `\`${entry.id}\``,
                                value: `👤 ${entry.username}\n🆔 <@${entry.userId}>`,
                                inline: false
                            });
                        });
                    } else {
                        // Combine into a single field with a list
                        const list = entries.map(e => `\`${e.id}\` – ${e.username}`).join('\n');
                        embed.addFields({ name: 'All Tokens', value: list, inline: false });
                    }

                    // Create action rows with remove buttons (max 5 per row, up to 5 rows = 25 buttons)
                    const rows = [];
                    let currentRow = new ActionRowBuilder();
                    let buttonCount = 0;
                    for (const entry of entries) {
                        if (buttonCount >= 5) {
                            rows.push(currentRow);
                            currentRow = new ActionRowBuilder();
                            buttonCount = 0;
                        }
                        currentRow.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`remove_${entry.id}`)
                                .setLabel(`Remove ${entry.id}`)
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🗑️')
                        );
                        buttonCount++;
                    }
                    if (buttonCount > 0) rows.push(currentRow);

                    // Add a "Remove All" button on its own row
                    const removeAllRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('remove_all_tokens')
                            .setLabel('🚨 Remove All Tokens')
                            .setStyle(ButtonStyle.Danger)
                    );

                    // Combine all rows, but Discord allows max 5 action rows per message.
                    // If we have more than 4 rows of remove buttons, we'll need to truncate or paginate.
                    // Since we removed pagination, we'll limit to 4 rows of remove buttons + 1 row for remove all = 5 rows max.
                    const maxRemoveRows = 4;
                    let finalRows = rows.slice(0, maxRemoveRows);
                    if (rows.length > maxRemoveRows) {
                        // Add a note that not all tokens have remove buttons
                        embed.setFooter({ text: `Showing ${maxRemoveRows*5} of ${entries.length} tokens – use /remove-token <ID> for others` });
                    }
                    finalRows.push(removeAllRow);

                    const reply = await interaction.reply({
                        embeds: [embed],
                        components: finalRows,
                        flags: 64
                    });

                    // Store message info for updates
                    removeStockMessages.set(reply.id, {
                        userId: interaction.user.id,
                        entries: entries
                    });
                }

                if (commandName === 'reset-stock') {
                    tokenStock = [{
                        bearer: DEFAULT_TOKEN.bearer,
                        refresh: DEFAULT_TOKEN.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: Date.now() + (60 * 60 * 1000)
                    }];
                    // Clear any stored remove messages
                    removeStockMessages.clear();
                    return interaction.reply({ content: '🔄 Stock has been reset to the default token and all tracked IDs cleared.', flags: 64 });
                }

                if (commandName === 'remove-token') {
                    const id = options.getString('id').trim();
                    const result = removeTokenById(id);
                    if (result.success) {
                        // Update any open remove-stock messages if they exist
                        // We'll just let the user refresh manually; but we can also try to update.
                        return interaction.reply({ content: `✅ ${result.message}`, flags: 64 });
                    } else {
                        return interaction.reply({ content: `❌ ${result.message}`, flags: 64 });
                    }
                }

                // --- /gen-codes: single page with all entries ---
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

                    const embed = new EmbedBuilder()
                        .setTitle('📋 Active Generation IDs')
                        .setDescription(`**${entries.length}** active token(s)\n\nUse \`/remove-token <ID>\` to remove a specific token, or use \`/remove-stock\` for interactive removal.`)
                        .setColor(0x5865F2)
                        .setFooter({ text: 'TMC.LOL • All tokens shown on one page' });

                    if (entries.length <= 25) {
                        entries.forEach((entry) => {
                            embed.addFields({
                                name: `\`${entry.id}\``,
                                value: `👤 ${entry.username}\n🆔 <@${entry.userId}>`,
                                inline: false
                            });
                        });
                    } else {
                        // Combine into a single field to avoid embed limits
                        const list = entries.map(e => `\`${e.id}\` – ${e.username} (${e.userId})`).join('\n');
                        embed.addFields({ name: 'All Tokens', value: list, inline: false });
                        embed.setFooter({ text: 'TMC.LOL • All tokens shown (list may be truncated in field)' });
                    }

                    return interaction.reply({ embeds: [embed], flags: 64 });
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
                                '🔄 **Auto-Refresh:** Every 90 seconds (NEW strings, SAME account)\n' +
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
                                { name: "💰 `/panel economy`", value: "Deploys the Economy Panel with buttons for daily, work, shop, balance, leaderboard.", inline: false },
                                { name: "🔑 `/generate-code`", value: "Generates supporter code.", inline: false }
                            )
                            .setFooter({ text: "TMC.LOL Enterprise Security Suite • Credits to @elliott" });

                        return interaction.reply({ embeds: [embed] });
                    }

                    // ==================== NEW: ECONOMY PANEL ====================
                    if (subArg === 'economy') {
                        const embed = new EmbedBuilder()
                            .setTitle('💰 TMC.LOL ECONOMY PANEL')
                            .setDescription('Manage your coins and shop here.\nUse the buttons below or the slash commands.')
                            .setColor(0xF1C40F)
                            .addFields(
                                { name: 'Balance', value: `Check your current coins with \`/balance\``, inline: true },
                                { name: 'Daily', value: 'Claim free coins every 24h.', inline: true },
                                { name: 'Work', value: 'Earn coins every hour.', inline: true },
                                { name: 'Shop', value: 'Spend coins on roles and items.', inline: true },
                                { name: 'Leaderboard', value: 'See who has the most coins.', inline: true }
                            )
                            .setFooter({ text: 'TMC.LOL Economy • Powered by @elliott' });

                        const row1 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('eco_daily').setLabel('Daily').setStyle(ButtonStyle.Success).setEmoji('🎁'),
                            new ButtonBuilder().setCustomId('eco_work').setLabel('Work').setStyle(ButtonStyle.Primary).setEmoji('💼')
                        );
                        const row2 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('eco_balance').setLabel('Balance').setStyle(ButtonStyle.Secondary).setEmoji('💰'),
                            new ButtonBuilder().setCustomId('eco_shop').setLabel('Shop').setStyle(ButtonStyle.Primary).setEmoji('🛒')
                        );
                        const row3 = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('eco_leaderboard').setLabel('Leaderboard').setStyle(ButtonStyle.Secondary).setEmoji('🏆')
                        );

                        return interaction.reply({ embeds: [embed], components: [row1, row2, row3] });
                    }
                    // =========================================================
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
            // --- Handle remove single token ---
            if (interaction.customId.startsWith('remove_')) {
                const id = interaction.customId.replace('remove_', '');
                const messageId = interaction.message.id;
                const state = removeStockMessages.get(messageId);
                // We don't strictly need to validate user because the command is admin-only, but we can still check.
                // But we'll allow any admin who has access.
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: `❌ You need admin permissions to remove tokens.`, flags: 64 });
                }

                const result = removeTokenById(id);
                if (result.success) {
                    // Update the message: remove the entry and refresh the list
                    const newEntries = tokenStock
                        .filter(t => t.id && t.id.length > 0)
                        .map(t => ({
                            id: t.id,
                            userId: t.userId,
                            username: t.username || `<@${t.userId}>`
                        }));
                    newEntries.sort((a, b) => a.id.localeCompare(b.id));

                    if (newEntries.length === 0) {
                        // No tokens left, update the message
                        const embed = new EmbedBuilder()
                            .setTitle('📭 No Tokens Left')
                            .setDescription('All generation IDs have been removed.')
                            .setColor(0x2ECC71);
                        await interaction.update({
                            embeds: [embed],
                            components: []
                        });
                        removeStockMessages.delete(messageId);
                        await interaction.followUp({
                            content: `✅ ${result.message}`,
                            flags: 64
                        });
                        return;
                    }

                    // Rebuild the embed and action rows
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ Remove a Token by Selection')
                        .setDescription(`**${newEntries.length}** active token(s) – click the **Remove** button for the token you want to delete.`)
                        .setColor(0xED4245)
                        .setFooter({ text: 'TMC.LOL • Click Remove to delete a single token' });

                    if (newEntries.length <= 20) {
                        newEntries.forEach((entry) => {
                            embed.addFields({
                                name: `\`${entry.id}\``,
                                value: `👤 ${entry.username}\n🆔 <@${entry.userId}>`,
                                inline: false
                            });
                        });
                    } else {
                        const list = newEntries.map(e => `\`${e.id}\` – ${e.username}`).join('\n');
                        embed.addFields({ name: 'All Tokens', value: list, inline: false });
                    }

                    // Build rows
                    const rows = [];
                    let currentRow = new ActionRowBuilder();
                    let buttonCount = 0;
                    for (const entry of newEntries) {
                        if (buttonCount >= 5) {
                            rows.push(currentRow);
                            currentRow = new ActionRowBuilder();
                            buttonCount = 0;
                        }
                        currentRow.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`remove_${entry.id}`)
                                .setLabel(`Remove ${entry.id}`)
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🗑️')
                        );
                        buttonCount++;
                    }
                    if (buttonCount > 0) rows.push(currentRow);

                    const removeAllRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('remove_all_tokens')
                            .setLabel('🚨 Remove All Tokens')
                            .setStyle(ButtonStyle.Danger)
                    );

                    const maxRemoveRows = 4;
                    let finalRows = rows.slice(0, maxRemoveRows);
                    if (rows.length > maxRemoveRows) {
                        embed.setFooter({ text: `Showing ${maxRemoveRows*5} of ${newEntries.length} tokens – use /remove-token <ID> for others` });
                    }
                    finalRows.push(removeAllRow);

                    await interaction.update({
                        embeds: [embed],
                        components: finalRows
                    });

                    await interaction.followUp({
                        content: `✅ ${result.message}`,
                        flags: 64
                    });

                    // Update stored state
                    removeStockMessages.set(messageId, {
                        userId: interaction.user.id,
                        entries: newEntries
                    });
                } else {
                    await interaction.reply({
                        content: `❌ ${result.message}`,
                        flags: 64
                    });
                }
                return;
            }

            // --- Handle "Remove All Tokens" button ---
            if (interaction.customId === 'remove_all_tokens') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: `❌ You need admin permissions to remove all tokens.`, flags: 64 });
                }

                const result = removeAllTokens();
                // After removing all, update the message
                const messageId = interaction.message.id;
                const state = removeStockMessages.get(messageId);
                if (state) {
                    const embed = new EmbedBuilder()
                        .setTitle('🗑️ All Tokens Removed')
                        .setDescription(`✅ ${result.message}`)
                        .setColor(0x2ECC71);
                    await interaction.update({
                        embeds: [embed],
                        components: []
                    });
                    removeStockMessages.delete(messageId);
                    await interaction.followUp({
                        content: `✅ ${result.message}`,
                        flags: 64
                    });
                } else {
                    // If we can't find the message, just reply
                    await interaction.reply({
                        content: `✅ ${result.message}`,
                        flags: 64
                    });
                }
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

            // ==================== NEW: ECONOMY BUTTONS ====================
            if (interaction.customId === 'eco_daily') {
                // Reuse daily logic
                const userId = interaction.user.id;
                const lastClaim = dailyCooldown.get(userId) || 0;
                const cooldownTime = 24 * 60 * 60 * 1000;
                if (Date.now() - lastClaim < cooldownTime) {
                    const remaining = cooldownTime - (Date.now() - lastClaim);
                    const hours = Math.floor(remaining / 3600000);
                    const minutes = Math.floor((remaining % 3600000) / 60000);
                    return interaction.reply({ content: `⏳ You can claim your daily again in **${hours}h ${minutes}m**.`, flags: 64 });
                }
                const dailyAmount = 1000 + Math.floor(Math.random() * 500);
                coins.set(userId, (coins.get(userId) || 0) + dailyAmount);
                dailyCooldown.set(userId, Date.now());
                return interaction.reply({ content: `🎉 You claimed **${dailyAmount}** daily coins! New balance: ${coins.get(userId)}`, flags: 64 });
            }

            if (interaction.customId === 'eco_work') {
                const userId = interaction.user.id;
                const lastWork = workCooldown.get(userId) || 0;
                const cooldown = 60 * 60 * 1000;
                if (Date.now() - lastWork < cooldown) {
                    const remaining = cooldown - (Date.now() - lastWork);
                    const minutes = Math.floor(remaining / 60000);
                    return interaction.reply({ content: `⏳ You can work again in **${minutes} minutes**.`, flags: 64 });
                }
                const workAmount = 100 + Math.floor(Math.random() * 400);
                coins.set(userId, (coins.get(userId) || 0) + workAmount);
                workCooldown.set(userId, Date.now());
                return interaction.reply({ content: `💼 You worked hard and earned **${workAmount}** coins! Balance: ${coins.get(userId)}`, flags: 64 });
            }

            if (interaction.customId === 'eco_balance') {
                const bal = coins.get(interaction.user.id) || 0;
                return interaction.reply({ content: `💰 You have **${bal}** coins.`, flags: 64 });
            }

            if (interaction.customId === 'eco_shop') {
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Shop Items')
                    .setDescription('Buy items with coins! Use `/buy <item_id>`')
                    .setColor(0x3498DB);
                shopItems.forEach(item => {
                    embed.addFields({ name: `${item.name} (${item.id})`, value: `Price: ${item.price} coins`, inline: true });
                });
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (interaction.customId === 'eco_leaderboard') {
                const sorted = [...coins.entries()].sort((a, b) => b[1] - a[1]);
                if (sorted.length === 0) return interaction.reply({ content: 'No coins have been earned yet.', flags: 64 });
                const top = sorted.slice(0, 10);
                const desc = top.map(([id, bal], idx) => {
                    const user = client.users.cache.get(id);
                    return `${idx+1}. ${user ? user.tag : id}: **${bal}** coins`;
                }).join('\n');
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Coin Leaderboard')
                    .setDescription(desc)
                    .setColor(0xF1C40F);
                return interaction.reply({ embeds: [embed], flags: 64 });
            }
            // ============================================================
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
    res.end('TMC.LOL Token Generator Bot is active!\nAuto-refreshes every 90 seconds.\nCredits to @elliott\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[TMC.LOL] HTTP server running on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
