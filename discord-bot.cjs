import discord
from discord.ext import commands

# Initialize Bot
intents = discord.Intents.default()
intents.members = True
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# --- CONFIGURATION (Replace with your server's IDs) ---
MEMBER_ROLE_ID = 123456789012345678      # Role given upon verification
ANNOUNCEMENT_ROLE_ID = 123456789012345678 # Role for announcements notification
MOD_ROLE_ID = 123456789012345678          # Staff / Mod role ID


# ==========================================
# 1. VIEWS & INTERACTIVE PANELS
# ==========================================

# --- Verification Panel ---
class VerificationView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Verify", style=discord.ButtonStyle.green, custom_id="persistent_verify", emoji="✅")
    async def verify_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        role = interaction.guild.get_role(MEMBER_ROLE_ID)
        if not role:
            return await interaction.response.send_message("❌ Error: Verification role not configured.", ephemeral=True)
            
        if role in interaction.user.roles:
            await interaction.response.send_message("You are already verified in Elliott Modding!", ephemeral=True)
        else:
            await interaction.user.add_roles(role)
            await interaction.response.send_message("✅ Welcome to TMC.LOL! You have been successfully verified.", ephemeral=True)


# --- Redeem Panel ---
class RedeemModal(discord.ui.Modal, title="Elliott Modding - Key Redemption"):
    code = discord.ui.TextInput(label="Enter Your Redeem Code", placeholder="TMC-XXXX-XXXX")

    async def on_submit(self, interaction: discord.Interaction):
        # Insert your database key validation logic here
        await interaction.response.send_message(f"🔍 Validating code: `{self.code.value}`...", ephemeral=True)

class RedeemView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Redeem Key", style=discord.ButtonStyle.blurple, custom_id="persistent_redeem", emoji="🔑")
    async def redeem_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(RedeemModal())


# --- Support Ticket Dropdown ---
class SupportDropdown(discord.ui.Select):
    def __init__(self):
        options = [
            discord.SelectOption(label="Mod Support", description="Get help with Big Scary mods, files, or tools", emoji="👾"),
            discord.SelectOption(label="Token/Bot Help", description="Assistance regarding bot tools & generators", emoji="🤖"),
            discord.SelectOption(label="General Inquiry", description="Speak with Elliott Modding staff", emoji="❓")
        ]
        super().__init__(placeholder="Select a support category...", min_values=1, max_values=1, options=options, custom_id="persistent_support_select")

    async def callback(self, interaction: discord.Interaction):
        # Create private ticket channel logic here
        await interaction.response.send_message(f"🎫 Creating your private ticket for **{self.values[0]}**...", ephemeral=True)

class SupportView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(SupportDropdown())


# --- Self-Roles Panel ---
class RoleToggleView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    async def toggle_role(self, interaction: discord.Interaction, role_id: int, role_name: str):
        role = interaction.guild.get_role(role_id)
        if not role:
            return await interaction.response.send_message("❌ Role not found.", ephemeral=True)
            
        if role in interaction.user.roles:
            await interaction.user.remove_roles(role)
            await interaction.response.send_message(f"❌ Removed the **{role_name}** role.", ephemeral=True)
        else:
            await interaction.user.add_roles(role)
            await interaction.response.send_message(f"✅ Added the **{role_name}** role!", ephemeral=True)

    @discord.ui.button(label="Announcements", style=discord.ButtonStyle.secondary, custom_id="role_announcements", emoji="📢")
    async def ann_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, ANNOUNCEMENT_ROLE_ID, "Announcements")


# ==========================================
# 2. BOT EVENTS & COMMANDS
# ==========================================

@bot.event
async def on_ready():
    # Persist views so buttons continue working after bot restarts
    bot.add_view(VerificationView())
    bot.add_view(RedeemView())
    bot.add_view(SupportView())
    bot.add_view(RoleToggleView())
    print(f"Logged in as {bot.user} - Elliott Modding Bot is active!")


# Master Panel Command for Admins
@bot.command()
@commands.has_permissions(administrator=True)
async def panel(ctx, name: str):
    """Usage: !panel verify | redeem | support | roles"""
    await ctx.message.delete() # Clean up command message for clean UI
    
    name = name.lower()
    if name == "verify":
        embed = discord.Embed(
            title="🔒 Elliott Modding - Verification",
            description="Welcome to **TMC.LOL**! Click the button below to verify your account and unlock access to the server.",
            color=discord.Color.green()
        )
        await ctx.send(embed=embed, view=VerificationView())
        
    elif name == "redeem":
        embed = discord.Embed(
            title="🎁 TMC.LOL - Key Redemption",
            description="Purchased a rank, tool, or mod? Click below to enter your key and claim your buyer status instantly.",
            color=discord.Color.blurple()
        )
        await ctx.send(embed=embed, view=RedeemView())
        
    elif name == "support":
        embed = discord.Embed(
            title="🛠️ Elliott Modding - Support Center",
            description="Need assistance? Choose a category from the dropdown menu below to open a private ticket with our team.",
            color=discord.Color.gold()
        )
        await ctx.send(embed=embed, view=SupportView())
        
    elif name == "roles":
        embed = discord.Embed(
            title="🎨 Notification Roles",
            description="Click the button below to toggle your notification pings for server updates and community announcements.",
            color=discord.Color.purple()
        )
        await ctx.send(embed=embed, view=RoleToggleView())
    else:
        await ctx.send("❌ Unknown panel type! Choose from: `verify`, `redeem`, `support`, `roles`", delete_after=5)

# Run the bot
bot.run("YOUR_BOT_TOKEN_HERE")
