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
const dns = require('dns');
const { promisify } = require('util');
const dnsLookup = promisify(dns.lookup);

dns.setServers(['8.8.8.8', '1.1.1.1']);
console.log('[INFO] [EAM.LOL] DNS set to Google DNS (8.8.8.8, 1.1.1.1)');

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
const GENERATION_COOLDOWN = 0;
const REQUIRED_ROLE_ID = "1544637223058542642";
const MOD_ROLE_ID = "1544645742373765151";
const MOD_APP_CHANNEL_ID = "1545515386328326256";

const DONATION_LINKS = {
    paypal: 'https://paypal.me/yourusername',
    cashapp: 'https://cash.app/$yourusername',
    crypto: 'https://example.com/crypto'
};

// --- API CONFIG ---
const NAKAMA_SERVER = 'https://animalcompany.us-east1.nakamacloud.io';
const NAKAMA_SERVER_KEY = '6URuTSlDKKfYbuDW';
const API_URLS = [ NAKAMA_SERVER ];
let ACTIVE_API_URL = API_URLS[0];
let apiWorking = false;

// --- TOKEN STORAGE ---
let DEFAULT_TOKEN = {
  "bearer": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiI3YWQ2YjZkZS01MTk4LTRhYmMtYjk0ZC1kODZkZGI3OTRjNDciLCJ1aWQiOiI2ZmQ2MTBmNS1hMDcxLTQyZDgtYTdhMS0zZmE2MDdlNTZhNWIiLCJ1c24iOiJCS1c3dkRVUDJLT1FuUWxGIiwidnJzIjp7ImF1dGhJRCI6IjdhNTUxNjVmZGVjOTQ4YjQ5NTg5MmY5ODFkM2RkNjRlIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiA5Ljk5LjkuOTk5OV9mZmZmZmZmZiIsImRldmljZUlEIjoiMTgzNTc2MWMyYThiNmM2MjliOTlmZmY5ZWRmZjI4OWQ3ZjNlYTEyOCJ9LCJleHAiOjE3ODg0NjQwMjgsImlhdCI6MTc4ODQ1NTQwNX0.NYuM_TD_K5H74Gs-nLgb4Z7hhQ2BYXlU5Z36Ga4hgMw",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiI3YWQ2YjZkZS01MTk4LTRhYmMtYjk0ZC1kODZkZGI3OTRjNDciLCJ1aWQiOiI2ZmQ2MTBmNS1hMDcxLTQyZDgtYTdhMS0zZmE2MDdlNTZhNWIiLCJ1c24iOiJCS1c3dkRVUDJLT1FuUWxGIiwidnJzIjp7ImF1dGhJRCI6IjdhNTUxNjVmZGVjOTQ4YjQ5NTg5MmY5ODFkM2RkNjRlIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiA5Ljk5LjkuOTk5OV9mZmZmZmZmZiIsImRldmljZUlEIjoiMTgzNTc2MWMyYThiNmM2MjliOTlmZmY5ZWRmZjI4OWQ3ZjNlYTEyOCJ9LCJleHAiOjE3ODg0ODIwMjgsImlhdCI6MTc4ODQ1NTQwNX0.UKNLJKCb_1QaKGpAYKGrEh1wyKuEtxatr_rxhC5c0vc"
};
let tokenStock = [];
const cooldowns = new Map();
const activeGenerations = new Map();
let isGenerating = false;
const validCodes = new Set();
const userWarnings = new Map();
const logChannels = new Map();
let refreshBatchCounter = 0;
const removeStockMessages = new Map();
let refreshAttempts = 0;
let lastRefreshExpiry = 0;
const MAX_FAILS = 5;
let consecutiveFails = 0;

// --- Cache for full tokens (for copy buttons) ---
const tokenCache = new Map();
let isRefreshing = false;

// --- SUBSCRIPTION SYSTEM ---
const subscribedUsers = new Set();
const AUTO_DELIVERY_INTERVAL = 5 * 60 * 1000;
let deliveryInterval = null;

// --- MULTI-ACCOUNT SUPPORT ---
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
    if (accounts.length === 0) {
        const token = (process.env.INITIAL_TOKEN || '').trim();
        const refresh = (process.env.INITIAL_REFRESH_TOKEN || '').trim();
        if (token && refresh) {
            accounts.push({ token, refresh_token: refresh, label: 'account_1 (legacy)' });
        }
    }
    return accounts;
}
let accounts = loadAccounts();
let activeAccountLabel = accounts.length > 0 ? accounts[0].label : 'default';

function getActiveAccount() {
    for (const acc of accounts) {
        if (!isTokenExpiredObj({ bearer: acc.refresh_token })) return acc;
    }
    return null;
}
function switchToNextAccount(currentLabel) {
    const ordered = [...accounts].sort((a, b) => (a.label === currentLabel ? 1 : b.label === currentLabel ? -1 : 0));
    for (const acc of ordered) {
        if (acc.label === currentLabel) continue;
        if (!isTokenExpiredObj({ bearer: acc.refresh_token })) {
            console.log(`[INFO] [EAM.LOL] Switching to ${acc.label}`);
            return acc;
        }
    }
    return null;
}

// --- JWT HELPERS ---
function decodeJwt(token) {
    try {
        const part = (token || '').split('.')[1];
        if (!part) return null;
        const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(normalized + '===', 'base64').toString('utf-8');
        return JSON.parse(json);
    } catch (e) { return null; }
}

function getTokenExpiryMs(token) {
    const p = decodeJwt(token);
    if (p && typeof p.exp === 'number') {
        return p.exp * 1000;
    }
    console.warn('[WARN] [EAM.LOL] Token has no valid expiry claim, returning null.');
    return null;
}

function isTokenExpiredObj(tokenObj) {
    if (!tokenObj || !tokenObj.bearer) return true;
    const expiry = getTokenExpiryMs(tokenObj.bearer);
    if (expiry === null) return true;
    return Date.now() >= expiry;
}

function secondsUntilExpiry(tokenStr) {
    const expiry = getTokenExpiryMs(tokenStr);
    if (expiry === null) return null;
    return Math.floor((expiry - Date.now()) / 1000);
}

function formatRemainingTime(expiresAt) {
    if (expiresAt === null || isNaN(expiresAt)) return 'UNKNOWN';
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'EXPIRED';
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function humanExpiry(expiresAt) {
    if (expiresAt === null || isNaN(expiresAt)) return 'UNKNOWN';
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'EXPIRED';
    return `expires in ${formatRemainingTime(expiresAt)} (${new Date(expiresAt).toUTCString()})`;
}

// --- VALIDATION ---
async function validateTokenDetails(bearerToken, refreshToken = null) {
    const expiry = getTokenExpiryMs(bearerToken);
    const hasExpiry = expiry !== null;
    const expired = hasExpiry && Date.now() >= expiry;

    let refreshExpiry = null;
    let refreshExpired = false;
    let refreshHasExpiry = false;
    let refreshSecondsRemaining = null;

    if (refreshToken) {
        refreshExpiry = getTokenExpiryMs(refreshToken);
        refreshHasExpiry = refreshExpiry !== null;
        refreshExpired = refreshHasExpiry && Date.now() >= refreshExpiry;
        refreshSecondsRemaining = refreshHasExpiry ? Math.floor((refreshExpiry - Date.now()) / 1000) : null;
    }

    let apiValid = false;
    let apiError = null;
    try {
        const url = `${ACTIVE_API_URL}/v2/account/me`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.status === 200) {
            apiValid = true;
        } else if (response.status === 401 || response.status === 403) {
            apiValid = false;
            apiError = `Unauthorized (${response.status})`;
        } else if (response.status === 404) {
            apiValid = !expired;
            apiError = 'API endpoint not found, using JWT expiry';
        } else {
            apiValid = !expired;
            apiError = `HTTP ${response.status}`;
        }
    } catch (err) {
        apiValid = !expired;
        apiError = err.message;
    }

    return {
        valid: hasExpiry && !expired && apiValid,
        expired,
        expiry,
        hasExpiry,
        apiValid,
        apiError,
        secondsRemaining: hasExpiry ? Math.floor((expiry - Date.now()) / 1000) : null,
        refreshExpiry,
        refreshExpired,
        refreshHasExpiry,
        refreshSecondsRemaining
    };
}

// --- Refresh token (standalone) ---
async function refreshTokenOnly(refreshTk) {
    const refreshUrl = `${ACTIVE_API_URL}/v2/account/session/refresh`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const serverKeyAuth = 'Basic ' + Buffer.from(NAKAMA_SERVER_KEY + ':').toString('base64');
    try {
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
            throw new Error(`Non-JSON response (status ${response.status})`);
        }
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.message || `HTTP ${response.status}`);
        }
        const newBearer = data.token || data.access_token || data.bearer;
        const newRefresh = data.refresh_token || refreshTk;
        if (!newBearer) throw new Error('No token in response');
        const newExpiry = getTokenExpiryMs(newBearer);
        if (newExpiry === null || newExpiry <= Date.now()) throw new Error('Refreshed token already expired or invalid');
        return { success: true, bearer: newBearer, refresh: newRefresh, expiresAt: newExpiry };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// --- Global refresh ---
async function doRefresh(tokens) {
    const refreshUrl = `${ACTIVE_API_URL}/v2/account/session/refresh`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const serverKeyAuth = 'Basic ' + Buffer.from(NAKAMA_SERVER_KEY + ':').toString('base64');
    try {
        const response = await fetch(refreshUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'SteamVR 1.88.1.3421_a3df6ce5',
                'Authorization': serverKeyAuth
            },
            body: JSON.stringify({ token: tokens.refresh_token }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error(`Non-JSON response (status ${response.status})`);
        }
        const data = await response.json();
        if (!response.ok) {
            const err = new Error(data?.message || `HTTP ${response.status}`);
            err.httpCode = response.status;
            throw err;
        }
        const newBearer = data.token || data.access_token || data.bearer;
        const newRefresh = data.refresh_token || tokens.refresh_token;
        if (!newBearer) throw new Error('No token in response');
        if (newBearer === tokens.refresh_token) throw new Error('Refresh returned identical token');
        const newExpiry = getTokenExpiryMs(newBearer);
        if (newExpiry === null || newExpiry <= Date.now()) throw new Error('Refreshed token already expired or invalid');
        tokens.bearer = newBearer;
        tokens.refresh_token = newRefresh;
        console.log(`[SUCCESS] [EAM.LOL] Token refreshed! New expiry: ${new Date(newExpiry).toISOString()}`);
        return tokens;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

async function refreshToken(refreshTk) {
    if (!refreshTk) return { success: false, error: 'No refresh token' };
    try {
        const tokens = { bearer: DEFAULT_TOKEN.bearer, refresh_token: refreshTk };
        const result = await doRefresh(tokens);
        DEFAULT_TOKEN.bearer = result.bearer;
        DEFAULT_TOKEN.refresh_token = result.refresh_token;
        apiWorking = true;
        consecutiveFails = 0;
        lastRefreshExpiry = getTokenExpiryMs(result.bearer);
        updateAccountTokens(refreshTk, result.bearer, result.refresh_token);
        if (tokenStock.length > 0) {
            const old = tokenStock[0];
            tokenStock[0] = {
                bearer: result.bearer,
                refresh: result.refresh_token,
                addedAt: Date.now(),
                expiresAt: lastRefreshExpiry,
                id: old.id || generateGenerationId(),
                userId: old.userId || 'system',
                username: old.username || 'System'
            };
        } else {
            tokenStock.push({
                bearer: result.bearer,
                refresh: result.refresh_token,
                addedAt: Date.now(),
                expiresAt: lastRefreshExpiry,
                id: generateGenerationId(),
                userId: 'system',
                username: 'System'
            });
        }
        console.log(`[SUCCESS] [EAM.LOL] Token stock updated. New expiry: ${humanExpiry(lastRefreshExpiry)}`);
        return { success: true, bearer: result.bearer, refresh: result.refresh_token, expiresAt: lastRefreshExpiry };
    } catch (err) {
        const httpCode = err.httpCode || 0;
        if (httpCode === 401 || httpCode === 403) {
            console.log(`[WARN] [EAM.LOL] Auth error on ${activeAccountLabel} - trying next account...`);
            const nextAcc = switchToNextAccount(activeAccountLabel);
            if (nextAcc) {
                activeAccountLabel = nextAcc.label;
                DEFAULT_TOKEN.bearer = nextAcc.token;
                DEFAULT_TOKEN.refresh_token = nextAcc.refresh_token;
                const newExpiry = getTokenExpiryMs(nextAcc.token);
                if (tokenStock.length > 0) {
                    const old = tokenStock[0];
                    tokenStock[0] = {
                        bearer: nextAcc.token,
                        refresh: nextAcc.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: newExpiry,
                        id: old.id || generateGenerationId(),
                        userId: old.userId || 'system',
                        username: old.username || 'System'
                    };
                } else {
                    tokenStock.push({
                        bearer: nextAcc.token,
                        refresh: nextAcc.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: newExpiry,
                        id: generateGenerationId(),
                        userId: 'system',
                        username: 'System'
                    });
                }
                console.log(`[SUCCESS] [EAM.LOL] Switched to ${nextAcc.label} - new token ready`);
                return { success: true, bearer: nextAcc.token, refresh: nextAcc.refresh_token, expiresAt: newExpiry };
            }
            console.log('[ERROR] [EAM.LOL] All accounts exhausted');
        }
        return { success: false, error: err.message };
    }
}

function updateAccountTokens(oldRefresh, newBearer, newRefresh) {
    for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].refresh_token === oldRefresh) {
            accounts[i].token = newBearer;
            accounts[i].refresh_token = newRefresh;
            console.log(`[INFO] [EAM.LOL] Updated ${accounts[i].label}`);
            return;
        }
    }
    accounts.push({ token: newBearer, refresh_token: newRefresh, label: `account_${accounts.length + 1} (refreshed)` });
}

function giveNewTokenFromAccounts() {
    const acc = getActiveAccount();
    if (acc) {
        DEFAULT_TOKEN.bearer = acc.token;
        DEFAULT_TOKEN.refresh_token = acc.refresh_token;
        activeAccountLabel = acc.label;
        const newExpiry = getTokenExpiryMs(acc.token);
        if (tokenStock.length > 0) {
            const old = tokenStock[0];
            tokenStock[0] = {
                bearer: acc.token,
                refresh: acc.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: old.id || generateGenerationId(),
                userId: old.userId || 'system',
                username: old.username || 'System'
            };
        } else {
            tokenStock.push({
                bearer: acc.token,
                refresh: acc.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: generateGenerationId(),
                userId: 'system',
                username: 'System'
            });
        }
        console.log(`[SUCCESS] [EAM.LOL] New token loaded from ${acc.label} - expires ${new Date(newExpiry).toUTCString()}`);
    } else {
        console.log('[ERROR] [EAM.LOL] No valid accounts left! Falling back to hardcoded default token.');
        DEFAULT_TOKEN.bearer = DEFAULT_TOKEN.bearer;
        DEFAULT_TOKEN.refresh_token = DEFAULT_TOKEN.refresh_token;
        const newExpiry = getTokenExpiryMs(DEFAULT_TOKEN.bearer);
        if (tokenStock.length > 0) {
            const old = tokenStock[0];
            tokenStock[0] = {
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: old.id || generateGenerationId(),
                userId: old.userId || 'system',
                username: old.username || 'System'
            };
        } else {
            tokenStock.push({
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: generateGenerationId(),
                userId: 'system',
                username: 'System'
            });
        }
        console.log(`[WARN] [EAM.LOL] Using hardcoded default token - expires ${new Date(newExpiry).toUTCString()}`);
    }
}

// --- REFRESHER ---
async function refreshTokenInStock() {
    if (tokenStock.length === 0) {
        console.log('[INFO] [EAM.LOL] Stock empty - loading from accounts...');
        giveNewTokenFromAccounts();
        return;
    }
    
    const tokenObj = tokenStock[0];
    if (!tokenObj.refresh) {
        console.log('[ERROR] [EAM.LOL] No refresh token in stock - loading new token...');
        giveNewTokenFromAccounts();
        return;
    }

    console.log('[REFRESH] [EAM.LOL] 2:30 interval reached - Refreshing token...');
    try {
        const result = await refreshToken(tokenObj.refresh);
        if (result.success) {
            console.log(`[SUCCESS] [EAM.LOL] Token refreshed! New expiry: ${humanExpiry(result.expiresAt)}`);
            consecutiveFails = 0;
        } else {
            console.log('[ERROR] [EAM.LOL] Refresh failed - getting new token from accounts...');
            giveNewTokenFromAccounts();
        }
    } catch (err) {
        console.error('[ERROR] [EAM.LOL] Error during refresh:', err);
        giveNewTokenFromAccounts();
    }
}

function checkAndRemoveExpiredStock() {
    if (tokenStock.length === 0) return;
    const now = Date.now();
    const expiredTokens = tokenStock.filter(t => now >= t.expiresAt);
    if (expiredTokens.length > 0) {
        console.log(`[INFO] [EAM.LOL] Removing ${expiredTokens.length} expired token(s) from stock.`);
        tokenStock = tokenStock.filter(t => now < t.expiresAt);
        if (tokenStock.length === 0) giveNewTokenFromAccounts();
    }
}

const AUTO_REFRESH_INTERVAL = 150 * 1000;
let refreshInterval = null;
function startAutoRefresh() {
    console.log('[SYSTEM] [EAM.LOL] AUTO-REFRESH STARTED (interval: 2m 30s)');
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => {
        if (isRefreshing) {
            console.log('[INFO] [EAM.LOL] Refresh already in progress, skipping...');
            return;
        }
        isRefreshing = true;
        try {
            checkAndRemoveExpiredStock();
            await refreshTokenInStock();
        } catch (err) {
            console.error('[ERROR] [EAM.LOL] Auto-refresh error:', err);
        } finally {
            isRefreshing = false;
        }
    }, AUTO_REFRESH_INTERVAL);
}

// --- DELIVERY ---
async function deliverTokenToUser(user) {
    console.log(`[DELIVERY] Starting delivery to ${user.tag}`);

    if (tokenStock.length === 0) {
        console.log('[DELIVERY] Stock empty, loading from accounts...');
        giveNewTokenFromAccounts();
    }
    if (tokenStock.length === 0) {
        console.error('[DELIVERY] No stock token available after loading.');
        return;
    }

    let tokenObj = tokenStock[0];
    try {
        console.log('[DELIVERY] Refreshing stock token...');
        const refreshResult = await refreshToken(tokenObj.refresh);
        if (refreshResult.success) {
            tokenObj = tokenStock[0];
            console.log(`[DELIVERY] Refresh successful. New expiry: ${humanExpiry(tokenObj.expiresAt)}`);
        } else {
            console.log('[DELIVERY] Refresh failed, trying to load a new token from accounts...');
            giveNewTokenFromAccounts();
            tokenObj = tokenStock[0];
        }
    } catch (e) {
        console.error('[DELIVERY] Error during refresh:', e);
        giveNewTokenFromAccounts();
        tokenObj = tokenStock[0];
    }

    if (!tokenObj) {
        console.error('[DELIVERY] No token object after refresh/loading.');
        return;
    }

    console.log('[DELIVERY] Validating token...');
    let validation = await validateTokenDetails(tokenObj.bearer, tokenObj.refresh);
    if (!validation.valid) {
        console.log(`[DELIVERY] Token invalid (${validation.apiError || 'unknown'}), trying one more refresh...`);
        try {
            const retryResult = await refreshToken(tokenObj.refresh);
            if (retryResult.success) {
                tokenObj = tokenStock[0];
                validation = await validateTokenDetails(tokenObj.bearer, tokenObj.refresh);
                if (!validation.valid) {
                    console.error('[DELIVERY] Retry validation still failed. Skipping delivery.');
                    return;
                }
            } else {
                console.error('[DELIVERY] Retry refresh failed. Skipping delivery.');
                return;
            }
        } catch (e) {
            console.error('[DELIVERY] Error during retry refresh:', e);
            return;
        }
    }

    const ttl = Math.floor((tokenObj.expiresAt - Date.now()) / 1000);
    if (ttl <= 0) {
        console.error('[DELIVERY] Token TTL is <=0, skipping.');
        return;
    }

    const genId = generateGenerationId();
    const expiryText = humanExpiry(tokenObj.expiresAt);

    const tokenData = {
        token: {
            bearer: tokenObj.bearer,
            refresh_token: tokenObj.refresh,
            expires_at: new Date(tokenObj.expiresAt).toISOString(),
            seconds_remaining: ttl,
            added_at: new Date().toISOString(),
            generation_id: genId
        },
        message: "EAM.LOL Auto-Delivery (every 5 min)",
        credits: "@elliott",
        auto_refresh: "Refreshed automatically"
    };
    const jsonString = JSON.stringify(tokenData, null, 2);
    const jsonBuffer = Buffer.from(jsonString, 'utf-8');
    const attachment = new AttachmentBuilder(jsonBuffer, { name: 'token.json' });
    const textVersion = `EAM.LOL TOKEN GENERATOR\n----------------------------------------\nBEARER TOKEN:\n${tokenObj.bearer}\nREFRESH TOKEN:\n${tokenObj.refresh}\nGENERATION ID:\n${genId}\n----------------------------------------\nExpires: ${expiryText}\nSeconds left: ${ttl}s\nAuto-Refresh: Constantly\n----------------------------------------\n\n📌 IMPORTANT: Copy the BEARER TOKEN (the long string) and paste it into Animal Company.\nDo NOT add any spaces, quotes, or the word "Bearer".`;
    const textBuffer = Buffer.from(textVersion, 'utf-8');
    const textAttachment = new AttachmentBuilder(textBuffer, { name: 'token.txt' });

    const embed = new EmbedBuilder()
        .setTitle('◆ AUTO-DELIVERED TOKEN ◆')
        .setDescription(`Fresh token – valid for ~${Math.floor(ttl/60)} minutes.`)
        .setColor(0x00FFAA)
        .addFields(
            { name: 'Generation ID', value: genId, inline: true },
            { name: 'Expires', value: expiryText, inline: true },
            { name: '🔑 How to use', value: 'Open the **token.txt** file, copy the **BEARER TOKEN** (the long string) and paste it into Animal Company. **Do not add extra spaces or quotes.**', inline: false }
        )
        .setFooter({ text: 'EAM.LOL | Auto-Subscription (5 min interval) – 100% free' });

    try {
        await user.send({ embeds: [embed], files: [attachment, textAttachment] });
        console.log(`[DELIVERY] ✅ Valid token sent to ${user.tag}`);
    } catch (err) {
        console.error(`[ERROR] Could not DM subscribed user ${user.id}:`, err);
    }
}

function startDeliveryLoop() {
    if (deliveryInterval) clearInterval(deliveryInterval);
    deliveryInterval = setInterval(async () => {
        if (subscribedUsers.size === 0) return;
        console.log(`[DELIVERY] Sending tokens to ${subscribedUsers.size} subscriber(s)...`);
        for (const userId of subscribedUsers) {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) await deliverTokenToUser(user);
        }
    }, AUTO_DELIVERY_INTERVAL);
}

async function catchUpSubscribers() {
    if (subscribedUsers.size === 0) return;
    console.log(`[STARTUP] Catching up ${subscribedUsers.size} subscribers...`);
    for (const userId of subscribedUsers) {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) await deliverTokenToUser(user);
    }
}

// --- HELPERS ---
function generateGenerationId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'GEN-';
    for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
}

function removeTokenById(id) {
    const idx = tokenStock.findIndex(t => t.id === id);
    if (idx === -1) return { success: false, message: 'No token found with that ID.' };
    tokenStock.splice(idx, 1);
    return { success: true, message: `Token \`${id}\` removed. Remaining: ${tokenStock.length}` };
}

// --- ROLE CHECKS ---
function hasRequiredRole(interaction) {
    return interaction.member?.roles?.cache?.has(REQUIRED_ROLE_ID) || false;
}

function hasAdminAccess(interaction) {
    if (interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID)) return true;
    return false;
}

async function findWorkingApiUrl() {
    for (const url of API_URLS) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' }, signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.status < 500) {
                ACTIVE_API_URL = url;
                apiWorking = true;
                return url;
            }
        } catch (e) {}
    }
    apiWorking = false;
    return API_URLS[0];
}

function forceSetOwnToken(bearer, refresh) {
    DEFAULT_TOKEN.bearer = bearer;
    DEFAULT_TOKEN.refresh_token = refresh;
    lastRefreshExpiry = getTokenExpiryMs(bearer);
    tokenStock = [{ bearer, refresh, addedAt: Date.now(), expiresAt: lastRefreshExpiry }];
    console.log(`[SUCCESS] [EAM.LOL] Token manually set! Expires: ${new Date(lastRefreshExpiry).toUTCString()}`);
}

// --- UI HELPERS ---
function buildSleekProgress(step, total = 4, width = 16) {
    const filled = Math.round((step / total) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function getLiveUIStats(interaction) {
    const time = new Date().toLocaleString();
    const userName = interaction.user.tag;
    return `System Time: ${time} | Requested by: ${userName}`;
}

async function updateGenerationEmbed(interaction, step, message, ttl = null) {
    const stepLabels = ['DM Verification', 'Token Refresh', 'Finalizing', 'Delivery'];
    const statusIcons = stepLabels.map((label, idx) => {
        if (idx < step) return '●';
        if (idx === step) return '○';
        return '○';
    });
    const statusLines = stepLabels.map((label, idx) => {
        const icon = statusIcons[idx];
        let suffix = '';
        if (idx === step) suffix = '  ⟳';
        else if (idx < step) suffix = '  ✔';
        return `${icon} ${label}${suffix}`;
    }).join('\n');

    const progress = buildSleekProgress(step, 4);
    const percent = Math.round((step / 4) * 100);

    const embed = new EmbedBuilder()
        .setTitle('◆ EAM.LOL TOKEN GENERATOR ◆')
        .setDescription(
            `\`${progress}  ${percent}%\`\n\n` +
            `${statusLines}`
        )
        .addFields(
            { name: 'STATUS', value: '● OPERATIONAL', inline: true },
            { name: 'STOCK', value: `${tokenStock.length} tokens`, inline: true },
            { name: 'TTL', value: `${ttl ? ttl+'s' : '...'}`, inline: true }
        )
        .setColor(0x44AAFF)
        .setFooter({ text: getLiveUIStats(interaction) });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cancel_gen')
            .setLabel('✕ CANCEL')
            .setStyle(ButtonStyle.Danger)
    );
    await interaction.editReply({ embeds: [embed], components: [row] });
}

// --- PROCESS TOKEN GENERATION ---
async function processTokenGeneration(interaction, tierName) {
    const userId = interaction.user.id;
    const member = interaction.member;
    await interaction.deferReply({ flags: 64 });

    const hasNoCooldown = member?.roles?.cache?.has(NO_COOLDOWN_ROLE_ID) || false;
    if (!hasNoCooldown) {
        const cooldownKey = `public_${userId}`;
        if (cooldowns.has(cooldownKey)) {
            const cooldownEnd = cooldowns.get(cooldownKey);
            if (Date.now() < cooldownEnd) {
                const remaining = cooldownEnd - Date.now();
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                return interaction.editReply({ content: `Please wait ${minutes}m ${seconds}s.`, components: [] });
            }
        }
    }
    if (activeGenerations.has(userId)) {
        const gen = activeGenerations.get(userId);
        if (Date.now() - gen.startTime < 60000) {
            return interaction.editReply({ content: 'Generation already in progress.', components: [] });
        } else activeGenerations.delete(userId);
    }
    const genContext = { startTime: Date.now(), interaction, cancelFlag: false };
    activeGenerations.set(userId, genContext);

    await updateGenerationEmbed(interaction, 1, 'Verifying DM connection...');
    try {
        const testDM = await interaction.user.send({ content: 'EAM.LOL — DM verified.' });
        await testDM.delete();
    } catch (dmError) {
        activeGenerations.delete(userId);
        return interaction.editReply({ content: 'DM Error: Please enable DMs.', components: [] });
    }

    await updateGenerationEmbed(interaction, 2, 'Fetching fresh token...');
    if (tokenStock.length === 0) giveNewTokenFromAccounts();
    if (tokenStock.length === 0) {
        activeGenerations.delete(userId);
        return interaction.editReply({ content: 'No tokens available.', components: [] });
    }
    isGenerating = true;
    let tokenObj = tokenStock[0];
    try {
        const refreshResult = await refreshToken(tokenObj.refresh);
        if (refreshResult.success) tokenObj = tokenStock[0];
        else { giveNewTokenFromAccounts(); if (tokenStock.length > 0) tokenObj = tokenStock[0]; }
    } catch (e) { giveNewTokenFromAccounts(); if (tokenStock.length > 0) tokenObj = tokenStock[0]; }
    if (!tokenObj || Date.now() >= tokenObj.expiresAt) {
        isGenerating = false;
        activeGenerations.delete(userId);
        return interaction.editReply({ content: 'Token expired, no replacement.', components: [] });
    }
    const ttl = Math.floor((tokenObj.expiresAt - Date.now()) / 1000);
    if (ttl <= 0) {
        isGenerating = false;
        activeGenerations.delete(userId);
        return interaction.editReply({ content: 'Token expired, try again.', components: [] });
    }

    const validation = await validateTokenDetails(tokenObj.bearer, tokenObj.refresh);
    if (!validation.valid) {
        isGenerating = false;
        activeGenerations.delete(userId);
        return interaction.editReply({ content: `Token validation failed: ${validation.apiError || 'unknown error'}`, components: [] });
    }

    await updateGenerationEmbed(interaction, 3, `Finalizing (${ttl}s left)...`, ttl);
    const genId = generateGenerationId();
    tokenObj.id = genId;
    tokenObj.userId = interaction.user.id;
    tokenObj.username = interaction.user.tag;
    if (!hasNoCooldown) cooldowns.set(`public_${userId}`, Date.now() + GENERATION_COOLDOWN);

    await updateGenerationEmbed(interaction, 4, 'Sending to DMs...', ttl);
    const expiryText = humanExpiry(tokenObj.expiresAt);
    const tokenData = {
        token: {
            bearer: tokenObj.bearer,
            refresh_token: tokenObj.refresh,
            expires_at: new Date(tokenObj.expiresAt).toISOString(),
            seconds_remaining: ttl,
            added_at: new Date().toISOString(),
            generation_id: genId
        },
        message: "EAM.LOL Token Generator",
        credits: "@elliott",
        auto_refresh: "Refreshed automatically"
    };
    const jsonString = JSON.stringify(tokenData, null, 2);
    const jsonBuffer = Buffer.from(jsonString, 'utf-8');
    const attachment = new AttachmentBuilder(jsonBuffer, { name: 'token.json' });

    const textVersion = `EAM.LOL TOKEN GENERATOR\n----------------------------------------\nBEARER TOKEN:\n${tokenObj.bearer}\nREFRESH TOKEN:\n${tokenObj.refresh}\nGENERATION ID:\n${genId}\n----------------------------------------\nExpires: ${expiryText}\nSeconds left: ${ttl}s\nAuto-Refresh: Constantly\n----------------------------------------\n\n📌 IMPORTANT: Copy the BEARER TOKEN (the long string) and paste it into Animal Company.\nDo NOT add any spaces, quotes, or the word "Bearer".`;
    const textBuffer = Buffer.from(textVersion, 'utf-8');
    const textAttachment = new AttachmentBuilder(textBuffer, { name: 'token.txt' });

    const successEmbed = new EmbedBuilder()
        .setTitle('◆ SECURE TOKEN RECEIPT ◆')
        .setDescription(
            '```\n' +
            '------------------------------------------------\n' +
            ' ◆ EAM.LOL SECURE TOKEN RECEIPT ◆\n' +
            '------------------------------------------------\n' +
            ' STATUS      :  ✔ VALID\n' +
            ' EXPIRATION  :  ' + expiryText + '\n' +
            ' GENERATION  :  ' + genId + '\n' +
            ' REMINING    :  ' + ttl + 's\n' +
            '------------------------------------------------\n' +
            ' Files attached below.\n' +
            '```'
        )
        .addFields(
            { name: '🔑 How to use', value: 'Open **token.txt**, copy the **BEARER TOKEN** (the long string) and paste it into Animal Company. **No extra spaces, quotes, or "Bearer".**', inline: false }
        )
        .setColor(0x00FFAA)
        .setFooter({ text: 'EAM.LOL | Secure Token Service – 100% free' });

    try {
        await interaction.user.send({ embeds: [successEmbed], files: [attachment, textAttachment] });
        isGenerating = false;
        activeGenerations.delete(userId);
        return interaction.editReply({
            content: `Token sent to DMs | ID: \`${genId}\` | ${expiryText}`,
            components: []
        });
    } catch (err) {
        console.error('[ERROR] [EAM.LOL] DM Error:', err);
        isGenerating = false;
        activeGenerations.delete(userId);
        return interaction.editReply({ content: 'Could not send DM. Please open your DMs.', components: [] });
    }
}

// --- STOCK PAGINATION ---
let stockPage = 0;
const STOCK_PER_PAGE = 5;
async function showRemoveStock(interaction, page = 0) {
    const entries = tokenStock.filter(t => t.id && t.id.length > 0).map(t => ({ id: t.id, userId: t.userId, username: t.username || `<@${t.userId}>` }));
    if (entries.length === 0) return interaction.reply({ content: 'No active generation IDs.', flags: 64 });
    const totalPages = Math.ceil(entries.length / STOCK_PER_PAGE);
    const start = page * STOCK_PER_PAGE;
    const pageEntries = entries.slice(start, start + STOCK_PER_PAGE);
    const embed = new EmbedBuilder()
        .setTitle('◆ REMOVE TOKEN ◆')
        .setDescription(`**${entries.length}** active tokens | Page ${page+1}/${totalPages}`)
        .setColor(0xED4245);
    pageEntries.forEach(entry => embed.addFields({ name: `\`${entry.id}\``, value: `User: ${entry.username}`, inline: false }));
    const row = new ActionRowBuilder();
    pageEntries.forEach(entry => row.addComponents(new ButtonBuilder().setCustomId(`remove_${entry.id}`).setLabel(`Remove ${entry.id}`).setStyle(ButtonStyle.Danger)));
    const navRow = new ActionRowBuilder();
    if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId('stock_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary));
    if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId('stock_next').setLabel('Next').setStyle(ButtonStyle.Secondary));
    const components = [row];
    if (navRow.components.length > 0) components.push(navRow);
    await interaction.reply({ embeds: [embed], components, flags: 64 });
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
    new SlashCommandBuilder().setName('donate-panel').setDescription('Post a donation panel with payment links.'),
    new SlashCommandBuilder().setName('donation-panel').setDescription('Post a panel to donate tokens by pasting JSON.'),
    new SlashCommandBuilder().setName('check-panel').setDescription('Post a panel to check/validate a token from JSON.'),
    new SlashCommandBuilder().setName('split-panel').setDescription('Post a panel to split a token JSON into bearer and refresh.'),
    new SlashCommandBuilder().setName('announce').setDescription('DM all members with your announcement message.').addStringOption(opt => opt.setName('message').setDescription('The announcement message').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('check-expiry').setDescription('Check when a token expires (based on JWT exp claim)').addStringOption(opt => opt.setName('token').setDescription('The token to check').setRequired(true)),
    new SlashCommandBuilder().setName('subscribe').setDescription('Subscribe to automatic token deliveries in DMs (every 5 minutes)'),
    new SlashCommandBuilder().setName('unsubscribe').setDescription('Stop automatic token deliveries'),
    new SlashCommandBuilder().setName('subscription-panel').setDescription('Post an interactive subscription panel with Subscribe/Unsubscribe buttons').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('mod-application-panel')
        .setDescription('Post a panel for users to apply for moderator')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

// --- READY ---
client.once('ready', async () => {
    console.log(`[SYSTEM] [EAM.LOL] ONLINE: ${client.user.tag}`);
    tokenStock = [{ bearer: DEFAULT_TOKEN.bearer, refresh: DEFAULT_TOKEN.refresh_token, addedAt: Date.now(), expiresAt: getTokenExpiryMs(DEFAULT_TOKEN.bearer) }];
    await findWorkingApiUrl();
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
        console.log('[SUCCESS] [EAM.LOL] Slash commands registered');
    } catch (error) { console.error('[ERROR] [EAM.LOL] Failed to register commands:', error); }
    startAutoRefresh();
    startDeliveryLoop();
    await catchUpSubscribers();
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
    try {
        // --- SLASH COMMANDS ---
        if (interaction.isChatInputCommand()) {
            if (!hasRequiredRole(interaction)) {
                console.log(`[ACCESS DENIED] ${interaction.user.tag} tried to use /${interaction.commandName} but lacks role ${REQUIRED_ROLE_ID}`);
                return interaction.reply({
                    content: `⛔ You need the <@&${REQUIRED_ROLE_ID}> role to use any bot commands.`,
                    flags: 64
                });
            }

            const { commandName, options } = interaction;

            // --- SUBSCRIPTION COMMANDS (ephemeral is fine) ---
            if (commandName === 'subscribe') {
                await interaction.deferReply({ flags: 64 });
                if (subscribedUsers.has(interaction.user.id)) {
                    return interaction.editReply({ content: 'You are already subscribed!', flags: 64 });
                }
                subscribedUsers.add(interaction.user.id);
                await deliverTokenToUser(interaction.user);
                return interaction.editReply({ content: '✅ You will now receive a fresh token in your DMs **every 5 minutes**!', flags: 64 });
            }

            if (commandName === 'unsubscribe') {
                await interaction.deferReply({ flags: 64 });
                if (!subscribedUsers.has(interaction.user.id)) {
                    return interaction.editReply({ content: 'You are not subscribed.', flags: 64 });
                }
                subscribedUsers.delete(interaction.user.id);
                return interaction.editReply({ content: '❌ You have unsubscribed from automatic token deliveries.', flags: 64 });
            }

            // --- SUBSCRIPTION PANEL (VISIBLE TO EVERYONE - NOT EPHEMERAL) ---
            if (commandName === 'subscription-panel') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied – Admin only to post panel.', flags: 64 });

                const embed = new EmbedBuilder()
                    .setTitle('🔔 SUBSCRIPTION PANEL')
                    .setDescription(
                        '**How to use this panel:**\n' +
                        '1️⃣ Click **✅ Subscribe** – you\'ll get a fresh token in your DMs **every 5 minutes**.\n' +
                        '2️⃣ Click **❌ Unsubscribe** – stop receiving tokens.\n' +
                        '3️⃣ Open your DMs – the bot will send you a new token immediately and then every 5 minutes.\n\n' +
                        '**💸 Cost:** Absolutely **free** – no payments, no subscriptions, no hidden fees.'
                    )
                    .setColor(0x5865F2)
                    .addFields(
                        { name: '📊 Current Status', value: 'Click a button to toggle your subscription.', inline: false }
                    )
                    .setFooter({ text: 'EAM.LOL | Auto-Subscription (5 min interval) – 100% free' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('subscribe_panel')
                            .setLabel('✅ Subscribe')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('unsubscribe_panel')
                            .setLabel('❌ Unsubscribe')
                            .setStyle(ButtonStyle.Danger)
                    );

                // Send as a regular message – visible to everyone
                await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
                return;
            }

            // --- MOD APPLICATION PANEL (VISIBLE TO EVERYONE) ---
            if (commandName === 'mod-application-panel') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied – Admin only to post panel.', flags: 64 });

                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Moderator Application')
                    .setDescription(
                        'We are looking for dedicated community members to join our moderation team.\n\n' +
                        '**Requirements:**\n' +
                        '• Active in the community\n' +
                        '• Mature and respectful\n' +
                        '• Willing to help others\n\n' +
                        'Click the button below to start your application.'
                    )
                    .setColor(0x3498DB)
                    .setFooter({ text: 'Applications are reviewed by staff.' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('mod_app_apply')
                            .setLabel('📝 Apply Now')
                            .setStyle(ButtonStyle.Primary)
                    );

                // Send as a regular message – visible to everyone
                await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
                return;
            }

            // --- PUBLIC PANELS (POSTED TO CHANNEL) ---
            if (commandName === 'donate-panel' || commandName === 'donation-panel' || commandName === 'check-panel' || commandName === 'split-panel') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied – Admin only to post panel.', flags: 64 });
                
                // DONATE PANEL
                if (commandName === 'donate-panel') {
                    const embed = new EmbedBuilder()
                        .setTitle('◆ SUPPORT THE PROJECT ◆')
                        .setDescription('> Your contributions keep this bot alive and the tokens flowing.\n> Choose a platform below to send a donation.')
                        .addFields(
                            { name: 'PayPal', value: `[Click to donate](${DONATION_LINKS.paypal})`, inline: true },
                            { name: 'CashApp', value: `[Click to donate](${DONATION_LINKS.cashapp})`, inline: true },
                            { name: 'Crypto', value: `[Click to donate](${DONATION_LINKS.crypto})`, inline: true }
                        )
                        .setColor(0xF1C40F)
                        .setFooter({ text: getLiveUIStats(interaction) });
                    const row1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setLabel('PayPal').setStyle(ButtonStyle.Link).setURL(DONATION_LINKS.paypal),
                        new ButtonBuilder().setLabel('CashApp').setStyle(ButtonStyle.Link).setURL(DONATION_LINKS.cashapp),
                        new ButtonBuilder().setLabel('Crypto').setStyle(ButtonStyle.Link).setURL(DONATION_LINKS.crypto)
                    );
                    const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('donate_info').setLabel('More Info').setStyle(ButtonStyle.Secondary));
                    return interaction.reply({ embeds: [embed], components: [row1, row2] });
                }

                // DONATION PANEL
                if (commandName === 'donation-panel') {
                    const embed = new EmbedBuilder()
                        .setTitle('◆ DONATE A TOKEN ◆')
                        .setDescription('> Paste a valid JSON containing `token` (bearer) and `refresh_token`.\n> The bot will validate and add it to the stock.')
                        .addFields(
                            { name: 'STEP 1', value: 'Copy the token JSON from your client', inline: true },
                            { name: 'STEP 2', value: 'Paste it into the modal', inline: true },
                            { name: 'STEP 3', value: 'Hit Donate - it gets added to stock!', inline: true }
                        )
                        .setColor(0x5865F2)
                        .setFooter({ text: getLiveUIStats(interaction) });
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('donate_token_btn').setLabel('Donate Token').setStyle(ButtonStyle.Success));
                    return interaction.reply({ embeds: [embed], components: [row] });
                }

                // CHECK PANEL
                if (commandName === 'check-panel') {
                    const embed = new EmbedBuilder()
                        .setTitle('◆ CHECK TOKEN ◆')
                        .setDescription('> Paste a JSON containing `token` (or bearer) and `refresh_token`.\n> The bot will extract and validate them.')
                        .addFields(
                            { name: 'STEP 1', value: 'Paste JSON', inline: true },
                            { name: 'STEP 2', value: 'Click Check', inline: true },
                            { name: 'RESULT', value: 'JWT & API Validation', inline: true }
                        )
                        .setColor(0x3498DB)
                        .setFooter({ text: getLiveUIStats(interaction) });
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('check_token_btn').setLabel('Check Token').setStyle(ButtonStyle.Primary));
                    return interaction.reply({ embeds: [embed], components: [row] });
                }

                // SPLIT PANEL
                if (commandName === 'split-panel') {
                    const embed = new EmbedBuilder()
                        .setTitle('◆ SPLIT TOKEN ◆')
                        .setDescription('> Paste a JSON containing `token` (or bearer) and `refresh_token`.\n> The bot will extract and return them separately.')
                        .addFields(
                            { name: 'STEP 1', value: 'Paste JSON', inline: true },
                            { name: 'STEP 2', value: 'Click Split', inline: true },
                            { name: 'OUTPUT', value: 'Separate Bearer & Refresh', inline: true }
                        )
                        .setColor(0x2ECC71)
                        .setFooter({ text: getLiveUIStats(interaction) });
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('split_token_btn').setLabel('Split Token').setStyle(ButtonStyle.Success));
                    return interaction.reply({ embeds: [embed], components: [row] });
                }
            }

            // --- FAST COMMANDS (no defer needed) ---
            const fastCommands = ['ping', '8ball', 'help', 'serverinfo'];
            if (fastCommands.includes(commandName)) {
                if (commandName === 'ping') {
                    return interaction.reply({ content: `Pong! ${client.ws.ping}ms`, flags: 64 });
                }
                if (commandName === '8ball') {
                    const question = options.getString('question');
                    const answers = ['Yes.', 'No.', 'Maybe.', 'Definitely.', 'Ask again later.', 'Outlook not so good.'];
                    const ans = answers[Math.floor(Math.random() * answers.length)];
                    const embed = new EmbedBuilder().setTitle('◆ 8-BALL ◆').addFields({ name: 'Question', value: question }, { name: 'Answer', value: ans }).setColor(0x3498DB);
                    return interaction.reply({ embeds: [embed] });
                }
                if (commandName === 'help') {
                    const embed = new EmbedBuilder().setTitle("◆ EAM.LOL COMMAND INTERFACE ◆").setDescription(
                        `> Welcome to the EAM.LOL Command Interface.\n> All commands are listed below.`
                    )
                    .addFields(
                        { name: '◆ GENERATION', value: '/token - Generate a fresh token\n/generator - Post the generator panel', inline: true },
                        { name: '◆ SUBSCRIPTION', value: '/subscribe - Get tokens in DMs every 5 min\n/unsubscribe - Stop auto-delivery\n/subscription-panel - Post interactive panel (admin)', inline: true },
                        { name: '◆ MODERATION', value: '/mod-application-panel - Post the mod application panel (admin)', inline: true },
                        { name: '◆ UTILITIES', value: '/check-expiry - Check expiry of a raw token\n/check-panel - Check/validate a token from JSON', inline: true },
                        { name: '◆ EXTRAS', value: '/donation-panel - Donate a token\n/split-panel - Split a token JSON', inline: true },
                        { name: '◆ ADMIN ONLY', value: '/stock - Add token stock\n/force_refresh - Force refresh\n/announce - DM all members', inline: true }
                    )
                    .setColor(0x3498DB)
                    .addFields({ name: 'Credits', value: '@elliott', inline: true })
                    .setFooter({ text: getLiveUIStats(interaction) });
                    return interaction.reply({ embeds: [embed], flags: 64 });
                }
                if (commandName === 'serverinfo') {
                    const guild = interaction.guild;
                    const embed = new EmbedBuilder().setTitle(`◆ Server: ${guild.name} ◆`).setThumbnail(guild.iconURL())
                        .addFields(
                            { name: 'Members', value: `${guild.memberCount}`, inline: true },
                            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>`, inline: true },
                            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true }
                        ).setColor(0x3498DB).setTimestamp();
                    return interaction.reply({ embeds: [embed] });
                }
            }

            // --- ALL OTHER COMMANDS (deferred, ephemeral is fine) ---
            await interaction.deferReply({ flags: 64 });

            // --- TOKEN GENERATION ---
            if (commandName === 'token') {
                await processTokenGeneration(interaction, 'Public Token');
                return;
            }

            // --- ANNOUNCE ---
            if (commandName === 'announce') {
                if (!hasAdminAccess(interaction)) return interaction.editReply({ content: 'You need admin permissions to use this command.', flags: 64 });
                const messageContent = options.getString('message');
                const guild = interaction.guild;
                if (!guild) return interaction.editReply({ content: 'This command can only be used in a server.' });
                const members = await guild.members.fetch();
                let successCount = 0;
                let failCount = 0;
                const total = members.size;
                await interaction.editReply({ content: `Sending DMs to ${total} members... (0/${total})` });
                let index = 0;
                for (const [id, member] of members) {
                    if (member.user.bot) continue;
                    try {
                        await member.send({ embeds: [new EmbedBuilder().setTitle('◆ ANNOUNCEMENT ◆').setDescription(messageContent).setColor(0xFFAA00).setTimestamp().setFooter({ text: `From ${guild.name}` })] });
                        successCount++;
                    } catch (err) { failCount++; }
                    index++;
                    if (index % 10 === 0 || index === total) await interaction.editReply({ content: `Sending DMs... (${index}/${total})` });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                return interaction.editReply({ content: `Announcement DMs sent! ${successCount} succeeded, ${failCount} failed (skipped bots).` });
            }

            // --- CHECK-EXPIRY ---
            if (commandName === 'check-expiry') {
                const token = options.getString('token');
                const expiry = getTokenExpiryMs(token);
                const hasExpiry = expiry !== null;
                const isExpired = hasExpiry && Date.now() >= expiry;
                const remaining = hasExpiry ? secondsUntilExpiry(token) : null;
                const embed = new EmbedBuilder()
                    .setTitle('◆ EXPIRY CHECK ◆')
                    .addFields(
                        { name: 'Status', value: isExpired ? 'EXPIRED' : (hasExpiry ? 'VALID' : 'UNKNOWN'), inline: true },
                        { name: 'Expires At', value: hasExpiry ? new Date(expiry).toUTCString() : 'N/A', inline: true },
                        { name: 'Remaining', value: hasExpiry ? (isExpired ? '0s' : `${remaining}s`) : 'UNKNOWN', inline: true }
                    )
                    .setColor(isExpired ? 0xED4245 : (hasExpiry ? 0x2ECC71 : 0xFEE75C))
                    .setFooter({ text: getLiveUIStats(interaction) });
                return interaction.editReply({ embeds: [embed], flags: 64 });
            }

            // --- ADMIN COMMANDS ---
            const adminCommands = ['stock', 'stock_main', 'generator', 'force_refresh', 'remove-stock', 'reset-stock', 'gen-codes', 'remove-token', 'refresh_cooldown_all', 'panel'];
            if (adminCommands.includes(commandName)) {
                if (!hasAdminAccess(interaction)) return interaction.editReply({ content: 'Access Denied.', flags: 64 });

                if (commandName === 'stock_main') {
                    const bearer = options.getString('bearer');
                    const refresh = options.getString('refresh');
                    if (!bearer || !refresh) return interaction.editReply({ content: 'Both tokens required.' });
                    forceSetOwnToken(bearer, refresh);
                    const embed = new EmbedBuilder().setTitle('◆ MAIN TOKEN UPDATED ◆').setDescription('Token updated successfully.').setColor(0x2ECC71).addFields({ name: 'Valid For', value: humanExpiry(lastRefreshExpiry), inline: true }, { name: 'Stock', value: `${tokenStock.length} token(s)`, inline: true }, { name: 'Ping', value: `${client.ws.ping}ms`, inline: true });
                    return interaction.editReply({ embeds: [embed] });
                }

                if (commandName === 'stock') {
                    const modal = new ModalBuilder().setCustomId('stock_modal').setTitle('Add Token Stock');
                    const bearerInput = new TextInputBuilder().setCustomId('stock_bearer_input').setLabel("BEARER TOKEN").setStyle(TextInputStyle.Paragraph).setPlaceholder("eyJhbGci...").setRequired(true).setMinLength(10).setMaxLength(2000);
                    const refreshInput = new TextInputBuilder().setCustomId('stock_refresh_input').setLabel("REFRESH TOKEN").setStyle(TextInputStyle.Paragraph).setPlaceholder("eyJhbGci...").setRequired(true).setMinLength(10).setMaxLength(2000);
                    modal.addComponents(new ActionRowBuilder().addComponents(bearerInput), new ActionRowBuilder().addComponents(refreshInput));
                    return await interaction.showModal(modal);
                }

                if (commandName === 'generator') {
                    const createGenEmbed = () => {
                        return new EmbedBuilder()
                            .setTitle('◆ EAM.LOL TOKEN GENERATOR ◆')
                            .setDescription('> Secure, one-click generation with live status.\n> Tokens are auto-refreshed for maximum lifespan.')
                            .addFields(
                                { name: 'SYSTEM STATUS', value: '● OPERATIONAL', inline: true },
                                { name: 'TOKENS IN STOCK', value: `${tokenStock.length}`, inline: true },
                                { name: 'COOLDOWN', value: '0s', inline: true },
                                { name: 'AUTO-REFRESH', value: '2m 30s', inline: true },
                                { name: 'DELIVERY', value: 'Direct Message', inline: true },
                                { name: 'LATENCY', value: `${client.ws.ping}ms`, inline: true }
                            )
                            .setColor(0x5865F2)
                            .setFooter({ text: getLiveUIStats(interaction) });
                    };
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gen_public').setLabel('GENERATE TOKEN').setStyle(ButtonStyle.Success));
                    const message = await interaction.editReply({ embeds: [createGenEmbed()], components: [row] });
                    const updateInterval = setInterval(async () => {
                        try {
                            const fetchedMsg = await interaction.channel.messages.fetch(message.id);
                            await fetchedMsg.edit({ embeds: [createGenEmbed()], components: [row] });
                        } catch (err) {
                            clearInterval(updateInterval);
                        }
                    }, 10000);
                    return;
                }

                if (commandName === 'force_refresh') {
                    if (tokenStock.length === 0) return interaction.editReply({ content: 'No token in stock.' });
                    try {
                        const result = await refreshToken(tokenStock[0].refresh);
                        if (result.success) {
                            const embed = new EmbedBuilder().setTitle('◆ TOKEN REFRESHED ◆').setDescription('Token refreshed successfully.').setColor(0x2ECC71)
                                .addFields({ name: 'Expiry', value: humanExpiry(tokenStock[0].expiresAt), inline: true }, { name: 'Stock', value: `${tokenStock.length} token(s)`, inline: true }, { name: 'Ping', value: `${client.ws.ping}ms`, inline: true });
                            return interaction.editReply({ embeds: [embed] });
                        } else return interaction.editReply({ content: 'Refresh failed - will retry.' });
                    } catch (err) { return interaction.editReply({ content: 'Refresh failed - will retry.' }); }
                }

                if (commandName === 'remove-stock') {
                    stockPage = 0;
                    return await showRemoveStock(interaction, 0);
                }

                if (commandName === 'reset-stock') {
                    lastRefreshExpiry = getTokenExpiryMs(DEFAULT_TOKEN.bearer);
                    tokenStock = [{ bearer: DEFAULT_TOKEN.bearer, refresh: DEFAULT_TOKEN.refresh_token, addedAt: Date.now(), expiresAt: lastRefreshExpiry }];
                    return interaction.editReply({ content: 'Stock reset to default.', flags: 64 });
                }

                if (commandName === 'remove-token') {
                    const id = options.getString('id').trim();
                    const result = removeTokenById(id);
                    return interaction.editReply({ content: result.success ? `Success: ${result.message}` : `Error: ${result.message}`, flags: 64 });
                }

                if (commandName === 'gen-codes') {
                    const entries = tokenStock.filter(t => t.id && t.id.length > 0).map(t => ({ id: t.id, username: t.username || `<@${t.userId}>` }));
                    if (entries.length === 0) return interaction.editReply({ content: 'No active IDs.', flags: 64 });
                    const embed = new EmbedBuilder().setTitle('◆ ACTIVE GENERATION IDS ◆').setDescription(`**${entries.length}** active token(s)`).setColor(0x5865F2);
                    entries.forEach(entry => embed.addFields({ name: `\`${entry.id}\``, value: `User: ${entry.username}`, inline: false }));
                    return interaction.editReply({ embeds: [embed], flags: 64 });
                }

                if (commandName === 'refresh_cooldown_all') {
                    const count = cooldowns.size;
                    cooldowns.clear();
                    return interaction.editReply({ content: `Cooldowns reset! ${count} cleared.`, flags: 64 });
                }

                if (commandName === 'panel') {
                    const subArg = options.getString('type');
                    if (subArg === 'generator') {
                        const embed = new EmbedBuilder().setTitle('◆ EAM.LOL TOKEN GENERATOR ◆').setDescription('> Generate your token below.\n\n> DMs must be open.').setColor(0x5865F2).setFooter({ text: 'Never expires' });
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gen_public').setLabel('GENERATE').setStyle(ButtonStyle.Success));
                        return interaction.editReply({ embeds: [embed], components: [row], ephemeral: false });
                    }
                    if (subArg === 'verify') {
                        const embed = new EmbedBuilder().setTitle("◆ VERIFICATION ◆").setDescription("Click below to verify.").setColor(0x1ABC9C);
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_btn').setLabel('VERIFY').setStyle(ButtonStyle.Success));
                        return interaction.editReply({ embeds: [embed], components: [row] });
                    }
                    if (subArg === 'redeem') {
                        const embed = new EmbedBuilder().setTitle("◆ KEY REDEEM ◆").setDescription("Got a code? Click below to redeem.").setColor(0x5865F2);
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM KEY').setStyle(ButtonStyle.Primary));
                        return interaction.editReply({ embeds: [embed], components: [row] });
                    }
                    if (subArg === 'support') {
                        const embed = new EmbedBuilder().setTitle("◆ SUPPORT ◆").setDescription("Select your department.").setColor(0xFEE75C);
                        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('support_select').setPlaceholder('Select department...').addOptions([ { label: 'General Support', value: 'General Inquiry' }, { label: 'Token Help', value: 'Token Help' } ]));
                        return interaction.editReply({ embeds: [embed], components: [row] });
                    }
                }
            }
        }

        // --- BUTTON HANDLERS ---
        if (interaction.isButton()) {
            // --- MOD APPLICATION BUTTON ---
            if (interaction.customId === 'mod_app_apply') {
                const modal = new ModalBuilder()
                    .setCustomId('mod_app_modal')
                    .setTitle('Moderator Application');

                const nameInput = new TextInputBuilder()
                    .setCustomId('mod_app_name')
                    .setLabel('Full Name (or username)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Your name')
                    .setRequired(true)
                    .setMaxLength(100);

                const ageInput = new TextInputBuilder()
                    .setCustomId('mod_app_age')
                    .setLabel('Your Age')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('18+')
                    .setRequired(true)
                    .setMaxLength(3);

                const whyInput = new TextInputBuilder()
                    .setCustomId('mod_app_why')
                    .setLabel('Why do you want to be a moderator?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Tell us why you are interested...')
                    .setRequired(true)
                    .setMaxLength(1000);

                const experienceInput = new TextInputBuilder()
                    .setCustomId('mod_app_experience')
                    .setLabel('Do you have any moderation experience?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Previous roles, servers, etc.')
                    .setRequired(false)
                    .setMaxLength(1000);

                const availabilityInput = new TextInputBuilder()
                    .setCustomId('mod_app_availability')
                    .setLabel('Availability (timezone & hours)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., EST, 3-6 PM daily')
                    .setRequired(true)
                    .setMaxLength(200);

                const extraInput = new TextInputBuilder()
                    .setCustomId('mod_app_extra')
                    .setLabel('Anything else you want to add?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Optional extra info')
                    .setRequired(false)
                    .setMaxLength(1000);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(nameInput),
                    new ActionRowBuilder().addComponents(ageInput),
                    new ActionRowBuilder().addComponents(whyInput),
                    new ActionRowBuilder().addComponents(experienceInput),
                    new ActionRowBuilder().addComponents(availabilityInput),
                    new ActionRowBuilder().addComponents(extraInput)
                );

                return await interaction.showModal(modal);
            }

            // --- SUBSCRIPTION PANEL BUTTONS ---
            if (interaction.customId === 'subscribe_panel' || interaction.customId === 'unsubscribe_panel') {
                await interaction.deferUpdate();
                const isSubscribe = interaction.customId === 'subscribe_panel';
                const userId = interaction.user.id;

                if (isSubscribe) {
                    if (subscribedUsers.has(userId)) {
                        return interaction.editReply({ content: 'You are already subscribed!', flags: 64 });
                    }
                    subscribedUsers.add(userId);
                    await deliverTokenToUser(interaction.user);
                    return interaction.editReply({ content: '✅ You are now subscribed! You will receive a fresh token in your DMs **every 5 minutes**.', flags: 64 });
                } else {
                    if (!subscribedUsers.has(userId)) {
                        return interaction.editReply({ content: 'You are not subscribed.', flags: 64 });
                    }
                    subscribedUsers.delete(userId);
                    return interaction.editReply({ content: '❌ You have unsubscribed from automatic token deliveries.', flags: 64 });
                }
            }

            // --- CANCEL GENERATION ---
            if (interaction.customId === 'cancel_gen') {
                await interaction.deferUpdate();
                const userId = interaction.user.id;
                if (activeGenerations.has(userId)) {
                    const gen = activeGenerations.get(userId);
                    gen.cancelFlag = true;
                    activeGenerations.delete(userId);
                    isGenerating = false;
                    await interaction.editReply({ content: 'Generation cancelled.', flags: 64 });
                    await interaction.message.edit({ content: 'Cancelled.', embeds: [], components: [] }).catch(() => {});
                } else {
                    await interaction.editReply({ content: 'No active generation.', flags: 64 });
                }
                return;
            }

            // --- DONATE INFO ---
            if (interaction.customId === 'donate_info') {
                return interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle('◆ DONATION INFO ◆')
                        .setDescription('> Donations help cover hosting costs and development time.\n\n> All funds go directly to keeping the bot online.\n\n> Thank you for your support!')
                        .setColor(0xF1C40F)
                    ],
                    flags: 64
                });
            }

            // --- DONATE TOKEN BUTTON ---
            if (interaction.customId === 'donate_token_btn') {
                const modal = new ModalBuilder().setCustomId('donate_token_modal').setTitle('Donate Token JSON');
                const jsonInput = new TextInputBuilder().setCustomId('donate_json_input').setLabel('Paste your JSON here').setStyle(TextInputStyle.Paragraph).setPlaceholder('{"refresh_token":"...","token":"..."}').setRequired(true).setMinLength(20).setMaxLength(2000);
                modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
                return await interaction.showModal(modal);
            }

            // --- CHECK TOKEN BUTTON ---
            if (interaction.customId === 'check_token_btn') {
                const modal = new ModalBuilder().setCustomId('check_token_modal').setTitle('Check Token JSON');
                const jsonInput = new TextInputBuilder().setCustomId('check_json_input').setLabel('Paste your JSON here').setStyle(TextInputStyle.Paragraph).setPlaceholder('{"token":"...","refresh_token":"..."}').setRequired(true).setMinLength(20).setMaxLength(2000);
                modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
                return await interaction.showModal(modal);
            }

            // --- SPLIT TOKEN BUTTON ---
            if (interaction.customId === 'split_token_btn') {
                const modal = new ModalBuilder().setCustomId('split_token_modal').setTitle('Split Token JSON');
                const jsonInput = new TextInputBuilder().setCustomId('split_json_input').setLabel('Paste your JSON here').setStyle(TextInputStyle.Paragraph).setPlaceholder('{"token":"...","refresh_token":"..."}').setRequired(true).setMinLength(20).setMaxLength(2000);
                modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
                return await interaction.showModal(modal);
            }

            // --- STOCK PAGINATION ---
            if (interaction.customId === 'stock_prev' || interaction.customId === 'stock_next') {
                await interaction.deferUpdate();
                const page = interaction.customId === 'stock_prev' ? stockPage - 1 : stockPage + 1;
                stockPage = page;
                const entries = tokenStock.filter(t => t.id && t.id.length > 0);
                if (entries.length === 0) return interaction.editReply({ content: 'No active IDs.', embeds: [], components: [] });
                const totalPages = Math.ceil(entries.length / STOCK_PER_PAGE);
                const start = page * STOCK_PER_PAGE;
                const pageEntries = entries.slice(start, start + STOCK_PER_PAGE);
                const embed = new EmbedBuilder().setTitle('◆ REMOVE TOKEN ◆').setDescription(`**${entries.length}** active | Page ${page+1}/${totalPages}`).setColor(0xED4245);
                pageEntries.forEach(entry => embed.addFields({ name: `\`${entry.id}\``, value: `User: ${entry.username}`, inline: false }));
                const row = new ActionRowBuilder();
                pageEntries.forEach(entry => row.addComponents(new ButtonBuilder().setCustomId(`remove_${entry.id}`).setLabel(`Remove ${entry.id}`).setStyle(ButtonStyle.Danger)));
                const navRow = new ActionRowBuilder();
                if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId('stock_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary));
                if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId('stock_next').setLabel('Next').setStyle(ButtonStyle.Secondary));
                const components = [row];
                if (navRow.components.length > 0) components.push(navRow);
                await interaction.editReply({ embeds: [embed], components });
                return;
            }

            // --- REMOVE TOKEN BUTTON ---
            if (interaction.customId.startsWith('remove_')) {
                await interaction.deferUpdate();
                const id = interaction.customId.replace('remove_', '');
                const result = removeTokenById(id);
                await interaction.editReply({ content: result.success ? `Success: ${result.message}` : `Error: ${result.message}`, flags: 64 });
                if (interaction.message && interaction.message.embeds.length > 0 && interaction.message.embeds[0].title?.includes('REMOVE TOKEN')) {
                    const entries = tokenStock.filter(t => t.id && t.id.length > 0);
                    if (entries.length === 0) await interaction.message.edit({ content: 'No active generation IDs.', embeds: [], components: [] });
                    else {
                        const totalPages = Math.ceil(entries.length / STOCK_PER_PAGE);
                        if (stockPage >= totalPages) stockPage = totalPages - 1;
                        await showRemoveStock(interaction, stockPage);
                    }
                }
                return;
            }

            // --- GENERATE BUTTON ---
            if (interaction.customId === 'gen_public') {
                return await processTokenGeneration(interaction, 'Public Token');
            }

            // --- VERIFY BUTTON ---
            if (interaction.customId === 'verify_btn') {
                await interaction.deferReply({ flags: 64 });
                const role = interaction.guild.roles.cache.get(MEMBER_ROLE_ID);
                if (!role) return interaction.editReply({ content: "Role not found." });
                if (interaction.member.roles.cache.has(role.id)) return interaction.editReply({ content: "Already verified." });
                try { await interaction.member.roles.add(role); return interaction.editReply({ content: "Verified!" }); } catch (err) { return interaction.editReply({ content: "Failed to verify." }); }
            }

            // --- REDEEM BUTTON ---
            if (interaction.customId === 'redeem_btn') {
                const modal = new ModalBuilder().setCustomId('redeem_modal').setTitle('Secure Key Redemption');
                const codeInput = new TextInputBuilder().setCustomId('redeem_code_input').setLabel("ENTER CODE").setStyle(TextInputStyle.Short).setPlaceholder("supporter-xxxx-xxxx-xxxx").setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
                return await interaction.showModal(modal);
            }

            // --- CLOSE TICKET BUTTON ---
            if (interaction.customId === 'close_ticket_btn') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: "Only staff can close tickets.", flags: 64 });
                await interaction.reply({ content: "Closing ticket..." });
                setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
                return;
            }

            // Fallback for unknown buttons
            await interaction.deferUpdate();
            await interaction.editReply({ content: 'This button is not yet handled.', flags: 64 });
        }

        // --- SELECT MENU: Support ticket ---
        if (interaction.isStringSelectMenu() && interaction.customId === 'support_select') {
            await interaction.deferReply({ flags: 64 });
            const category = interaction.values[0];
            try {
                const ticketChannel = await interaction.guild.channels.create({
                    name: `ticket-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ],
                });
                const embed = new EmbedBuilder().setTitle(`◆ TICKET: ${category.toUpperCase()} ◆`).setDescription(`Welcome, <@${interaction.user.id}>.`).setColor(0xFEE75C).setTimestamp();
                const closeButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket_btn').setLabel('CLOSE').setStyle(ButtonStyle.Danger));
                await ticketChannel.send({ embeds: [embed], components: [closeButton] });
                return interaction.editReply({ content: `Ticket created: <#${ticketChannel.id}>` });
            } catch (err) { return interaction.editReply({ content: "Failed to create ticket." }); }
        }

        // --- MODAL SUBMITS ---
        if (interaction.isModalSubmit()) {
            // --- MOD APPLICATION MODAL ---
            if (interaction.customId === 'mod_app_modal') {
                await interaction.deferReply({ flags: 64 });
                const name = interaction.fields.getTextInputValue('mod_app_name');
                const age = interaction.fields.getTextInputValue('mod_app_age');
                const why = interaction.fields.getTextInputValue('mod_app_why');
                const experience = interaction.fields.getTextInputValue('mod_app_experience') || 'None provided';
                const availability = interaction.fields.getTextInputValue('mod_app_availability');
                const extra = interaction.fields.getTextInputValue('mod_app_extra') || 'None';

                const embed = new EmbedBuilder()
                    .setTitle('📩 New Moderator Application')
                    .setColor(0x3498DB)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '👤 Applicant', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                        { name: '📛 Full Name', value: name, inline: true },
                        { name: '🎂 Age', value: age, inline: true },
                        { name: '❓ Why do you want to be a mod?', value: why, inline: false },
                        { name: '📋 Experience', value: experience, inline: false },
                        { name: '🕒 Availability', value: availability, inline: false },
                        { name: '📝 Additional Info', value: extra, inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Please review this application.' });

                // Fetch the channel – if not in cache, fetch it
                let channel = interaction.guild.channels.cache.get(MOD_APP_CHANNEL_ID);
                if (!channel) {
                    try {
                        channel = await interaction.guild.channels.fetch(MOD_APP_CHANNEL_ID);
                    } catch (fetchErr) {
                        console.error('[ERROR] Could not fetch mod application channel:', fetchErr);
                        return interaction.editReply({ content: '❌ Could not find the application channel. Please contact an admin.', flags: 64 });
                    }
                }

                if (channel) {
                    try {
                        await channel.send({ embeds: [embed] });
                        await interaction.editReply({ content: '✅ Your application has been submitted successfully! Staff will review it shortly.' });
                        try {
                            await interaction.user.send({ embeds: [new EmbedBuilder().setTitle('📨 Application Received').setDescription('Your moderator application has been submitted. We will get back to you soon.').setColor(0x2ECC71)] });
                        } catch (_) {}
                    } catch (sendErr) {
                        // Specific error handling for send permissions
                        console.error('[ERROR] Could not send to mod application channel:', sendErr);
                        await interaction.editReply({ content: '❌ I could not submit your application to the staff channel. The bot is missing the **Send Messages** permission there, or the channel ID is incorrect. Please contact an admin.', flags: 64 });
                    }
                } else {
                    await interaction.editReply({ content: '❌ The application channel could not be found. Please contact an admin.' });
                }
                return;
            }

            // --- STOCK MODAL ---
            if (interaction.customId === 'stock_modal') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                const bearer = interaction.fields.getTextInputValue('stock_bearer_input').trim();
                const refresh = interaction.fields.getTextInputValue('stock_refresh_input').trim();
                if (!bearer || !refresh) return interaction.editReply({ content: 'Both tokens required.' });
                tokenStock.push({ bearer, refresh, addedAt: Date.now(), expiresAt: getTokenExpiryMs(bearer) });
                return interaction.editReply({ content: `Added token! Total: ${tokenStock.length}` });
            }

            // --- REDEEM MODAL ---
            if (interaction.customId === 'redeem_modal') {
                await interaction.deferReply({ flags: 64 });
                const code = interaction.fields.getTextInputValue('redeem_code_input').trim();
                if (validCodes.has(code)) {
                    validCodes.delete(code);
                    const supporterRole = interaction.guild.roles.cache.get(SUPPORTER_ROLE_ID);
                    if (!supporterRole) return interaction.editReply({ content: 'Code valid but role missing.' });
                    try { await interaction.member.roles.add(supporterRole); return interaction.editReply({ content: `Redeemed! Code \`${code}\` verified.` }); } catch (err) { return interaction.editReply({ content: 'Code valid but role assignment failed.' }); }
                } else return interaction.editReply({ content: `Invalid code: \`${code}\`` });
            }

            // --- DONATE TOKEN MODAL ---
            if (interaction.customId === 'donate_token_modal') {
                await interaction.deferReply({ flags: 64 });
                const jsonRaw = interaction.fields.getTextInputValue('donate_json_input').trim();
                let parsed;
                try { parsed = JSON.parse(jsonRaw); } catch (e) { return interaction.editReply({ content: 'Invalid JSON. Please check the format.' }); }
                let bearer, refresh;
                if (parsed.token && typeof parsed.token === 'object') {
                    bearer = parsed.token.bearer || parsed.token.token || parsed.token.access_token;
                    refresh = parsed.token.refresh_token;
                } else {
                    bearer = parsed.token || parsed.bearer || parsed.access_token;
                    refresh = parsed.refresh_token;
                }
                if (!bearer || !refresh) return interaction.editReply({ content: 'Missing `token` (or bearer) and/or `refresh_token` in the JSON.' });
                const expiry = getTokenExpiryMs(bearer);
                if (expiry !== null && Date.now() >= expiry) {
                    const refreshResult = await refreshTokenOnly(refresh);
                    if (!refreshResult.success) return interaction.editReply({ content: `Token expired and refresh failed: ${refreshResult.error}` });
                    const newBearer = refreshResult.bearer;
                    const newRefresh = refreshResult.refresh;
                    const newExpiry = refreshResult.expiresAt;
                    const apiValid = await validateTokenDetails(newBearer);
                    if (!apiValid.valid) return interaction.editReply({ content: `Refreshed token still invalid according to API.` });
                    const genId = generateGenerationId();
                    tokenStock.push({ bearer: newBearer, refresh: newRefresh, addedAt: Date.now(), expiresAt: newExpiry, id: genId, userId: interaction.user.id, username: interaction.user.tag });
                    if (!accounts.find(a => a.refresh_token === newRefresh)) accounts.push({ token: newBearer, refresh_token: newRefresh, label: `donated_${Date.now()}` });
                    return interaction.editReply({ content: `Token donated and refreshed successfully! New token added to stock (${tokenStock.length} total). ID: \`${genId}\` Expires: ${humanExpiry(newExpiry)}` });
                } else {
                    const validation = await validateTokenDetails(bearer, refresh);
                    if (!validation.valid) return interaction.editReply({ content: `Token validation failed.` });
                    const genId = generateGenerationId();
                    tokenStock.push({ bearer: bearer, refresh: refresh, addedAt: Date.now(), expiresAt: expiry, id: genId, userId: interaction.user.id, username: interaction.user.tag });
                    if (!accounts.find(a => a.refresh_token === refresh)) accounts.push({ token: bearer, refresh_token: refresh, label: `donated_${Date.now()}` });
                    return interaction.editReply({ content: `Token donated successfully! Added to stock (${tokenStock.length} total). ID: \`${genId}\` Expires: ${humanExpiry(expiry)}` });
                }
            }

            // --- CHECK TOKEN MODAL ---
            if (interaction.customId === 'check_token_modal') {
                await interaction.deferReply({ flags: 64 });
                const jsonRaw = interaction.fields.getTextInputValue('check_json_input').trim();
                let parsed;
                try { parsed = JSON.parse(jsonRaw); } catch (e) { return interaction.editReply({ content: 'Invalid JSON. Please check the format.' }); }
                let bearer, refresh;
                if (parsed.token && typeof parsed.token === 'object') {
                    bearer = parsed.token.bearer || parsed.token.token || parsed.token.access_token;
                    refresh = parsed.token.refresh_token;
                } else {
                    bearer = parsed.token || parsed.bearer || parsed.access_token;
                    refresh = parsed.refresh_token;
                }
                if (!bearer || !refresh) return interaction.editReply({ content: 'Missing `token` (or bearer) and/or `refresh_token` in the JSON.' });
                const validation = await validateTokenDetails(bearer, refresh);
                let embed = new EmbedBuilder()
                    .setTitle('◆ TOKEN CHECK RESULT ◆')
                    .setColor(validation.valid && !validation.refreshExpired ? 0x2ECC71 : 0xED4245)
                    .addFields(
                        { name: 'Bearer Token', value: `\`${bearer.slice(0, 30)}...\` (${bearer.length} chars)`, inline: false },
                        { name: 'Refresh Token', value: `\`${refresh.slice(0, 30)}...\` (${refresh.length} chars)`, inline: false },
                        { name: 'Bearer Status', value: validation.hasExpiry && validation.valid ? '✔ VALID' : (validation.hasExpiry ? '✕ INVALID' : '✕ UNKNOWN'), inline: true },
                        { name: 'Refresh Status', value: validation.refreshHasExpiry && !validation.refreshExpired ? '✔ VALID' : (validation.refreshHasExpiry ? '✕ EXPIRED' : '✕ UNKNOWN'), inline: true },
                        { name: 'Bearer Expires', value: validation.hasExpiry ? new Date(validation.expiry).toUTCString() : 'UNKNOWN', inline: true },
                        { name: 'Bearer Remaining', value: validation.hasExpiry ? (validation.secondsRemaining > 0 ? `${validation.secondsRemaining}s` : 'Expired') : 'UNKNOWN', inline: true },
                        { name: 'Refresh Expires', value: validation.refreshHasExpiry ? new Date(validation.refreshExpiry).toUTCString() : 'UNKNOWN', inline: true },
                        { name: 'Refresh Remaining', value: validation.refreshHasExpiry ? (validation.refreshSecondsRemaining > 0 ? `${validation.refreshSecondsRemaining}s` : 'Expired') : 'UNKNOWN', inline: true },
                        { name: 'API Validation', value: validation.apiValid ? '✔ Passed' : `✕ ${validation.apiError || 'Failed'}`, inline: false }
                    )
                    .setFooter({ text: getLiveUIStats(interaction) });

                if (!validation.hasExpiry || !validation.refreshHasExpiry) embed.setDescription('> This token does not have a valid expiry claim. It is likely malformed or invalid.');
                else if (!validation.valid) embed.setDescription('> This token is invalid – it may be expired, revoked, or the refresh token is dead.');
                else embed.setDescription('> Token is valid and ready for use.');

                embed.addFields(
                    { name: 'Full Bearer Token', value: `\`\`\`\n${bearer}\n\`\`\``, inline: false },
                    { name: 'Full Refresh Token', value: `\`\`\`\n${refresh}\n\`\`\``, inline: false }
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`copy_bearer_${Date.now()}`).setLabel('Copy Bearer').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`copy_refresh_${Date.now()}`).setLabel('Copy Refresh').setStyle(ButtonStyle.Success)
                );

                const reply = await interaction.editReply({ embeds: [embed], components: [row2] });
                const msg = await interaction.fetchReply();
                tokenCache.set(msg.id, { bearer, refresh });
                setTimeout(() => tokenCache.delete(msg.id), 10 * 60 * 1000);
                return;
            }

            // --- SPLIT TOKEN MODAL ---
            if (interaction.customId === 'split_token_modal') {
                await interaction.deferReply({ flags: 64 });
                const jsonRaw = interaction.fields.getTextInputValue('split_json_input').trim();
                let parsed;
                try { parsed = JSON.parse(jsonRaw); } catch (e) { return interaction.editReply({ content: 'Invalid JSON. Please check the format.' }); }
                let bearer, refresh;
                if (parsed.token && typeof parsed.token === 'object') {
                    bearer = parsed.token.bearer || parsed.token.token || parsed.token.access_token;
                    refresh = parsed.token.refresh_token;
                } else {
                    bearer = parsed.token || parsed.bearer || parsed.access_token;
                    refresh = parsed.refresh_token;
                }
                if (!bearer || !refresh) return interaction.editReply({ content: 'Missing `token` (or bearer) and/or `refresh_token` in the JSON.' });
                const embed = new EmbedBuilder()
                    .setTitle('◆ TOKEN SPLIT ◆')
                    .setDescription('> Extracted Bearer and Refresh tokens – copy them individually below.')
                    .setColor(0x2ECC71)
                    .addFields(
                        { name: 'Bearer Token', value: `\`\`\`\n${bearer}\n\`\`\``, inline: false },
                        { name: 'Refresh Token', value: `\`\`\`\n${refresh}\n\`\`\``, inline: false }
                    )
                    .setFooter({ text: getLiveUIStats(interaction) });
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`copy_bearer_${Date.now()}`).setLabel('Copy Bearer').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`copy_refresh_${Date.now()}`).setLabel('Copy Refresh').setStyle(ButtonStyle.Success)
                );
                const reply = await interaction.editReply({ embeds: [embed], components: [row] });
                const msg = await interaction.fetchReply();
                tokenCache.set(msg.id, { bearer, refresh });
                setTimeout(() => tokenCache.delete(msg.id), 10 * 60 * 1000);
                return;
            }
        }
    } catch (err) {
        console.error(`[ERROR] [EAM.LOL] Interaction Error:`, err);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: "An error occurred. Please try again.", flags: 64 });
            } catch (_) {
                console.error('[ERROR] Could not send error reply.');
            }
        } else {
            try {
                await interaction.editReply({ content: "An error occurred. Please try again.", flags: 64 });
            } catch (_) {}
        }
    }
});

// --- COPY BUTTON HANDLER ---
client.on('interactionCreate', async interaction => {
    if (interaction.isButton() && interaction.customId.startsWith('copy_')) {
        const parts = interaction.customId.split('_');
        const type = parts[1];
        const msgId = interaction.message.id;
        let token = '';

        const cached = tokenCache.get(msgId);
        if (cached) {
            token = type === 'bearer' ? cached.bearer : cached.refresh;
        } else {
            const embed = interaction.message.embeds[0];
            if (embed) {
                for (const field of embed.fields) {
                    if (field.name.includes('Bearer') && type === 'bearer') {
                        const match = field.value.match(/```\n([\s\S]*?)\n```/);
                        token = match ? match[1].trim() : field.value.replace(/```\n/g, '').replace(/\n```/g, '').trim();
                        break;
                    }
                    if (field.name.includes('Refresh') && type === 'refresh') {
                        const match = field.value.match(/```\n([\s\S]*?)\n```/);
                        token = match ? match[1].trim() : field.value.replace(/```\n/g, '').replace(/\n```/g, '').trim();
                        break;
                    }
                }
            }
        }

        if (!token) return interaction.reply({ content: 'No token found.', flags: 64 });

        await interaction.deferReply({ flags: 64 });
        try {
            await interaction.user.send({ content: `**${type.charAt(0).toUpperCase() + type.slice(1)} Token**\n\`\`\`\n${token}\n\`\`\`` });
        } catch (_) {}

        return interaction.editReply({ content: `**${type.charAt(0).toUpperCase() + type.slice(1)} Token copied!**\n\`\`\`\n${token}\n\`\`\`` });
    }
});

// --- HEALTH CHECK ---
const server = http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', bot: 'online', timestamp: Date.now() })); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('EAM.LOL Token Generator Bot is active.\nAuto-refreshes smartly.\nCredits to @elliott\n');
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`[SYSTEM] [EAM.LOL] HTTP server on port ${PORT}`));

// --- LOGIN ---
if (!process.env.DISCORD_TOKEN) {
    console.error('[ERROR] [EAM.LOL] DISCORD_TOKEN environment variable is missing.');
    process.exit(1);
} else {
    // Test DNS
    (async () => {
        try {
            console.log('[INFO] [EAM.LOL] Testing DNS resolution for gateway.discord.gg...');
            const address = await dnsLookup('gateway.discord.gg');
            console.log(`[INFO] [EAM.LOL] Gateway resolves to: ${address.address}`);
        } catch (err) {
            console.error('[ERROR] [EAM.LOL] DNS lookup failed:', err.message);
        }
    })();

    client.on('debug', (info) => console.log('[DEBUG]', info));
    client.on('shardError', (error, shardId) => {
        console.error(`[SHARD ERROR] Shard ${shardId}:`, error);
    });
    client.on('shardReady', (shardId) => {
        console.log(`[SHARD READY] Shard ${shardId} is ready.`);
    });
    client.on('shardDisconnect', (event, shardId) => {
        console.log(`[SHARD DISCONNECT] Shard ${shardId}:`, event);
    });
    client.on('shardReconnecting', (shardId) => {
        console.log(`[SHARD RECONNECT] Shard ${shardId} is reconnecting...`);
    });
    client.on('shardResume', (shardId, replayed) => {
        console.log(`[SHARD RESUME] Shard ${shardId} resumed, replayed ${replayed} events.`);
    });

    async function loginWithRetry(attempts = 3) {
        for (let i = 1; i <= attempts; i++) {
            try {
                console.log(`[INFO] [EAM.LOL] Login attempt ${i}/${attempts}...`);
                const loginPromise = client.login(process.env.DISCORD_TOKEN);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Login timed out after 90 seconds')), 90000)
                );
                await Promise.race([loginPromise, timeoutPromise]);
                console.log('[SUCCESS] [EAM.LOL] Login successful!');
                return true;
            } catch (err) {
                console.error(`[ERROR] [EAM.LOL] Attempt ${i} failed:`, err.message || err);
                if (i === attempts) {
                    console.error('[ERROR] [EAM.LOL] All login attempts failed.');
                    return false;
                }
                await new Promise(r => setTimeout(r, 15000));
            }
        }
        return false;
    }

    loginWithRetry().then(success => {
        if (!success) {
            console.error('[ERROR] [EAM.LOL] Failed to connect. Exiting.');
            process.exit(1);
        }
    });
}

process.on('unhandledRejection', (reason) => console.error('[ERROR] [EAM.LOL] Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('[ERROR] [EAM.LOL] Uncaught Exception:', err));
