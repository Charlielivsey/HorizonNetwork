# Horizon Discord Bot

Multi-server Discord bot for the Horizon Network: moderation, tickets with transcripts, role panels,
logging, member counter, custom commands, per-server command/permission control, and network-wide
administration across linked servers.

## 1. Discord Developer Portal (one time)

1. Open https://discord.com/developers/applications → your application → **Bot**.
2. Under **Privileged Gateway Intents**, enable **Server Members Intent** and **Message Content Intent**
   (needed for welcome messages, member logs, message logs and ticket transcripts).
3. **OAuth2 → URL Generator**: tick `bot` and `applications.commands`, then the `Administrator`
   permission (or at least Manage Roles, Manage Channels, Kick/Ban/Moderate Members, Manage Messages,
   View Channels, Send Messages, Embed Links, Attach Files, Read Message History).
   Use the generated link to invite the bot to each server.

## 2. Install on the VPS (Ubuntu/Debian)

```bash
git clone https://github.com/Charlielivsey/HorizonNetwork.git
cd HorizonNetwork/discord-bot
sudo bash install.sh
```

The script installs Node.js 20, PM2 and log rotation, copies the bot to `/opt/horizon-discord-bot`,
asks for the bot token (stored in `/opt/horizon-discord-bot/.env`, readable by root only), starts
the bot and enables it on boot.

**Updating:** `git pull` then `sudo bash install.sh` again. Your token, settings and data are kept.

| Task | Command |
| --- | --- |
| Logs | `pm2 logs horizon-discord-bot` |
| Restart | `pm2 restart horizon-discord-bot` |
| Status | `pm2 status` |
| Change token | `sudo DISCORD_TOKEN=new-token bash install.sh` |

Optional: add `BOT_OWNER_IDS=id1,id2` to `/opt/horizon-discord-bot/.env` to give extra users
bot-owner access (the application owner/team always has it), then restart.

## 3. First steps in each server

1. `/setup auto` creates private log channels, a Tickets category and a transcripts channel.
2. `/ticket support-add` picks which roles handle tickets, then `/ticket panel` posts the button.
3. `/setup welcome`, `/setup autorole`, `/membercount setup` as needed.
4. `/permissions` and `/commands` control who can use what. `/help` lists everything.

To link servers into the network, the bot owner runs `/network server-add` in each server (or passes
a server ID), and gives staff access with `/network staff-add`. Network announcements and network-ban
notices go to each server's `/logging set network` channel.

## Commands

| Category | Commands |
| --- | --- |
| Information | `/help` `/ping` `/info server\|user\|avatar` |
| Bot Setup | `/setup auto\|view\|welcome\|autorole\|reset` `/membercount setup\|disable` |
| Moderation | `/ban` `/unban` `/kick` `/timeout` `/purge` `/warn add\|list\|clear` |
| Role Management | `/role add\|remove\|info\|panel` (button self-roles) |
| Tickets | `/ticket panel\|settings\|support-add\|support-remove\|open\|close\|claim\|add\|remove\|rename\|list` |
| Ticket Responses | `/response send\|add\|remove\|list` |
| Transcripts | Automatic HTML transcript on close (saved + DMed to the opener), `/transcript` for any channel |
| Logging | `/logging set\|disable\|view`: moderation, members, messages, tickets, network |
| Customization | `/customcommand add\|remove\|list`, `/commands disable\|enable\|list`, `/permissions allow\|revoke\|reset\|view` |
| Network Administration | `/network server-add\|server-remove\|ban\|unban\|announce\|staff-add\|staff-remove` |
| Network Utilities | `/networkinfo servers\|stats\|lookup\|bans` |
| Bot Administration | `/botadmin stats\|servers\|leave\|status\|sync` (bot owner only) |

Permissions are enforced by the bot: each command has a default Discord permission (e.g. `/ban`
needs Ban Members). `/permissions allow` replaces that default with a list of roles, so staff roles
can use commands without having the Discord permission themselves. Administrators can always use
everything.

Data is stored as JSON in `/opt/horizon-discord-bot/data/`. Back this folder up.
