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
    Routes
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
const MEMBER_ROLE_ID = "1539945420501950535";
const SUPPORTER_ROLE_ID = "1540841149554499634";
const ANNOUNCEMENT_ROLE_ID = "123456789012345678";
const BOT_OWNER_ID = "YOUR_DISCORD_USER_ID";

const BUYER_ROLE_ID = "1542337976917434428";
const VIP_ROLE_ID = "1542337978016469093";
const BOOSTER_ROLE_ID = "1542337979807178832";

// --- API CONFIGURATION ---
// Try these URLs in order until one works
const API_URLS = [
    'https://api.realanimalcompany.com',
    'https://realanimalcompany.com/api',
    'https://www.realanimalcompany.com/api',
    'https://auth.realanimalcompany.com',
    'https://api.animalcompany.com',
    'https://animalcompany.com/api',
    'https://api.realanimalcompany.com/v1',
    'https://realanimalcompany.com/v1',
    'https://api.realanimalcompany.com/auth',
    'https://realanimalcompany.com/auth'
];

let ACTIVE_API_URL = API_URLS[0];
let apiWorking = false;

// --- Token refresh queue system ---
let isRefreshing = false;
let failedQueue = [];

// Queue processor for pending requests
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

// --- DEFAULT TOKEN (ALWAYS IN STOCK) ---
let DEFAULT_TOKEN = {
    bearer: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiIyYzNiNDJmMi0zZGNhLTQ3ZmYtYjgwZC00NzEzNTRiN2E0NTkiLCJ1aWQiOiIzZjJkZWI5Ni01MGQ1LTQxNTAtYjBmNC05NjdkZjhlNWY0YjIiLCJ1c24iOiJNQ080N2xwMVNfbnlrVFVNIiwidnJzIjp7ImF1dGhJRCI6ImExOTU2MWI1NGQwZjRhNzFiZWFmNDFkYWMwYWMyNDA5IiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjAuMzQxNV8wN2UxNGExNyIsImRldmljZUlEIjoiNDYxNjU0MDU0NjhmNmU4MTYxZDY1Yjc1OWQ3N2I1NTEwMzAzMWVhOSJ9LCJleHAiOjE3ODc4MTU1MDksImlhdCI6MTc4Nzc4MDU0Mn0.gPWaFouLcPLVsI7VyMpCeVwIJybuhFIBkTWsiKeQkJE",
    refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiIyYzNiNDJmMi0zZGNhLTQ3ZmYtYjgwZC00NzEzNTRiN2E0NTkiLCJ1aWQiOiIzZjJkZWI5Ni01MGQ1LTQxNTAtYjBmNC05NjdkZjhlNWY0YjIiLCJ1c24iOiJNQ080N2xwMVNfbnlrVFVNIiwidnJzIjp7ImF1dGhJRCI6ImExOTU2MWI1NGQwZjRhNzFiZWFmNDFkYWMwYWMyNDA5IiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjAuMzQxNV8wN2UxNGExNyIsImRldmljZUlEIjoiNDYxNjU0MDU0NjhmNmU4MTYxZDY1Yjc1OWQ3N2I1NTEwMzAzMWVhOSJ9LCJleHAiOjE3ODc4MzM1MDksImlhdCI6MTc4Nzc4MDU0Mn0.1P_vl9PrIh3GuhHbY_kf3_6neC80_biZgsJNcr1Yw_Q"
};

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

// --- CLEANUP STUCK GENERATIONS (Runs every 30 seconds) ---
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
        console.log(`[Cleanup] Removed ${cleaned} stuck token generations`);
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
        console.error(`[Logging Error] Could not send log to channel ${channelId}:`, err.message);
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

// --- TRY ALL API URLS UNTIL ONE WORKS ---
async function findWorkingApiUrl() {
    console.log('[API Finder] Searching for working API URL...');
    
    for (const url of API_URLS) {
        try {
            console.log(`[API Finder] Testing: ${url}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${url}/validate`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'ElliottModdingBot/1.0'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                console.log(`[API Finder] ✅ Found working API: ${url}`);
                ACTIVE_API_URL = url;
                apiWorking = true;
                return url;
            } else {
                console.log(`[API Finder] ❌ Not a JSON API: ${url}`);
            }
        } catch (err) {
            console.log(`[API Finder] ❌ Failed: ${url} - ${err.message}`);
        }
    }
    
    console.log('[API Finder] ⚠️ No working API URL found. Using fallback mode.');
    apiWorking = false;
    return API_URLS[0];
}

// --- UPDATED STEAM TOKEN VALIDATION WITH BRICK/CORRUPT CHECK ---
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
            console.log(`[Token Validation] ❌ Token appears bricked/corrupted: contains "${pattern}"`);
            return { 
                valid: false, 
                status: 400,
                data: null,
                expiresAt: null,
                message: `Token appears bricked/corrupted - Contains "${pattern}"`
            };
        }
    }

    try {
        const parts = bearerToken.split('.');
        if (parts.length !== 3) {
            console.log('[Token Validation] ❌ Invalid JWT format');
            return { 
                valid: false, 
                status: 400,
                data: null,
                expiresAt: null,
                message: 'Invalid token format - Not a valid JWT'
            };
        }
        
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        
        if (payload.exp) {
            const expTime = payload.exp * 1000;
            console.log(`[Token Validation] JWT expires at: ${new Date(expTime).toISOString()}`);
            
            if (Date.now() > expTime) {
                console.log('[Token Validation] ❌ Token expired based on JWT claim');
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
                console.log(`[Token Validation] ❌ Token payload contains corrupted data: "${pattern}"`);
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
        console.log('[Token Validation] ❌ Could not decode JWT:', err.message);
        return { 
            valid: false, 
            status: 400,
            data: null,
            expiresAt: null,
            message: 'Invalid token format - Could not decode JWT'
        };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${ACTIVE_API_URL}/validate`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'ElliottModdingBot/1.0'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.log('[Token Validation] ⚠️ Response is not JSON, bypassing...');
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
                console.log('[Token Validation] ⚠️ Could not parse JSON, bypassing...');
                return { 
                    valid: true, 
                    status: 200,
                    data: { bypassed: true },
                    expiresAt: Date.now() + (60 * 60 * 1000),
                    message: 'Validation bypassed - Invalid JSON response'
                };
            }
            
            console.log(`[Token Validation] Attempt ${attempt + 1}: Status ${response.status}`);
            
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
            
            let expiresAt = null;
            if (responseData.expires_at) {
                expiresAt = new Date(responseData.expires_at).getTime();
            } else if (responseData.expiresIn) {
                expiresAt = Date.now() + (responseData.expiresIn * 1000);
            } else if (responseData.exp) {
                expiresAt = responseData.exp * 1000;
            } else if (responseData.expires) {
                expiresAt = new Date(responseData.expires).getTime();
            }
            
            if (expiresAt && Date.now() > expiresAt) {
                return { 
                    valid: false, 
                    status: 401,
                    data: responseData,
                    expiresAt: expiresAt,
                    message: 'Token expired - API reported expiration'
                };
            }
            
            if (!expiresAt) {
                expiresAt = Date.now() + (60 * 60 * 1000);
            }
            
            apiWorking = true;
            
            return { 
                valid: isValid, 
                status: response.status,
                data: responseData,
                expiresAt: expiresAt,
                message: responseData.message || responseData.error || (isValid ? 'Valid token' : 'Invalid token')
            };
            
        } catch (err) {
            console.error(`[Token Validation] Attempt ${attempt + 1} failed:`, err.message);
            
            if (attempt === retries) {
                console.log('[Token Validation] ⚠️ API unreachable - BYPASSING with 1-hour limit.');
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

// --- ENHANCED REFRESH SYSTEM WITH QUEUE ---
async function refreshToken(refreshToken) {
    try {
        console.log('[Refresh Token] Attempting to refresh token...');
        
        if (isRefreshing) {
            console.log('[Refresh Token] Already refreshing, queuing request...');
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then(token => {
                console.log('[Refresh Token] Queue resolved with new token');
                return { 
                    success: true, 
                    bearer: token,
                    refresh: refreshToken,
                    expiresAt: Date.now() + (60 * 60 * 1000)
                };
            }).catch(err => {
                console.log('[Refresh Token] Queue rejected:', err);
                return { success: false };
            });
        }

        isRefreshing = true;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${ACTIVE_API_URL}/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ElliottModdingBot/1.0'
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.log('[Refresh Token] ❌ Response is not JSON, treating as failure');
            processQueue(new Error('Invalid response format'), null);
            isRefreshing = false;
            return { success: false };
        }
        
        const data = await response.json();
        
        if (response.status === 200 && (data.access_token || data.bearer)) {
            const newBearer = data.access_token || data.bearer;
            const newRefresh = data.refresh_token || refreshToken;
            const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + (60 * 60 * 1000);
            
            console.log('[Refresh Token] ✅ Successfully refreshed! Got new token strings');
            
            try {
                const parts = newBearer.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                    console.log(`[Refresh Token] Account: ${payload.uid} (SAME ACCOUNT)`);
                }
            } catch (e) {}
            
            apiWorking = true;
            processQueue(null, newBearer);
            isRefreshing = false;
            
            return {
                success: true,
                bearer: newBearer,
                refresh: newRefresh,
                expiresAt: expiresAt
            };
        } else {
            console.log(`[Refresh Token] ❌ Failed with status: ${response.status}`);
            console.log(`[Refresh Token] Response:`, data);
            
            processQueue(new Error(`Refresh failed with status ${response.status}`), null);
            isRefreshing = false;
            
            return { success: false };
        }
    } catch (err) {
        console.error('[Refresh Token] Error:', err);
        
        if (err.message && err.message.includes('ENOTFOUND')) {
            console.log('[Refresh Token] 🔄 DNS error - trying to find working API URL...');
            await findWorkingApiUrl();
        }
        
        processQueue(err, null);
        isRefreshing = false;
        
        return { success: false };
    }
}

// --- REFRESH TOKEN IN STOCK (Every 5 minutes) ---
async function refreshTokenInStock() {
    console.log('[Refresh Stock] 🔄 Refreshing default token with NEW strings...');
    
    if (tokenStock.length === 0) {
        console.log('[Refresh Stock] Stock was empty, re-adding default token...');
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
            tokenStock[0] = {
                bearer: refreshResult.bearer,
                refresh: refreshResult.refresh,
                addedAt: Date.now(),
                expiresAt: refreshResult.expiresAt || Date.now() + (60 * 60 * 1000)
            };
            console.log('[Refresh Stock] ✅ Token refreshed with NEW strings!');
            console.log(`[Refresh Stock] New Bearer: ${tokenStock[0].bearer.substring(0, 50)}...`);
            console.log(`[Refresh Stock] New Refresh: ${tokenStock[0].refresh.substring(0, 50)}...`);
            console.log(`[Refresh Stock] Expires: ${new Date(tokenStock[0].expiresAt).toISOString()}`);
            console.log(`[Refresh Stock] ⏳ Lifespan extended to 1 hour from now!`);
            console.log(`[Refresh Stock] 📍 Using API URL: ${ACTIVE_API_URL}`);
        } else {
            console.log('[Refresh Stock] Refresh failed, re-adding default token...');
            tokenStock[0] = {
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                addedAt: Date.now(),
                expiresAt: Date.now() + (60 * 60 * 1000)
            };
        }
    } catch (err) {
        console.error('[Refresh Stock] Error refreshing token:', err);
        tokenStock[0] = {
            bearer: DEFAULT_TOKEN.bearer,
            refresh: DEFAULT_TOKEN.refresh_token,
            addedAt: Date.now(),
            expiresAt: Date.now() + (60 * 60 * 1000)
        };
    }
    
    if (tokenStock.length === 0) {
        tokenStock.push({
            bearer: DEFAULT_TOKEN.bearer,
            refresh: DEFAULT_TOKEN.refresh_token,
            addedAt: Date.now(),
            expiresAt: Date.now() + (60 * 60 * 1000)
        });
    }
    
    console.log(`[Refresh Stock] Stock count: ${tokenStock.length}`);
    console.log(`[Refresh Stock] API Status: ${apiWorking ? '✅ Working' : '⚠️ Fallback Mode'}`);
    console.log(`[Refresh Stock] Next refresh in 5 minutes...`);
}

// --- START AUTO-REFRESH (Every 5 minutes) ---
function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    console.log('[🔄 AUTO-REFRESH] Starting 5-minute refresh cycle...');
    console.log('[🔑 DEFAULT TOKEN] Always in stock - Auto-refreshes every 5 minutes');
    console.log('[🔄 AUTO-REFRESH] Token will get NEW strings every 5 minutes (SAME account)');
    console.log('[🔄 AUTO-REFRESH] Queue system active - Multiple requests will be batched');

    isRefreshing = false;
    failedQueue = [];
    
    setTimeout(async () => {
        await findWorkingApiUrl();
        await refreshTokenInStock();
    }, 5000);
    
    refreshInterval = setInterval(async () => {
        if (isRefreshing) {
            console.log('[Auto-Refresh] Refresh already in progress, skipping...');
            return;
        }
        
        if (!apiWorking) {
            await findWorkingApiUrl();
        }
        await refreshTokenInStock();
    }, 5 * 60 * 1000);
}

// --- REGISTER SLASH COMMANDS ---
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
    new SlashCommandBuilder().setName('force_refresh').setDescription('Rotate the current token to the back of the queue').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('remove_stock').setDescription('Remove or clear tokens from stock queue').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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

// --- UPDATED READY EVENT ---
client.once('ready', async () => {
    console.log(`[🚀 ONLINE] Elliott Modding (${client.user.tag}) is fully operational!`);
    console.log('[🔑 DEFAULT TOKEN] Always in stock - Auto-refreshes every 5 minutes');
    console.log('[🔄 AUTO-REFRESH] Token will get NEW strings every 5 minutes (SAME account)');
    console.log('[🌐 API STATUS] Searching for working API URL...');

    isRefreshing = false;
    failedQueue = [];

    tokenStock = [{
        bearer: DEFAULT_TOKEN.bearer,
        refresh: DEFAULT_TOKEN.refresh_token,
        addedAt: Date.now(),
        expiresAt: Date.now() + (60 * 60 * 1000)
    }];
    console.log('[📦 STOCK] Default token added to stock');

    await findWorkingApiUrl();
    
    if (apiWorking) {
        console.log(`[🌐 API STATUS] ✅ API is working: ${ACTIVE_API_URL}`);
    } else {
        console.log('[🌐 API STATUS] ⚠️ API not reachable - Using fallback mode');
        console.log('[🌐 API STATUS] Tokens will still work in fallback mode!');
    }

    for (const guild of client.guilds.cache.values()) {
        for (const [key, roleConfig] of Object.entries(REQUIRED_ROLES)) {
            const exists = guild.roles.cache.some(r => r.name === roleConfig.name);
            if (!exists) {
                try {
                    await guild.roles.create({
                        name: roleConfig.name,
                        color: roleConfig.color,
                        permissions: roleConfig.permissions,
                        reason: `Automated Setup: Missing required role - ${roleConfig.name}`
                    });
                    console.log(`[Role Setup] Created missing role '${roleConfig.name}' in guild: ${guild.name}`);
                } catch (err) {
                    console.error(`[Role Setup Error] Could not create role '${roleConfig.name}' in ${guild.name}:`, err.message);
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
                    reason: "Automated Setup: Missing Supporter role"
                });
                console.log(`[Role Setup] Created missing role 'Supporter' in guild: ${guild.name}`);
            } catch (err) {
                console.error(`[Role Setup Error] Could not create Supporter role in ${guild.name}:`, err.message);
            }
        }

        const verifiedExists = guild.roles.cache.some(r => r.id === MEMBER_ROLE_ID || r.name === "Verified Member");
        if (!verifiedExists) {
            try {
                await guild.roles.create({
                    name: "Verified Member",
                    color: 0x2ECC71,
                    permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
                    reason: "Automated Setup: Missing Verified Member role"
                });
                console.log(`[Role Setup] Created missing role 'Verified Member' in guild: ${guild.name}`);
            } catch (err) {
                console.error(`[Role Setup Error] Could not create Verified Member role in ${guild.name}:`, err.message);
            }
        }
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('[Slash Commands] Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandsData },
        );
        console.log('[Slash Commands] Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Failed to register slash commands:', error);
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

function getRoleMention(roleId) {
    return `<@&${roleId}>`;
}

// --- PROCESS TOKEN GENERATION ---
async function processTokenGeneration(interaction, tierName) {
    const userId = interaction.user.id;
    
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
            console.log('[Stock] Stock was empty, re-added default token');
        }
        
        await interaction.editReply({ 
            content: '⏳ **Generating your token...** (Step 2/4: Checking token validity)' 
        });
        
        const tokenObj = tokenStock[0];
        
        if (tokenObj.expiresAt && isTokenExpired(tokenObj)) {
            const refreshResult = await refreshToken(tokenObj.refresh);
            if (refreshResult.success) {
                tokenStock[0] = {
                    bearer: refreshResult.bearer,
                    refresh: refreshResult.refresh,
                    addedAt: Date.now(),
                    expiresAt: refreshResult.expiresAt || Date.now() + (60 * 60 * 1000)
                };
            } else {
                tokenStock[0] = {
                    bearer: DEFAULT_TOKEN.bearer,
                    refresh: DEFAULT_TOKEN.refresh_token,
                    addedAt: Date.now(),
                    expiresAt: Date.now() + (60 * 60 * 1000)
                };
            }
        }
        
        await interaction.editReply({ 
            content: '⏳ **Generating your token...** (Step 3/4: Finalizing)' 
        });
        
        const validationResult = await validateSteamToken(tokenObj.bearer);
        
        if (!validationResult.valid) {
            const refreshResult = await refreshToken(tokenObj.refresh);
            if (refreshResult.success) {
                tokenStock[0] = {
                    bearer: refreshResult.bearer,
                    refresh: refreshResult.refresh,
                    addedAt: Date.now(),
                    expiresAt: refreshResult.expiresAt || Date.now() + (60 * 60 * 1000)
                };
                const newValidation = await validateSteamToken(tokenStock[0].bearer);
                if (!newValidation.valid) {
                    tokenStock[0] = {
                        bearer: DEFAULT_TOKEN.bearer,
                        refresh: DEFAULT_TOKEN.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: Date.now() + (60 * 60 * 1000)
                    };
                }
            } else {
                tokenStock[0] = {
                    bearer: DEFAULT_TOKEN.bearer,
                    refresh: DEFAULT_TOKEN.refresh_token,
                    addedAt: Date.now(),
                    expiresAt: Date.now() + (60 * 60 * 1000)
                };
            }
        }
        
        if (validationResult.expiresAt) {
            tokenObj.expiresAt = validationResult.expiresAt;
        }
        
        tokenStock.shift();
        tokenStock.push(tokenObj);
        
        await interaction.editReply({ 
            content: '⏳ **Generating your token...** (Step 4/4: Sending to DMs)' 
        });
        
        const tokenEmbed = new EmbedBuilder()
            .setTitle('TOKENS BY ELLIOTT')
            .setDescription('🛠️ **Your Generated EIC Token:**\n\n' +
                '**Bearer Token:**\n```ini\n' + tokenObj.bearer + '\n```\n' +
                '**Refresh Token:**\n```ini\n' + tokenObj.refresh + '\n```\n\n' +
                `⏳ **Valid for:** ${formatRemainingTime(tokenObj.expiresAt)}`)
            .setColor(0x5865F2)
            .setFooter({ text: 'Made by elliott.gg' });
        
        await interaction.user.send({ embeds: [tokenEmbed] });
        
        const successLog = new EmbedBuilder()
            .setTitle('Token Generated Successfully')
            .setDescription(`User: <@${userId}> (${userId})\nTier Group: ${tierName}\nTokens in Rotation: ${tokenStock.length}`)
            .setColor(0x2ECC71)
            .setTimestamp();
        await sendBotLog(interaction.guild, 'generator_success', successLog);
        
        activeGenerations.delete(userId);
        return interaction.editReply({ 
            content: `✅ **Token sent to your DMs!** (Tier: **${tierName}**)\n⏳ **Valid for:** ${formatRemainingTime(tokenObj.expiresAt)}\n📦 **Tokens remaining in stock:** ${tokenStock.length}` 
        });
        
    } catch (err) {
        console.error('[Token Generation Error]', err);
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
                return interaction.reply({ content: `Pong! Latency is \`${client.ws.ping}ms\`.`, flags: 64 });
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
                else outcome = 'Queen Bee wins! 🐝';

                return interaction.reply({ content: `You chose **${userChoice}**, Queen Bee chose **${botChoice}**. ${outcome}` });
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
                
                const tokenObj = tokenStock[0];
                
                if (tokenObj.expiresAt && isTokenExpired(tokenObj)) {
                    const refreshResult = await refreshToken(tokenObj.refresh);
                    if (refreshResult.success) {
                        tokenStock[0] = {
                            bearer: refreshResult.bearer,
                            refresh: refreshResult.refresh,
                            addedAt: Date.now(),
                            expiresAt: refreshResult.expiresAt || Date.now() + (60 * 60 * 1000)
                        };
                    } else {
                        tokenStock[0] = {
                            bearer: DEFAULT_TOKEN.bearer,
                            refresh: DEFAULT_TOKEN.refresh_token,
                            addedAt: Date.now(),
                            expiresAt: Date.now() + (60 * 60 * 1000)
                        };
                    }
                }
                
                const validationResult = await validateSteamToken(tokenObj.bearer);
                
                if (!validationResult.valid) {
                    const refreshResult = await refreshToken(tokenObj.refresh);
                    if (refreshResult.success) {
                        tokenStock[0] = {
                            bearer: refreshResult.bearer,
                            refresh: refreshResult.refresh,
                            addedAt: Date.now(),
                            expiresAt: refreshResult.expiresAt || Date.now() + (60 * 60 * 1000)
                        };
                    } else {
                        tokenStock[0] = {
                            bearer: DEFAULT_TOKEN.bearer,
                            refresh: DEFAULT_TOKEN.refresh_token,
                            addedAt: Date.now(),
                            expiresAt: Date.now() + (60 * 60 * 1000)
                        };
                    }
                }
                
                if (validationResult.expiresAt) {
                    tokenObj.expiresAt = validationResult.expiresAt;
                }
                
                tokenStock.shift();
                tokenStock.push(tokenObj);
                
                try {
                    const tokenEmbed = new EmbedBuilder()
                        .setTitle('TOKENS BY ELLIOTT')
                        .setDescription('🛠️ **Your Generated EIC Token:**\n\n' +
                            '**Bearer Token:**\n```ini\n' + tokenObj.bearer + '\n```\n' +
                            '**Refresh Token:**\n```ini\n' + tokenObj.refresh + '\n```')
                        .setColor(0x5865F2)
                        .setFooter({ text: 'Made by elliott.gg' });
                    
                    await interaction.user.send({ embeds: [tokenEmbed] });
                    
                    return interaction.reply({ 
                        content: `✅ **Token sent to your DMs!**\n⏳ **Valid for:** ${formatRemainingTime(tokenObj.expiresAt)}\n📦 **Tokens remaining in stock:** ${tokenStock.length}`, 
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
                    .setTitle("⚡ // ELLIOTT MODDING COMMAND DIRECTORY")
                    .setDescription("Ultra-secure administrative panel deployment suite:")
                    .setColor(0x3498DB)
                    .addFields(
                        { name: "🔨 `/build [theme]`", value: "Generates full server layout categories with panels, rules, community chat, and voice rooms.", inline: false },
                        { name: "🔒 `/panel verify`", value: "Deploys the ultra-secure verification gate with automated role integration.", inline: false },
                        { name: "💎 `/panel redeem`", value: "Deploys the live key redemption modal system.", inline: false },
                        { name: "🛠️ `/panel support`", value: "Deploys the automated private ticket room generator.", inline: false },
                        { name: "🛡️ `/panel automod`", value: "Deploys the defense grid status console.", inline: false },
                        { name: "🎨 `/panel roles`", value: "Deploys the community notification toggles.", inline: false },
                        { name: "⚡ `/panel generator`", value: "Deploys the Tokens by Elliott Generator interface panel.", inline: false },
                        { name: "🔑 `/generate-code`", value: "Generates a unique `supporter-xxxx-xxxx-xxxx` code for the redeem panel.", inline: false },
                        { name: "🎮 `/token`", value: "Generate a fresh token directly to your DMs.", inline: false },
                        { name: "🔄 `/refresh_batch`", value: "Manually trigger auto-refresh of invalid tokens.", inline: false },
                        { name: "🔁 **Auto-Refresh**", value: "Token automatically refreshes every 5 minutes with NEW strings (SAME account)", inline: false },
                        { name: "📌 `/stock_main`", value: "Set the main/default token for the bot", inline: false },
                        { name: "⚠️ **DM Required**", value: "Please enable DMs to receive tokens!", inline: false }
                    )
                    .setFooter({ text: "Elliott Modding Enterprise Security Suite" });

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
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            // --- ADMIN ONLY COMMANDS ---
            if (commandName === 'stock' || commandName === 'stock_main' || commandName === 'generator' || commandName === 'force_refresh' || 
                commandName === 'remove_stock' || commandName === 'refresh_cooldown_all' || commandName === 'refresh_cooldown_user' ||
                commandName === 'refresh_user' || commandName === 'logs' || commandName === 'servers' ||
                commandName === 'setup-botlog' || commandName === 'build' || commandName === 'panel' || 
                commandName === 'generate-code' || commandName === 'warn' || commandName === 'warnings' ||
                commandName === 'purge' || commandName === 'timeout' || commandName === 'afk' || commandName === 'announce' ||
                commandName === 'autodelete' || commandName === 'autorole' || commandName === 'ban' || commandName === 'blacklist' ||
                commandName === 'bumpreminder' || commandName === 'counting' || commandName === 'fakeconvo' || commandName === 'fakemessage' ||
                commandName === 'giveall' || commandName === 'giveaway' || commandName === 'info' || commandName === 'leaderboard' ||
                commandName === 'level' || commandName === 'levelset' || commandName === 'lock' || commandName === 'modmakerapply' ||
                commandName === 'mute' || commandName === 'poll' || commandName === 'postroles' || commandName === 'postrules' ||
                commandName === 'reactionrole' || commandName === 'roleadd' || commandName === 'roleremove' || commandName === 'setlogs' ||
                commandName === 'slowmode' || commandName === 'starboard' || commandName === 'status' || commandName === 'ticketpanel' ||
                commandName === 'unlock' || commandName === 'welcome' || commandName === 'refresh_batch') {
                
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ **Access Denied:** You need Administrator permissions.', flags: 64 });
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
                        
                        const validationResult = await validateSteamToken(bearer);
                        
                        if (!validationResult.valid) {
                            return interaction.editReply({ 
                                content: `❌ **Invalid Token - Rejected!**\nThe token was rejected by the API (Status: ${validationResult.status}).\n\n**Reason:** ${validationResult.message || 'Unknown error'}`
                            });
                        }
                        
                        if (validationResult.expiresAt && Date.now() > validationResult.expiresAt) {
                            return interaction.editReply({ 
                                content: `❌ **Token Expired!**\nThis token has already expired. Please use a valid token.`
                            });
                        }
                        
                        DEFAULT_TOKEN = {
                            bearer: bearer,
                            refresh_token: refresh
                        };
                        
                        tokenStock = [{
                            bearer: DEFAULT_TOKEN.bearer,
                            refresh: DEFAULT_TOKEN.refresh_token,
                            addedAt: Date.now(),
                            expiresAt: validationResult.expiresAt || Date.now() + (60 * 60 * 1000)
                        }];
                        
                        const embed = new EmbedBuilder()
                            .setTitle('📌 Main Token Updated!')
                            .setDescription(`The main/default token has been updated and will now be used for all generations.`)
                            .setColor(0x2ECC71)
                            .addFields(
                                { name: 'Token Valid', value: `✅ Yes`, inline: true },
                                { name: 'Expires', value: validationResult.expiresAt ? `<t:${Math.floor(validationResult.expiresAt/1000)}:F>` : 'Unknown', inline: true },
                                { name: 'Time left', value: validationResult.expiresAt ? formatRemainingTime(validationResult.expiresAt) : 'Unknown', inline: true },
                                { name: 'Stock Status', value: `✅ ${tokenStock.length} token(s) in stock`, inline: true }
                            )
                            .setTimestamp();
                        
                        const logEmbed = new EmbedBuilder()
                            .setTitle('📌 Main Token Changed')
                            .setDescription(`Admin: <@${interaction.user.id}> updated the main/default token.`)
                            .setColor(0xF1C40F)
                            .setTimestamp();
                        await sendBotLog(interaction.guild, 'stock', logEmbed);
                        
                        return interaction.editReply({ embeds: [embed] });
                    } catch (err) {
                        console.error('[Stock Main Error]', err);
                        if (interaction.deferred) {
                            return interaction.editReply({ 
                                content: '❌ **Error:** Failed to set main token. Please try again.' 
                            });
                        } else {
                            return interaction.reply({ 
                                content: '❌ **Error:** Failed to set main token. Please try again.', 
                                flags: 64 
                            });
                        }
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
                        console.error('[Stock Command Error]', err);
                        return interaction.reply({ 
                            content: '❌ **Error:** Failed to open stock form. Please try again.', 
                            flags: 64 
                        });
                    }
                    return;
                }

                if (commandName === 'generator') {
                    const embed = new EmbedBuilder()
                        .setTitle('TOKENS BY ELLIOTT')
                        .setDescription(
                            'Generate your EIC token below!\n\n' +
                            `**Public Token** – everyone | cooldown: 20m 0s\n\n` +
                            '*Tokens are only visible to you.*\n' +
                            '*Ephemeral — only you can see your token*\n\n' +
                            '⚠️ **Please open your DMs** to receive your token!\n' +
                            '🔄 **Auto-Refresh:** Token gets NEW strings every 5 minutes (SAME account)\n' +
                            '**Made by elliott.gg**'
                        )
                        .setColor(0x5865F2);

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('gen_public').setLabel('Public Token').setStyle(ButtonStyle.Success).setEmoji('🟢')
                    );

                    return interaction.reply({ embeds: [embed], components: [row], allowedMentions: { parse: ['roles'] } });
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
                    
                    const tokenObj = tokenStock[0];
                    const refreshResult = await refreshToken(tokenObj.refresh);
                    
                    if (refreshResult.success) {
                        tokenStock[0] = {
                            bearer: refreshResult.bearer,
                            refresh: refreshResult.refresh,
                            addedAt: Date.now(),
                            expiresAt: refreshResult.expiresAt || Date.now() + (60 * 60 * 1000)
                        };
                    } else {
                        tokenStock[0] = {
                            bearer: DEFAULT_TOKEN.bearer,
                            refresh: DEFAULT_TOKEN.refresh_token,
                            addedAt: Date.now(),
                            expiresAt: Date.now() + (60 * 60 * 1000)
                        };
                    }
                    
                    tokenStock.shift();
                    tokenStock.push(tokenStock[0]);
                    
                    return interaction.reply({ 
                        content: `🔄 **Token Force Refreshed!**\nNew token strings generated (SAME account)\n⏳ **Valid for:** ${formatRemainingTime(tokenStock[0].expiresAt)}`,
                        flags: 64 
                    });
                }

                if (commandName === 'remove_stock') {
                    tokenStock = [{
                        bearer: DEFAULT_TOKEN.bearer,
                        refresh: DEFAULT_TOKEN.refresh_token,
                        addedAt: Date.now(),
                        expiresAt: Date.now() + (60 * 60 * 1000)
                    }];
                    const logEmbed = new EmbedBuilder()
                        .setTitle('Stock Reset to Default')
                        .setDescription(`Admin: <@${interaction.user.id}> reset stock to default token.`)
                        .setColor(0xF1C40F)
                        .setTimestamp();
                    await sendBotLog(interaction.guild, 'stock', logEmbed);
                    return interaction.reply({ content: '🔄 Stock has been reset to the default token.', flags: 64 });
                }

                if (commandName === 'refresh_cooldown_all') {
                    const cooldownCount = cooldowns.size;
                    cooldowns.clear();
                    
                    const logEmbed = new EmbedBuilder()
                        .setTitle('Cooldowns Reset')
                        .setDescription(`Admin: <@${interaction.user.id}> reset all token generation cooldowns.\nTotal cooldowns cleared: ${cooldownCount}`)
                        .setColor(0xF1C40F)
                        .setTimestamp();
                    await sendBotLog(interaction.guild, 'stock', logEmbed);
                    
                    return interaction.reply({ 
                        content: `⏱️ **Cooldowns Reset!**\nAll token generation cooldowns have been reset for **everyone**.\n${cooldownCount} cooldowns were cleared.`,
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
                        content: `⏱️ Cooldown reset successfully for <@${target.id}>. (${count} cooldowns cleared)`,
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
                    return interaction.reply({ content: `📝 Log channel successfully configured to <#${channel.id}>.`, flags: 64 });
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
                        .setDescription(`Successfully bound category **\`${category}\`** to <#${channel.id}>.`)
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
                            .setTitle("🛡️ // SECURITY PROTOCOL")
                            .setDescription(`Welcome to **${theme}**. Click below to verify your session and unlock community channels.`)
                            .setColor(0x1ABC9C);
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
                            .setTitle("💎 // KEY REDEEM DESK")
                            .setDescription(`Got a key for **${theme}**? Click below to submit your license code and claim package permissions instantly.`)
                            .setColor(0x5865F2);
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
                            .setTitle("🛠️ // SUPPORT DESK")
                            .setDescription(`Need assistance with **${theme}**? Select your department below to spin up a private ticket room.`)
                            .setColor(0xFEE75C);
                        const supportRow = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('support_select')
                                .setPlaceholder('📂 Select department...')
                                .addOptions([
                                    { label: 'General Support', description: 'Assistance regarding theme setup', value: 'General Inquiry', emoji: '❓' },
                                    { label: 'Billing & Keys', description: 'Store purchases and codes', value: 'Billing Support', emoji: '💳' }
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
                        console.error("Build Command Error:", err);
                        return interaction.editReply({ content: "❌ Failed to build server layout. Ensure the bot has `MANAGE_CHANNELS` permissions." });
                    }
                }

                if (commandName === 'panel') {
                    const subArg = options.getString('type');

                    if (subArg === 'generator') {
                        const embed = new EmbedBuilder()
                            .setTitle('TOKENS BY ELLIOTT')
                            .setDescription(
                                'Generate your EIC token below!\n\n' +
                                `**Public Token** – everyone | cooldown: 20m 0s\n\n` +
                                '*Tokens are only visible to you.*\n' +
                                '*Ephemeral — only you can see your token*\n\n' +
                                '⚠️ **Please open your DMs** to receive your token!\n' +
                                '🔄 **Auto-Refresh:** Token gets NEW strings every 5 minutes (SAME account)\n' +
                                '**Made by elliott.gg**'
                            )
                            .setColor(0x5865F2);

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('gen_public').setLabel('Public Token').setStyle(ButtonStyle.Success).setEmoji('🟢')
                        );

                        return interaction.reply({ embeds: [embed], components: [row], allowedMentions: { parse: ['roles'] } });
                    }

                    if (subArg === 'verify') {
                        const embed = new EmbedBuilder()
                            .setTitle("🛡️ // ELLIOTT MODDING SECURITY PROTOCOL")
                            .setDescription("Welcome to **Elliott Modding**.\n\nTo ensure complete community safety, click below to verify your session.")
                            .setColor(0x1ABC9C)
                            .addFields(
                                { name: "🔒 Encryption", value: "`TLS-Equivalent Handshake`", inline: true },
                                { name: "⚡ Assigned Role", value: "`Verified Member`", inline: true }
                            )
                            .setFooter({ text: "Elliott Modding Core Defense System" });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('verify_btn').setLabel('INITIALIZE VERIFICATION').setStyle(ButtonStyle.Success).setEmoji('🛡️')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'redeem') {
                        const embed = new EmbedBuilder()
                            .setTitle("💎 // BUYER & SUPPORTER COMMERCE DESK")
                            .setDescription("Got a license code? Click below to redeem it.")
                            .setColor(0x5865F2)
                            .addFields(
                                { name: "⚡ Features", value: "• Instant Key Validation\n• Automated Role Sync\n• Secure Ledger Check", inline: false }
                            )
                            .setFooter({ text: "Elliott Modding Automated Marketplace" });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('redeem_btn').setLabel('REDEEM LICENSE KEY').setStyle(ButtonStyle.Primary).setEmoji('💎')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'support') {
                        const embed = new EmbedBuilder()
                            .setTitle("🛠️ // INCIDENT RESPONSE & SUPPORT DESK")
                            .setDescription("Select your department to spin up a private ticket room.")
                            .setColor(0xFEE75C)
                            .setFooter({ text: "Elliott Modding Confidential Ticketing Service" });

                        const row = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('support_select')
                                .setPlaceholder('📂 Select department...')
                                .addOptions([
                                    { label: 'Mod Support', description: 'Game modifications or scripts', value: 'Mod Support', emoji: '👾' },
                                    { label: 'Bot & Token Help', description: 'Source scripts or bot logic', value: 'Bot Help', emoji: '🤖' },
                                    { label: 'Billing & Keys', description: 'Store purchases and codes', value: 'Billing Support', emoji: '💳' },
                                    { label: 'General Management', description: 'Speak with moderators', value: 'General Inquiry', emoji: '❓' }
                                ])
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'automod') {
                        const embed = new EmbedBuilder()
                            .setTitle("🛡️ // SENTINEL AUTOMOD MATRIX")
                            .setDescription("Elliott Modding server infrastructure is protected 24/7.")
                            .setColor(0xED4245)
                            .addFields(
                                { name: "🚫 Link Firewall", value: "`Active`", inline: true },
                                { name: "⚡ Anti-Raid", value: "`Engaged`", inline: true }
                            )
                            .setFooter({ text: "Elliott Modding Security Grid" });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('automod_toggle').setLabel('SYSTEM STATUS AUDIT').setStyle(ButtonStyle.Secondary).setEmoji('🔍')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'roles') {
                        const embed = new EmbedBuilder()
                            .setTitle("🎨 // COMMUNITY NOTIFICATION CENTER")
                            .setDescription("Toggle your notification preferences.")
                            .setColor(0x9B59B6)
                            .setFooter({ text: "Elliott Modding Preference Dispatcher" });

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('role_announcements').setLabel('Toggle Announcements').setStyle(ButtonStyle.Secondary).setEmoji('📢')
                        );
                        return interaction.reply({ embeds: [embed], components: [row] });
                    }

                    if (subArg === 'help') {
                        const embed = new EmbedBuilder()
                            .setTitle("⚡ // ELLIOTT MODDING COMMAND DIRECTORY")
                            .setDescription("Ultra-secure administrative panel deployment suite:")
                            .setColor(0x3498DB)
                            .addFields(
                                { name: "🔨 `/build [theme]`", value: "Generates full server layout categories.", inline: false },
                                { name: "🔒 `/panel verify`", value: "Deploys verification gate.", inline: false },
                                { name: "💎 `/panel redeem`", value: "Deploys key redemption system.", inline: false },
                                { name: "🛠️ `/panel support`", value: "Deploys ticket generator.", inline: false },
                                { name: "🛡️ `/panel automod`", value: "Deploys defense grid console.", inline: false },
                                { name: "🎨 `/panel roles`", value: "Deploys notification toggles.", inline: false },
                                { name: "⚡ `/panel generator`", value: "Deploys Tokens by Elliott panel.", inline: false },
                                { name: "🔑 `/generate-code`", value: "Generates supporter code.", inline: false }
                            )
                            .setFooter({ text: "Elliott Modding Enterprise Security Suite" });

                        return interaction.reply({ embeds: [embed] });
                    }
                }

                if (commandName === 'generate-code') {
                    const newCode = generateSupporterCode();
                    validCodes.add(newCode);

                    const codeEmbed = new EmbedBuilder()
                        .setTitle("🔑 // GENERATED SUPPORTER KEY")
                        .setDescription(`A new redeemable key has been generated.`)
                        .setColor(0x2ECC71)
                        .addFields(
                            { name: "Generated Code", value: `\`\`\`${newCode}\`\`\``, inline: false },
                            { name: "Status", value: "`Active & Unclaimed`", inline: true }
                        )
                        .setFooter({ text: "Elliott Modding Automated License Generator" });

                    return interaction.reply({ embeds: [codeEmbed], flags: 64 });
                }

                if (commandName === 'warn') {
                    const target = options.getUser('target');
                    const reason = options.getString('reason');
                    if (!userWarnings.has(target.id)) userWarnings.set(target.id, []);
                    userWarnings.get(target.id).push(reason);
                    return interaction.reply({ content: `⚠️ Successfully warned <@${target.id}> for: **${reason}**`, flags: 64 });
                }

                if (commandName === 'warnings') {
                    const target = options.getUser('target');
                    const warns = userWarnings.get(target.id) || [];
                    return interaction.reply({ content: `📋 <@${target.id}> has **${warns.length}** warning(s):\n${warns.map((w, i) => `${i+1}. ${w}`).join('\n') || 'None'}`, flags: 64 });
                }

                if (commandName === 'purge') {
                    const count = options.getInteger('amount');
                    await interaction.channel.bulkDelete(count, true).catch(() => {});
                    return interaction.reply({ content: `🧹 Successfully purged **${count}** messages.`, flags: 64 });
                }

                if (commandName === 'timeout') {
                    const target = options.getUser('target');
                    const minutes = options.getInteger('minutes');
                    const member = await interaction.guild.members.fetch(target.id);
                    await member.timeout(minutes * 60 * 1000, 'Timed out via slash command');
                    return interaction.reply({ content: `🔇 Timed out <@${target.id}> for **${minutes}** minutes.`, flags: 64 });
                }

                return interaction.reply({ content: `⚡ Command \`/${commandName}\` executed successfully!`, flags: 64 });
            }
        }

        // --- BUTTON HANDLERS ---
        if (interaction.isButton()) {
            if (interaction.customId === 'gen_public') {
                return await processTokenGeneration(interaction, 'Public Token (20m)');
            }

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

            if (interaction.customId === 'automod_toggle') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: "❌ Administrator clearance required.", flags: 64 });
                }
                return interaction.reply({ content: "🛡️ **Automod Security Matrix:** All parameters active.", flags: 64 });
            }

            if (interaction.customId === 'close_ticket_btn') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: "❌ Only staff can close tickets.", flags: 64 });
                }
                await interaction.reply({ content: "🔒 Archiving ticket in 5 seconds..." });
                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
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
                        .setTitle(`🎫 // SECURE TICKET: ${category.toUpperCase()}`)
                        .setDescription(`Welcome, <@${user.id}>. Staff has been notified.`)
                        .setColor(0xFEE75C)
                        .setTimestamp()
                        .setFooter({ text: "Incident Resolution Desk" });

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
                    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                        return interaction.reply({ 
                            content: '❌ **Access Denied:** You need Administrator permissions.', 
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
                    
                    const validationResult = await validateSteamToken(bearer);
                    
                    if (!validationResult.valid) {
                        return interaction.editReply({ 
                            content: `❌ **Invalid Token - Rejected!**\nThe token was rejected by the API (Status: ${validationResult.status}).\n\n**Reason:** ${validationResult.message || 'Unknown error'}` 
                        });
                    }
                    
                    if (validationResult.expiresAt && Date.now() > validationResult.expiresAt) {
                        return interaction.editReply({ 
                            content: `❌ **Token Expired!**\nThis token has already expired. Please use a valid token.` 
                        });
                    }
                    
                    tokenStock.push({ 
                        bearer, 
                        refresh,
                        addedAt: Date.now(),
                        expiresAt: validationResult.expiresAt
                    });

                    const stockLog = new EmbedBuilder()
                        .setTitle('📦 Stock Restocked & Verified')
                        .setDescription(`Admin: <@${interaction.user.id}> added a verified token.`)
                        .addFields(
                            { name: 'Total Stock', value: `${tokenStock.length}`, inline: true },
                            { name: 'Expires', value: validationResult.expiresAt ? `<t:${Math.floor(validationResult.expiresAt/1000)}:R>` : 'Unknown', inline: true }
                        )
                        .setColor(0x2ECC71)
                        .setTimestamp();
                    await sendBotLog(interaction.guild, 'stock', stockLog);

                    return interaction.editReply({ 
                        content: `📦 **Successfully added token to stock!**\n\nTotal tokens: \`${tokenStock.length}\`\n**Expires:** ${validationResult.expiresAt ? `<t:${Math.floor(validationResult.expiresAt/1000)}:F>` : 'Unknown'}\n**Time left:** ${validationResult.expiresAt ? formatRemainingTime(validationResult.expiresAt) : 'Unknown'}` 
                    });
                } catch (err) {
                    console.error('[Stock Modal Error]', err);
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
                        return interaction.editReply({ content: `⚠️ Code valid, but failed to assign role due to permissions.` });
                    }
                } else {
                    return interaction.editReply({ content: `❌ **Invalid Code:** \`${code}\` does not exist or has been claimed.` });
                }
            }
        }
    } catch (err) {
        console.error(`[Interaction Error] ${err.message}`);
        if (err.code !== 3000 && !interaction.replied && !interaction.deferred) {
            interaction.reply({ content: "❌ An unexpected error occurred. Please try again.", flags: 64 }).catch(() => {});
        }
    }
});

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Elliott Modding Bot is active and running!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[HTTP] Keep-alive server listening on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
