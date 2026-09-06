// ============================================================
// FILE: index.js – EAM.LOL Token Bot v2.5.6
// Enhanced API validation with logging and flexible parsing.
// ============================================================

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
const VERSION = "2.5.6";
const UPDATE_LOG_CHANNEL_ID = "1545829503912120431";
const STATUS_CHANNEL_ID = "1545624109583695933";
const TOKEN_NUMBER_CHANNEL_ID = "1546151859465756722";
const LOG_CHANNEL_ID = "1545922334534148196";

const CHANGELOG = `🔧 Bot Update v${VERSION}

What's fixed:
• **API validation** – now logs the raw response and checks multiple wrapper keys (data, user, account).
• "Empty account data" error is now easier to debug – the actual API response is printed to the console.`;

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

// --- Panel message tracking ---
let subscriptionPanelMessage = null;
let statusPanelMessage = null;

// --- Stats tracking ---
let totalTokensGenerated = 0;
const userTokenCounts = new Map();
const userHistory = new Map();
const lotteryPool = new Set();

// --- Token number helper ---
function generateTokenNumber() {
    return Math.floor(Math.random() * 100) + 1;
}

// --- Log queue to Discord ---
let logQueue = [];
let logQueueInterval = null;

function shouldLogMessage(msg) {
    if (!msg) return false;
    const lower = msg.toLowerCase();
    if (lower.includes('gateway')) return false;
    if (lower.includes('dns')) return false;
    if (lower.includes('[debug]')) return false;
    if (lower.includes('heartbeat')) return false;
    if (lower.includes('ready')) return false;
    return true;
}

function processLogQueue() {
    if (logQueue.length === 0) return;
    const channel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!channel) return;
    const batch = logQueue.splice(0, 5);
    for (const item of batch) {
        const embed = new EmbedBuilder()
            .setTitle(`📋 ${item.type.toUpperCase()}`)
            .setDescription(item.message.length > 1900 ? item.message.slice(0, 1900) + '...' : item.message)
            .setColor(item.type === 'error' ? 0xED4245 : item.type === 'warn' ? 0xF1C40F : 0x2ECC71)
            .setTimestamp()
            .setFooter({ text: 'EAM.LOL Logs' });
        channel.send({ embeds: [embed] }).catch(() => {});
    }
}

function enqueueLog(message, type = 'info') {
    if (!shouldLogMessage(message)) return;
    logQueue.push({ message, type });
}

// Override console methods
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;
const origInfo = console.info;

console.log = function(...args) {
    const msg = args.join(' ');
    origLog.apply(console, args);
    enqueueLog(msg, 'info');
};

console.error = function(...args) {
    const msg = args.join(' ');
    origError.apply(console, args);
    enqueueLog(msg, 'error');
};

console.warn = function(...args) {
    const msg = args.join(' ');
    origWarn.apply(console, args);
    enqueueLog(msg, 'warn');
};

console.info = function(...args) {
    const msg = args.join(' ');
    origInfo.apply(console, args);
    enqueueLog(msg, 'info');
};

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

// --- JWT‑ONLY VALIDATION (no API call) ---
function validateTokenJWT(bearerToken, refreshToken = null) {
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

    return {
        valid: hasExpiry && !expired,
        expired,
        expiry,
        hasExpiry,
        apiValid: true,
        apiError: null,
        secondsRemaining: hasExpiry ? Math.floor((expiry - Date.now()) / 1000) : null,
        refreshExpiry,
        refreshExpired,
        refreshHasExpiry,
        refreshSecondsRemaining
    };
}

// ========== FIXED: API TOKEN VALIDATION with logging ==========
async function validateTokenDetails(bearer, refreshToken) {
    try {
        const url = `${ACTIVE_API_URL}/v2/account`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${bearer}`,
                'Content-Type': 'application/json',
                'User-Agent': 'SteamVR 1.88.1.3421_a3df6ce5'
            }
        });
        if (response.status === 200) {
            const body = await response.text();
            console.log(`[API] Raw response: ${body}`); // Log raw response to console
            if (body && body.startsWith('{')) {
                const parsed = JSON.parse(body);
                // Try multiple possible wrapper keys
                const account = parsed.data || parsed.user || parsed.account || parsed;
                if (account && (account.id || account.username || account.tid || account.userId)) {
                    return { valid: true, apiError: null };
                }
                return { valid: false, apiError: `Empty account data (parsed: ${JSON.stringify(parsed).slice(0, 200)})` };
            }
            return { valid: false, apiError: 'Non-JSON response' };
        }
        return { valid: false, apiError: `HTTP ${response.status}` };
    } catch (err) {
        console.warn(`[API] Validation fetch failed: ${err.message}`);
        return { valid: false, apiError: err.message };
    }
}

// --- RefreshTokenOnly (no "same token" check) ---
async function refreshTokenOnly(refreshTk, retries = 3) {
    let lastError = null;
    let lastResponse = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`[REFRESH] Attempt ${attempt} to refresh token...`);
            const refreshUrl = `${ACTIVE_API_URL}/v2/account/session/refresh`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
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

            const status = response.status;
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error(`Non-JSON response (status ${status})`);
            }
            const data = await response.json();
            lastResponse = data;

            if (!response.ok) {
                if (status === 401 || status === 403) {
                    throw new Error(`Refresh token invalid: ${data?.message || 'Unauthorized'}`);
                }
                throw new Error(data?.message || `HTTP ${status}`);
            }

            const newBearer = data.token || data.access_token || data.bearer;
            const newRefresh = data.refresh_token || refreshTk;
            if (!newBearer) throw new Error('No token in response');

            const apiCheck = await validateTokenDetails(newBearer, newRefresh);
            if (!apiCheck.valid) {
                throw new Error(`API validation failed: ${apiCheck.apiError}`);
            }

            const newExpiry = getTokenExpiryMs(newBearer);
            if (newExpiry === null) throw new Error('No expiry claim in new token');
            if (newExpiry <= Date.now()) throw new Error('New token already expired');

            const jwtCheck = validateTokenJWT(newBearer, newRefresh);
            if (!jwtCheck.valid) {
                throw new Error('New token JWT is invalid or expired');
            }

            console.log(`[REFRESH] Successfully refreshed. Expiry: ${new Date(newExpiry).toUTCString()}`);
            return { success: true, bearer: newBearer, refresh: newRefresh, expiresAt: newExpiry };
        } catch (err) {
            lastError = err;
            console.error(`[REFRESH] Attempt ${attempt} failed: ${err.message}`);
            if (attempt < retries) {
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`[REFRESH] Retrying in ${delay/1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    console.error(`[REFRESH] All ${retries} attempts failed. Last error: ${lastError?.message || 'Unknown'}`);
    return { success: false, error: lastError ? lastError.message : 'Unknown error', response: lastResponse };
}

// --- refreshToken with fallback ---
async function refreshToken(refreshTk) {
    if (!refreshTk) return { success: false, error: 'No refresh token' };

    const result = await refreshTokenOnly(refreshTk, 5);

    if (result.success) {
        DEFAULT_TOKEN.bearer = result.bearer;
        DEFAULT_TOKEN.refresh_token = result.refresh;
        apiWorking = true;
        consecutiveFails = 0;
        lastRefreshExpiry = result.expiresAt;

        updateAccountTokens(refreshTk, result.bearer, result.refresh);

        if (tokenStock.length > 0) {
            const old = tokenStock[0];
            tokenStock[0] = {
                bearer: result.bearer,
                refresh: result.refresh,
                addedAt: Date.now(),
                expiresAt: result.expiresAt,
                id: old.id || generateGenerationId(),
                userId: old.userId || 'system',
                username: old.username || 'System',
                displayNumber: old.displayNumber || generateTokenNumber()
            };
        } else {
            tokenStock.push({
                bearer: result.bearer,
                refresh: result.refresh,
                addedAt: Date.now(),
                expiresAt: result.expiresAt,
                id: generateGenerationId(),
                userId: 'system',
                username: 'System',
                displayNumber: generateTokenNumber()
            });
        }
        console.log(`[SUCCESS] [EAM.LOL] Token stock updated. New expiry: ${humanExpiry(lastRefreshExpiry)}`);
        return { success: true, bearer: result.bearer, refresh: result.refresh, expiresAt: result.expiresAt };
    }

    console.log(`[WARN] [EAM.LOL] Refresh failed (${result.error}). Trying fallback accounts...`);
    const nextAcc = switchToNextAccount(activeAccountLabel);
    if (nextAcc) {
        activeAccountLabel = nextAcc.label;
        DEFAULT_TOKEN.bearer = nextAcc.token;
        DEFAULT_TOKEN.refresh_token = nextAcc.refresh_token;
        const newExpiry = getTokenExpiryMs(nextAcc.token);
        const newNumber = generateTokenNumber();
        if (tokenStock.length > 0) {
            const old = tokenStock[0];
            tokenStock[0] = {
                bearer: nextAcc.token,
                refresh: nextAcc.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: old.id || generateGenerationId(),
                userId: old.userId || 'system',
                username: old.username || 'System',
                displayNumber: newNumber
            };
        } else {
            tokenStock.push({
                bearer: nextAcc.token,
                refresh: nextAcc.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: generateGenerationId(),
                userId: 'system',
                username: 'System',
                displayNumber: newNumber
            });
        }
        console.log(`[SUCCESS] [EAM.LOL] Switched to ${nextAcc.label} - new token ready`);
        return { success: true, bearer: nextAcc.token, refresh: nextAcc.refresh_token, expiresAt: newExpiry };
    }

    console.log('[ERROR] [EAM.LOL] All accounts exhausted. Falling back to hardcoded default.');
    const defaultExpiry = getTokenExpiryMs(DEFAULT_TOKEN.bearer);
    const defaultNumber = generateTokenNumber();
    if (tokenStock.length > 0) {
        const old = tokenStock[0];
        tokenStock[0] = {
            bearer: DEFAULT_TOKEN.bearer,
            refresh: DEFAULT_TOKEN.refresh_token,
            addedAt: Date.now(),
            expiresAt: defaultExpiry,
            id: old.id || generateGenerationId(),
            userId: old.userId || 'system',
            username: old.username || 'System',
            displayNumber: defaultNumber
        };
    } else {
        tokenStock.push({
            bearer: DEFAULT_TOKEN.bearer,
            refresh: DEFAULT_TOKEN.refresh_token,
            addedAt: Date.now(),
            expiresAt: defaultExpiry,
            id: generateGenerationId(),
            userId: 'system',
            username: 'System',
            displayNumber: defaultNumber
        });
    }
    console.log(`[WARN] [EAM.LOL] Using hardcoded default token - expires ${new Date(defaultExpiry).toUTCString()}`);
    return { success: true, bearer: DEFAULT_TOKEN.bearer, refresh: DEFAULT_TOKEN.refresh_token, expiresAt: defaultExpiry };
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
    console.log(`[INFO] Added new account: account_${accounts.length}`);
}

function addOrUpdateAccount(bearer, refresh) {
    const existing = accounts.find(a => a.refresh_token === refresh);
    if (existing) {
        existing.token = bearer;
        existing.refresh_token = refresh;
        console.log(`[INFO] Updated existing account: ${existing.label}`);
        return;
    }
    const label = `account_${accounts.length + 1}`;
    accounts.push({ token: bearer, refresh_token: refresh, label });
    console.log(`[INFO] Added new account: ${label}`);
}

function giveNewTokenFromAccounts() {
    const acc = getActiveAccount();
    if (acc) {
        DEFAULT_TOKEN.bearer = acc.token;
        DEFAULT_TOKEN.refresh_token = acc.refresh_token;
        activeAccountLabel = acc.label;
        const newExpiry = getTokenExpiryMs(acc.token);
        const newNumber = generateTokenNumber();
        if (tokenStock.length > 0) {
            const old = tokenStock[0];
            tokenStock[0] = {
                bearer: acc.token,
                refresh: acc.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: old.id || generateGenerationId(),
                userId: old.userId || 'system',
                username: old.username || 'System',
                displayNumber: newNumber
            };
        } else {
            tokenStock.push({
                bearer: acc.token,
                refresh: acc.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: generateGenerationId(),
                userId: 'system',
                username: 'System',
                displayNumber: newNumber
            });
        }
        console.log(`[SUCCESS] [EAM.LOL] New token loaded from ${acc.label} - expires ${new Date(newExpiry).toUTCString()}`);
    } else {
        console.log('[ERROR] [EAM.LOL] No valid accounts left! Falling back to hardcoded default token.');
        DEFAULT_TOKEN.bearer = DEFAULT_TOKEN.bearer;
        DEFAULT_TOKEN.refresh_token = DEFAULT_TOKEN.refresh_token;
        const newExpiry = getTokenExpiryMs(DEFAULT_TOKEN.bearer);
        const newNumber = generateTokenNumber();
        if (tokenStock.length > 0) {
            const old = tokenStock[0];
            tokenStock[0] = {
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: old.id || generateGenerationId(),
                userId: old.userId || 'system',
                username: old.username || 'System',
                displayNumber: newNumber
            };
        } else {
            tokenStock.push({
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: generateGenerationId(),
                userId: 'system',
                username: 'System',
                displayNumber: newNumber
            });
        }
        console.log(`[WARN] [EAM.LOL] Using hardcoded default token - expires ${new Date(newExpiry).toUTCString()}`);
    }
}

// --- REFRESHER (called every 2:30) ---
async function refreshTokenInStock() {
    console.log('[REFRESHER] Starting refresh cycle...');
    if (tokenStock.length === 0) {
        console.log('[INFO] [EAM.LOL] Stock empty - loading from accounts...');
        giveNewTokenFromAccounts();
        await updateStatusPanel();
        await updateSubscriptionPanel();
        return;
    }
    
    const tokenObj = tokenStock[0];
    if (!tokenObj.refresh) {
        console.log('[ERROR] [EAM.LOL] No refresh token in stock - loading new token...');
        giveNewTokenFromAccounts();
        await updateStatusPanel();
        await updateSubscriptionPanel();
        return;
    }

    console.log('[REFRESH] [EAM.LOL] 2:30 interval reached - Refreshing token...');
    console.log(`[REFRESH] Current token expires at ${new Date(tokenObj.expiresAt).toUTCString()}`);
    try {
        const result = await refreshToken(tokenObj.refresh);
        if (result.success) {
            console.log(`[SUCCESS] [EAM.LOL] Token refreshed! New expiry: ${humanExpiry(result.expiresAt)}`);
            consecutiveFails = 0;
            await updateStatusPanel();
            await updateSubscriptionPanel();
        } else {
            console.log('[ERROR] [EAM.LOL] Refresh failed - getting new token from accounts...');
            giveNewTokenFromAccounts();
            await updateStatusPanel();
            await updateSubscriptionPanel();
        }
    } catch (err) {
        console.error('[ERROR] [EAM.LOL] Error during refresh:', err);
        giveNewTokenFromAccounts();
        await updateStatusPanel();
        await updateSubscriptionPanel();
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
        updateStatusPanel();
        updateSubscriptionPanel();
    }
}

const AUTO_REFRESH_INTERVAL = 150 * 1000;
let refreshInterval = null;
function startAutoRefresh() {
    console.log('[SYSTEM] [EAM.LOL] AUTO-REFRESH STARTED (interval: 2m 30s)');
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => {
        console.log('[AUTO-REFRESH] Tick at', new Date().toISOString());
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
    let tokenObj = null;
    let valid = false;
    let attempts = 0;
    const maxAttempts = 5;
    const MIN_TTL = 900; // 15 minutes in seconds

    while (!valid && attempts < maxAttempts) {
        attempts++;
        console.log(`[DELIVERY] Attempt ${attempts} to get a valid token`);
        if (tokenStock.length === 0) giveNewTokenFromAccounts();
        if (tokenStock.length === 0) {
            console.error('[DELIVERY] No stock token available.');
            break;
        }
        tokenObj = tokenStock[0];
        const currentTtl = tokenObj.expiresAt ? Math.floor((tokenObj.expiresAt - Date.now()) / 1000) : 0;
        console.log(`[DELIVERY] Current TTL: ${currentTtl}s`);
        if (currentTtl > MIN_TTL) {
            console.log(`[DELIVERY] Current token has ${currentTtl}s left (>${MIN_TTL}s), using it.`);
            const validation = validateTokenJWT(tokenObj.bearer, tokenObj.refresh);
            if (validation.valid) {
                const apiCheck = await validateTokenDetails(tokenObj.bearer, tokenObj.refresh);
                if (apiCheck.valid) {
                    valid = true;
                    console.log('[DELIVERY] Current token passed JWT and API validation.');
                    break;
                } else {
                    console.log(`[DELIVERY] Current token failed API validation: ${apiCheck.apiError}, refreshing.`);
                }
            } else {
                console.log(`[DELIVERY] Current token failed JWT validation, refreshing.`);
            }
        } else {
            console.log(`[DELIVERY] Current token has only ${currentTtl}s left (<${MIN_TTL}s), refreshing.`);
        }

        try {
            console.log('[DELIVERY] Calling refresh...');
            const refreshResult = await refreshToken(tokenObj.refresh);
            if (refreshResult.success) {
                tokenObj = tokenStock[0];
                console.log(`[DELIVERY] Refresh succeeded. New expiry: ${humanExpiry(tokenObj.expiresAt)}`);
                const validation = validateTokenJWT(tokenObj.bearer, tokenObj.refresh);
                if (validation.valid) {
                    const apiCheck = await validateTokenDetails(tokenObj.bearer, tokenObj.refresh);
                    if (apiCheck.valid) {
                        const newTtl = Math.floor((tokenObj.expiresAt - Date.now()) / 1000);
                        if (newTtl > MIN_TTL) {
                            valid = true;
                            console.log('[DELIVERY] Refreshed token passed JWT, API, and has enough TTL.');
                            break;
                        } else {
                            console.log(`[DELIVERY] Refreshed token TTL (${newTtl}s) still below threshold, retrying...`);
                        }
                    } else {
                        console.log(`[DELIVERY] Refreshed token failed API validation: ${apiCheck.apiError}, retrying...`);
                    }
                } else {
                    console.log('[DELIVERY] Refreshed token JWT invalid, retrying...');
                }
            } else {
                console.log(`[DELIVERY] Refresh failed: ${refreshResult.error || 'unknown'}`);
                giveNewTokenFromAccounts();
                tokenObj = tokenStock[0];
                if (tokenObj) {
                    const validation = validateTokenJWT(tokenObj.bearer, tokenObj.refresh);
                    if (validation.valid) {
                        const apiCheck = await validateTokenDetails(tokenObj.bearer, tokenObj.refresh);
                        if (apiCheck.valid) {
                            const fallbackTtl = Math.floor((tokenObj.expiresAt - Date.now()) / 1000);
                            if (fallbackTtl > MIN_TTL) {
                                valid = true;
                                console.log('[DELIVERY] Fallback token passed JWT, API, and has enough TTL.');
                                break;
                            } else {
                                console.log(`[DELIVERY] Fallback token TTL (${fallbackTtl}s) too low, retrying...`);
                            }
                        } else {
                            console.log(`[DELIVERY] Fallback token failed API validation: ${apiCheck.apiError}`);
                        }
                    } else {
                        console.log('[DELIVERY] Fallback token JWT invalid.');
                    }
                }
            }
        } catch (e) {
            console.error('[DELIVERY] Error during refresh:', e);
            giveNewTokenFromAccounts();
            tokenObj = tokenStock[0];
        }
        await new Promise(r => setTimeout(r, 500));
    }

    if (!valid && tokenStock.length > 0) {
        const current = tokenStock[0];
        if (current && current.expiresAt) {
            const timeLeft = (current.expiresAt - Date.now()) / 1000;
            if (timeLeft > 60) {
                console.log(`[DELIVERY] Final fallback: using current token (${Math.floor(timeLeft/60)} min left).`);
                const validation = validateTokenJWT(current.bearer, current.refresh);
                if (validation.valid) {
                    const apiCheck = await validateTokenDetails(current.bearer, current.refresh);
                    if (apiCheck.valid) {
                        tokenObj = current;
                        valid = true;
                        console.log('[DELIVERY] Final fallback passed JWT and API.');
                    } else {
                        console.log(`[DELIVERY] Final fallback failed API: ${apiCheck.apiError}`);
                    }
                } else {
                    console.log('[DELIVERY] Final fallback JWT validation failed.');
                }
            } else {
                console.log(`[DELIVERY] Final fallback token has only ${Math.floor(timeLeft)} seconds left – not using.`);
            }
        }
    }

    if (!valid || !tokenObj) {
        console.error('[DELIVERY] Could not obtain a valid token after all attempts.');
        return false;
    }

    const ttl = Math.floor((tokenObj.expiresAt - Date.now()) / 1000);
    if (ttl <= 60) {
        console.error(`[DELIVERY] Token TTL is only ${ttl}s, skipping.`);
        return false;
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
            { name: 'How to use', value: 'Open the **token.txt** file, copy the **BEARER TOKEN** (the long string) and paste it into Animal Company. **Do not add extra spaces or quotes.**', inline: false }
        )
        .setFooter({ text: 'EAM.LOL | Auto-Subscription (5 min interval) – 100% free' });

    try {
        await user.send({ embeds: [embed], files: [attachment, textAttachment] });
        console.log(`[DELIVERY] ✅ Valid token sent to ${user.tag}`);
        return true;
    } catch (err) {
        console.error(`[ERROR] Could not DM subscribed user ${user.id}:`, err.message);
        if (err.code === 50007) {
            console.log(`[DELIVERY] User ${user.tag} has DMs disabled.`);
        }
        return false;
    }
}

// --- Bulk subscribe / unsubscribe ---
async function subscribeAllMembers(guild) {
    const members = await guild.members.fetch();
    let count = 0;
    for (const [id, member] of members) {
        if (member.user.bot) continue;
        if (!subscribedUsers.has(id)) {
            subscribedUsers.add(id);
            count++;
        }
    }
    console.log(`[SUBSCRIBE] Subscribed ${count} members.`);
    return count;
}

async function unsubscribeAllMembers() {
    const count = subscribedUsers.size;
    subscribedUsers.clear();
    console.log(`[UNSUBSCRIBE] Unsubscribed ${count} members.`);
    return count;
}

async function sendTokenToAllSubscribers() {
    let successCount = 0;
    let failCount = 0;
    for (const userId of subscribedUsers) {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
            const ok = await deliverTokenToUser(user);
            if (ok) successCount++; else failCount++;
            await new Promise(r => setTimeout(r, 200));
        }
    }
    console.log(`[DELIVERY] Sent to ${successCount} subscribers, ${failCount} failed.`);
    return { successCount, failCount };
}

// --- Update log embed ---
async function postUpdateLog() {
    const channel = client.channels.cache.get(UPDATE_LOG_CHANNEL_ID);
    if (!channel) {
        console.error(`[ERROR] Update log channel ${UPDATE_LOG_CHANNEL_ID} not found.`);
        return;
    }
    const embed = new EmbedBuilder()
        .setTitle(`📦 Bot Update – v${VERSION}`)
        .setDescription(CHANGELOG)
        .setColor(0x5865F2)
        .setTimestamp()
        .setFooter({ text: 'Run /update-log to see this again' });

    await channel.send({ embeds: [embed] });
}

function startDeliveryLoop() {
    if (deliveryInterval) clearInterval(deliveryInterval);
    deliveryInterval = setInterval(async () => {
        if (subscribedUsers.size === 0) return;
        console.log(`[DELIVERY] Sending tokens to ${subscribedUsers.size} subscriber(s)...`);
        for (const userId of subscribedUsers) {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const success = await deliverTokenToUser(user);
                if (!success) {
                    console.log(`[DELIVERY] Failed to deliver to ${user.tag}, will retry next cycle.`);
                }
            }
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
    console.log(`[STOCK] Removed token ${id}. Remaining: ${tokenStock.length}`);
    return { success: true, message: `Token \`${id}\` removed. Remaining: ${tokenStock.length}` };
}

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
                console.log(`[API] Working API URL: ${url}`);
                return url;
            }
        } catch (e) {}
    }
    apiWorking = false;
    console.warn('[API] No working API URL found, using default.');
    return API_URLS[0];
}

function forceSetOwnToken(bearer, refresh) {
    DEFAULT_TOKEN.bearer = bearer;
    DEFAULT_TOKEN.refresh_token = refresh;
    lastRefreshExpiry = getTokenExpiryMs(bearer);
    const newNumber = generateTokenNumber();
    tokenStock = [{ bearer, refresh, addedAt: Date.now(), expiresAt: lastRefreshExpiry, displayNumber: newNumber }];
    console.log(`[SUCCESS] [EAM.LOL] Token manually set! Expires: ${new Date(lastRefreshExpiry).toUTCString()}`);
    updateStatusPanel();
    updateSubscriptionPanel();
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
                console.log(`[COOLDOWN] ${interaction.user.tag} is on cooldown (${minutes}m ${seconds}s)`);
                return interaction.editReply({ content: `Please wait ${minutes}m ${seconds}s.`, components: [] });
            }
        }
    }
    if (activeGenerations.has(userId)) {
        const gen = activeGenerations.get(userId);
        if (Date.now() - gen.startTime < 60000) {
            console.log(`[GENERATION] ${interaction.user.tag} already has an active generation.`);
            return interaction.editReply({ content: 'Generation already in progress.', components: [] });
        } else activeGenerations.delete(userId);
    }
    const genContext = { startTime: Date.now(), interaction, cancelFlag: false };
    activeGenerations.set(userId, genContext);
    console.log(`[GENERATION] ${interaction.user.tag} started a token generation.`);

    await updateGenerationEmbed(interaction, 1, 'Verifying DM connection...');
    try {
        const testDM = await interaction.user.send({ content: 'EAM.LOL — DM verified.' });
        await testDM.delete();
        console.log(`[GENERATION] DM verified for ${interaction.user.tag}.`);
    } catch (dmError) {
        activeGenerations.delete(userId);
        console.warn(`[GENERATION] DM failed for ${interaction.user.tag}: ${dmError.message}`);
        return interaction.editReply({ content: 'DM Error: Please enable DMs.', components: [] });
    }

    await updateGenerationEmbed(interaction, 2, 'Fetching fresh token...');
    if (tokenStock.length === 0) giveNewTokenFromAccounts();
    if (tokenStock.length === 0) {
        activeGenerations.delete(userId);
        console.error(`[GENERATION] No tokens available for ${interaction.user.tag}.`);
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
        console.error(`[GENERATION] Token expired for ${interaction.user.tag}.`);
        return interaction.editReply({ content: 'Token expired, no replacement.', components: [] });
    }
    const ttl = Math.floor((tokenObj.expiresAt - Date.now()) / 1000);
    if (ttl <= 60) {
        isGenerating = false;
        activeGenerations.delete(userId);
        console.warn(`[GENERATION] Token TTL too low (${ttl}s) for ${interaction.user.tag}.`);
        return interaction.editReply({ content: 'Token expires too soon, try again.', components: [] });
    }

    const validation = validateTokenJWT(tokenObj.bearer, tokenObj.refresh);
    if (!validation.valid) {
        isGenerating = false;
        activeGenerations.delete(userId);
        console.error(`[GENERATION] JWT validation failed for ${interaction.user.tag}.`);
        return interaction.editReply({ content: `Token JWT validation failed.`, components: [] });
    }

    const apiCheck = await validateTokenDetails(tokenObj.bearer, tokenObj.refresh);
    if (!apiCheck.valid) {
        isGenerating = false;
        activeGenerations.delete(userId);
        console.error(`[GENERATION] API validation failed for ${interaction.user.tag}: ${apiCheck.apiError}`);
        return interaction.editReply({ content: `Token failed API validation. Please try again.`, components: [] });
    }

    await updateGenerationEmbed(interaction, 3, `Finalizing (${ttl}s left)...`, ttl);
    const genId = generateGenerationId();
    tokenObj.id = genId;
    tokenObj.userId = interaction.user.id;
    tokenObj.username = interaction.user.tag;
    if (!hasNoCooldown) cooldowns.set(`public_${userId}`, Date.now() + GENERATION_COOLDOWN);

    totalTokensGenerated++;
    userTokenCounts.set(userId, (userTokenCounts.get(userId) || 0) + 1);
    if (!userHistory.has(userId)) userHistory.set(userId, []);
    const history = userHistory.get(userId);
    history.push({ id: genId, timestamp: Date.now() });
    if (history.length > 10) history.shift();

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
            { name: 'How to use', value: 'Open **token.txt**, copy the **BEARER TOKEN** (the long string) and paste it into Animal Company. **No extra spaces, quotes, or "Bearer".**', inline: false }
        )
        .setColor(0x00FFAA)
        .setFooter({ text: 'EAM.LOL | Secure Token Service – 100% free' });

    try {
        await interaction.user.send({ embeds: [successEmbed], files: [attachment, textAttachment] });
        isGenerating = false;
        activeGenerations.delete(userId);
        console.log(`[GENERATION] Token sent to ${interaction.user.tag} (ID: ${genId})`);
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
    new SlashCommandBuilder()
        .setName('token-meaning')
        .setDescription('Learn what all the token terms and status icons mean'),
    new SlashCommandBuilder()
        .setName('fun')
        .setDescription('Get a random fun fact or joke about Animal Company.'),
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('See the top 5 token generators in the server.'),
    new SlashCommandBuilder()
        .setName('lottery')
        .setDescription('Enter the token lottery draw (admin draws a winner).'),
    new SlashCommandBuilder()
        .setName('history')
        .setDescription('View your last 5 generated token IDs.'),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show bot statistics: total tokens, subscribers, uptime.'),
    new SlashCommandBuilder().setName('stock').setDescription('Open form to add token stock').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('stock_main').setDescription('Set the main/default token').addStringOption(opt => opt.setName('bearer').setDescription('Bearer token').setRequired(true)).addStringOption(opt => opt.setName('refresh').setDescription('Refresh token').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('set-refresh').setDescription('Update only the refresh token (tested immediately)').addStringOption(opt => opt.setName('refresh').setDescription('The new refresh token').setRequired(true)),
    new SlashCommandBuilder().setName('test-refresh').setDescription('Test if the current refresh token works'),
    new SlashCommandBuilder().setName('generator').setDescription('Post generator panel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('force_refresh').setDescription('Force refresh the current token').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('force-refresh-now')
        .setDescription('Force an immediate token refresh (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('sub-all')
        .setDescription('Subscribe all server members (except bots) to token delivery')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('un-suball')
        .setDescription('Unsubscribe all server members from token delivery')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('send-all-token')
        .setDescription('Send a fresh token to all currently subscribed users')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('refresh-status')
        .setDescription('Show current refresh health and token status')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('update-log')
        .setDescription('Re‑post the latest update log')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('rename-token-channel')
        .setDescription('Force update the token number channel name (admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

// ========== STATUS PANEL UPDATE FUNCTION ==========
async function updateStatusPanel() {
    try {
        const channel = client.channels.cache.get(STATUS_CHANNEL_ID);
        if (!channel) {
            console.error(`[ERROR] Status channel ${STATUS_CHANNEL_ID} not found.`);
            return;
        }

        await cleanupDuplicateStatusPanels(STATUS_CHANNEL_ID);

        const token = tokenStock.length > 0 ? tokenStock[0] : null;
        let statusText = '🔴 token-expired';
        let color = 0xED4245;
        let expiryText = 'N/A';
        let timeLeft = 'N/A';
        let tokenNumber = token && token.displayNumber ? token.displayNumber : 0;

        if (token && token.bearer) {
            const expiry = getTokenExpiryMs(token.bearer);
            if (expiry !== null) {
                const now = Date.now();
                const ttl = Math.floor((expiry - now) / 1000);
                expiryText = new Date(expiry).toUTCString();
                timeLeft = ttl > 0 ? formatRemainingTime(expiry) : 'EXPIRED';

                const apiCheck = await validateTokenDetails(token.bearer, token.refresh);
                const apiValid = apiCheck.valid;

                if (ttl <= 0 || !apiValid) {
                    statusText = '🔴 token-expired';
                    color = 0xED4245;
                } else if (ttl < 300) {
                    statusText = '🟡 token-expiring-soon';
                    color = 0xF1C40F;
                } else {
                    statusText = '🟢 token-available';
                    color = 0x2ECC71;
                }
            } else {
                statusText = '⚠️ token-unknown';
                color = 0xFEE75C;
            }
        } else {
            statusText = '🟠 token-none';
            color = 0xF39C12;
        }

        await updateStatusChannelName();
        await updateTokenNumberChannel();

        const embed = new EmbedBuilder()
            .setTitle('📊 Token Status Dashboard')
            .setDescription(`Live status of the bot's main token.`)
            .setColor(color)
            .addFields(
                { name: 'Token #', value: `${tokenNumber}`, inline: true },
                { name: 'Status', value: statusText, inline: true },
                { name: 'Stock Count', value: `${tokenStock.length} token(s)`, inline: true },
                { name: 'Expires At (UTC)', value: expiryText, inline: true },
                { name: 'Time Left', value: timeLeft, inline: true },
                { name: 'Last Refresh', value: lastRefreshExpiry ? humanExpiry(lastRefreshExpiry) : 'Never', inline: true },
                { name: 'Auto-Refresh Cycle', value: 'Every 2m 30s', inline: true }
            )
            .setFooter({ text: `EAM.LOL Status | v${VERSION}` })
            .setTimestamp();

        const components = [];

        if (statusPanelMessage) {
            try {
                const oldChannel = client.channels.cache.get(statusPanelMessage.channelId);
                if (oldChannel) {
                    const oldMsg = await oldChannel.messages.fetch(statusPanelMessage.messageId);
                    await oldMsg.edit({ embeds: [embed], components });
                    return;
                }
            } catch (err) {
                console.log('[STATUS] Old panel not found, sending new one.');
                statusPanelMessage = null;
            }
        }

        const msg = await channel.send({ embeds: [embed], components });
        statusPanelMessage = {
            channelId: msg.channel.id,
            messageId: msg.id
        };
    } catch (err) {
        console.error('[ERROR] Updating status panel:', err);
    }
}

async function updateStatusChannelName() {
    try {
        const channel = client.channels.cache.get(STATUS_CHANNEL_ID);
        if (!channel) return;

        const token = tokenStock.length > 0 ? tokenStock[0] : null;
        let newName = '🟠 token-none';

        if (token && token.bearer) {
            const expiry = getTokenExpiryMs(token.bearer);
            if (expiry !== null) {
                const now = Date.now();
                const ttl = Math.floor((expiry - now) / 1000);
                const apiCheck = await validateTokenDetails(token.bearer, token.refresh);
                const valid = apiCheck.valid && ttl > 0;
                if (ttl <= 0 || !valid) {
                    newName = '🔴 token-expired';
                } else if (ttl < 300) {
                    newName = '🟡 token-expiring-soon';
                } else {
                    newName = '🟢 token-available';
                }
            } else {
                newName = '⚠️ token-unknown';
            }
        } else {
            newName = '🟠 token-none';
        }

        if (channel.name !== newName) {
            await channel.setName(newName);
            console.log(`[STATUS] Channel name updated to: ${newName}`);
        }
    } catch (err) {
        console.error('[STATUS] Error updating status channel name:', err);
    }
}

// ========== TOKEN NUMBER CHANNEL UPDATE ==========
async function updateTokenNumberChannel() {
    try {
        const channel = client.channels.cache.get(TOKEN_NUMBER_CHANNEL_ID);
        if (!channel) {
            console.error(`[TOKEN_NUMBER] Channel ${TOKEN_NUMBER_CHANNEL_ID} not found.`);
            return;
        }

        const token = tokenStock.length > 0 ? tokenStock[0] : null;
        let emoji = '🔴';
        let number = 0;

        if (token && token.bearer) {
            const expiry = getTokenExpiryMs(token.bearer);
            if (expiry !== null) {
                const now = Date.now();
                const ttl = Math.floor((expiry - now) / 1000);
                const apiCheck = await validateTokenDetails(token.bearer, token.refresh);
                const valid = apiCheck.valid && ttl > 0;
                if (valid) {
                    if (ttl < 300) {
                        emoji = '🟡';
                    } else {
                        emoji = '🟢';
                    }
                    number = token.displayNumber || 0;
                } else {
                    emoji = '🔴';
                    number = 0;
                }
            } else {
                emoji = '⚠️';
                number = 0;
            }
        } else {
            emoji = '🔴';
            number = 0;
        }

        const newName = `${emoji} token-in-bot${number}`;
        if (channel.name !== newName) {
            await channel.setName(newName);
            console.log(`[TOKEN_NUMBER] Channel name updated to: ${newName}`);
        }
    } catch (err) {
        console.error('[TOKEN_NUMBER] Error updating channel name:', err);
    }
}

async function cleanupDuplicateStatusPanels(channelId) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return;
        const messages = await channel.messages.fetch({ limit: 20 });
        const botMessages = messages.filter(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title === '📊 Token Status Dashboard');
        if (botMessages.size > 1) {
            const sorted = botMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            const latest = sorted.first();
            for (const [id, msg] of sorted) {
                if (msg.id !== latest.id) {
                    await msg.delete();
                    console.log(`[CLEANUP] Deleted duplicate status panel: ${msg.id}`);
                }
            }
        }
    } catch (err) {
        console.error('[CLEANUP] Error cleaning up status panels:', err);
    }
}

function buildSubscriptionEmbed() {
    const token = tokenStock.length > 0 ? tokenStock[0] : null;
    let status = '🔴 EXPIRED';
    let color = 0xED4245;
    let timeLeft = 'N/A';
    let tokenNumber = token && token.displayNumber ? token.displayNumber : 0;

    if (token && token.bearer) {
        const expiry = getTokenExpiryMs(token.bearer);
        if (expiry !== null) {
            const now = Date.now();
            const ttl = Math.floor((expiry - now) / 1000);
            timeLeft = ttl > 0 ? formatRemainingTime(expiry) : 'EXPIRED';

            if (ttl <= 0) {
                status = '🔴 EXPIRED';
                color = 0xED4245;
            } else if (ttl < 300) {
                status = '🟡 EXPIRING SOON';
                color = 0xF1C40F;
            } else {
                status = '🟢 ACTIVE';
                color = 0x2ECC71;
            }
        } else {
            status = '⚠️ UNKNOWN';
            color = 0xFEE75C;
        }
    } else {
        status = '🟠 NONE';
        color = 0xF39C12;
    }

    const embed = new EmbedBuilder()
        .setTitle('📋 Subscription Panel')
        .setDescription(
            'Click **Subscribe** to receive tokens every 5 min.\n' +
            'Click **Get Token Now** for an immediate token.\n' +
            'Admins: use **Refresh Stock** to refresh the main token.'
        )
        .setColor(color)
        .addFields(
            { name: '👥 Subscribers', value: `${subscribedUsers.size}`, inline: true },
            { name: '📌 Token #', value: `${tokenNumber}`, inline: true },
            { name: '📌 Status', value: status, inline: true },
            { name: '⏳ Time Left', value: timeLeft, inline: true }
        )
        .setFooter({ text: `EAM.LOL v${VERSION}` })
        .setTimestamp();
    return embed;
}

async function updateSubscriptionPanel() {
    if (subscriptionPanelMessage) {
        const oldChannel = client.channels.cache.get(subscriptionPanelMessage.channelId);
        if (oldChannel) {
            try {
                await oldChannel.messages.fetch(subscriptionPanelMessage.messageId);
            } catch (err) {
                subscriptionPanelMessage = null;
            }
        } else {
            subscriptionPanelMessage = null;
        }
    }

    if (subscriptionPanelMessage) {
        try {
            const channel = client.channels.cache.get(subscriptionPanelMessage.channelId);
            if (!channel) return;
            const message = await channel.messages.fetch(subscriptionPanelMessage.messageId);
            if (!message) return;
            const embed = buildSubscriptionEmbed();
            const components = message.components;
            await message.edit({ embeds: [embed], components });
            return;
        } catch (err) {
            console.log('[INFO] Subscription panel message no longer available, will repost if needed.');
            subscriptionPanelMessage = null;
        }
    }
}

async function cleanupDuplicateSubscriptionPanels(channelId) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return;
        const messages = await channel.messages.fetch({ limit: 20 });
        const botMessages = messages.filter(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title === '📋 Subscription Panel');
        if (botMessages.size > 1) {
            const sorted = botMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            const latest = sorted.first();
            for (const [id, msg] of sorted) {
                if (msg.id !== latest.id) {
                    await msg.delete();
                    console.log(`[CLEANUP] Deleted duplicate subscription panel: ${msg.id}`);
                }
            }
        }
    } catch (err) {
        console.error('[CLEANUP] Error cleaning up panels:', err);
    }
}

// --- READY ---
client.once('ready', async () => {
    console.log(`[SYSTEM] [EAM.LOL] ONLINE: ${client.user.tag}`);
    tokenStock = [{ bearer: DEFAULT_TOKEN.bearer, refresh: DEFAULT_TOKEN.refresh_token, addedAt: Date.now(), expiresAt: getTokenExpiryMs(DEFAULT_TOKEN.bearer), displayNumber: generateTokenNumber() }];
    await findWorkingApiUrl();
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
        console.log('[SUCCESS] [EAM.LOL] Slash commands registered');
    } catch (error) { console.error('[ERROR] [EAM.LOL] Failed to register commands:', error); }

    logQueueInterval = setInterval(processLogQueue, 2000);

    await updateStatusChannelName();
    await updateTokenNumberChannel();

    startAutoRefresh();
    startDeliveryLoop();
    await catchUpSubscribers();
    await postUpdateLog();
    await updateStatusPanel();

    if (subscriptionPanelMessage) {
        await cleanupDuplicateSubscriptionPanels(subscriptionPanelMessage.channelId);
    }

    setInterval(async () => {
        await updateStatusPanel();
    }, 30000);

    setInterval(async () => {
        await updateSubscriptionPanel();
    }, 5000);
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (!hasRequiredRole(interaction)) {
                console.log(`[ACCESS DENIED] ${interaction.user.tag} tried to use /${interaction.commandName} but lacks role ${REQUIRED_ROLE_ID}`);
                return interaction.reply({
                    content: `You need <@&${REQUIRED_ROLE_ID}> to use bot commands.`,
                    flags: 64
                });
            }

            const { commandName, options } = interaction;

            // --- FUN COMMANDS ---
            if (commandName === 'fun') {
                const facts = [
                    "🦴 Animal Company tokens are powered by Nakama server technology.",
                    "🎮 The bearer token is your digital passport to the game.",
                    "⏰ Tokens expire after 1 hour, but we auto-refresh every 2.5 minutes!",
                    "📈 This bot has generated thousands of tokens for the community.",
                    "💡 Refresh tokens are like a spare key – keep them safe!",
                    "🐾 Animal Company was originally called 'PetWorld' during development.",
                    "🚀 The Nakama server handles all authentication – it's the backbone.",
                    "🎁 Donating a token helps keep the bot running for everyone."
                ];
                const fact = facts[Math.floor(Math.random() * facts.length)];
                const embed = new EmbedBuilder()
                    .setTitle('🎉 Fun Fact')
                    .setDescription(fact)
                    .setColor(0xF1C40F)
                    .setFooter({ text: 'EAM.LOL | Fun Zone' })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (commandName === 'leaderboard') {
                const sorted = [...userTokenCounts.entries()].sort((a, b) => b[1] - a[1]);
                const top5 = sorted.slice(0, 5);
                let desc = '';
                if (top5.length === 0) desc = 'No one has generated any tokens yet.';
                else {
                    top5.forEach(([userId, count], index) => {
                        const user = client.users.cache.get(userId);
                        const name = user ? user.tag : `Unknown (${userId})`;
                        desc += `#${index+1} **${name}** – ${count} token${count !== 1 ? 's' : ''}\n`;
                    });
                }
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Token Generator Leaderboard')
                    .setDescription(desc)
                    .setColor(0xF1C40F)
                    .setFooter({ text: 'EAM.LOL | Leaderboard' })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (commandName === 'lottery') {
                const userId = interaction.user.id;
                if (lotteryPool.has(userId)) {
                    return interaction.reply({ content: 'You are already entered in the lottery!', flags: 64 });
                }
                lotteryPool.add(userId);
                return interaction.reply({ content: '🎟️ You have been entered into the token lottery! An admin will draw a winner later.', flags: 64 });
            }

            if (commandName === 'history') {
                const userId = interaction.user.id;
                const history = userHistory.get(userId) || [];
                if (history.length === 0) {
                    return interaction.reply({ content: 'You haven\'t generated any tokens yet.', flags: 64 });
                }
                const entries = history.slice(-5).reverse().map(h => `\`${h.id}\` (${new Date(h.timestamp).toLocaleString()})`).join('\n');
                const embed = new EmbedBuilder()
                    .setTitle('📜 Your Token History')
                    .setDescription(entries)
                    .setColor(0x3498DB)
                    .setFooter({ text: 'EAM.LOL | History' })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (commandName === 'stats') {
                const uptime = process.uptime();
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);
                const embed = new EmbedBuilder()
                    .setTitle('📊 Bot Statistics')
                    .addFields(
                        { name: 'Total Tokens Generated', value: `${totalTokensGenerated}`, inline: true },
                        { name: 'Subscribers', value: `${subscribedUsers.size}`, inline: true },
                        { name: 'Stock Tokens', value: `${tokenStock.length}`, inline: true },
                        { name: 'Accounts Loaded', value: `${accounts.length}`, inline: true },
                        { name: 'Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
                        { name: 'Lottery Entries', value: `${lotteryPool.size}`, inline: true }
                    )
                    .setColor(0x5865F2)
                    .setFooter({ text: 'EAM.LOL | Stats' })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            // --- UPDATE LOG ---
            if (commandName === 'update-log') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                await postUpdateLog();
                return interaction.editReply({ content: 'Update log posted to <#' + UPDATE_LOG_CHANNEL_ID + '>.', flags: 64 });
            }

            // --- SUB-ALL ---
            if (commandName === 'sub-all') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                const count = await subscribeAllMembers(interaction.guild);
                await updateSubscriptionPanel();
                return interaction.editReply({ content: `Subscribed **${count}** members.`, flags: 64 });
            }

            // --- UN-SUBALL ---
            if (commandName === 'un-suball') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                const count = await unsubscribeAllMembers();
                await updateSubscriptionPanel();
                return interaction.editReply({ content: `Unsubscribed **${count}** members.`, flags: 64 });
            }

            // --- SEND-ALL-TOKEN ---
            if (commandName === 'send-all-token') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                const { successCount, failCount } = await sendTokenToAllSubscribers();
                return interaction.editReply({ content: `Sent to **${successCount}** subscribers (${failCount} failed).`, flags: 64 });
            }

            // --- REFRESH-STATUS ---
            if (commandName === 'refresh-status') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                const token = tokenStock.length > 0 ? tokenStock[0] : null;
                const status = token ? {
                    bearer: token.bearer ? token.bearer.slice(0, 20) + '...' : 'N/A',
                    refresh: token.refresh ? token.refresh.slice(0, 20) + '...' : 'N/A',
                    expiresAt: token.expiresAt ? new Date(token.expiresAt).toISOString() : 'N/A',
                    timeLeft: token.expiresAt ? formatRemainingTime(token.expiresAt) : 'N/A',
                    valid: token.expiresAt ? Date.now() < token.expiresAt : false,
                    number: token.displayNumber || 0
                } : null;
                const embed = new EmbedBuilder()
                    .setTitle('Refresh Status')
                    .addFields(
                        { name: 'Token #', value: status ? `${status.number}` : 'N/A', inline: true },
                        { name: 'Token in Stock', value: status ? 'Yes' : 'No', inline: true },
                        { name: 'Valid', value: status && status.valid ? '✅ Yes' : '❌ No', inline: true },
                        { name: 'Expires', value: status ? status.timeLeft : 'N/A', inline: true },
                        { name: 'Subscribers', value: `${subscribedUsers.size}`, inline: true },
                        { name: 'Accounts Loaded', value: `${accounts.length}`, inline: true },
                        { name: 'Last Refresh', value: lastRefreshExpiry ? humanExpiry(lastRefreshExpiry) : 'Never', inline: true }
                    )
                    .setColor(status && status.valid ? 0x2ECC71 : 0xED4245)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed], flags: 64 });
            }

            // --- SUBSCRIPTION COMMANDS ---
            if (commandName === 'subscribe') {
                await interaction.deferReply({ flags: 64 });
                if (subscribedUsers.has(interaction.user.id)) {
                    return interaction.editReply({ content: 'You are already subscribed!', flags: 64 });
                }
                subscribedUsers.add(interaction.user.id);
                const success = await deliverTokenToUser(interaction.user);
                await updateSubscriptionPanel();
                return interaction.editReply({ content: success ? 'Subscribed – you will receive tokens every 5 minutes.' : 'Subscribed but could not send initial token. Try again.', flags: 64 });
            }

            if (commandName === 'unsubscribe') {
                await interaction.deferReply({ flags: 64 });
                if (!subscribedUsers.has(interaction.user.id)) {
                    return interaction.editReply({ content: 'You are not subscribed.', flags: 64 });
                }
                subscribedUsers.delete(interaction.user.id);
                await updateSubscriptionPanel();
                return interaction.editReply({ content: 'Unsubscribed.', flags: 64 });
            }

            // --- SUBSCRIPTION PANEL ---
            if (commandName === 'subscription-panel') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied – Admin only to post panel.', flags: 64 });

                await cleanupDuplicateSubscriptionPanels(interaction.channel.id);

                const embed = buildSubscriptionEmbed();
                const row1 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('subscribe_panel')
                            .setLabel('Subscribe')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('unsubscribe_panel')
                            .setLabel('Unsubscribe')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('get_token_now')
                            .setLabel('Get Token Now')
                            .setStyle(ButtonStyle.Primary)
                    );
                const row2 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('refresh_stock_btn')
                            .setLabel('🔄 Refresh Stock')
                            .setStyle(ButtonStyle.Primary)
                    );

                const reply = await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: false, withResponse: true });
                const message = reply.resource.message;
                subscriptionPanelMessage = {
                    channelId: message.channel.id,
                    messageId: message.id
                };
                return;
            }

            // --- MOD APPLICATION PANEL ---
            if (commandName === 'mod-application-panel') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied – Admin only to post panel.', flags: 64 });

                const embed = new EmbedBuilder()
                    .setTitle('Moderator Application')
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
                            .setLabel('Apply Now')
                            .setStyle(ButtonStyle.Primary)
                    );

                await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
                return;
            }

            // --- FAST COMMANDS ---
            const fastCommands = ['ping', '8ball', 'help', 'serverinfo'];
            if (fastCommands.includes(commandName)) {
                if (commandName === 'ping') {
                    return interaction.reply({ content: `Pong! ${client.ws.ping}ms`, flags: 64 });
                }
                if (commandName === '8ball') {
                    const question = options.getString('question');
                    const answers = ['Yes.', 'No.', 'Maybe.', 'Definitely.', 'Ask again later.', 'Outlook not so good.'];
                    const ans = answers[Math.floor(Math.random() * answers.length)];
                    const embed = new EmbedBuilder().setTitle('8-BALL').addFields({ name: 'Question', value: question }, { name: 'Answer', value: ans }).setColor(0x3498DB);
                    return interaction.reply({ embeds: [embed] });
                }
                if (commandName === 'help') {
                    const embed = new EmbedBuilder().setTitle('EAM.LOL Command Interface')
                        .setDescription('All available commands are listed below.')
                        .addFields(
                            { name: 'Token Generation', value: '/token - Generate a fresh token\n/generator - Post the generator panel', inline: true },
                            { name: 'Subscription', value: '/subscribe - Get tokens in DMs every 5 min\n/unsubscribe - Stop auto-delivery\n/subscription-panel - Post interactive panel (admin)', inline: true },
                            { name: 'Moderation', value: '/mod-application-panel - Post the mod application panel (admin)', inline: true },
                            { name: 'Admin Tools', value: '/sub-all - Subscribe all members\n/un-suball - Unsubscribe all\n/send-all-token - Send to all subscribers\n/refresh-status - Check refresh health\n/set-refresh - Update only refresh token\n/test-refresh - Test current refresh token\n/force-refresh-now - Force immediate refresh', inline: true },
                            { name: 'Utilities', value: '/check-expiry - Check expiry of a raw token\n/check-panel - Check/validate a token from JSON', inline: true },
                            { name: 'Extras', value: '/donation-panel - Donate a token\n/split-panel - Split a token JSON', inline: true },
                            { name: 'Fun Zone', value: '/fun - Random fact\n/leaderboard - Top generators\n/lottery - Enter draw\n/history - Your token history\n/stats - Bot stats', inline: true },
                            { name: 'Admin Only', value: '/stock - Add token stock\n/force_refresh - Force refresh\n/announce - DM all members', inline: true }
                        )
                        .setColor(0x3498DB)
                        .addFields({ name: 'Credits', value: '@elliott', inline: true })
                        .setFooter({ text: 'Run /update-log to see what\'s new' });
                    return interaction.reply({ embeds: [embed], flags: 64 });
                }
                if (commandName === 'serverinfo') {
                    const guild = interaction.guild;
                    const embed = new EmbedBuilder().setTitle(`Server: ${guild.name}`).setThumbnail(guild.iconURL())
                        .addFields(
                            { name: 'Members', value: `${guild.memberCount}`, inline: true },
                            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>`, inline: true },
                            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true }
                        ).setColor(0x3498DB).setTimestamp();
                    return interaction.reply({ embeds: [embed] });
                }
            }

            // --- TOKEN-MEANING ---
            if (commandName === 'token-meaning') {
                const embed = new EmbedBuilder()
                    .setTitle('📘 Token Glossary & Status Guide')
                    .setDescription(
                        'Here’s what everything means in the EAM.LOL token system.\n\n' +
                        '**Status Indicators**\n' +
                        '🟢 **token-available** – Token is alive and ready to use (≥5 min left).\n' +
                        '🟡 **token-expiring-soon** – Less than 5 minutes left; the bot will auto‑refresh shortly.\n' +
                        '🔴 **token-expired** – Token no longer works; the bot will fall back to a new token.\n' +
                        '🟠 **token-none** – No token in stock.\n\n' +
                        '**Token Types**\n' +
                        '• **Bearer Token** – The long string you paste into Animal Company. This is your **access key**.\n' +
                        '• **Refresh Token** – The secret that allows the bot to get a new Bearer without you logging in again.\n' +
                        '• **Expiry** – The exact time when the Bearer stops working. The bot auto‑refreshes before that.\n\n' +
                        '**Bot Features**\n' +
                        '• **Stock** – The pool of available tokens. The bot keeps one active at all times.\n' +
                        '• **Auto‑Refresh** – Every 2 minutes 30 seconds, the bot renews the Bearer token automatically, so you never run out.\n' +
                        '• **Delivery** – Subscribers get a fresh token every 5 minutes directly in their DMs.\n\n' +
                        '**Need more help?** Use `/help` or ask a staff member.'
                    )
                    .setColor(0x5865F2)
                    .setFooter({ text: 'EAM.LOL | Token System v' + VERSION })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            // --- RENAME TOKEN CHANNEL (fallback) ---
            if (commandName === 'rename-token-channel') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                try {
                    await updateTokenNumberChannel();
                    return interaction.editReply({ content: '✅ Token channel renamed successfully.', flags: 64 });
                } catch (err) {
                    console.error('[RENAME] Error:', err);
                    return interaction.editReply({ content: `❌ Failed: ${err.message}`, flags: 64 });
                }
            }

            // --- FORCE REFRESH NOW ---
            if (commandName === 'force-refresh-now') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                try {
                    if (tokenStock.length === 0) {
                        return interaction.editReply({ content: 'No token in stock to refresh.', flags: 64 });
                    }
                    const result = await refreshToken(tokenStock[0].refresh);
                    if (result.success) {
                        await updateStatusPanel();
                        await updateSubscriptionPanel();
                        return interaction.editReply({ content: `✅ Token refreshed! New expiry: ${humanExpiry(result.expiresAt)}`, flags: 64 });
                    } else {
                        return interaction.editReply({ content: `❌ Refresh failed: ${result.error}`, flags: 64 });
                    }
                } catch (err) {
                    return interaction.editReply({ content: `❌ Error: ${err.message}`, flags: 64 });
                }
            }

            // --- ALL OTHER COMMANDS ---
            await interaction.deferReply({ flags: 64 });

            // --- SET-REFRESH ---
            if (commandName === 'set-refresh') {
                if (!hasAdminAccess(interaction)) return interaction.editReply({ content: 'Access Denied.', flags: 64 });
                const newRefresh = options.getString('refresh');
                await interaction.editReply({ content: '⏳ Testing new refresh token...' });

                const test = await refreshTokenOnly(newRefresh);
                if (!test.success) {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Refresh Token Invalid')
                        .setDescription(`Error: ${test.error}`)
                        .setColor(0xED4245)
                        .addFields(
                            { name: 'Refresh Token', value: `\`${newRefresh.slice(0, 30)}...\``, inline: false },
                            { name: 'Status', value: '❌ Invalid', inline: true }
                        )
                        .setTimestamp();
                    return interaction.editReply({ embeds: [embed] });
                }

                const jwtCheck = validateTokenJWT(test.bearer, newRefresh);
                if (!jwtCheck.valid) {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Bearer Token JWT Invalid')
                        .setDescription(`The refresh worked, but the new bearer has an invalid JWT expiry.`)
                        .setColor(0xED4245)
                        .setTimestamp();
                    return interaction.editReply({ embeds: [embed] });
                }

                DEFAULT_TOKEN.bearer = test.bearer;
                DEFAULT_TOKEN.refresh_token = newRefresh;

                const oldNumber = tokenStock.length > 0 && tokenStock[0].displayNumber ? tokenStock[0].displayNumber : generateTokenNumber();
                if (tokenStock.length > 0) {
                    tokenStock[0].bearer = test.bearer;
                    tokenStock[0].refresh = newRefresh;
                    tokenStock[0].expiresAt = test.expiresAt;
                    tokenStock[0].displayNumber = oldNumber;
                } else {
                    tokenStock.push({
                        bearer: test.bearer,
                        refresh: newRefresh,
                        addedAt: Date.now(),
                        expiresAt: test.expiresAt,
                        id: generateGenerationId(),
                        userId: 'system',
                        username: 'System',
                        displayNumber: oldNumber
                    });
                }
                lastRefreshExpiry = test.expiresAt;
                consecutiveFails = 0;

                addOrUpdateAccount(test.bearer, newRefresh);

                await updateStatusPanel();
                await updateSubscriptionPanel();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Refresh & Bearer Updated')
                    .setDescription('Both tokens are valid, synced to stock, and added to fallback accounts.')
                    .setColor(0x2ECC71)
                    .addFields(
                        { name: 'New Bearer', value: `\`${test.bearer.slice(0, 30)}...\``, inline: false },
                        { name: 'New Refresh', value: `\`${newRefresh.slice(0, 30)}...\``, inline: false },
                        { name: 'Expires', value: humanExpiry(test.expiresAt), inline: true }
                    )
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // --- TEST REFRESH ---
            if (commandName === 'test-refresh') {
                if (!hasAdminAccess(interaction)) return interaction.editReply({ content: 'Access Denied.', flags: 64 });
                if (tokenStock.length === 0) return interaction.editReply({ content: 'No token in stock.' });
                const current = tokenStock[0];
                if (!current.refresh) return interaction.editReply({ content: 'No refresh token in stock.' });

                await interaction.editReply({ content: '⏳ Testing refresh token...' });
                const result = await refreshTokenOnly(current.refresh);
                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Refresh Token Works')
                        .setDescription('The refresh token is valid and can produce a new bearer.')
                        .setColor(0x2ECC71)
                        .addFields(
                            { name: 'New Bearer', value: `\`${result.bearer.slice(0, 30)}...\``, inline: false },
                            { name: 'New Expiry', value: humanExpiry(result.expiresAt), inline: true }
                        )
                        .setTimestamp();
                    return interaction.editReply({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ Refresh Token Invalid')
                        .setDescription(`Error: ${result.error}`)
                        .setColor(0xED4245)
                        .setTimestamp();
                    return interaction.editReply({ embeds: [embed] });
                }
            }

            // --- TOKEN GENERATION ---
            if (commandName === 'token') {
                await processTokenGeneration(interaction, 'Public Token');
                return;
            }

            // --- ANNOUNCE ---
            if (commandName === 'announce') {
                if (!hasAdminAccess(interaction)) return interaction.editReply({ content: 'You need admin permissions.', flags: 64 });
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
                        await member.send({ embeds: [new EmbedBuilder().setTitle('Announcement').setDescription(messageContent).setColor(0xFFAA00).setTimestamp().setFooter({ text: `From ${guild.name}` })] });
                        successCount++;
                    } catch (err) { failCount++; }
                    index++;
                    if (index % 10 === 0 || index === total) await interaction.editReply({ content: `Sending DMs... (${index}/${total})` });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                return interaction.editReply({ content: `Announcement DMs sent! ${successCount} succeeded, ${failCount} failed (skipped bots).` });
            }

            // --- DONATE-PANEL ---
            if (commandName === 'donate-panel') {
                const embed = new EmbedBuilder()
                    .setTitle('Support the Project')
                    .setDescription('Your contributions keep this bot alive and the tokens flowing. Choose a platform below to send a donation.')
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
                return interaction.editReply({ embeds: [embed], components: [row1, row2], ephemeral: false });
            }

            // --- DONATION-PANEL ---
            if (commandName === 'donation-panel') {
                const embed = new EmbedBuilder()
                    .setTitle('Donate a Token')
                    .setDescription('Paste a valid JSON containing `token` (bearer) and `refresh_token`. The bot will validate and add it to the stock.')
                    .addFields(
                        { name: 'Step 1', value: 'Copy the token JSON from your client', inline: true },
                        { name: 'Step 2', value: 'Paste it into the modal', inline: true },
                        { name: 'Step 3', value: 'Hit Donate - it gets added to stock!', inline: true }
                    )
                    .setColor(0x5865F2)
                    .setFooter({ text: getLiveUIStats(interaction) });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('donate_token_btn').setLabel('Donate Token').setStyle(ButtonStyle.Success));
                return interaction.editReply({ embeds: [embed], components: [row], ephemeral: false });
            }

            // --- CHECK-PANEL ---
            if (commandName === 'check-panel') {
                const embed = new EmbedBuilder()
                    .setTitle('Check Token')
                    .setDescription('Paste a JSON containing `token` (or bearer) and `refresh_token`. The bot will extract and validate them.')
                    .addFields(
                        { name: 'Step 1', value: 'Paste JSON', inline: true },
                        { name: 'Step 2', value: 'Click Check', inline: true },
                        { name: 'Result', value: 'JWT Validation', inline: true }
                    )
                    .setColor(0x3498DB)
                    .setFooter({ text: getLiveUIStats(interaction) });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('check_token_btn').setLabel('Check Token').setStyle(ButtonStyle.Primary));
                return interaction.editReply({ embeds: [embed], components: [row], ephemeral: false });
            }

            // --- SPLIT-PANEL ---
            if (commandName === 'split-panel') {
                const embed = new EmbedBuilder()
                    .setTitle('Split Token')
                    .setDescription('Paste a JSON containing `token` (or bearer) and `refresh_token`. The bot will extract and return them separately.')
                    .addFields(
                        { name: 'Step 1', value: 'Paste JSON', inline: true },
                        { name: 'Step 2', value: 'Click Split', inline: true },
                        { name: 'Output', value: 'Separate Bearer & Refresh', inline: true }
                    )
                    .setColor(0x2ECC71)
                    .setFooter({ text: getLiveUIStats(interaction) });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('split_token_btn').setLabel('Split Token').setStyle(ButtonStyle.Success));
                return interaction.editReply({ embeds: [embed], components: [row], ephemeral: false });
            }

            // --- CHECK-EXPIRY ---
            if (commandName === 'check-expiry') {
                const token = options.getString('token');
                const expiry = getTokenExpiryMs(token);
                const hasExpiry = expiry !== null;
                const isExpired = hasExpiry && Date.now() >= expiry;
                const remaining = hasExpiry ? secondsUntilExpiry(token) : null;
                const embed = new EmbedBuilder()
                    .setTitle('Expiry Check')
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
                    await interaction.editReply({ content: '⏳ Testing refresh token...' });
                    const test = await refreshTokenOnly(refresh);
                    if (test.success) {
                        const jwtCheck = validateTokenJWT(test.bearer, test.refresh);
                        if (!jwtCheck.valid) {
                            const embed = new EmbedBuilder()
                                .setTitle('❌ Token JWT Invalid')
                                .setDescription(`The token has an invalid JWT expiry.`)
                                .setColor(0xED4245)
                                .setTimestamp();
                            return interaction.editReply({ embeds: [embed] });
                        }
                        const newNumber = generateTokenNumber();
                        DEFAULT_TOKEN.bearer = test.bearer;
                        DEFAULT_TOKEN.refresh_token = test.refresh;
                        lastRefreshExpiry = test.expiresAt;
                        tokenStock = [{ bearer: test.bearer, refresh: test.refresh, addedAt: Date.now(), expiresAt: test.expiresAt, displayNumber: newNumber }];
                        await updateStatusPanel();
                        await updateSubscriptionPanel();
                        const embed = new EmbedBuilder()
                            .setTitle('✅ Token Updated')
                            .setDescription(`Main token successfully set with number **${newNumber}**.`)
                            .setColor(0x2ECC71)
                            .addFields(
                                { name: 'Bearer', value: `\`${test.bearer.slice(0, 30)}...\``, inline: false },
                                { name: 'Refresh', value: `\`${test.refresh.slice(0, 30)}...\``, inline: false },
                                { name: 'Expires', value: humanExpiry(test.expiresAt), inline: true },
                                { name: 'Token #', value: `${newNumber}`, inline: true },
                                { name: 'Stock Count', value: `${tokenStock.length} token(s)`, inline: true }
                            )
                            .setTimestamp();
                        return interaction.editReply({ embeds: [embed] });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle('❌ Invalid Refresh Token')
                            .setDescription(`The refresh token failed the test: ${test.error}. Token not saved.`)
                            .setColor(0xED4245)
                            .setTimestamp();
                        return interaction.editReply({ embeds: [embed] });
                    }
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
                            .setTitle('EAM.LOL Token Generator')
                            .setDescription('Secure, one‑click generation with live status. Tokens are auto‑refreshed.')
                            .addFields(
                                { name: 'System Status', value: '● Operational', inline: true },
                                { name: 'Stock', value: `${tokenStock.length} tokens`, inline: true },
                                { name: 'Cooldown', value: '0s', inline: true },
                                { name: 'Auto‑Refresh', value: '2m 30s', inline: true },
                                { name: 'Delivery', value: 'Direct Message', inline: true },
                                { name: 'Latency', value: `${client.ws.ping}ms`, inline: true }
                            )
                            .setColor(0x5865F2)
                            .setFooter({ text: getLiveUIStats(interaction) });
                    };
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gen_public').setLabel('Generate Token').setStyle(ButtonStyle.Success));
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
                            const embed = new EmbedBuilder()
                                .setTitle('✅ Token Refreshed')
                                .setColor(0x2ECC71)
                                .addFields(
                                    { name: 'Expiry', value: humanExpiry(tokenStock[0].expiresAt), inline: true },
                                    { name: 'Stock', value: `${tokenStock.length} token(s)`, inline: true }
                                )
                                .setTimestamp();
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
                    const newNumber = generateTokenNumber();
                    tokenStock = [{ bearer: DEFAULT_TOKEN.bearer, refresh: DEFAULT_TOKEN.refresh_token, addedAt: Date.now(), expiresAt: lastRefreshExpiry, displayNumber: newNumber }];
                    await updateStatusPanel();
                    await updateSubscriptionPanel();
                    return interaction.editReply({ content: `Stock reset to default. Token #${newNumber}`, flags: 64 });
                }

                if (commandName === 'remove-token') {
                    const id = options.getString('id').trim();
                    const result = removeTokenById(id);
                    await updateStatusPanel();
                    await updateSubscriptionPanel();
                    return interaction.editReply({ content: result.success ? `Success: ${result.message}` : `Error: ${result.message}`, flags: 64 });
                }

                if (commandName === 'gen-codes') {
                    const entries = tokenStock.filter(t => t.id && t.id.length > 0).map(t => ({ id: t.id, username: t.username || `<@${t.userId}>` }));
                    if (entries.length === 0) return interaction.editReply({ content: 'No active IDs.', flags: 64 });
                    const embed = new EmbedBuilder().setTitle('Active Generation IDs').setDescription(`**${entries.length}** active token(s)`).setColor(0x5865F2);
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
                        const embed = new EmbedBuilder().setTitle('EAM.LOL Token Generator').setDescription('Generate your token below.\nDMs must be open.').setColor(0x5865F2).setFooter({ text: 'Never expires' });
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gen_public').setLabel('GENERATE').setStyle(ButtonStyle.Success));
                        return interaction.editReply({ embeds: [embed], components: [row], ephemeral: false });
                    }
                    if (subArg === 'verify') {
                        const embed = new EmbedBuilder().setTitle('Verification').setDescription('Click below to verify.').setColor(0x1ABC9C);
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_btn').setLabel('VERIFY').setStyle(ButtonStyle.Success));
                        return interaction.editReply({ embeds: [embed], components: [row] });
                    }
                    if (subArg === 'redeem') {
                        const embed = new EmbedBuilder().setTitle('Key Redeem').setDescription('Got a code? Click below to redeem.').setColor(0x5865F2);
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM KEY').setStyle(ButtonStyle.Primary));
                        return interaction.editReply({ embeds: [embed], components: [row] });
                    }
                    if (subArg === 'support') {
                        const embed = new EmbedBuilder().setTitle('Support').setDescription('Select your department.').setColor(0xFEE75C);
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
                    const success = await deliverTokenToUser(interaction.user);
                    await updateSubscriptionPanel();
                    return interaction.editReply({ content: success ? 'Subscribed – you will receive tokens every 5 minutes.' : 'Subscribed but could not send initial token. Try again later.', flags: 64 });
                } else {
                    if (!subscribedUsers.has(userId)) {
                        return interaction.editReply({ content: 'You are not subscribed.', flags: 64 });
                    }
                    subscribedUsers.delete(userId);
                    await updateSubscriptionPanel();
                    return interaction.editReply({ content: 'Unsubscribed.', flags: 64 });
                }
            }

            // --- GET TOKEN NOW ---
            if (interaction.customId === 'get_token_now') {
                await interaction.deferUpdate();
                const userId = interaction.user.id;
                if (!subscribedUsers.has(userId)) {
                    return interaction.editReply({ content: 'You are not subscribed. Please click Subscribe first.', flags: 64 });
                }
                const success = await deliverTokenToUser(interaction.user);
                return interaction.editReply({ content: success ? 'A fresh token has been sent to your DMs!' : 'Could not send a token right now. Please try again later.', flags: 64 });
            }

            // --- REFRESH STOCK (admin) ---
            if (interaction.customId === 'refresh_stock_btn') {
                if (!hasAdminAccess(interaction)) {
                    return interaction.reply({ content: 'You need admin permissions to refresh the stock.', flags: 64 });
                }
                await interaction.deferUpdate();
                await interaction.editReply({ content: '⏳ Refreshing stock token...', flags: 64 });
                
                if (tokenStock.length === 0) giveNewTokenFromAccounts();
                const tokenObj = tokenStock[0];
                if (!tokenObj || !tokenObj.refresh) {
                    return interaction.editReply({ content: 'No refresh token available.', flags: 64 });
                }
                const result = await refreshToken(tokenObj.refresh);
                if (result.success) {
                    await updateStatusPanel();
                    await updateSubscriptionPanel();
                    return interaction.editReply({ content: `✅ Stock token refreshed! New expiry: ${humanExpiry(tokenStock[0].expiresAt)}`, flags: 64 });
                } else {
                    return interaction.editReply({ content: `❌ Refresh failed: ${result.error}`, flags: 64 });
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
                        .setTitle('Donation Info')
                        .setDescription('Donations help cover hosting costs and development time.\n\nAll funds go directly to keeping the bot online.\n\nThank you for your support!')
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
                const embed = new EmbedBuilder().setTitle('Remove Token').setDescription(`**${entries.length}** active | Page ${page+1}/${totalPages}`).setColor(0xED4245);
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
                await updateStatusPanel();
                await updateSubscriptionPanel();
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
                const embed = new EmbedBuilder().setTitle(`Ticket: ${category.toUpperCase()}`).setDescription(`Welcome, <@${interaction.user.id}>.`).setColor(0xFEE75C).setTimestamp();
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
                    .setTitle('New Moderator Application')
                    .setColor(0x3498DB)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: 'Applicant', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                        { name: 'Full Name', value: name, inline: true },
                        { name: 'Age', value: age, inline: true },
                        { name: 'Why do you want to be a mod?', value: why, inline: false },
                        { name: 'Experience', value: experience, inline: false },
                        { name: 'Availability', value: availability, inline: false },
                        { name: 'Additional Info', value: extra, inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Please review this application.' });

                try {
                    await interaction.guild.members.fetch();
                } catch (fetchErr) {
                    console.error('[ERROR] Failed to fetch members:', fetchErr);
                }

                const staffRoleId = REQUIRED_ROLE_ID;
                const staffMembers = interaction.guild.members.cache.filter(m => m.roles.cache.has(staffRoleId) && !m.user.bot);
                let sentCount = 0;
                let failedCount = 0;

                if (staffMembers.size === 0) {
                    await interaction.editReply({ content: 'No staff members found with the required role to DM. Please contact an admin.', flags: 64 });
                    return;
                }

                for (const [id, member] of staffMembers) {
                    try {
                        await member.send({ embeds: [embed] });
                        sentCount++;
                    } catch (err) {
                        failedCount++;
                        console.error(`[ERROR] Failed to DM staff ${member.user.tag}:`, err.message);
                    }
                    await new Promise(r => setTimeout(r, 200));
                }

                const channel = interaction.guild.channels.cache.get(MOD_APP_CHANNEL_ID);
                if (channel) {
                    await channel.send({ embeds: [embed] }).catch(() => {});
                }

                await interaction.editReply({ 
                    content: `✅ Application submitted! Sent to **${sentCount}** staff via DM (${failedCount} failed).`,
                    flags: 64 
                });

                try {
                    await interaction.user.send({ embeds: [new EmbedBuilder().setTitle('Application Received').setDescription('Your moderator application has been submitted. Staff will review it shortly.').setColor(0x2ECC71)] });
                } catch (_) {}
                return;
            }

            // --- STOCK MODAL ---
            if (interaction.customId === 'stock_modal') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                const bearer = interaction.fields.getTextInputValue('stock_bearer_input').trim();
                const refresh = interaction.fields.getTextInputValue('stock_refresh_input').trim();
                if (!bearer || !refresh) return interaction.editReply({ content: 'Both tokens required.' });
                const jwt
