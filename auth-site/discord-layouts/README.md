# Discord server layouts (`/server-setup`)

Each `<name>.json` file here is a layout the Auth bot can apply with its `/server-setup` slash command. The file name
(lower case letters, numbers and dashes) is the layout's name. Layouts ship with Auth (`auth-site/install.sh` copies
this folder to `/opt/hn-auth/discord-layouts`); the command re-reads them each time it runs, and the bot re-registers
the command (with the layouts as choices) every time it connects.

## Using it in Discord

Only the Discord accounts in `ALLOWED_USERS` in `auth-site/server-setup.js` can run it (currently
`1449876557035475085`). Run it inside the server you want to set up. Every reply is visible only to you.

- `/server-setup layouts` lists the layouts and the server each one belongs to.
- `/server-setup preview` shows everything that would change. Nothing is changed.
- `/server-setup apply` sets the server up.

`layout` is optional: without it the bot uses the layout that belongs to this server.

The server ID is taken from where you run the command. The first time a layout is used, the server's name must match
the layout's `server`. After a successful `apply` the bot remembers that server's ID, so renaming the server later
doesn't matter, and the layout can't be applied to any other server. To fix a layout to an ID from the start, add
`"guildId"`.

Running `apply` again only changes what differs from the layout. Roles and channels are matched by name (text channel
names the way Discord stores them: lower case, dashes for spaces). Anything not in the layout is left alone, unless
`removeUnlisted` says otherwise.

## Format

```json
{
  "server": "Exact Discord server name",
  "description": "Optional short note shown in /server-setup layouts",
  "removeUnlisted": { "roles": false, "channels": false },
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
- **removeUnlisted** deletes roles/channels the layout doesn't list. It never touches @everyone, roles managed by
  integrations or above the bot, or the server's rules/updates channels. `preview` lists every deletion first.

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
