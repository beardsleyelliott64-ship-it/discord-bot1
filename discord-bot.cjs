import json
import os
import re
import asyncio
import time
import io
import base64
from datetime import datetime, timezone
import discord
from discord import app_commands
import aiohttp
import asyncpg

# --- ENVIRONMENT & CONFIGURATION ---
BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    print("[ERROR] BOT_TOKEN environment variable is not set.")
    exit(1)

SERVER_KEY = os.getenv("SERVER_KEY", "defaultkey")
ALLOWED_GUILD_IDS = [int(x.strip()) for x in os.getenv("ALLOWED_GUILD_IDS", "").split(",") if x.strip()]
DATABASE_URL = os.getenv("DATABASE_URL")

# FIXED: Correct Nakama refresh endpoint (same as EAM bot)
API_URL = "https://animalcompany.us-east1.nakamacloud.io/v2/account/session/refresh"

# --- DISCORD CONFIGURATION & ROLES ---
OWNER_IDS = {1537176834708602889, 1399841773555023893}

# --- COOLDOWN & ROLE CONFIGURATION ---
NORMAL_COOLDOWN = 450           # Default 7 minutes 30 seconds (450 seconds)
PREMIUM_COOLDOWN = 120          # 2 minutes for Buyer/VIP role tier
HEROIC_COOLDOWN = 420           # Cooldown for Heroic token generation
AUDIO_COOLDOWN = 300            # Cooldown for Audio generation

BOOSTER_ROLE_ID = 1537055300618817557
BUYER_ROLE_ID = 1538939158070825090
VIP_ROLE_ID = 1541168775720599602       
BLACKLIST_ROLE_ID = 1541516221462351954  

DATA_FILE = "data.json"
IMAGE_FILENAME = "panel.jpg"
IMAGE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), IMAGE_FILENAME)


def parse_token_expiration(token: str):
    """
    Decodes the payload of a JWT token and extracts the expiration timestamp.
    Returns: (datetime_object or None, is_expired: bool)
    """
    if not token or not token.strip():
        return None, True

    try:
        parts = token.split('.')
        if len(parts) < 2:
            return None, True

        payload_b64 = parts[1]
        payload_b64 += '=' * (-len(payload_b64) % 4)  # Add base64 padding
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(payload_bytes)

        exp_ts = payload.get("exp")
        if not exp_ts:
            return None, False  # Token has no expiration timestamp claim

        exp_dt = datetime.fromtimestamp(exp_ts, tz=timezone.utc)
        is_expired = time.time() >= exp_ts
        return exp_dt, is_expired

    except Exception:
        return None, True


def load_data():
    if not os.path.exists(DATA_FILE):
        initial_pool = []
        r_tok_1 = os.getenv("REFRESH_TOKEN_1")
        tok_1 = os.getenv("TOKEN_1")
        if r_tok_1: 
            initial_pool.append(r_tok_1)
        if tok_1 and tok_1 not in initial_pool: 
            initial_pool.append(tok_1)
            
        return {
            "token_pool": initial_pool, 
            "backup_tokens": [],
            "premium_token_pool": list(initial_pool),
            "premium_backup_tokens": [],
            "heroic_token_pool": list(initial_pool),
            "heroic_backup_tokens": [],
            "audio_pool": [],
            "audio_backup_tokens": [],
            "user_audio_history": {},
            "log_channel": None,
            "maintenance": False,
            "user_stats": {}
        }
    with open(DATA_FILE, "r") as f:
        data = json.load(f)
        if "token_pool" not in data:
            data["token_pool"] = []
        if "backup_tokens" not in data:
            data["backup_tokens"] = []
        if "premium_token_pool" not in data:
            data["premium_token_pool"] = []
        if "premium_backup_tokens" not in data:
            data["premium_backup_tokens"] = []
        if "heroic_token_pool" not in data:
            data["heroic_token_pool"] = []
        if "heroic_backup_tokens" not in data:
            data["heroic_backup_tokens"] = []
        if "audio_pool" not in data:
            data["audio_pool"] = []
        if "audio_backup_tokens" not in data:
            data["audio_backup_tokens"] = []
        if "user_audio_history" not in data:
            data["user_audio_history"] = {}
        if "log_channel" not in data:
            data["log_channel"] = None
        if "maintenance" not in data:
            data["maintenance"] = False
        if "user_stats" not in data:
            data["user_stats"] = {}
        return data

data = load_data()
cooldowns = {}
premium_cooldowns = {}
heroic_cooldowns = {}
audio_cooldowns = {}
token_lock = asyncio.Lock()

def save_data():
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=4)

# --- STRICT AUDIO VALIDATION FUNCTION ---
async def validate_audio_file(attachment: discord.Attachment) -> tuple[bool, str]:
    if not attachment.filename.lower().endswith('.mp3'):
        return False, "Invalid file format. Only `.mp3` files are permitted."
    
    if attachment.size == 0:
        return False, "The uploaded audio file is empty."
    if attachment.size > 25 * 1024 * 1024:
        return False, "The audio file exceeds the 25MB size limit."
        
    if attachment.content_type and not any(t in attachment.content_type.lower() for t in ['audio', 'mpeg', 'mp3', 'octet-stream']):
        return False, "The file's content type is not a valid audio format."
        
    try:
        file_bytes = await attachment.read()
        if len(file_bytes) < 4:
            return False, "The file is too short to be a valid MP3."
            
        has_id3 = file_bytes.startswith(b'ID3')
        has_mpeg_sync = False
        
        for i in range(len(file_bytes) - 1):
            if file_bytes[i] == 0xFF and (file_bytes[i+1] & 0xE0) == 0xE0:
                has_mpeg_sync = True
                break
                
        if not (has_id3 or has_mpeg_sync):
            return False, "File structure validation failed. Not a valid MP3 audio file."
            
    except Exception as e:
        return False, f"Error processing file data: {str(e)}"
        
    return True, "Validation successful."

# --- NAKAMA TOKEN VALIDATION & SESSION REFRESH (FIXED – like EAM) ---
async def test_token_validity(session: aiohttp.ClientSession, raw_token: str) -> tuple[bool, str, dict]:
    """
    Test a token by refreshing it using the Nakama refresh endpoint.
    The raw_token should be a refresh token (JWT). It will attempt to refresh it.
    Returns (success, message, result_data) where result_data contains
    "token" (new bearer) and "refresh_token" (new refresh token) if successful.
    """
    if not raw_token or not raw_token.strip():
        return False, "Token is invalid.", {}

    # Extract the first JWT from the input (if it's a block with extra text)
    jwt_tokens = re.findall(r'eyJ[a-zA-Z0-9_.-]+', raw_token)
    if not jwt_tokens:
        jwt_tokens = [raw_token.strip(" `\n\t")]
    
    refresh_tok = jwt_tokens[0]  # Use the first JWT as refresh token

    # Build auth header for server key
    auth_header = ""
    if SERVER_KEY:
        auth_bytes = f"{SERVER_KEY}:".encode("utf-8")
        auth_header = f"Basic {base64.b64encode(auth_bytes).decode('utf-8')}"

    headers = {
        "Content-Type": "application/json",
        "Authorization": auth_header,
        "server-key": SERVER_KEY
    }

    # Correct payload: only the refresh token
    payload = {"token": refresh_tok}

    try:
        async with session.post(API_URL, json=payload, headers=headers, timeout=10) as resp:
            resp_text = await resp.text()
            if resp.status == 200:
                try:
                    res_json = json.loads(resp_text)
                    # New bearer token
                    bearer = res_json.get("token") or res_json.get("access_token")
                    # New refresh token (may be the same if the server doesn't rotate, but we use the one returned)
                    new_refresh = res_json.get("refresh_token") or refresh_tok
                    if bearer:
                        return True, "Valid", {
                            "token": bearer,
                            "refresh_token": new_refresh,
                            "raw": res_json
                        }
                    else:
                        return False, "No bearer token in response", {}
                except json.JSONDecodeError:
                    return False, "Non-JSON response from refresh endpoint", {}
            elif resp.status in (429, 500, 502, 503, 504):
                return False, f"Network error / Server busy (HTTP {resp.status})", {}
            else:
                return False, f"Token invalid (HTTP {resp.status})", {}
    except Exception as e:
        return False, f"Network error during Nakama refresh: {e}", {}

# --- DISCORD BOT SETUP ---
intents = discord.Intents.default()
intents.members = True
intents.message_content = True

class EICBot(discord.Client):
    def __init__(self):
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)
        self.session = None
        self.db = None

    async def setup_hook(self):
        conn = aiohttp.TCPConnector(limit=10, keepalive_timeout=30)
        self.session = aiohttp.ClientSession(connector=conn)
        
        # --- RAILWAY POSTGRESQL INITIALIZATION ---
        if DATABASE_URL:
            try:
                self.db = await asyncpg.create_pool(DATABASE_URL)
                async with self.db.acquire() as db_conn:
                    await db_conn.execute("""
                        CREATE TABLE IF NOT EXISTS tokens (
                            discord_id TEXT PRIMARY KEY,
                            access_token TEXT NOT NULL,
                            refresh_token TEXT NOT NULL,
                            expires_at TIMESTAMPTZ NOT NULL
                        )
                    """)
                    await db_conn.execute("""
                        CREATE TABLE IF NOT EXISTS bot_pools (
                            pool_name TEXT PRIMARY KEY,
                            tokens JSONB NOT NULL
                        )
                    """)
                print("[SUCCESS] Connected to Railway PostgreSQL & verified dynamic tables!")
            except Exception as e:
                print(f"[DATABASE ERROR] Failed to initialize PostgreSQL pool: {e}")

        self.add_view(GenerateView())
        self.add_view(PremiumGenerateView())
        self.add_view(DonateView())
        self.add_view(CheckerView())
        self.add_view(TicketView())
        self.add_view(TicketCloseView())
        self.loop.create_task(self.auto_refresh_loop())
        self.loop.create_task(self.database_member_token_background_loop())

        for gid in ALLOWED_GUILD_IDS:
            guild = discord.Object(id=gid)
            self.tree.clear_commands(guild=guild)
            await self.tree.sync(guild=guild)
        await self.tree.sync()
        print("[SUCCESS] Cleared old commands and registered global/guild commands!")

    async def close(self):
        if self.db:
            await self.db.close()
        if self.session:
            await self.session.close()
        await super().close()

    async def auto_refresh_loop(self):
        await self.wait_until_ready()
        while not self.is_closed():
            await asyncio.sleep(300) # Check every 5 minutes
            if data.get("maintenance"):
                continue
            
            async with token_lock:
                refreshed_map = {}

                for pool_key, backup_key in [
                    ("token_pool", "backup_tokens"), 
                    ("premium_token_pool", "premium_backup_tokens"),
                    ("heroic_token_pool", "heroic_backup_tokens")
                ]:
                    pool = data.get(pool_key, [])
                    if not pool:
                        continue
                    
                    new_pool = []
                    for raw_stock in pool:
                        if raw_stock in refreshed_map:
                            new_pool.append(refreshed_map[raw_stock])
                            continue

                        exp_dt, is_expired = parse_token_expiration(raw_stock)
                        
                        if exp_dt and not is_expired:
                            time_left = (exp_dt - datetime.now(timezone.utc)).total_seconds()
                            if time_left > 600:  # more than 10 minutes left, skip refresh
                                new_pool.append(raw_stock)
                                continue

                        # Refresh the token
                        is_valid, err_msg, res_data = await test_token_validity(self.session, raw_stock)
                        if is_valid:
                            # res_data contains new bearer and new refresh token
                            new_refresh = res_data.get("refresh_token") or raw_stock
                            refreshed_map[raw_stock] = new_refresh
                            new_pool.append(new_refresh)
                        else:
                            # If refresh fails due to network/server issues, keep the token
                            if "Network error" in err_msg or "Server busy" in err_msg or "429" in err_msg:
                                new_pool.append(raw_stock)
                                continue

                            # Try to replace with a backup
                            backup_list = data.get(backup_key, [])
                            replaced = False
                            while backup_list:
                                next_backup = backup_list.pop(0)
                                b_valid, _, b_res = await test_token_validity(self.session, next_backup)
                                if b_valid:
                                    new_refresh = b_res.get("refresh_token") or next_backup
                                    new_pool.append(new_refresh)
                                    replaced = True
                                    break
                            if not replaced:
                                await log_to_channel(
                                    None,
                                    "🔄 Token Expired & Purged",
                                    f"Background check found an expired token in `{pool_key}` with no backups available.",
                                    discord.Color.orange()
                                )
                    data[pool_key] = new_pool
                save_data()

    async def database_member_token_background_loop(self):
        """Background maintenance loop to check and auto-refresh member tokens stored in Railway Postgres for 2k members."""
        await self.wait_until_ready()
        while not self.is_closed():
            await asyncio.sleep(300) # Check every 5 minutes
            if not self.db:
                continue
            try:
                async with self.db.acquire() as conn:
                    rows = await conn.fetch("SELECT discord_id, refresh_token, expires_at FROM tokens")
                    for row in rows:
                        discord_id = row["discord_id"]
                        refresh_token = row["refresh_token"]
                        expires_at = row["expires_at"]
                        
                        if expires_at and datetime.now(timezone.utc) >= expires_at:
                            # Use the fixed refresh endpoint
                            auth_bytes = f"{SERVER_KEY}:".encode("utf-8")
                            auth_header = f"Basic {base64.b64encode(auth_bytes).decode('utf-8')}"
                            headers = {"Content-Type": "application/json", "Authorization": auth_header, "server-key": SERVER_KEY}
                            payload = {"token": refresh_token}

                            async with self.session.post(API_URL, json=payload, headers=headers, timeout=10) as resp:
                                if resp.status == 200:
                                    res_json = await resp.json()
                                    new_access = res_json.get("token") or res_json.get("access_token")
                                    new_refresh = res_json.get("refresh_token") or refresh_token
                                    
                                    exp_dt, _ = parse_token_expiration(new_access)
                                    new_expiry = exp_dt if exp_dt else datetime.now(timezone.utc)
                                    
                                    await conn.execute(
                                        """
                                        UPDATE tokens 
                                        SET access_token = $1, refresh_token = $2, expires_at = $3 
                                        WHERE discord_id = $4
                                        """,
                                        new_access, new_refresh, new_expiry, discord_id
                                    )
                                else:
                                    await conn.execute("DELETE FROM tokens WHERE discord_id = $1", discord_id)
            except Exception as e:
                print(f"[BACKGROUND DB REFRESH ERROR]: {e}")

bot = EICBot()
client = bot

@bot.event
async def on_message(message: discord.Message):
    if message.author.bot or message.author.id in OWNER_IDS:
        return

    url_pattern = re.compile(r'https?://[^\s]+|www\.[^\s]+|discord\.gg/[^\s]+|discord\.com/invite/[^\s]+', re.IGNORECASE)

    if url_pattern.search(message.content):
        try:
            await message.delete()
            warning = await message.channel.send(f"{message.author.mention}, posting links is not allowed here!")
            await asyncio.sleep(5)
            await warning.delete()
        except discord.Forbidden:
            pass
        except discord.HTTPException:
            pass

async def log_to_channel(guild: discord.Guild, title: str, description: str, color: discord.Color):
    log_ch_id = data.get("log_channel")
    if not log_ch_id:
        return
    
    channel = bot.get_channel(log_ch_id)
    if not channel and guild:
        channel = guild.get_channel(log_ch_id)
        
    if not channel:
        try:
            channel = await bot.fetch_channel(log_ch_id)
        except Exception:
            pass
            
    if channel:
        embed = discord.Embed(title=title, description=description, color=color, timestamp=discord.utils.utcnow())
        try:
            await channel.send(embed=embed)
        except Exception as e:
            print(f"[LOG ERROR] Failed to send log to channel: {e}")

async def notify_owners_donation(item_type: str, user: discord.User, passed: bool, details: str, stocked: bool):
    for owner_id in OWNER_IDS:
        try:
            owner_user = await bot.fetch_user(owner_id)
            if owner_user:
                embed = discord.Embed(
                    title="🎁 Donation Notification" if "Token" in item_type or "Audio" in item_type else "🔍 Checker Notification",
                    description=(
                        f"👤 **User:** {user.mention} (`{user.id}`)\n"
                        f"📦 **Item Type:** `{item_type}`\n"
                        f"🧪 **Validation Passed:** `{'Yes ✅' if passed else 'No ❌'}`\n"
                        f"📥 **Added to Stock:** `{'Yes ✅' if stocked else 'No ❌'}`\n"
                        f"📝 **Details:** {details}"
                    ),
                    color=discord.Color.purple() if passed else discord.Color.red(),
                    timestamp=discord.utils.utcnow()
                )
                await owner_user.send(embed=embed)
        except Exception as e:
            print(f"[DM ERROR] Failed to send donation notification to owner {owner_id}: {e}")

async def give_token(interaction: discord.Interaction, token_type: str = "public"):
    user_id = interaction.user.id
    now = time.time()

    if isinstance(interaction.user, discord.Member):
        role_ids = {role.id for role in interaction.user.roles}
        if BLACKLIST_ROLE_ID in role_ids:
            return await interaction.response.send_message("You are blacklisted from using this generator.", ephemeral=True)

    is_premium = (token_type == "premium")
    is_heroic = (token_type == "heroic")

    if is_premium:
        is_authorized = user_id in OWNER_IDS
        if isinstance(interaction.user, discord.Member):
            role_ids = {role.id for role in interaction.user.roles}
            if VIP_ROLE_ID in role_ids or BUYER_ROLE_ID in role_ids:
                is_authorized = True
        if not is_authorized:
            return await interaction.response.send_message("❌ **Permission Denied:** This command is for Buyers and VIPs only.", ephemeral=True)
        
        cooldown_time = PREMIUM_COOLDOWN
        tier_name = "Premium (Buyer/VIP)"
        cd_dict = premium_cooldowns
        pool_key = "premium_token_pool"
        backup_key = "premium_backup_tokens"
    elif is_heroic:
        cooldown_time = 0 if user_id in OWNER_IDS else HEROIC_COOLDOWN
        tier_name = "Heroic"
        cd_dict = heroic_cooldowns
        pool_key = "heroic_token_pool"
        backup_key = "heroic_backup_tokens"
    else:
        cooldown_time = 0 if user_id in OWNER_IDS else NORMAL_COOLDOWN
        tier_name = "Public"
        cd_dict = cooldowns
        pool_key = "token_pool"
        backup_key = "backup_tokens"

    if cooldown_time > 0 and user_id in cd_dict:
        rem = int(cooldown_time - (now - cd_dict[user_id]))
        if rem > 0:
            mins = rem // 60
            secs = rem % 60
            time_str = f"{mins}m {secs}s" if mins > 0 else f"{secs} seconds"
            return await interaction.response.send_message(f"⏳ You are on cooldown. Try again in **{time_str}**.", ephemeral=True)

    if data.get("maintenance"):
        return await interaction.response.send_message("Generator is currently under maintenance.", ephemeral=True)

    async with token_lock:
        res_data = None
        b_tok = None
        r_tok = None
        pool = data.get(pool_key, [])

        attempts = 0
        max_attempts = 5
        while pool and attempts < max_attempts:
            attempts += 1
            raw_stock = pool.pop(0)
            is_valid, err_msg, res_data = await test_token_validity(bot.session, raw_stock)

            if is_valid:
                b_tok = res_data.get("token")      # new bearer
                r_tok = res_data.get("refresh_token") or raw_stock  # new refresh
                if r_tok:
                    pool.append(r_tok)  # store the new refresh token back
                elif raw_stock:
                    pool.append(raw_stock)
                break
            else:
                if "Network error" in err_msg or "timeout" in err_msg.lower() or ("HTTP" in err_msg and ("5" in err_msg or "429" in err_msg)) or "Server busy" in err_msg:
                    pool.append(raw_stock)
                    continue
                else:
                    await log_to_channel(
                        interaction.guild,
                        "🗑️ Token Purged from Pool",
                        f"👤 **User:** {interaction.user.mention} (`{interaction.user.id}`)\n"
                        f"⚠️ Pool token was invalid and purged. Rotating to next token (Attempt {attempts}/{max_attempts})...",
                        discord.Color.orange()
                    )

        if not is_heroic and not b_tok:
            backup_list = data.get(backup_key, [])
            while backup_list:
                next_backup = backup_list.pop(0)
                b_valid, _, b_res = await test_token_validity(bot.session, next_backup)
                if b_valid:
                    b_tok = b_res.get("token")
                    r_tok = b_res.get("refresh_token") or next_backup
                    if r_tok:
                        pool.append(r_tok)
                    break
        elif is_heroic and not r_tok:
            backup_list = data.get(backup_key, [])
            while backup_list:
                next_backup = backup_list.pop(0)
                b_valid, _, b_res = await test_token_validity(bot.session, next_backup)
                if b_valid:
                    r_tok = b_res.get("refresh_token") or next_backup
                    if r_tok:
                        pool.append(r_tok)
                    break

        data[pool_key] = pool
        save_data()

        if is_heroic and not r_tok:
            return await interaction.response.send_message("❌ **Out of stock:** No valid heroic tokens available in pool or backups. Please restock or donate using `/donate`.", ephemeral=True)
        elif not is_heroic and not b_tok:
            return await interaction.response.send_message("❌ **Out of stock:** No valid tokens available in pool or backups. Please restock or donate using `/donate`.", ephemeral=True)

        if cooldown_time > 0:
            cd_dict[user_id] = time.time()

        user_id_str = str(user_id)
        if "user_stats" not in data:
            data["user_stats"] = {}
        
        user_gen_count = data["user_stats"].get(user_id_str, 0) + 1
        data["user_stats"][user_id_str] = user_gen_count
        save_data()

    await interaction.response.send_message("🔄 **Starting generation...**", ephemeral=True)
    await asyncio.sleep(0.8)
    
    await interaction.edit_original_response(content="🔄 **Loading token... 3**")
    await asyncio.sleep(1)
    
    await interaction.edit_original_response(content="🔄 **Loading token... 2**")
    await asyncio.sleep(1)
    
    await interaction.edit_original_response(content="🔄 **Loading token... 1**")
    await asyncio.sleep(1)

    try:
        exp_dt, is_exp = parse_token_expiration(b_tok or r_tok)
        exp_str = exp_dt.strftime("%Y-%m-%d %H:%M:%S UTC") if exp_dt else "No Expiration Timestamp Found"

        file_content = (
            "=========================================\n"
            "           ENVOS TOKENS DATA             \n"
            "=========================================\n"
            f"Token Tier:  {tier_name.upper()}\n"
            f"Generated:   {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
            f"Expires At:  {exp_str}\n"
            "-----------------------------------------\n"
            "BEARER TOKEN:\n"
            f"{b_tok if b_tok else 'N/A'}\n\n"
            "REFRESH TOKEN:\n"
            f"{r_tok if r_tok else 'N/A'}\n"
            "=========================================\n"
        )

        token_file = discord.File(
            fp=io.BytesIO(file_content.encode('utf-8')),
            filename=f"{token_type.lower()}_token.txt"
        )

        if is_premium:
            message_content = f"🔑 **Here is your premium eic token 💎**\n\n**Bearer Token:**\n```{b_tok}```"
            if r_tok:
                message_content += f"\n**Refresh Token:**\n```{r_tok}```"
            message_content += "\n\n*made by envo*"
        elif is_heroic:
            message_content = f"🔑 **Here is your Heroic token 💎**\n\n**Refresh Token:**\n```{r_tok}```\n\n*made by envo*"
        else:
            message_content = f"🔑 **Here is your generated EIC token 💎**\n\n**Bearer Token:**\n```{b_tok}```"
            if r_tok:
                message_content += f"\n**Refresh Token:**\n```{r_tok}```"
            message_content += "\n\n*made by envo*"

        await interaction.user.send(content=message_content, file=token_file)

    except discord.Forbidden:
        return await interaction.edit_original_response(content="❌ I couldn't send you a DM. Please enable your direct messages.")

    await interaction.edit_original_response(content="✅ **Token successfully delivered to your DMs!**")

    pool_remaining = len(data.get(pool_key, []))
    token_preview = f"`...{r_tok[-12:]}`" if r_tok else (f"`...{b_tok[-12:]}`" if b_tok else "`N/A`")
    await log_to_channel(
        interaction.guild,
        "✨ Token Generated Successfully" if not is_premium else "💎 Premium Token Generated",
        f"👤 **User:** {interaction.user.mention} (`{interaction.user.id}`)\n"
        f"🏷️ **Tier:** `{tier_name}`\n"
        f"🔑 **Generated Token Suffix:** {token_preview}\n"
        f"📊 **Pool Status:** `{pool_remaining}` active tokens remaining in pool\n"
        f"📈 **User Total Gens:** `{user_gen_count}`",
        discord.Color.green() if not is_premium else discord.Color.gold()
    )

async def give_audio(interaction: discord.Interaction):
    user_id = interaction.user.id
    now = time.time()

    if isinstance(interaction.user, discord.Member):
        role_ids = {role.id for role in interaction.user.roles}
        if BLACKLIST_ROLE_ID in role_ids:
            return await interaction.response.send_message("You are blacklisted from using this generator.", ephemeral=True)

    cooldown_time = 0 if user_id in OWNER_IDS else AUDIO_COOLDOWN
    if cooldown_time > 0 and user_id in audio_cooldowns:
        rem = int(cooldown_time - (now - audio_cooldowns[user_id]))
        if rem > 0:
            mins = rem // 60
            secs = rem % 60
            time_str = f"{mins}m {secs}s" if mins > 0 else f"{secs} seconds"
            return await interaction.response.send_message(f"⏳ You are on cooldown for audio generation. Try again in **{time_str}**.", ephemeral=True)

    if data.get("maintenance"):
        return await interaction.response.send_message("Generator is currently under maintenance.", ephemeral=True)

    user_id_str = str(user_id)
    if "user_audio_history" not in data:
        data["user_audio_history"] = {}
    
    user_history = data["user_audio_history"].get(user_id_str, [])
    pool = data.get("audio_pool", [])
    
    if not pool:
        return await interaction.response.send_message("❌ **Out of stock:** No audio files available in the pool.", ephemeral=True)

    available_audios = [audio for audio in pool if audio not in user_history]
    
    if not available_audios:
        user_history = []
        available_audios = pool

    audio_url = available_audios[0]
    
    async with token_lock:
        user_history.append(audio_url)
        data["user_audio_history"][user_id_str] = user_history
        save_data()

        if cooldown_time > 0:
            audio_cooldowns[user_id] = time.time()

    await interaction.response.send_message("🎵 **Generating audio file...**", ephemeral=True)
    await asyncio.sleep(1)

    try:
        async with bot.session.get(audio_url) as resp:
            if resp.status == 200:
                file_bytes = await resp.read()
                fp = io.BytesIO(file_bytes)
                discord_file = discord.File(fp, filename="audio.mp3")
                await interaction.user.send(content="🎵 **Here is your generated audio file:**\n\n*made by envo*", file=discord_file)
            else:
                return await interaction.edit_original_response(content="❌ Failed to fetch the audio file from storage.")
    except discord.Forbidden:
        return await interaction.edit_original_response(content="❌ I couldn't send you a DM. Please enable your direct messages.")
    except Exception as e:
        return await interaction.edit_original_response(content=f"❌ Error sending audio file: {e}")

    await interaction.edit_original_response(content="✅ **Audio file successfully delivered to your DMs!**")
    
    await log_to_channel(
        interaction.guild,
        "🎶 Audio File Generated",
        f"👤 **User:** {interaction.user.mention} (`{interaction.user.id}`)\n"
        f"🔗 **Asset URL:** `{audio_url}`\n"
        f"📊 **Audio Pool Status:** `{len(data.get('audio_pool', []))}` files total (Forever Stock)",
        discord.Color.purple()
    )

class GenerateView(discord.ui.View):
    def __init__(self): 
        super().__init__(timeout=None)

    @discord.ui.button(label="Generate EIC Token", emoji="🔑", style=discord.ButtonStyle.success, custom_id="gen_eic_token_btn")
    async def generate_eic(self, interaction: discord.Interaction, button: discord.ui.Button): 
        await give_token(interaction, token_type="public")

    @discord.ui.button(label="Generate Heroic Token", emoji="💎", style=discord.ButtonStyle.primary, custom_id="gen_heroic_token_btn")
    async def generate_heroic(self, interaction: discord.Interaction, button: discord.ui.Button): 
        await give_token(interaction, token_type="heroic")

    @discord.ui.button(label="Generate Audio File", emoji="🎵", style=discord.ButtonStyle.secondary, custom_id="gen_audio_btn")
    async def generate_audio(self, interaction: discord.Interaction, button: discord.ui.Button):
        await give_audio(interaction)

class PremiumGenerateView(discord.ui.View):
    def __init__(self): 
        super().__init__(timeout=None)

    @discord.ui.button(label="Generate Premium Token", emoji="💎", style=discord.ButtonStyle.success, custom_id="gen_premium_token_btn")
    async def generate_premium(self, interaction: discord.Interaction, button: discord.ui.Button): 
        await give_token(interaction, token_type="premium")

    @discord.ui.button(label="Generate Heroic Token", emoji="💎", style=discord.ButtonStyle.primary, custom_id="gen_premium_heroic_token_btn")
    async def generate_heroic(self, interaction: discord.Interaction, button: discord.ui.Button): 
        await give_token(interaction, token_type="heroic")

    @discord.ui.button(label="Generate Audio File", emoji="🎵", style=discord.ButtonStyle.secondary, custom_id="gen_premium_audio_btn")
    async def generate_audio(self, interaction: discord.Interaction, button: discord.ui.Button):
        await give_audio(interaction)

class DonateView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Donate EIC Token", emoji="🎁", style=discord.ButtonStyle.success, custom_id="donate_token_btn")
    async def donate_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        if isinstance(interaction.user, discord.Member):
            role_ids = {role.id for role in interaction.user.roles}
            if BLACKLIST_ROLE_ID in role_ids:
                return await interaction.response.send_message("You are blacklisted from donating.", ephemeral=True)
        await interaction.response.send_modal(DonateModal())

    @discord.ui.button(label="Donate Heroic Token", emoji="💎", style=discord.ButtonStyle.primary, custom_id="donate_heroic_btn")
    async def donate_heroic_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        if isinstance(interaction.user, discord.Member):
            role_ids = {role.id for role in interaction.user.roles}
            if BLACKLIST_ROLE_ID in role_ids:
                return await interaction.response.send_message("You are blacklisted from donating.", ephemeral=True)
        await interaction.response.send_modal(HeroicDonateModal())

    @discord.ui.button(label="Donate Audio File (.mp3)", emoji="🎵", style=discord.ButtonStyle.secondary, custom_id="donate_audio_btn")
    async def donate_audio_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message("Please use the `/donate_audio` slash command to upload your `.mp3` file directly!", ephemeral=True)

class CheckerModal(discord.ui.Modal, title="Token Checker & Auto-Stock"):
    token_input = discord.ui.TextInput(
        label="Paste Token to Check",
        style=discord.TextStyle.paragraph,
        placeholder="Paste token or refresh token here...",
        required=True,
        max_length=4000
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.user.id not in OWNER_IDS:
            return await interaction.followup.send("Permission denied.", ephemeral=True)

        raw_text = self.token_input.value.strip()
        if not raw_text:
            return await interaction.followup.send("❌ **Validation Failed:** Provided input is empty.", ephemeral=True)

        is_valid, err_msg, res_data = await test_token_validity(bot.session, raw_text)
        
        if not is_valid:
            await notify_owners_donation("Checked Token", interaction.user, False, err_msg, False)
            return await interaction.followup.send(f"❌ **Token is Invalid:**\n```{err_msg}```", ephemeral=True)

        r_tok = res_data.get("refresh_token") or raw_text
        
        added_pools = []
        if r_tok not in data.get("token_pool", []):
            data["token_pool"].append(r_tok)
            added_pools.append("Public Pool")
        if r_tok not in data.get("premium_token_pool", []):
            data["premium_token_pool"].append(r_tok)
            added_pools.append("Premium Pool")
        if r_tok not in data.get("heroic_token_pool", []):
            data["heroic_token_pool"].append(r_tok)
            added_pools.append("Heroic Pool")
        save_data()

        status_msg = f"Secretly added to: `{', '.join(added_pools)}`" if added_pools else "Token is valid (already present in all pools)"
        await notify_owners_donation(
            "Checked Token",
            interaction.user,
            True,
            f"Suffix: `...{r_tok[-12:]}` ({status_msg})",
            len(added_pools) > 0
        )

        await interaction.followup.send(
            f"✅ **Token is Valid!**\n"
            f"{status_msg}\n"
            f"🔑 **Suffix:** `...{r_tok[-12:]}`",
            ephemeral=True
        )
        await log_to_channel(
            interaction.guild,
            "🔍 Token Checked & Auto-Stocked",
            f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) checked a valid token via `/checker panel` and auto-stocked it across pools.",
            discord.Color.green()
        )

class CheckerView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Check & Stock Token", emoji="🔍", style=discord.ButtonStyle.primary, custom_id="checker_panel_btn")
    async def checker_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(CheckerModal())

checker_group = app_commands.Group(name="checker", description="Token checker management commands")

@checker_group.command(name="panel", description="[Owner Only] Post the token checker panel message with button")
async def checker_panel(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    if interaction.user.id not in OWNER_IDS:
        return await interaction.followup.send("Permission denied.", ephemeral=True)
        
    embed = discord.Embed(
        title="🔍 Token Checker & Auto-Stock Panel",
        description=(
            "**Test tokens instantly!**\n\n"
            "Click the button below to check if a token is valid. If valid, it will be secretly and automatically stocked into the public, premium, and heroic pools!"
        ),
        color=discord.Color.blue()
    )
    
    await interaction.followup.send("Checker panel posted successfully!", ephemeral=True)
    await interaction.channel.send(embed=embed, view=CheckerView())

bot.tree.add_command(checker_group)

class StockModal(discord.ui.Modal, title="Add Token to Public Pool"):
    token_input = discord.ui.TextInput(
        label="Paste Token Block Here",
        style=discord.TextStyle.paragraph,
        placeholder="Paste your token or block here...",
        required=True,
        max_length=4000
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.user.id not in OWNER_IDS:
            return await interaction.followup.send("Permission denied.", ephemeral=True)
            
        raw_text = self.token_input.value.strip()
        if not raw_text:
            return await interaction.followup.send("❌ **Validation Failed:** Provided input is empty.", ephemeral=True)

        is_valid, err_msg, res_data = await test_token_validity(bot.session, raw_text)
        
        if not is_valid:
            return await interaction.followup.send(f"❌ **Validation Failed:**\n```{err_msg}```", ephemeral=True)
            
        r_tok = res_data.get("refresh_token") or raw_text
        if r_tok in data["token_pool"]:
            return await interaction.followup.send(f"⚠️ **Duplicate Token:** This token is already in the public pool.\n🔑 Suffix: `...{r_tok[-12:]}`", ephemeral=True)

        data["token_pool"].append(r_tok)
        save_data()

        await interaction.followup.send(f"✅ Token successfully verified with Nakama and added to public pool!\n🔑 **Suffix:** `...{r_tok[-12:]}`", ephemeral=True)
        await log_to_channel(
            interaction.guild,
            "📦 Public Pool Restocked",
            f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) added a token to the public pool. Total pool size: `{len(data['token_pool'])}`",
            discord.Color.blue()
        )

class PremiumStockModal(discord.ui.Modal, title="Add Token to Premium Pool"):
    token_input = discord.ui.TextInput(
        label="Paste Premium Token Block Here",
        style=discord.TextStyle.paragraph,
        placeholder="Paste your token or block here...",
        required=True,
        max_length=4000
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.user.id not in OWNER_IDS:
            return await interaction.followup.send("Permission denied.", ephemeral=True)
            
        raw_text = self.token_input.value.strip()
        if not raw_text:
            return await interaction.followup.send("❌ **Validation Failed:** Provided input is empty.", ephemeral=True)

        is_valid, err_msg, res_data = await test_token_validity(bot.session, raw_text)
        
        if not is_valid:
            return await interaction.followup.send(f"❌ **Validation Failed:**\n```{err_msg}```", ephemeral=True)
            
        r_tok = res_data.get("refresh_token") or raw_text
        if r_tok in data["premium_token_pool"]:
            return await interaction.followup.send(f"⚠️ **Duplicate Token:** This token is already in the premium pool.\n🔑 Suffix: `...{r_tok[-12:]}`", ephemeral=True)

        data["premium_token_pool"].append(r_tok)
        save_data()

        await interaction.followup.send(f"✅ Token successfully verified with Nakama and added to premium pool!\n🔑 **Suffix:** `...{r_tok[-12:]}`", ephemeral=True)
        await log_to_channel(
            interaction.guild,
            "📦 Premium Pool Restocked",
            f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) added a token to the premium pool. Total pool size: `{len(data['premium_token_pool'])}`",
            discord.Color.gold()
        )

class HeroicStockModal(discord.ui.Modal, title="Add Token to Heroic Pool"):
    token_input = discord.ui.TextInput(
        label="Paste Heroic Token Block Here",
        style=discord.TextStyle.paragraph,
        placeholder="Paste your token or block here...",
        required=True,
        max_length=4000
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if interaction.user.id not in OWNER_IDS:
            return await interaction.followup.send("Permission denied.", ephemeral=True)
            
        raw_text = self.token_input.value.strip()
        if not raw_text:
            return await interaction.followup.send("❌ **Validation Failed:** Provided input is empty.", ephemeral=True)

        is_valid, err_msg, res_data = await test_token_validity(bot.session, raw_text)
        
        if not is_valid:
            return await interaction.followup.send(f"❌ **Validation Failed:**\n```{err_msg}```", ephemeral=True)
            
        r_tok = res_data.get("refresh_token") or raw_text
        if r_tok in data["heroic_token_pool"]:
            return await interaction.followup.send(f"⚠️ **Duplicate Token:** This token is already in the heroic pool.\n🔑 Suffix: `...{r_tok[-12:]}`", ephemeral=True)

        data["heroic_token_pool"].append(r_tok)
        save_data()

        await interaction.followup.send(f"✅ Token successfully verified with Nakama and added to heroic pool!\n🔑 **Suffix:** `...{r_tok[-12:]}`", ephemeral=True)
        await log_to_channel(
            interaction.guild,
            "📦 Heroic Pool Restocked",
            f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) added a token to the heroic pool. Total pool size: `{len(data['heroic_token_pool'])}`",
            discord.Color.dark_purple()
        )

class DonateModal(discord.ui.Modal, title="Donate an EIC Token"):
    token_input = discord.ui.TextInput(
        label="Paste EIC Token to Donate",
        style=discord.TextStyle.paragraph,
        placeholder="Paste your token here...",
        required=True,
        max_length=4000
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        if isinstance(interaction.user, discord.Member):
            role_ids = {role.id for role in interaction.user.roles}
            if BLACKLIST_ROLE_ID in role_ids:
                return await interaction.followup.send("You are blacklisted from using this generator.", ephemeral=True)

        raw_text = self.token_input.value.strip()
        if not raw_text:
            await notify_owners_donation("EIC Token", interaction.user, False, "Empty token input submitted.", False)
            return await interaction.followup.send("❌ **Donation Rejected:** Provided token is empty.", ephemeral=True)

        is_valid, err_msg, res_data = await test_token_validity(bot.session, raw_text)
        if not is_valid:
            await notify_owners_donation("EIC Token", interaction.user, False, err_msg, False)
            return await interaction.followup.send(f"❌ **Donation Rejected:**\n```{err_msg}```", ephemeral=True)

        r_tok = res_data.get("refresh_token") or raw_text
        
        already_exists = (
            r_tok in data["token_pool"] and 
            r_tok in data["premium_token_pool"] and 
            r_tok in data["heroic_token_pool"]
        )
        
        if already_exists:
            await notify_owners_donation("EIC Token", interaction.user, True, f"Suffix: `...{r_tok[-12:]}` (Already in all pools)", False)
            return await interaction.followup.send("⚠️ **Notice:** This token is already present in our active pools! Thank you for contributing.", ephemeral=True)

        stocked = False
        if r_tok not in data["token_pool"]:
            data["token_pool"].append(r_tok)
            stocked = True
            
        if r_tok not in data["premium_token_pool"]:
            data["premium_token_pool"].append(r_tok)

        if r_tok not in data["heroic_token_pool"]:
            data["heroic_token_pool"].append(r_tok)
        
        save_data()
        
        await notify_owners_donation("EIC Token", interaction.user, True, f"Suffix: `...{r_tok[-12:]}`", stocked)
        await interaction.followup.send("🎉 **Thank you!** Your EIC token passed Nakama validation and was successfully added to pools.", ephemeral=True)
        
        await log_to_channel(
            interaction.guild,
            "🎁 Token Donated",
            f"**User:** {interaction.user.mention} (`{interaction.user.id}`) successfully donated a working token to all pools!\n"
            f"🔑 **Token Suffix:** `...{r_tok[-12:]}`",
            discord.Color.purple()
        )

class HeroicDonateModal(discord.ui.Modal, title="Donate a Heroic Token"):
    token_input = discord.ui.TextInput(
        label="Paste Heroic Token to Donate",
        style=discord.TextStyle.paragraph,
        placeholder="Paste your heroic token here...",
        required=True,
        max_length=4000
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        if isinstance(interaction.user, discord.Member):
            role_ids = {role.id for role in interaction.user.roles}
            if BLACKLIST_ROLE_ID in role_ids:
                return await interaction.followup.send("You are blacklisted from using this generator.", ephemeral=True)

        raw_text = self.token_input.value.strip()
        if not raw_text:
            await notify_owners_donation("Heroic Token", interaction.user, False, "Empty token input submitted.", False)
            return await interaction.followup.send("❌ **Donation Rejected:** Provided token is empty.", ephemeral=True)

        is_valid, err_msg, res_data = await test_token_validity(bot.session, raw_text)
        if not is_valid:
            await notify_owners_donation("Heroic Token", interaction.user, False, err_msg, False)
            return await interaction.followup.send(f"❌ **Donation Rejected:**\n```{err_msg}```", ephemeral=True)

        r_tok = res_data.get("refresh_token") or raw_text
        
        if "heroic_token_pool" not in data:
            data["heroic_token_pool"] = []

        if r_tok in data["heroic_token_pool"]:
            await notify_owners_donation("Heroic Token", interaction.user, True, f"Suffix: `...{r_tok[-12:]}` (Already in Heroic Pool)", False)
            return await interaction.followup.send("⚠️ **Notice:** This heroic token is already present in our pool! Thank you for contributing.", ephemeral=True)

        data["heroic_token_pool"].append(r_tok)
        save_data()
        
        await notify_owners_donation("Heroic Token", interaction.user, True, f"Suffix: `...{r_tok[-12:]}`", True)
        await interaction.followup.send("🎉 **Thank you!** Your heroic token passed Nakama validation and was successfully added to the heroic pool.", ephemeral=True)
        
        await log_to_channel(
            interaction.guild,
            "🎁 Heroic Token Donated",
            f"**User:** {interaction.user.mention} (`{interaction.user.id}`) successfully donated a working heroic token!\n"
            f"💎 **Token Suffix:** `...{r_tok[-12:]}`",
            discord.Color.dark_purple()
        )

class TicketCloseView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Close Ticket", emoji="🔒", style=discord.ButtonStyle.danger, custom_id="close_ticket_btn")
    async def close_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message("Closing ticket...", ephemeral=True)
        await asyncio.sleep(2)
        try:
            await interaction.channel.delete()
        except Exception:
            pass

class TicketView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Create Ticket", emoji="🎫", style=discord.ButtonStyle.primary, custom_id="create_ticket_btn")
    async def create_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        guild = interaction.guild
        user = interaction.user

        existing_channel = discord.utils.get(guild.text_channels, name=f"ticket-{user.name.lower()}")
        if existing_channel:
            return await interaction.response.send_message(f"You already have an open ticket: {existing_channel.mention}", ephemeral=True)

        await interaction.response.defer(ephemeral=True)
        overwrites = {
            guild.default_role: discord.PermissionOverwrite(read_messages=False),
            user: discord.PermissionOverwrite(read_messages=True, send_messages=True, read_message_history=True),
            guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True, manage_channels=True)
        }

        for owner_id in OWNER_IDS:
            owner_member = guild.get_member(owner_id)
            if owner_member:
                overwrites[owner_member] = discord.PermissionOverwrite(read_messages=True, send_messages=True)

        try:
            ticket_channel = await guild.create_text_channel(name=f"ticket-{user.name}", overwrites=overwrites)
            embed = discord.Embed(title="Support Ticket", description=f"Hello {user.mention}, describe your issue below.", color=discord.Color.blurple())
            await ticket_channel.send(content=f"{user.mention}", embed=embed, view=TicketCloseView())
            await interaction.followup.send(f"Created your ticket: {ticket_channel.mention}", ephemeral=True)
        except Exception as e:
            await interaction.followup.send(f"Failed to create ticket: {e}", ephemeral=True)

# --- PREMIUM COMMAND GROUP ---
premium_group = app_commands.Group(name="premium", description="Exclusive commands for buyers and VIPs")

@premium_group.command(name="generatepanel", description="[Owner Only] Post premium generator panel with button")
async def premium_generatepanel(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    if interaction.user.id not in OWNER_IDS:
        return await interaction.followup.send("Permission denied.", ephemeral=True)
        
    embed = discord.Embed(
        title="💎 Premium Generation Dashboard",
        description=(
            "Generate your tokens/files below\n\n"
            "✨ *Powered by envo*"
        ),
        color=discord.Color.dark_embed()
    )
    embed.set_thumbnail(url=f"attachment://{IMAGE_FILENAME}")
    
    if os.path.exists(IMAGE_PATH):
        file = discord.File(IMAGE_PATH, filename=IMAGE_FILENAME)
        await interaction.channel.send(file=file, embed=embed, view=PremiumGenerateView())
    else:
        await interaction.channel.send(embed=embed, view=PremiumGenerateView())
        print(f"[ERROR] Could not find image at: {IMAGE_PATH}")

    await interaction.followup.send("Premium generator panel posted successfully!", ephemeral=True)

@premium_group.command(name="stock", description="Check current premium pool stock (Buyers/VIPs only)")
async def premium_stock(interaction: discord.Interaction):
    user_id = interaction.user.id
    is_authorized = user_id in OWNER_IDS
    if isinstance(interaction.user, discord.Member):
        role_ids = {role.id for role in interaction.user.roles}
        if VIP_ROLE_ID in role_ids or BUYER_ROLE_ID in role_ids:
            is_authorized = True
            
    if not is_authorized:
        return await interaction.response.send_message("❌ **Permission Denied:** This command is for Buyers and VIPs only.", ephemeral=True)
        
    pool_count = len(data.get("premium_token_pool", []))
    backup_count = len(data.get("premium_backup_tokens", []))
    
    embed = discord.Embed(
        title="📊 Premium Stock Status",
        description=f"📦 **Active Premium Pool:** `{pool_count}` tokens\n🔄 **Premium Backups:** `{backup_count}` tokens",
        color=discord.Color.gold()
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)

@premium_group.command(name="add", description="[Owner Only] Open form to add a token to the premium pool")
async def premium_add(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    await interaction.response.send_modal(PremiumStockModal())

bot.tree.add_command(premium_group)

# --- HEROIC COMMAND GROUP ---
heroic_group = app_commands.Group(name="heroic", description="Heroic token management commands")

@heroic_group.command(name="stock", description="[Owner Only] Check current heroic pool stock")
async def heroic_stock(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
        
    pool_count = len(data.get("heroic_token_pool", []))
    backup_count = len(data.get("heroic_backup_tokens", []))
    
    embed = discord.Embed(
        title="📊 Heroic Stock Status",
        description=f"📦 **Active Heroic Pool:** `{pool_count}` tokens\n🔄 **Heroic Backups:** `{backup_count}` tokens",
        color=discord.Color.dark_purple()
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)

@heroic_group.command(name="add", description="[Owner Only] Open form to add a token to the heroic pool")
async def heroic_add(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    await interaction.response.send_modal(HeroicStockModal())

bot.tree.add_command(heroic_group)

# --- COOLDOWN COMMAND GROUP ---
cooldown_group = app_commands.Group(name="cooldown", description="Manage global generation cooldowns")

@cooldown_group.command(name="set", description="[Owner Only] Set everyone's permanent generation cooldown in seconds")
@app_commands.describe(seconds="Cooldown duration in seconds (e.g., 450 for 7m 30s)")
async def cooldown_set(interaction: discord.Interaction, seconds: int):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    
    global NORMAL_COOLDOWN
    NORMAL_COOLDOWN = seconds
    
    await interaction.response.send_message(f"✅ Public generation cooldown permanently updated to **{seconds} seconds** (`{seconds // 60}m {seconds % 60}s`).", ephemeral=True)
    await log_to_channel(
        interaction.guild,
        "⏱️ Global Cooldown Modified",
        f"**Admin:** {interaction.user.mention} updated the global normal cooldown to `{seconds} seconds`.",
        discord.Color.orange()
    )

@cooldown_group.command(name="reset", description="[Owner Only] Reset everyone's cooldown back to default (7m 30s)")
async def cooldown_reset(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    
    global NORMAL_COOLDOWN
    NORMAL_COOLDOWN = 450  # 7m 30s default
    cooldowns.clear()
    
    await interaction.response.send_message("🔄 Public cooldown has been reset back to **7m 30s** (450 seconds), and active user cooldowns were cleared.", ephemeral=True)
    await log_to_channel(
        interaction.guild,
        "🔄 Global Cooldown Reset",
        f"**Admin:** {interaction.user.mention} reset the cooldown back to 7m 30s and cleared active timers.",
        discord.Color.orange()
    )

bot.tree.add_command(cooldown_group)

# --- SAY COMMAND ---
@bot.tree.command(name="say", description="[Owner Only] Make the bot say a specified message in the current channel")
@app_commands.describe(message="The message you want the bot to repeat")
async def say_command(interaction: discord.Interaction, message: str):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    
    await interaction.response.send_message("Message sent.", ephemeral=True)
    await interaction.channel.send(message)

# --- AUDIO STOCK COMMAND (.MP3 ONLY WITH VALIDATION) ---
@bot.tree.command(name="stock_audio", description="[Owner Only] Upload and stock an validated .mp3 audio file")
@app_commands.describe(file="Upload the .mp3 audio file you want to stock")
async def stock_audio(interaction: discord.Interaction, file: discord.Attachment):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
        
    is_valid, err_msg = await validate_audio_file(file)
    if not is_valid:
        return await interaction.response.send_message(f"❌ **Audio Validation Failed:** {err_msg}", ephemeral=True)
        
    if file.url in data.get("audio_pool", []):
        return await interaction.response.send_message("⚠️ **Duplicate Audio:** This audio file is already in the audio pool.", ephemeral=True)

    data["audio_pool"].append(file.url)
    save_data()
    
    await interaction.response.send_message(f"✅ Validated audio file `{file.filename}` successfully added to the audio pool!", ephemeral=True)
    await log_to_channel(
        interaction.guild,
        "🎵 Audio Pool Restocked",
        f"**Admin:** {interaction.user.mention} added validated audio file `{file.filename}` to the audio pool. Total pool size: `{len(data['audio_pool'])}`",
        discord.Color.blue()
    )

# --- STANDARD COMMANDS (PUBLIC DONATIONS & USAGE) ---
@bot.tree.command(name="donate", description="Donate a working token to the generator (requires validation)")
async def donate_command(interaction: discord.Interaction):
    if isinstance(interaction.user, discord.Member):
        role_ids = {role.id for role in interaction.user.roles}
        if BLACKLIST_ROLE_ID in role_ids:
            return await interaction.response.send_message("You are blacklisted from using this generator.", ephemeral=True)
    await interaction.response.send_modal(DonateModal())

@bot.tree.command(name="donate_audio", description="Donate an .mp3 audio file to the generator with strict validation")
@app_commands.describe(file="Upload the .mp3 audio file you want to donate")
async def donate_audio_command(interaction: discord.Interaction, file: discord.Attachment):
    await interaction.response.defer(ephemeral=True)
    
    if isinstance(interaction.user, discord.Member):
        role_ids = {role.id for role in interaction.user.roles}
        if BLACKLIST_ROLE_ID in role_ids:
            return await interaction.followup.send("You are blacklisted from using this generator.", ephemeral=True)

    is_valid, err_msg = await validate_audio_file(file)
    if not is_valid:
        await notify_owners_donation("Audio File", interaction.user, False, err_msg, False)
        return await interaction.followup.send(f"❌ **Audio Validation Failed:** {err_msg}", ephemeral=True)

    if "audio_pool" not in data:
        data["audio_pool"] = []
        
    if file.url in data["audio_pool"]:
        await notify_owners_donation("Audio File", interaction.user, True, f"Filename: `{file.filename}` (Already in pool)", False)
        return await interaction.followup.send("⚠️ **Notice:** This audio file is already present in our audio pool! Thank you for contributing.", ephemeral=True)

    data["audio_pool"].append(file.url)
    save_data()
        
    await notify_owners_donation("Audio File", interaction.user, True, f"Filename: `{file.filename}`", True)
    await interaction.followup.send(f"✅ Validated audio file `{file.filename}` successfully donated and added to the audio pool!", ephemeral=True)
    
    await log_to_channel(
        interaction.guild,
        "🎶 Audio Donated",
        f"**User:** {interaction.user.mention} (`{interaction.user.id}`) donated validated audio file `{file.filename}`\n"
        f"🔗 **URL:** {file.url}",
        discord.Color.purple()
    )

@bot.tree.command(name="donatepanel", description="[Owner Only] Post the donate panel message with button")
async def donatepanel_command(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    if interaction.user.id not in OWNER_IDS:
        return await interaction.followup.send("Permission denied.", ephemeral=True)
        
    embed = discord.Embed(
        title="🎁 Token & Audio Donation Panel",
        description=(
            "**Help support the generator!**\n\n"
            "Click the buttons below to donate an EIC token, donate a heroic token, or donate an audio file (.mp3). "
            "All tokens and uploaded audio files are strictly tested and validated before being accepted!"
        ),
        color=discord.Color.purple()
    )
    
    await interaction.followup.send("Donate panel posted successfully!", ephemeral=True)
    await interaction.channel.send(embed=embed, view=DonateView())

@bot.tree.command(name="ticketpanel", description="[Owner Only] Post the support ticket panel message with button")
async def ticketpanel_command(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    if interaction.user.id not in OWNER_IDS:
        return await interaction.followup.send("Permission denied.", ephemeral=True)
        
    embed = discord.Embed(
        title="🎫 Support Tickets",
        description=(
            "**Need help or have a question?**\n\n"
            "Click the button below to open a private support ticket with our staff team!"
        ),
        color=discord.Color.blurple()
    )
    
    await interaction.followup.send("Ticket panel posted successfully!", ephemeral=True)
    await interaction.channel.send(embed=embed, view=TicketView())

@bot.tree.command(name="stock", description="[Owner Only] Open form to add a token to the public pool")
async def stock_command(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    await interaction.response.send_modal(StockModal())

@bot.tree.command(name="maintenance", description="[Owner Only] Toggle generator maintenance mode on/off")
async def maintenance_command(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    
    current_state = data.get("maintenance", False)
    data["maintenance"] = not current_state
    save_data()
    
    new_state_str = "🟢 **Disabled (Online)**" if data["maintenance"] is False else "🔴 **Enabled (Maintenance Active)**"
    await interaction.response.send_message(f"🛠️ Maintenance mode status changed: {new_state_str}", ephemeral=True)
    
    await log_to_channel(
        interaction.guild,
        "🛠️ Maintenance Mode Toggled",
        f"**Admin:** {interaction.user.mention} set maintenance mode to: `{data['maintenance']}`",
        discord.Color.gold()
    )

@bot.tree.command(name="system", description="[Owner Only] View detailed pool statistics and diagnostics")
async def system_command(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
        
    pool_count = len(data.get("token_pool", []))
    backup_count = len(data.get("backup_tokens", []))
    prem_pool_count = len(data.get("premium_token_pool", []))
    prem_backup_count = len(data.get("premium_backup_tokens", []))
    heroic_pool_count = len(data.get("heroic_token_pool", []))
    heroic_backup_count = len(data.get("heroic_backup_tokens", []))
    audio_pool_count = len(data.get("audio_pool", []))
    total_gens = sum(data.get("user_stats", {}).values())
    unique_users = len(data.get("user_stats", {}))
    is_maint = data.get("maintenance", False)
    
    embed = discord.Embed(
        title="📊 Pool Diagnostics & Statistics",
        color=discord.Color.blue()
    )
    embed.add_field(name="Public Pool Size", value=f"`{pool_count}` tokens", inline=True)
    embed.add_field(name="Public Backups", value=f"`{backup_count}` tokens", inline=True)
    embed.add_field(name="Premium Pool Size", value=f"`{prem_pool_count}` tokens", inline=True)
    embed.add_field(name="Premium Backups", value=f"`{prem_backup_count}` tokens", inline=True)
    embed.add_field(name="Heroic Pool Size", value=f"`{heroic_pool_count}` tokens", inline=True)
    embed.add_field(name="Heroic Backups", value=f"`{heroic_backup_count}` tokens", inline=True)
    embed.add_field(name="Audio Pool Size", value=f"`{audio_pool_count}` files (Forever Stock)", inline=True)
    embed.add_field(name="Maintenance", value="Active" if is_maint else "Inactive", inline=True)
    embed.add_field(name="Total Generations", value=f"`{total_gens}`", inline=True)
    embed.add_field(name="Unique Users", value=f"`{unique_users}`", inline=True)
    embed.set_footer(text="EIC Bot • Powered by envo")
    
    await interaction.response.send_message(embed=embed, ephemeral=True)

remove_group = app_commands.Group(name="remove", description="Stock and pool clearing commands")

@remove_group.command(name="pool", description="[Owner Only] Clear the entire public token pool")
async def remove_pool(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    data["token_pool"] = []
    save_data()
    await interaction.response.send_message("🗑️ **Pool Removed:** Cleared all tokens from the public active pool.", ephemeral=True)
    await log_to_channel(
        interaction.guild,
        "🗑️ Public Pool Cleared",
        f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) cleared the public token pool.",
        discord.Color.red()
    )

@remove_group.command(name="backups", description="[Owner Only] Clear all public backup tokens")
async def remove_backups(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    data["backup_tokens"] = []
    save_data()
    await interaction.response.send_message("🗑️ **Stock Removed:** Cleared all public backup tokens.", ephemeral=True)
    await log_to_channel(
        interaction.guild,
        "🗑️ Public Stock Cleared",
        f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) cleared all public backup tokens.",
        discord.Color.red()
    )

@remove_group.command(name="all", description="[Owner Only] Clear all pools and backups entirely")
async def remove_all(interaction: discord.Interaction):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    data["token_pool"] = []
    data["backup_tokens"] = []
    data["premium_token_pool"] = []
    data["premium_backup_tokens"] = []
    data["heroic_token_pool"] = []
    data["heroic_backup_tokens"] = []
    data["audio_pool"] = []
    data["audio_backup_tokens"] = []
    data["user_audio_history"] = {}
    save_data()
    await interaction.response.send_message("🗑️ **Stock Removed:** Cleared all public, premium, heroic, and audio pools entirely.", ephemeral=True)
    await log_to_channel(
        interaction.guild,
        "🗑️ Stock Cleared",
        f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) cleared all pools entirely.",
        discord.Color.red()
    )

bot.tree.add_command(remove_group)

@bot.tree.command(name="announce", description="[Owner Only] Send a fast DM announcement to past generator users")
@app_commands.describe(message="The message content to broadcast")
async def announce_command(interaction: discord.Interaction, message: str):
    await interaction.response.defer(ephemeral=True)
    if interaction.user.id not in OWNER_IDS:
        return await interaction.followup.send("Permission denied.", ephemeral=True)
    
    user_stats = data.get("user_stats", {})
    if not user_stats:
        return await interaction.followup.send("❌ No users have recorded generator usage yet.", ephemeral=True)
    
    success_count = 0
    fail_count = 0
    semaphore = asyncio.Semaphore(10)

    async def send_dm(user_id_str):
        nonlocal success_count, fail_count
        async with semaphore:
            try:
                user = await bot.fetch_user(int(user_id_str))
                if user:
                    await user.send(f"📢 **Server Announcement:**\n\n{message}")
                    success_count += 1
            except Exception:
                fail_count += 1

    tasks = [send_dm(uid) for uid in user_stats.keys()]
    await asyncio.gather(*tasks)
            
    await interaction.followup.send(f"✅ **Fast Announcement Complete!**\n- Sent: `{success_count}`\n- Failed: `{fail_count}`", ephemeral=True)
    await log_to_channel(
        interaction.guild,
        "📢 Announcement Broadcasted",
        f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) sent a high-speed announcement to `{success_count}` users.",
        discord.Color.blurple()
    )

@bot.tree.command(name="refresh", description="[Owner Only] Reset everyone's cooldown or a specific user's cooldown")
@app_commands.describe(user="Optional: Specific user to refresh. Leave blank to refresh everyone.")
async def refresh_command(interaction: discord.Interaction, user: discord.Member = None):
    if interaction.user.id not in OWNER_IDS:
        return await interaction.response.send_message("Permission denied.", ephemeral=True)
    
    if user is None:
        cooldowns.clear()
        premium_cooldowns.clear()
        heroic_cooldowns.clear()
        audio_cooldowns.clear()
        await interaction.response.send_message("envo has refreshed everyone's cooldown", ephemeral=False)
        await log_to_channel(
            interaction.guild,
            "🔄 Cooldowns Reset",
            f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) refreshed cooldowns for **everyone**.",
            discord.Color.orange()
        )
    else:
        cooldowns.pop(user.id, None)
        premium_cooldowns.pop(user.id, None)
        heroic_cooldowns.pop(user.id, None)
        audio_cooldowns.pop(user.id, None)
        await interaction.response.send_message(f"envo has refreshed cooldown for {user.mention}", ephemeral=True)
        await log_to_channel(
            interaction.guild,
            "🔄 User Cooldown Reset",
            f"**Admin:** {interaction.user.mention} (`{interaction.user.id}`) refreshed cooldown for {user.mention} (`{user.id}`).",
            discord.Color.orange()
        )

@bot.tree.command(name="token", description="Generate a fresh EIC token to your DMs")
async def token_command(interaction: discord.Interaction):
    await give_token(interaction, token_type="public")

@bot.tree.command(name="logs", description="[Owner Only] Set log channel")
async def logs(interaction: discord.Interaction, channel: discord.TextChannel = None):
    await interaction.response.defer(ephemeral=True)
    if interaction.user.id not in OWNER_IDS:
        return await interaction.followup.send("Permission denied.", ephemeral=True)
    
    if channel is None:
        current = bot.get_channel(data.get("log_channel")) if data.get("log_channel") else None
        return await interaction.followup.send(f"Current log channel: {current.mention if current else 'Not Set'}", ephemeral=True)
    
    data["log_channel"] = channel.id
    save_data()
    await interaction.followup.send(f"Log channel set to {channel.mention}.", ephemeral=True)
    await log_to_channel(
        interaction.guild,
        "📋 Log Channel Updated",
        f"**Admin:** {interaction.user.mention} set this channel as the official bot audit log destination.",
        discord.Color.teal()
    )

@bot.tree.command(name="generator", description="[Owner Only] Post dashboard generator panel")
async def generator(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    if interaction.user.id not in OWNER_IDS:
        return await interaction.followup.send("Permission denied.", ephemeral=True)
        
    embed = discord.Embed(
        title="⚡ Generation Dashboard",
        description=(
            "Generate your tokens/files below\n\n"
            "✨ *Powered by envo*"
        ),
        color=discord.Color.dark_embed()
    )
    embed.set_thumbnail(url=f"attachment://{IMAGE_FILENAME}")
    
    if os.path.exists(IMAGE_PATH):
        file = discord.File(IMAGE_PATH, filename=IMAGE_FILENAME)
        await interaction.channel.send(file=file, embed=embed, view=GenerateView())
    else:
        await interaction.channel.send(embed=embed, view=GenerateView())
        print(f"[ERROR] Could not find image at: {IMAGE_PATH}")

    await interaction.followup.send("Generator panel posted saved successfully!", ephemeral=True)

if __name__ == "__main__":
    bot.run(BOT_TOKEN)
