const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
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
        GatewayIntentBits.MessageContent
    ]
});

// =========================== CONFIGURATION ===========================
const MEMBER_ROLE_ID = "1492798151516491816";
const ADMIN_ROLE_ID = "1542956153166626856";
const ELLIOTT_ID = "1363240484818128926";

const NO_COOLDOWN_ROLE_ID = ADMIN_ROLE_ID;
const GENERATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

const NAKAMA_SERVER = 'https://animalcompany.us-east1.nakamacloud.io';
const NAKAMA_SERVER_KEY = "6URuTSlDKKfYbuDW";

let tokenStock = [];
const cooldowns = new Map();
const activeGenerations = new Map();
let refreshInterval = null;
let isRefreshing = false;
let failedQueue = [];

// =========================== DEFAULT TOKEN ===========================
let DEFAULT_TOKEN = {
    bearer: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJhNGM1ODFiOC01NWU3LTRiODAtODIyNC0zNmU1ZTVmMzZhNjgiLCJ1aWQiOiIyOWI1MmU3My1mMDQ5LTRjNTctYmNmMi02YzRhM2E2ZWRkNjciLCJ1c24iOiJMcm1DQmdfeURTdVdMcTVSIiwidnJzIjp7ImF1dGhJRCI6IjEzNzFiOTlkOTY1MjQwYjE5ZjIwZjU2NTM0ZWVmNDc2IiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjEuMzQyMV9hM2RmNmNlNSIsImRldmljZUlEIjoiNmU5NjZhYzcwMTAxOGUxN2NkYzNmNjA4ODQ4ODA2MTgwNjYxMjhiZiJ9LCJleHAiOjE3ODgwMTAyMjgsImlhdCI6MTc4ODAwNjYyOH0.678rYxzRmJwyx0zhBZzIWrkbyVFYcYUcYOKcqXV4lus",
    refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJhNGM1ODFiOC01NWU3LTRiODAtODIyNC0zNmU1ZTVmMzZhNjgiLCJ1aWQiOiIyOWI1MmU3My1mMDQ5LTRjNTctYmNmMi02YzRhM2E2ZWRkNjciLCJ1c24iOiJMcm1DQmdfeURTdVdMcTVSIiwidnJzIjp7ImF1dGhJRCI6IjEzNzFiOTlkOTY1MjQwYjE5ZjIwZjU2NTM0ZWVmNDc2IiwiY2xpZW50VXNlckFnZW50IjoiU3RlYW1WUiAxLjg4LjEuMzQyMV9hM2RmNmNlNSIsImRldmljZUlEIjoiNmU5NjZhYzcwMTAxOGUxN2NkYzNmNjA4ODQ4ODA2MTgwNjYxMjhiZiJ9LCJleHAiOjE3ODgwMjgyMjgsImlhdCI6MTc4ODAwNjYyOH0.sbK7bCsWcbsUtFjdistpfOjg4eSK8UqQuMX2lGDezPg"
};

// =========================== HELPER FUNCTIONS ===========================
function generateGenerationId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'GEN-';
    for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
}

function formatRemainingTime(expiresAt) {
    const timeLeft = expiresAt - Date.now();
    if (timeLeft <= 0) return "Expired";
    const sec = Math.floor(timeLeft / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m > 0) return `${m}m ${s}s left`;
    return `${s}s left`;
}

function isTokenExpired(tokenObj) {
    return tokenObj.expiresAt && Date.now() > tokenObj.expiresAt;
}

function hasAdminAccess(interaction) {
    if (interaction.user.id === ELLIOTT_ID) return true;
    if (interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (interaction.member?.roles.cache.has(ADMIN_ROLE_ID)) return true;
    return false;
}

// =========================== TOKEN REFRESH ===========================
async function refreshToken(refreshTk) {
    if (isRefreshing) {
        return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
        });
    }
    isRefreshing = true;

    const url = `${NAKAMA_SERVER}/v2/account/session/refresh`;
    const authHeader = `Bearer ${NAKAMA_SERVER_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'SteamVR 1.88.1.3421_a3df6ce5',
                'Authorization': authHeader
            },
            body: JSON.stringify({ token: refreshTk })
        });

        const data = await response.json();
        if (response.status === 200 && data.token && data.token !== refreshTk) {
            const newBearer = data.token;
            const newRefresh = data.refresh_token || refreshTk;
            const expiresAt = Date.now() + 60 * 60 * 1000;

            // Update default and stock
            DEFAULT_TOKEN.bearer = newBearer;
            DEFAULT_TOKEN.refresh_token = newRefresh;
            if (tokenStock.length > 0) {
                const old = tokenStock[0];
                tokenStock[0] = {
                    bearer: newBearer,
                    refresh: newRefresh,
                    expiresAt: expiresAt,
                    id: old.id || undefined,
                    userId: old.userId || undefined,
                    username: old.username || undefined
                };
            } else {
                tokenStock.push({ bearer: newBearer, refresh: newRefresh, expiresAt });
            }

            const result = { success: true, bearer: newBearer, refresh: newRefresh, expiresAt };
            failedQueue.forEach(p => p.resolve(result));
            failedQueue = [];
            isRefreshing = false;
            return result;
        } else {
            throw new Error(data.message || `HTTP ${response.status}`);
        }
    } catch (err) {
        failedQueue.forEach(p => p.reject(err));
        failedQueue = [];
        isRefreshing = false;
        throw err;
    }
}

async function refreshTokenInStock() {
    if (tokenStock.length === 0) {
        tokenStock.push({
            bearer: DEFAULT_TOKEN.bearer,
            refresh: DEFAULT_TOKEN.refresh_token,
            expiresAt: Date.now() + 60 * 60 * 1000
        });
    }
    const tokenObj = tokenStock[0];
    try {
        const result = await refreshToken(tokenObj.refresh);
        if (result.success) {
            console.log('[TMC.LOL] ✅ Token refreshed successfully.');
        }
    } catch (err) {
        console.error('[TMC.LOL] ❌ Refresh failed:', err.message);
        if (isTokenExpired(tokenObj)) {
            tokenObj.expiresAt = Date.now() + 5 * 60 * 1000; // 5min grace
        }
    }
}

// =========================== TOKEN VALIDATION ===========================
async function validateToken(bearerToken) {
    // Quick JWT expiry check
    try {
        const parts = bearerToken.split('.');
        if (parts.length !== 3) return false;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (payload.exp && Date.now() >= payload.exp * 1000) return false;
    } catch {
        return false;
    }
    // Optionally call /v2/account to verify
    try {
        const resp = await fetch(`${NAKAMA_SERVER}/v2/account`, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        return resp.status === 200;
    } catch {
        return true; // fallback if API unreachable
    }
}

// =========================== GENERATE TOKEN PROCESS ===========================
async function generateTokenForUser(interaction, tier) {
    const userId = interaction.user.id;
    const member = interaction.member;

    // Cooldown check
    const hasNoCooldown = member?.roles.cache.has(NO_COOLDOWN_ROLE_ID);
    if (!hasNoCooldown) {
        const key = `gen_${userId}`;
        if (cooldowns.has(key) && Date.now() < cooldowns.get(key)) {
            const remaining = cooldowns.get(key) - Date.now();
            return interaction.reply({
                content: `⏳ Cooldown: ${formatRemainingTime(remaining)}`,
                flags: 64
            });
        }
    }

    // Active generation check
    if (activeGenerations.has(userId)) {
        return interaction.reply({
            content: '⏳ You already have a generation in progress.',
            flags: 64
        });
    }
    activeGenerations.set(userId, Date.now());

    // DM check
    try {
        await interaction.user.send('🔍 Testing DM...');
    } catch {
        activeGenerations.delete(userId);
        return interaction.reply({
            content: '❌ Please enable DMs from server members.',
            flags: 64
        });
    }

    await interaction.reply({ content: '⏳ Generating token...', flags: 64 });

    try {
        // Ensure stock has at least one token
        if (tokenStock.length === 0) {
            tokenStock.push({
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                expiresAt: Date.now() + 60 * 60 * 1000
            });
        }

        let tokenObj = tokenStock[0];

        // Refresh if expired
        if (isTokenExpired(tokenObj)) {
            try {
                const result = await refreshToken(tokenObj.refresh);
                if (result.success) tokenObj = tokenStock[0];
            } catch (err) {
                // Fallback to default
                tokenStock[0] = {
                    bearer: DEFAULT_TOKEN.bearer,
                    refresh: DEFAULT_TOKEN.refresh_token,
                    expiresAt: Date.now() + 60 * 60 * 1000
                };
                tokenObj = tokenStock[0];
            }
        }

        // Validate
        const valid = await validateToken(tokenObj.bearer);
        if (!valid) {
            // Try refresh again
            try {
                await refreshToken(tokenObj.refresh);
                tokenObj = tokenStock[0];
            } catch {
                activeGenerations.delete(userId);
                return interaction.editReply({
                    content: '❌ Token expired and refresh failed. Please contact admin to set a new main token.'
                });
            }
        }

        // Assign generation ID
        const genId = generateGenerationId();
        tokenObj.id = genId;
        tokenObj.userId = userId;
        tokenObj.username = interaction.user.tag;

        // Move to end of stock (rotation)
        tokenStock.shift();
        tokenStock.push(tokenObj);

        // Set cooldown
        if (!hasNoCooldown) {
            cooldowns.set(`gen_${userId}`, Date.now() + GENERATION_COOLDOWN);
        }

        await interaction.editReply({ content: '⏳ Sending token via DM...' });

        // Build attachment
        const tokenData = {
            token: {
                bearer: tokenObj.bearer,
                refresh_token: tokenObj.refresh,
                expires_at: new Date(tokenObj.expiresAt).toISOString(),
                generation_id: genId
            },
            credits: "@elliott (1363240484818128926)",
            auto_refresh: "Every 90 seconds"
        };
        const jsonBuffer = Buffer.from(JSON.stringify(tokenData, null, 2), 'utf-8');
        const attachment = new AttachmentBuilder(jsonBuffer, { name: 'token.json' });

        const textContent = `BEARER: ${tokenObj.bearer}\nREFRESH: ${tokenObj.refresh}\nGEN ID: ${genId}\nValid until: ${new Date(tokenObj.expiresAt).toLocaleString()}`;
        const textBuffer = Buffer.from(textContent, 'utf-8');
        const textAttachment = new AttachmentBuilder(textBuffer, { name: 'token.txt' });

        const embed = new EmbedBuilder()
            .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
            .setDescription(`✅ Token generated!\n🆔 ${genId}\n⏳ ${formatRemainingTime(tokenObj.expiresAt)}`)
            .setColor(0x5865F2)
            .setFooter({ text: 'TMC.LOL • Credits to @elliott' });

        await interaction.user.send({
            embeds: [embed],
            files: [attachment, textAttachment]
        });

        activeGenerations.delete(userId);
        return interaction.editReply({
            content: `✅ Token sent to DMs! ID: \`${genId}\``
        });
    } catch (err) {
        console.error('[TMC.LOL] Generation error:', err);
        activeGenerations.delete(userId);
        return interaction.editReply({
            content: '❌ An error occurred. Please try again.'
        });
    }
}

// =========================== SLASH COMMANDS ===========================
const commands = [
    new SlashCommandBuilder()
        .setName('token')
        .setDescription('Generate a token (sent to DMs)'),
    new SlashCommandBuilder()
        .setName('generator')
        .setDescription('Post the generator panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('stock')
        .setDescription('Add token to stock (modal)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('stock_main')
        .setDescription('Set the main token')
        .addStringOption(opt => opt.setName('bearer').setDescription('Bearer token').setRequired(true))
        .addStringOption(opt => opt.setName('refresh').setDescription('Refresh token').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('reset-stock')
        .setDescription('Reset stock to default token')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('refresh_batch')
        .setDescription('Force refresh the current token')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('force_refresh')
        .setDescription('Alias for refresh_batch')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

// =========================== CLIENT EVENTS ===========================
client.once('ready', async () => {
    console.log(`[TMC.LOL] 🚀 Logged in as ${client.user.tag}`);
    console.log('[TMC.LOL] 🔄 Auto-refresh every 90 seconds');
    console.log('[TMC.LOL] 🔑 Using Nakama server key');

    // Initialize stock
    tokenStock = [{
        bearer: DEFAULT_TOKEN.bearer,
        refresh: DEFAULT_TOKEN.refresh_token,
        expiresAt: Date.now() + 60 * 60 * 1000
    }];

    // Register commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('[TMC.LOL] ✅ Slash commands registered');
    } catch (err) {
        console.error('[TMC.LOL] Failed to register commands:', err);
    }

    // Start auto-refresh
    if (refreshInterval) clearInterval(refreshInterval);
    setTimeout(async () => {
        await refreshTokenInStock();
    }, 5000);
    refreshInterval = setInterval(async () => {
        if (!isRefreshing) {
            await refreshTokenInStock();
        }
    }, 90 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'token') {
            return await generateTokenForUser(interaction, 'Public');
        }

        if (!hasAdminAccess(interaction)) {
            return interaction.reply({
                content: '❌ You need admin permissions.',
                flags: 64
            });
        }

        if (commandName === 'generator') {
            const embed = new EmbedBuilder()
                .setTitle('🔑 TMC.LOL TOKEN GENERATOR')
                .setDescription('Click the button below to generate a token.\nTokens are sent via DM.\nCooldown: 5 minutes (bypass with admin role).\nAuto-refresh every 90 seconds.')
                .setColor(0x5865F2)
                .setFooter({ text: 'TMC.LOL • Credits to @elliott' });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('gen_public')
                    .setLabel('Generate Token')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🔑')
            );
            return interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'stock_main') {
            const bearer = interaction.options.getString('bearer');
            const refresh = interaction.options.getString('refresh');
            DEFAULT_TOKEN.bearer = bearer;
            DEFAULT_TOKEN.refresh_token = refresh;
            tokenStock = [{
                bearer,
                refresh,
                expiresAt: Date.now() + 60 * 60 * 1000
            }];
            return interaction.reply({
                content: '✅ Main token updated successfully.',
                flags: 64
            });
        }

        if (commandName === 'stock') {
            const modal = new ModalBuilder()
                .setCustomId('stock_modal')
                .setTitle('Add Token Stock');
            const bearerInput = new TextInputBuilder()
                .setCustomId('bearer')
                .setLabel('Bearer Token')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);
            const refreshInput = new TextInputBuilder()
                .setCustomId('refresh')
                .setLabel('Refresh Token')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);
            modal.addComponents(
                new ActionRowBuilder().addComponents(bearerInput),
                new ActionRowBuilder().addComponents(refreshInput)
            );
            return interaction.showModal(modal);
        }

        if (commandName === 'reset-stock') {
            tokenStock = [{
                bearer: DEFAULT_TOKEN.bearer,
                refresh: DEFAULT_TOKEN.refresh_token,
                expiresAt: Date.now() + 60 * 60 * 1000
            }];
            return interaction.reply({ content: '🔄 Stock reset to default token.', flags: 64 });
        }

        if (commandName === 'refresh_batch' || commandName === 'force_refresh') {
            await interaction.reply({ content: '⏳ Refreshing...', flags: 64 });
            try {
                await refreshTokenInStock();
                return interaction.editReply({
                    content: `✅ Token refreshed. Valid for ${formatRemainingTime(tokenStock[0]?.expiresAt)}`
                });
            } catch (err) {
                return interaction.editReply({ content: '❌ Refresh failed.' });
            }
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'gen_public') {
            return await generateTokenForUser(interaction, 'Public');
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'stock_modal') {
            const bearer = interaction.fields.getTextInputValue('bearer');
            const refresh = interaction.fields.getTextInputValue('refresh');
            tokenStock.push({
                bearer,
                refresh,
                expiresAt: Date.now() + 60 * 60 * 1000
            });
            return interaction.reply({
                content: `📦 Token added. Stock size: ${tokenStock.length}`,
                flags: 64
            });
        }
    }
});

// =========================== HTTP SERVER ===========================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('TMC.LOL Token Bot is running.\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[TMC.LOL] HTTP server on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
