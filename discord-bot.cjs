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

// ==================== ECONOMY, SNIPE, REMINDERS, TODO, NOTES ====================
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

// ==================== NEW: USER STASH TOKENS & IMPORT ====================
const userTokens = new Map(); // userId -> { bearer, refresh }
const STASH_IMPORT_URL = 'https://animalcompany.us-east1.nakamacloud.io/v2/stash/import'; // change to actual endpoint
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

// ==================== SNIPE CACHE ====================
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
            { name: 'Economy', value: 'economy' },
            { name: 'Stash', value: 'stash' }  // NEW: Stash panel
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
    // ==================== STASH COMMANDS ====================
    new SlashCommandBuilder()
        .setName('stash_connect')
        .setDescription('Store your bearer and refresh tokens for stash import')
        .addStringOption(opt => opt.setName('bearer').setDescription('Bearer token').setRequired(true))
        .addStringOption(opt => opt.setName('refresh').setDescription('Refresh token').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // restrict to admins or adjust
    new SlashCommandBuilder()
        .setName('stash_import')
        .setDescription('Upload a blueprint/unity asset file to your stash')
        .addAttachmentOption(opt => opt.setName('file').setDescription('Blueprint file (.asset, .unity, etc.)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
    // ... (unchanged, keep existing code)
}

// --- INTERACTION CREATE ---
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options } = interaction;

            // --- PUBLIC COMMANDS (unchanged) ---
            // ... (keep all existing command handlers up to the admin commands)

            // ==================== NEW STASH COMMANDS ====================
            if (commandName === 'stash_connect') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: '❌ You need admin permissions to use this command.', flags: 64 });
                }
                const bearer = options.getString('bearer');
                const refresh = options.getString('refresh');
                if (!bearer || !refresh) {
                    return interaction.reply({ content: '❌ Both bearer and refresh tokens are required.', flags: 64 });
                }
                userTokens.set(interaction.user.id, { bearer, refresh });
                return interaction.reply({ content: '✅ Your stash tokens have been saved securely. Use `/stash_import` to upload blueprints.', flags: 64 });
            }

            if (commandName === 'stash_import') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: '❌ You need admin permissions to use this command.', flags: 64 });
                }
                const attachment = options.getAttachment('file');
                if (!attachment) {
                    return interaction.reply({ content: '❌ Please attach a file (blueprint/unity asset).', flags: 64 });
                }
                const user = interaction.user;
                const tokens = userTokens.get(user.id);
                if (!tokens) {
                    return interaction.reply({ content: '❌ You have not set your stash tokens. Use `/stash_connect` first.', flags: 64 });
                }

                await interaction.deferReply({ flags: 64 });

                try {
                    // Download the file
                    const response = await fetch(attachment.url);
                    if (!response.ok) throw new Error('Failed to download attachment');
                    const buffer = Buffer.from(await response.arrayBuffer());

                    // Prepare form data
                    const form = new FormData();
                    form.append('file', new Blob([buffer]), attachment.name);

                    // Send to stash import endpoint
                    const importResult = await fetch(STASH_IMPORT_URL, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${tokens.bearer}`,
                        },
                        body: form,
                    });

                    if (!importResult.ok) {
                        const errorText = await importResult.text();
                        throw new Error(`Import API error (${importResult.status}): ${errorText}`);
                    }

                    const resultData = await importResult.json();
                    return interaction.editReply({
                        content: `✅ Blueprint **${attachment.name}** imported successfully!\n\`\`\`json\n${JSON.stringify(resultData, null, 2)}\n\`\`\``
                    });
                } catch (err) {
                    console.error('[TMC.LOL] Stash import error:', err);
                    return interaction.editReply({
                        content: `❌ Failed to import blueprint: ${err.message}`
                    });
                }
            }
            // =============================================================

            // --- ADMIN ONLY COMMANDS (existing) ---
            // ... (keep all existing admin command handlers, make sure to include the new ones in the adminCommands array)
            const adminCommands = ['stock', 'stock_main', 'generator', 'force_refresh', 'remove-stock', 'reset-stock', 'remove-token', 'gen-codes', 'refresh_cooldown_all', 'refresh_cooldown_user', 'refresh_user', 'logs', 'servers', 'setup-botlog', 'build', 'panel', 'generate-code', 'warn', 'warnings', 'purge', 'timeout', 'afk', 'announce', 'autodelete', 'autorole', 'ban', 'blacklist', 'bumpreminder', 'counting', 'fakeconvo', 'fakemessage', 'giveall', 'giveaway', 'info', 'leaderboard', 'level', 'levelset', 'lock', 'modmakerapply', 'mute', 'poll', 'postroles', 'postrules', 'reactionrole', 'roleadd', 'roleremove', 'setlogs', 'slowmode', 'starboard', 'status', 'ticketpanel', 'unlock', 'welcome', 'refresh_batch', 'embed', 'stash_connect', 'stash_import'];
            // ... rest of existing code, but we need to add the new commands to the admin check.

            // We'll place the new stash commands before the adminCommands check so they are caught, but we already handled them above.
            // So we can just leave them as is.

            // ... (continue with the rest of the existing interaction handling)
        }

        // --- BUTTON HANDLERS (existing) ---
        // ... (keep existing, add new stash panel button logic)

        // --- MODAL SUBMITS (existing) ---
        // ... (keep existing, add new stash_set_modal for /panel stash)
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
