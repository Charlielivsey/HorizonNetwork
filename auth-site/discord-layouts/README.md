# Discord server layouts (`/server-setup`)

Each `<name>.json` file here is a layout the Auth bot can apply with its `/server-setup` slash command. The file name
(lower case letters, numbers and dashes) is the layout's name. Layouts ship with Auth (`auth-site/install.sh` copies
this folder to `/opt/hn-auth/discord-layouts`); the command re-reads them each time it runs, and the bot re-registers
the command (with the layouts as choices) every time it connects.

## Using it in Discord

Only the Discord accounts in `ALLOWED_USERS` in `auth-site/server-setup.js` can run it (currently
`1449876557035475085` and `1256504335110635531`). Run it inside the server you want to set up. Every reply is an HN Group embed that everyone in the channel can see (as are
all the bot's messages).

- `/server-setup layouts` lists the layouts and the server each one belongs to.
- `/server-setup preview` shows everything that would change. Nothing is changed.
- `/server-setup apply` sets the server up.

`layout` is optional: without it the bot uses the layout that belongs to this server. While you type, it searches the
layouts by server name (and layout name); you can also type a server name in full instead of choosing.

The server ID is taken from where you run the command. The first time a layout is used, the server's name must match
the layout's `server`. After a successful `apply` the bot remembers that server's ID, so renaming the server later
doesn't matter, and the layout can't be applied to any other server. To fix a layout to an ID from the start, add
`"guildId"`.

Running `apply` again only changes what differs from the layout. Roles and channels are matched by name (text channel
names the way Discord stores them: lower case, dashes for spaces). **Every role is deleted and the layout's roles are made
again** on every `apply` (the default since 3 November 2026), including roles with the same names as the layout's, so
nobody keeps a role from before: give people their roles again afterwards. Channels not in the layout are left alone unless `removeUnlisted.channels` is true.

## Format

```json
{
  "server": "Exact Discord server name",
  "description": "Optional short note shown in /server-setup layouts",
  "guildId": "Optional: the server ID, if you know it",
  "removeUnlisted": { "roles": true, "channels": false },
  "everyone": ["ViewChannel", "ReadMessageHistory", "AddReactions", "Connect", "Speak"],
  "roles": [
    { "name": "Owner", "color": "#5514B4", "hoist": true, "mentionable": false, "permissions": ["Administrator"] },
    { "name": "Staff", "color": "#3E9BA3", "hoist": true, "permissions": ["ViewChannel", "SendMessages", "ManageMessages"] }
  ],
  "channels": [
    { "name": "welcome", "type": "text", "topic": "Start here", "permissions": { "@everyone": { "deny": ["SendMessages"] } } }
  ],
  "categories": [
    {
      "name": "Staff",
      "permissions": { "@everyone": { "deny": ["ViewChannel"] }, "Staff": { "allow": ["ViewChannel"] } },
      "channels": [
        { "name": "staff-chat", "type": "text", "slowmode": 0 },
        { "name": "Staff Voice", "type": "voice", "userLimit": 10 }
      ]
    }
  ]
}
```

- **roles** are listed top first and placed, in that order, directly under the bot's own role. `permissions` sets
  the role's server-wide permissions exactly; leave it out to leave them as they are.
- **everyone** sets the @everyone role's server-wide permissions exactly; leave it out to leave them alone.
- **channels** sit at the top, outside any category; **categories** follow in order with their channels.
- `type`: `text` (default), `voice`, `announcement`, `stage` or `forum`. Optional: `topic`, `nsfw`, `slowmode`
  (seconds), `userLimit` and `bitrate` (voice/stage).
- **permissions** on a category or channel are channel permission overwrites: role name (or `@everyone`) →
  `allow` / `deny` lists. They replace the channel's role overwrites exactly; per-member overwrites are kept. A
  channel in a category with no `permissions` copies the category's (synced). Roles named here may be layout roles
  or roles already on the server.
- **Always given, in every layout:** on every `apply`, every member who isn't a bot gets each **separator role** (a
  name that starts and ends with a line, like `────────── MEMBERS ──────────`), **Network Permission Level 1** and
  **M | Member**, if the layout has them. No `roleGrants` entry is needed. Like roleGrants, this needs Server Members
  Intent. Include these roles in every layout so everyone gets them.
- **roleGrants** gives members extra roles that go with roles they already have, e.g.
  `{ "President": ["Network Permission Level 5"], "@everyone": ["Network Permission Level 1"] }` (`@everyone` means
  every member who isn't a bot). It only ever adds roles, never removes them. The bot has to list the server's
  members, so turn on **Server Members Intent** (Discord Developer Portal → the application → Bot → Privileged
  Gateway Intents). Run `apply` again whenever people get new roles.
- **removeUnlisted**: `roles` (default **true**) deletes every role first, including ones named like the layout's, and
  then makes the layout's roles again; `permissions` and `roleGrants` may then only name the layout's roles or
  `@everyone`. Set it to `false` to keep existing roles (layout roles are then updated in place and nothing else is
  deleted). `channels` (default false) deletes channels the layout doesn't list. Neither ever touches @everyone or roles
  Discord manages (bots, Server Booster, integrations); roles above the bot's own role can't be deleted and are reported.

Permission names are Discord's (any case, spaces allowed): CreateInstantInvite, KickMembers, BanMembers,
Administrator, ManageChannels, ManageGuild (Manage Server), AddReactions, ViewAuditLog, PrioritySpeaker, Stream,
ViewChannel, SendMessages, SendTTSMessages, ManageMessages, EmbedLinks, AttachFiles, ReadMessageHistory,
MentionEveryone, UseExternalEmojis, ViewGuildInsights, Connect, Speak, MuteMembers, DeafenMembers, MoveMembers,
UseVAD, ChangeNickname, ManageNicknames, ManageRoles, ManageWebhooks, ManageGuildExpressions, UseApplicationCommands,
RequestToSpeak, ManageEvents, ManageThreads, CreatePublicThreads, CreatePrivateThreads, UseExternalStickers,
SendMessagesInThreads, UseEmbeddedActivities, ModerateMembers (Timeout Members), ViewCreatorMonetizationAnalytics,
UseSoundboard, CreateGuildExpressions, CreateEvents, UseExternalSounds, SendVoiceMessages, SendPolls, UseExternalApps.

The bot needs Administrator in the server (or at least Manage Roles and Manage Channels, plus every permission it
grants), and its role must be above every role the layout changes. Discord records each change in the server's audit
log as "HN Group server setup (<layout>) by <user>".

## Layouts here

None at the moment. The HN Group roles for the HQ, Horizon Ads, Staff and dev servers are **not** a /server-setup
layout (the user's correction, 6 November 2026: "dont use setup role list. the bot will do it automatically accross
the servers i gave the IDs for"): they are in `../hn-roles.json`, which the bot applies by itself (`position-sync.js`):
if any of those roles is missing in one of those servers it deletes every other role and creates the list in order,
and it keeps each member's roles in step with their Horizon Network position on the staff portal (position role, its
permission level, NA | Network Administration), while every human member gets the separator roles, Network
Permission Level 1 and M | Member. Network Permission Level 2 (Trial Staff) and B | Bots are given by hand.
