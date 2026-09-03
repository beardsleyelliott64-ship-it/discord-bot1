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

// --- DONATION LINKS ---
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
  "bearer": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJlZjgyYjk2NS1iYzVmLTQ3NjktODc1Zi0zMDA3Zjg0OWZkNTQiLCJ1aWQiOiJhMzQ5MTgxOS1lZGNkLTRiZDEtOTJkNS1hODJjZjk5NzBhNjYiLCJ1c24iOiIwelVHYjBrTVhyRGl0b1FYIiwidnJzIjp7ImF1dGhJRCI6IjU3OGQzOThkYzM1NTRiYzc4ZmI1YmVjMzNhM2Q3NzdiIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiA5Ljk5LjkuOTk5OV9mZmZmZmZmZiIsImRldmljZUlEIjoiMTgzNTc2MWMyYThiNmM2MjliOTlmZmY5ZWRmZjI4OWQ3ZjNlYTEyOCJ9LCJleHAiOjE3ODgyMjU0OTYsImlhdCI6MTc4ODIyMTg5Nn0.zsyuyJcY7DJUe9ftCFbeJZc5jgIosg32Jm4pyw7GXKs",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJlZjgyYjk2NS1iYzVmLTQ3NjktODc1Zi0zMDA3Zjg0OWZkNTQiLCJ1aWQiOiJhMzQ5MTgxOS1lZGNkLTRiZDEtOTJkNS1hODJjZjk5NzBhNjYiLCJ1c24iOiIwelVHYjBrTVhyRGl0b1FYIiwidnJzIjp7ImF1dGhJRCI6IjU3OGQzOThkYzM1NTRiYzc4ZmI1YmVjMzNhM2Q3NzdiIiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiA5Ljk5LjkuOTk5OV9mZmZmZmZmZiIsImRldmljZUlEIjoiMTgzNTc2MWMyYThiNmM2MjliOTlmZmY5ZWRmZjI4OWQ3ZjNlYTEyOCJ9LCJleHAiOjE3ODgyNDM0OTYsImlhdCI6MTc4ODIyMTg5Nn0.yMAjCc1nx-TxRlWsN6ftjju6U3nxn5N7r2SqcpYCIHE"
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

// --- JWT HELPERS (exact expiry) ---
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
    console.warn('[WARN] [EAM.LOL] No exp claim in token, defaulting to 1 hour expiry.');
    return Date.now() + 3600 * 1000;
}

function isTokenExpiredObj(tokenObj) {
    if (!tokenObj || !tokenObj.bearer) return true;
    return Date.now() >= getTokenExpiryMs(tokenObj.bearer);
}

function secondsUntilExpiry(tokenStr) {
    return Math.floor((getTokenExpiryMs(tokenStr) - Date.now()) / 1000);
}

function formatRemainingTime(expiresAt) {
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
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'EXPIRED';
    return `expires in ${formatRemainingTime(expiresAt)} (${new Date(expiresAt).toUTCString()})`;
}

// --- TOKEN VALIDATION ---
async function validateTokenDetails(bearerToken) {
    const expiry = getTokenExpiryMs(bearerToken);
    const expired = Date.now() >= expiry;
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
        valid: !expired && apiValid,
        expired,
        expiry,
        apiValid,
        apiError,
        secondsRemaining: Math.floor((expiry - Date.now()) / 1000)
    };
}

// --- Refreshes a token without affecting global state ---
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
        if (newExpiry <= Date.now()) throw new Error('Refreshed token already expired');
        return { success: true, bearer: newBearer, refresh: newRefresh, expiresAt: newExpiry };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// --- TOKEN REFRESH (global) ---
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
        if (newExpiry <= Date.now()) throw new Error('Refreshed token already expired');
        tokens.bearer = newBearer;
        tokens.refresh_token = newRefresh;
        console.log(`[SUCCESS] [EAM.LOL] Token refreshed! Expires: ${new Date(newExpiry).toISOString()}`);
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
        await validateTokenDetails(result.bearer);
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
                    tokenStock[0] = {
                        bearer: nextAcc.token,
                        refresh: nextAcc.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: newExpiry,
                        id: tokenStock[0].id || generateGenerationId(),
                        userId: tokenStock[0].userId || 'system',
                        username: tokenStock[0].username || 'System'
                    };
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
            tokenStock[0] = {
                bearer: acc.token,
                refresh: acc.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: tokenStock[0].id || generateGenerationId(),
                userId: tokenStock[0].userId || 'system',
                username: tokenStock[0].username || 'System'
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
            tokenStock[0] = {
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                addedAt: Date.now(),
                expiresAt: newExpiry,
                id: tokenStock[0].id || generateGenerationId(),
                userId: tokenStock[0].userId || 'system',
                username: tokenStock[0].username || 'System'
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

// --- REFRESHER LOGIC (FORCED EVERY 2:30 MINUTES) ---
async function refreshTokenInStock() {
    if (isGenerating) {
        console.log('[INFO] [EAM.LOL] Skipping auto-refresh - generation in progress');
        return;
    }
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

    console.log('[REFRESH] [EAM.LOL] 2:30 interval reached - Forcing token refresh...');
    try {
        const result = await refreshToken(tokenObj.refresh);
        if (result.success) {
            console.log('[SUCCESS] [EAM.LOL] Token refreshed successfully! Max TTL applied.');
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

const AUTO_REFRESH_INTERVAL = 150 * 1000; // 2 minutes 30 seconds
let refreshInterval = null;
function startAutoRefresh() {
    console.log('[SYSTEM] [EAM.LOL] AUTO-REFRESH STARTED (interval: 2m 30s)');
    setTimeout(async () => {
        await findWorkingApiUrl();
        if (tokenStock.length === 0 && accounts.length > 0) giveNewTokenFromAccounts();
        await refreshTokenInStock();
        refreshInterval = setInterval(async () => {
            checkAndRemoveExpiredStock();
            await refreshTokenInStock();
        }, AUTO_REFRESH_INTERVAL);
    }, 2000);
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

function isPrivilegedUser(userId) {
    return userId === BOT_OWNER_ID || userId === ELLIOTT_ID;
}
function hasAdminAccess(interaction) {
    if (isPrivilegedUser(interaction.user.id)) return true;
    if (interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID)) return true;
    return false;
}
function hasRequiredRole(interaction) {
    if (isPrivilegedUser(interaction.user.id)) return true;
    if (interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (interaction.member?.roles?.cache?.has(REQUIRED_ROLE_ID)) return true;
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

// --- UI HELPERS (SLEEK) ---
function buildSleekProgress(step, total = 4, width = 12) {
    const filled = Math.round((step / total) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
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
        .setTitle('EAM.LOL TOKEN GENERATOR')
        .setDescription(
            `\`${progress}  ${percent}%\`\n\n` +
            `${statusLines}`
        )
        .setColor(0x44AAFF)
        .setFooter({ text: `TTL: ${ttl ? ttl+'s' : '...'}  |  ${new Date().toLocaleTimeString()}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cancel_gen')
            .setLabel('CANCEL')
            .setStyle(ButtonStyle.Danger)
    );
    await interaction.editReply({ embeds: [embed], components: [row] });
}

// --- NEW: HELPER FOR EXPIRATION-BASED FILENAMES ---
function getExpiryFileName(expiresAt, extension) {
    const date = new Date(expiresAt);
    const iso = date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
    return `token-exp-${iso}.${extension}`;
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

    await validateTokenDetails(tokenObj.bearer);

    await updateGenerationEmbed(interaction, 3, `Finalizing (${ttl}s left)...`, ttl);
    const genId = generateGenerationId();
    tokenObj.id = genId;
    tokenObj.userId = interaction.user.id;
    tokenObj.username = interaction.user.tag;
    tokenStock.shift();
    tokenStock.push(tokenObj);
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
    const attachment = new AttachmentBuilder(jsonBuffer, { name: getExpiryFileName(tokenObj.expiresAt, 'json') });
    const textVersion = `EAM.LOL TOKEN GENERATOR\n----------------------------------------\nBEARER TOKEN:\n${tokenObj.bearer}\nREFRESH TOKEN:\n${tokenObj.refresh}\nGENERATION ID:\n${genId}\n----------------------------------------\nExpires: ${expiryText}\nSeconds left: ${ttl}s\nAuto-Refresh: Constantly\n----------------------------------------`;
    const textBuffer = Buffer.from(textVersion, 'utf-8');
    const textAttachment = new AttachmentBuilder(textBuffer, { name: getExpiryFileName(tokenObj.expiresAt, 'txt') });

    const successEmbed = new EmbedBuilder()
        .setTitle('TOKEN GENERATED')
        .setDescription('> Your token has been generated and delivered.\n> Check your Direct Messages for the attached files.')
        .addFields(
            { name: 'Generation ID', value: `\`${genId}\``, inline: true },
            { name: 'Validity', value: expiryText, inline: true },
            { name: 'Stock Left', value: `${tokenStock.length}`, inline: true }
        )
        .setColor(0x00FFAA)
        .setFooter({ text: 'EAM.LOL | Secure Token Service' });

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
        .setTitle('REMOVE TOKEN')
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
    new SlashCommandBuilder()
        .setName('donate-panel')
        .setDescription('Post a donation panel with payment links.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('donation-panel')
        .setDescription('Post a panel to donate tokens by pasting JSON.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('check-panel')
        .setDescription('Post a panel to check/validate a token from JSON.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('split-panel')
        .setDescription('Post a panel to split a token JSON into bearer and refresh.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('DM all members with your announcement message.')
        .addStringOption(opt => opt.setName('message').setDescription('The announcement message').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('check-expiry')
        .setDescription('Check when a token expires (based on JWT exp claim)')
        .addStringOption(opt => opt.setName('token').setDescription('The token to check').setRequired(true))
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
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (!hasRequiredRole(interaction)) {
                return interaction.reply({
                    content: `You need <@&${REQUIRED_ROLE_ID}> to use bot commands.`,
                    flags: 64
                });
            }

            const { commandName, options } = interaction;

            if (commandName === 'ping') return interaction.reply({ content: `Pong! ${client.ws.ping}ms`, flags: 64 });
            if (commandName === '8ball') {
                const question = options.getString('question');
                const answers = ['Yes.', 'No.', 'Maybe.', 'Definitely.', 'Ask again later.', 'Outlook not so good.'];
                const ans = answers[Math.floor(Math.random() * answers.length)];
                const embed = new EmbedBuilder().setTitle('8-Ball').addFields({ name: 'Question', value: question }, { name: 'Answer', value: ans }).setColor(0x3498DB);
                return interaction.reply({ embeds: [embed] });
            }
            if (commandName === 'help') {
                const embed = new EmbedBuilder().setTitle("EAM.LOL COMMANDS").setDescription("Token Generator Bot").setColor(0x3498DB)
                    .addFields(
                        { name: "/token", value: "Generate a fresh token to your DMs", inline: false },
                        { name: "/generator", value: "Post the generator panel", inline: false },
                        { name: "/gen-codes", value: "List active generation IDs", inline: false },
                        { name: "/remove-stock", value: "Remove a token by selection", inline: false },
                        { name: "/force_refresh", value: "Force refresh the current token", inline: false },
                        { name: "/announce", value: "DM all members with your message", inline: false },
                        { name: "/donate-panel", value: "Post a donation panel with payment links", inline: false },
                        { name: "/donation-panel", value: "Donate a token by pasting JSON", inline: false },
                        { name: "/check-panel", value: "Check/validate a token from JSON", inline: false },
                        { name: "/check-expiry", value: "Check expiry of a raw token", inline: false },
                        { name: "/split-panel", value: "Split a token JSON into bearer and refresh", inline: false },
                        { name: "Auto-Refresh", value: "Smart (multi-account)", inline: false },
                        { name: "Credits", value: "@elliott", inline: false }
                    ).setFooter({ text: "EAM.LOL | Never expires" });
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
            if (commandName === 'check-expiry') {
                const token = options.getString('token');
                const expiry = getTokenExpiryMs(token);
                const isExpired = Date.now() >= expiry;
                const remaining = secondsUntilExpiry(token);
                const embed = new EmbedBuilder()
                    .setTitle('EXPIRY CHECK')
                    .addFields(
                        { name: 'Status', value: isExpired ? 'EXPIRED' : 'VALID', inline: true },
                        { name: 'Expires At', value: new Date(expiry).toUTCString(), inline: true },
                        { name: 'Remaining', value: isExpired ? '0s' : `${remaining}s`, inline: true }
                    )
                    .setColor(isExpired ? 0xED4245 : 0x2ECC71)
                    .setFooter({ text: 'EAM.LOL | Expiry Check' });
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (commandName === 'token') {
                await interaction.deferReply({ flags: 64 });
                if (tokenStock.length === 0) giveNewTokenFromAccounts();
                if (tokenStock.length === 0) return interaction.editReply({ content: 'No tokens available.' });
                isGenerating = true;
                let tokenObj = tokenStock[0];
                try {
                    const refreshResult = await refreshToken(tokenObj.refresh);
                    if (refreshResult.success) tokenObj = tokenStock[0];
                    else { giveNewTokenFromAccounts(); if (tokenStock.length > 0) tokenObj = tokenStock[0]; }
                } catch (e) { giveNewTokenFromAccounts(); if (tokenStock.length > 0) tokenObj = tokenStock[0]; }
                if (Date.now() >= tokenObj.expiresAt) { giveNewTokenFromAccounts(); if (tokenStock.length > 0) tokenObj = tokenStock[0]; else { isGenerating = false; return interaction.editReply({ content: 'Token expired.' }); } }
                const ttl = Math.floor((tokenObj.expiresAt - Date.now()) / 1000);
                if (ttl <= 0) { isGenerating = false; return interaction.editReply({ content: 'Token expired.' }); }
                await validateTokenDetails(tokenObj.bearer);
                const genId = generateGenerationId();
                tokenObj.id = genId;
                tokenObj.userId = interaction.user.id;
                tokenObj.username = interaction.user.tag;
                const expiryText = humanExpiry(tokenObj.expiresAt);
                try {
                    const tokenData = { token: { bearer: tokenObj.bearer, refresh_token: tokenObj.refresh, expires_at: new Date(tokenObj.expiresAt).toISOString(), seconds_remaining: ttl, added_at: new Date().toISOString(), generation_id: genId }, message: "EAM.LOL Token Generator", credits: "@elliott", auto_refresh: "Refreshed automatically" };
                    const jsonString = JSON.stringify(tokenData, null, 2);
                    const jsonBuffer = Buffer.from(jsonString, 'utf-8');
                    const attachment = new AttachmentBuilder(jsonBuffer, { name: getExpiryFileName(tokenObj.expiresAt, 'json') });
                    const textVersion = `EAM.LOL TOKEN GENERATOR\n----------------------------------------\nBEARER TOKEN:\n${tokenObj.bearer}\nREFRESH TOKEN:\n${tokenObj.refresh}\nGENERATION ID:\n${genId}\n----------------------------------------\nExpires: ${expiryText}\nSeconds left: ${ttl}s\nAuto-Refresh: Constantly\n----------------------------------------`;
                    const textBuffer = Buffer.from(textVersion, 'utf-8');
                    const textAttachment = new AttachmentBuilder(textBuffer, { name: getExpiryFileName(tokenObj.expiresAt, 'txt') });
                    const embed = new EmbedBuilder().setTitle('TOKEN GENERATED').setDescription('> Token sent to your DMs.').addFields({ name: 'ID', value: `\`${genId}\``, inline: true }, { name: 'Validity', value: expiryText, inline: true }).setColor(0x00FFAA).setFooter({ text: 'EAM.LOL' });
                    await interaction.user.send({ embeds: [embed], files: [attachment, textAttachment] });
                    isGenerating = false;
                    return interaction.editReply({ content: `Token sent to DMs | ID: \`${genId}\` | ${expiryText}` });
                } catch (err) {
                    isGenerating = false;
                    return interaction.editReply({ content: 'DM Failed: Please open your DMs.' });
                }
            }

            // --- ANNOUNCE ---
            if (commandName === 'announce') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'You need admin permissions to use this command.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
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
                        await member.send({ embeds: [new EmbedBuilder().setTitle('ANNOUNCEMENT').setDescription(messageContent).setColor(0xFFAA00).setTimestamp().setFooter({ text: `From ${guild.name}` })] });
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
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Admin only.', flags: 64 });
                const embed = new EmbedBuilder()
                    .setTitle('SUPPORT THE PROJECT')
                    .setDescription('> Your contributions keep this bot alive and the tokens flowing.\n> Choose a platform below to send a donation.\n> Every bit helps – thank you!')
                    .addFields(
                        { name: 'PayPal', value: `[Click to donate](${DONATION_LINKS.paypal})`, inline: true },
                        { name: 'CashApp', value: `[Click to donate](${DONATION_LINKS.cashapp})`, inline: true },
                        { name: 'Crypto', value: `[Click to donate](${DONATION_LINKS.crypto})`, inline: true }
                    )
                    .setColor(0xF1C40F)
                    .setFooter({ text: 'EAM.LOL | Donations are appreciated' });
                const row1 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setLabel('PayPal').setStyle(ButtonStyle.Link).setURL(DONATION_LINKS.paypal),
                        new ButtonBuilder().setLabel('CashApp').setStyle(ButtonStyle.Link).setURL(DONATION_LINKS.cashapp),
                        new ButtonBuilder().setLabel('Crypto').setStyle(ButtonStyle.Link).setURL(DONATION_LINKS.crypto)
                    );
                const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('donate_info').setLabel('More Info').setStyle(ButtonStyle.Secondary));
                return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: false });
            }

            // --- DONATION-PANEL ---
            if (commandName === 'donation-panel') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Admin only.', flags: 64 });
                const embed = new EmbedBuilder()
                    .setTitle('DONATE A TOKEN')
                    .setDescription('> Paste a valid JSON containing `token` (bearer) and `refresh_token`.\n> The bot will validate and add it to the stock.\n> If expired, it will attempt to refresh it automatically.')
                    .setColor(0x5865F2)
                    .setFooter({ text: 'EAM.LOL | Token Donation' });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('donate_token_btn').setLabel('Donate Token').setStyle(ButtonStyle.Success));
                return interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
            }

            // --- CHECK-PANEL ---
            if (commandName === 'check-panel') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Admin only.', flags: 64 });
                const embed = new EmbedBuilder()
                    .setTitle('CHECK TOKEN')
                    .setDescription('> Paste a JSON containing `token` (or bearer) and `refresh_token`.\n> The bot will extract and validate them.')
                    .setColor(0x3498DB)
                    .setFooter({ text: 'EAM.LOL | Token Check' });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('check_token_btn').setLabel('Check Token').setStyle(ButtonStyle.Primary));
                return interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
            }

            // --- SPLIT-PANEL ---
            if (commandName === 'split-panel') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Admin only.', flags: 64 });
                const embed = new EmbedBuilder()
                    .setTitle('SPLIT TOKEN')
                    .setDescription('> Paste a JSON containing `token` (or bearer) and `refresh_token`.\n> The bot will extract and return them separately with copy buttons.')
                    .setColor(0x2ECC71)
                    .setFooter({ text: 'EAM.LOL | Token Split' });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('split_token_btn').setLabel('Split Token').setStyle(ButtonStyle.Success));
                return interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
            }

            // --- ADMIN COMMANDS ---
            const adminCommands = ['stock', 'stock_main', 'generator', 'force_refresh', 'remove-stock', 'reset-stock', 'gen-codes', 'remove-token', 'refresh_cooldown_all', 'panel'];
            if (adminCommands.includes(commandName)) {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });

                if (commandName === 'stock_main') {
                    await interaction.deferReply({ flags: 64 });
                    const bearer = options.getString('bearer');
                    const refresh = options.getString('refresh');
                    if (!bearer || !refresh) return interaction.editReply({ content: 'Both tokens required.' });
                    forceSetOwnToken(bearer, refresh);
                    const embed = new EmbedBuilder().setTitle('Main Token Updated').setDescription('Token updated successfully.').setColor(0x2ECC71).addFields({ name: 'Valid For', value: humanExpiry(lastRefreshExpiry), inline: true }, { name: 'Stock', value: `${tokenStock.length} token(s)`, inline: true });
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
                    const embed = new EmbedBuilder()
                        .setTitle('EAM.LOL TOKEN GENERATOR')
                        .setDescription('> Generate your personal access token instantly.\n> One-click generation with live status.\n> Delivered securely to your Direct Messages.\n> Smart auto-refresh keeps your token active.')
                        .setColor(0x5865F2)
                        .setFooter({ text: 'Always available | Never expires' });
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gen_public').setLabel('GENERATE TOKEN').setStyle(ButtonStyle.Success));
                    return interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
                }

                if (commandName === 'force_refresh') {
                    await interaction.deferReply({ flags: 64 });
                    if (tokenStock.length === 0) return interaction.editReply({ content: 'No token in stock.' });
                    try {
                        const result = await refreshToken(tokenStock[0].refresh);
                        if (result.success) {
                            const embed = new EmbedBuilder().setTitle('Token Refreshed').setDescription('Token refreshed successfully.').setColor(0x2ECC71)
                                .addFields({ name: 'Expiry', value: humanExpiry(tokenStock[0].expiresAt), inline: true }, { name: 'Stock', value: `${tokenStock.length} token(s)`, inline: true });
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
                    return interaction.reply({ content: 'Stock reset to default.', flags: 64 });
                }

                if (commandName === 'remove-token') {
                    const id = options.getString('id').trim();
                    const result = removeTokenById(id);
                    return interaction.reply({ content: result.success ? `Success: ${result.message}` : `Error: ${result.message}`, flags: 64 });
                }

                if (commandName === 'gen-codes') {
                    const entries = tokenStock.filter(t => t.id && t.id.length > 0).map(t => ({ id: t.id, username: t.username || `<@${t.userId}>` }));
                    if (entries.length === 0) return interaction.reply({ content: 'No active IDs.', flags: 64 });
                    const embed = new EmbedBuilder().setTitle('Active Generation IDs').setDescription(`**${entries.length}** active token(s)`).setColor(0x5865F2);
                    entries.forEach(entry => embed.addFields({ name: `\`${entry.id}\``, value: `User: ${entry.username}`, inline: false }));
                    return interaction.reply({ embeds: [embed], flags: 64 });
                }

                if (commandName === 'refresh_cooldown_all') {
                    const count = cooldowns.size;
                    cooldowns.clear();
                    return interaction.reply({ content: `Cooldowns reset! ${count} cleared.`, flags: 64 });
                }

                if (commandName === 'panel') {
                    const subArg = options.getString('type');
                    if (subArg === 'generator') {
                        const embed = new EmbedBuilder().setTitle('EAM.LOL TOKEN GENERATOR').setDescription('> Generate your token below.\n> DMs must be open.').setColor(0x5865F2).setFooter({ text: 'Never expires' });
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gen_public').setLabel('GENERATE').setStyle(ButtonStyle.Success));
                        return interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
                    }
                    if (subArg === 'verify') {
                        const embed = new EmbedBuilder().setTitle("VERIFICATION").setDescription("Click below to verify.").setColor(0x1ABC9C);
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_btn').setLabel('VERIFY').setStyle(ButtonStyle.Success));
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }
                    if (subArg === 'redeem') {
                        const embed = new EmbedBuilder().setTitle("KEY REDEEM").setDescription("Got a code? Click below to redeem.").setColor(0x5865F2);
                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM KEY').setStyle(ButtonStyle.Primary));
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }
                    if (subArg === 'support') {
                        const embed = new EmbedBuilder().setTitle("SUPPORT").setDescription("Select your department.").setColor(0xFEE75C);
                        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('support_select').setPlaceholder('Select department...').addOptions([ { label: 'General Support', value: 'General Inquiry' }, { label: 'Token Help', value: 'Token Help' } ]));
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }
                }
            }
        }

        // --- BUTTON HANDLERS ---
        if (interaction.isButton()) {
            if (interaction.customId === 'cancel_gen') {
                const userId = interaction.user.id;
                if (activeGenerations.has(userId)) {
                    const gen = activeGenerations.get(userId);
                    gen.cancelFlag = true;
                    activeGenerations.delete(userId);
                    isGenerating = false;
                    await interaction.reply({ content: 'Generation cancelled.', flags: 64 });
                    await interaction.message.edit({ content: 'Cancelled.', embeds: [], components: [] }).catch(() => {});
                } else await interaction.reply({ content: 'No active generation.', flags: 64 });
                return;
            }

            if (interaction.customId === 'donate_info') {
                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle('Donation Info')
                        .setDescription('> Donations help cover hosting costs and development time.\n> All funds go directly to keeping the bot online.\n> Thank you for your support!')
                        .setColor(0xF1C40F)
                    ],
                    flags: 64
                });
                return;
            }

            if (interaction.customId === 'donate_token_btn') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Admin only.', flags: 64 });
                const modal = new ModalBuilder().setCustomId('donate_token_modal').setTitle('Donate Token JSON');
                const jsonInput = new TextInputBuilder().setCustomId('donate_json_input').setLabel('Paste your JSON here').setStyle(TextInputStyle.Paragraph).setPlaceholder('{"refresh_token":"...","token":"..."}').setRequired(true).setMinLength(20).setMaxLength(2000);
                modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'check_token_btn') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Admin only.', flags: 64 });
                const modal = new ModalBuilder().setCustomId('check_token_modal').setTitle('Check Token JSON');
                const jsonInput = new TextInputBuilder().setCustomId('check_json_input').setLabel('Paste your JSON here').setStyle(TextInputStyle.Paragraph).setPlaceholder('{"token":"...","refresh_token":"..."}').setRequired(true).setMinLength(20).setMaxLength(2000);
                modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'split_token_btn') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Admin only.', flags: 64 });
                const modal = new ModalBuilder().setCustomId('split_token_modal').setTitle('Split Token JSON');
                const jsonInput = new TextInputBuilder().setCustomId('split_json_input').setLabel('Paste your JSON here').setStyle(TextInputStyle.Paragraph).setPlaceholder('{"token":"...","refresh_token":"..."}').setRequired(true).setMinLength(20).setMaxLength(2000);
                modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'stock_prev' || interaction.customId === 'stock_next') {
                const page = interaction.customId === 'stock_prev' ? stockPage - 1 : stockPage + 1;
                stockPage = page;
                await interaction.deferUpdate();
                const entries = tokenStock.filter(t => t.id && t.id.length > 0);
                if (entries.length === 0) return interaction.editReply({ content: 'No active IDs.', embeds: [], components: [] });
                const totalPages = Math.ceil(entries.length / STOCK_PER_PAGE);
                const start = page * STOCK_PER_PAGE;
                const pageEntries = entries.slice(start, start + STOCK_PER_PAGE);
                const embed = new EmbedBuilder().setTitle('REMOVE TOKEN').setDescription(`**${entries.length}** active | Page ${page+1}/${totalPages}`).setColor(0xED4245);
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

            if (interaction.customId.startsWith('remove_')) {
                const id = interaction.customId.replace('remove_', '');
                const result = removeTokenById(id);
                await interaction.reply({ content: result.success ? `Success: ${result.message}` : `Error: ${result.message}`, flags: 64 });
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

            if (interaction.customId === 'gen_public') return await processTokenGeneration(interaction, 'Public Token');

            if (interaction.customId === 'verify_btn') {
                await interaction.deferReply({ flags: 64 });
                const role = interaction.guild.roles.cache.get(MEMBER_ROLE_ID);
                if (!role) return interaction.editReply({ content: "Role not found." });
                if (interaction.member.roles.cache.has(role.id)) return interaction.editReply({ content: "Already verified." });
                try { await interaction.member.roles.add(role); return interaction.editReply({ content: "Verified!" }); } catch (err) { return interaction.editReply({ content: "Failed to verify." }); }
            }

            if (interaction.customId === 'redeem_btn') {
                const modal = new ModalBuilder().setCustomId('redeem_modal').setTitle('Secure Key Redemption');
                const codeInput = new TextInputBuilder().setCustomId('redeem_code_input').setLabel("ENTER CODE").setStyle(TextInputStyle.Short).setPlaceholder("supporter-xxxx-xxxx-xxxx").setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'close_ticket_btn') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: "Only staff can close tickets.", flags: 64 });
                await interaction.reply({ content: "Closing ticket..." });
                setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            }
        }

        // --- SELECT MENU ---
        if (interaction.isStringSelectMenu() && interaction.customId === 'support_select') {
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
                const embed = new EmbedBuilder().setTitle(`TICKET: ${category.toUpperCase()}`).setDescription(`Welcome, <@${interaction.user.id}>.`).setColor(0xFEE75C).setTimestamp();
                const closeButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket_btn').setLabel('CLOSE').setStyle(ButtonStyle.Danger));
                await ticketChannel.send({ embeds: [embed], components: [closeButton] });
                return interaction.editReply({ content: `Ticket created: <#${ticketChannel.id}>` });
            } catch (err) { return interaction.editReply({ content: "Failed to create ticket." }); }
        }

        // --- MODAL SUBMITS ---
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'refresh_token_modal_submit') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                const bearer = interaction.fields.getTextInputValue('refresh_bearer_input').trim();
                const refresh = interaction.fields.getTextInputValue('refresh_refresh_input').trim();
                if (!bearer || !refresh) return interaction.editReply({ content: 'Both tokens required.' });
                DEFAULT_TOKEN.bearer = bearer;
                DEFAULT_TOKEN.refresh_token = refresh;
                activeAccountLabel = 'manual';
                if (!accounts.find(a => a.token === bearer)) accounts.push({ token: bearer, refresh_token: refresh, label: 'manual' });
                if (tokenStock.length > 0) {
                    const old = tokenStock[0];
                    tokenStock[0] = { bearer, refresh, addedAt: Date.now(), expiresAt: getTokenExpiryMs(bearer), id: old.id, userId: old.userId, username: old.username };
                } else tokenStock.push({ bearer, refresh, addedAt: Date.now(), expiresAt: getTokenExpiryMs(bearer) });
                const refreshResult = await refreshToken(refresh);
                let statusMessage = refreshResult.success ? 'Token updated and REFRESHED!' : 'Token updated but refresh failed.';
                const embed = new EmbedBuilder().setTitle('Token Refreshed').setDescription(statusMessage).setColor(0x2ECC71)
                    .addFields(
                        { name: 'Bearer Token', value: `\`\`\`\n${bearer}\n\`\`\``, inline: false },
                        { name: 'Refresh Token', value: `\`\`\`\n${refresh}\n\`\`\``, inline: false },
                        { name: 'Expiry', value: humanExpiry(getTokenExpiryMs(bearer)), inline: true },
                        { name: 'Stock', value: `${tokenStock.length} token(s)`, inline: true },
                        { name: 'Auto-Refresh', value: 'Smart (multi-account)', inline: true }
                    ).setTimestamp().setFooter({ text: 'EAM.LOL' });
                const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`copy_bearer_${Date.now()}`).setLabel('Copy Bearer').setStyle(ButtonStyle.Primary));
                const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`copy_refresh_${Date.now()}`).setLabel('Copy Refresh').setStyle(ButtonStyle.Success));
                return interaction.editReply({ embeds: [embed], components: [row1, row2] });
            }

            if (interaction.customId === 'stock_modal') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
                await interaction.deferReply({ flags: 64 });
                const bearer = interaction.fields.getTextInputValue('stock_bearer_input').trim();
                const refresh = interaction.fields.getTextInputValue('stock_refresh_input').trim();
                if (!bearer || !refresh) return interaction.editReply({ content: 'Both tokens required.' });
                tokenStock.push({ bearer, refresh, addedAt: Date.now(), expiresAt: getTokenExpiryMs(bearer) });
                return interaction.editReply({ content: `Added token! Total: ${tokenStock.length}` });
            }

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

            if (interaction.customId === 'donate_token_modal') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
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
                if (Date.now() >= expiry) {
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
                    const validation = await validateTokenDetails(bearer);
                    if (!validation.valid) return interaction.editReply({ content: `Token validation failed.` });
                    const genId = generateGenerationId();
                    tokenStock.push({ bearer: bearer, refresh: refresh, addedAt: Date.now(), expiresAt: expiry, id: genId, userId: interaction.user.id, username: interaction.user.tag });
                    if (!accounts.find(a => a.refresh_token === refresh)) accounts.push({ token: bearer, refresh_token: refresh, label: `donated_${Date.now()}` });
                    return interaction.editReply({ content: `Token donated successfully! Added to stock (${tokenStock.length} total). ID: \`${genId}\` Expires: ${humanExpiry(expiry)}` });
                }
            }

            if (interaction.customId === 'check_token_modal') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
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
                const validation = await validateTokenDetails(bearer);
                let embed = new EmbedBuilder()
                    .setTitle('TOKEN CHECK RESULT')
                    .setColor(validation.valid ? 0x2ECC71 : 0xED4245)
                    .addFields(
                        { name: 'Bearer Token', value: `\`${bearer.slice(0, 30)}...\` (${bearer.length} chars)`, inline: false },
                        { name: 'Refresh Token', value: `\`${refresh.slice(0, 30)}...\` (${refresh.length} chars)`, inline: false },
                        { name: 'Status', value: validation.valid ? 'VALID' : 'INVALID', inline: true },
                        { name: 'Expiry (UTC)', value: new Date(validation.expiry).toUTCString(), inline: true },
                        { name: 'Seconds Remaining', value: validation.secondsRemaining > 0 ? `${validation.secondsRemaining}s` : 'Expired', inline: true },
                        { name: 'API Validation', value: validation.apiValid ? 'Passed' : `Failed: ${validation.apiError || 'Unknown'}`, inline: false }
                    )
                    .setFooter({ text: 'EAM.LOL | Token Check' });
                if (!validation.valid) embed.setDescription('> This token is invalid – it may be expired or revoked.');
                else embed.setDescription('> Token is valid – ready for use.');
                embed.addFields(
                    { name: 'Full Bearer Token', value: `\`\`\`\n${bearer}\n\`\`\``, inline: false },
                    { name: 'Full Refresh Token', value: `\`\`\`\n${refresh}\n\`\`\``, inline: false }
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`copy_bearer_${Date.now()}`).setLabel('Copy Bearer').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`copy_refresh_${Date.now()}`).setLabel('Copy Refresh').setStyle(ButtonStyle.Success)
                );
                return interaction.editReply({ embeds: [embed], components: [row2] });
            }

            if (interaction.customId === 'split_token_modal') {
                if (!hasAdminAccess(interaction)) return interaction.reply({ content: 'Access Denied.', flags: 64 });
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
                    .setTitle('TOKEN SPLIT')
                    .setDescription('> Extracted Bearer and Refresh tokens – copy them individually below.')
                    .setColor(0x2ECC71)
                    .addFields(
                        { name: 'Bearer Token', value: `\`\`\`\n${bearer}\n\`\`\``, inline: false },
                        { name: 'Refresh Token', value: `\`\`\`\n${refresh}\n\`\`\``, inline: false }
                    )
                    .setFooter({ text: 'EAM.LOL | Token Split' });
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`copy_bearer_${Date.now()}`).setLabel('Copy Bearer').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`copy_refresh_${Date.now()}`).setLabel('Copy Refresh').setStyle(ButtonStyle.Success)
                );
                return interaction.editReply({ embeds: [embed], components: [row] });
            }
        }
    } catch (err) {
        console.error(`[ERROR] [EAM.LOL] Interaction Error:`, err);
        if (!interaction.replied && !interaction.deferred) interaction.reply({ content: "An error occurred.", flags: 64 }).catch(() => {});
    }
});

// --- COPY BUTTON HANDLER ---
client.on('interactionCreate', async interaction => {
    if (interaction.isButton() && interaction.customId.startsWith('copy_')) {
        const parts = interaction.customId.split('_');
        const type = parts[1]; // 'bearer' or 'refresh'
        const embed = interaction.message.embeds[0];
        if (!embed) return;
        let token = '';
        for (const field of embed.fields) {
            if (field.name.includes('Bearer') && type === 'bearer') {
                const match = field.value.match(/```\n([\s\S]*?)\n```/);
                if (match) token = match[1].trim();
                else token = field.value.replace(/```\n/g, '').replace(/\n```/g, '').trim();
                break;
            }
            if (field.name.includes('Refresh') && type === 'refresh') {
                const match = field.value.match(/```\n([\s\S]*?)\n```/);
                if (match) token = match[1].trim();
                else token = field.value.replace(/```\n/g, '').replace(/\n```/g, '').trim();
                break;
            }
        }
        if (!token) return interaction.reply({ content: 'No token found.', flags: 64 });
        await interaction.reply({ content: `**${type.charAt(0).toUpperCase() + type.slice(1)} Token copied!**\n\`\`\`\n${token}\n\`\`\``, flags: 64 });
        try { await interaction.user.send({ content: `**${type.charAt(0).toUpperCase() + type.slice(1)} Token**\n\`\`\`\n${token}\n\`\`\`` }); } catch (dmErr) {}
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
if (!process.env.DISCORD_TOKEN) console.error('[ERROR] [EAM.LOL] DISCORD_TOKEN missing.');
else {
    async function loginWithRetry(attempts = 5) {
        for (let i = 1; i <= attempts; i++) {
            try {
                console.log(`[INFO] [EAM.LOL] Login attempt ${i}/${attempts}...`);
                await Promise.race([client.login(process.env.DISCORD_TOKEN), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))]);
                console.log('[SUCCESS] [EAM.LOL] Login successful!');
                return true;
            } catch (err) { console.error(`[ERROR] [EAM.LOL] Attempt ${i} failed:`, err.message); if (i === attempts) return false; await new Promise(r => setTimeout(r, 5000 * i)); }
        }
        return false;
    }
    loginWithRetry().then(success => { if (!success) console.error('[ERROR] [EAM.LOL] Failed to connect.'); });
}

process.on('unhandledRejection', (reason) => console.error('[ERROR] [EAM.LOL] Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('[ERROR] [EAM.LOL] Uncaught Exception:', err));
