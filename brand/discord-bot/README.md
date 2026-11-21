# Discord bot profile artwork

HN Utilities and HN Logs use the approved Horizon Network wordmarks and stripe, with opaque purple gradients and white text. The company wordmark paths remain unchanged. Square artwork uses the stacked white Horizon Network logo; banners use its horizontal white wordmark.

| Asset | PNG dimensions | Aspect ratio | Use |
| --- | --- | --- | --- |
| `hn-utilities-avatar` / `hn-logs-avatar` | 1024 × 1024 | 1:1 | Bot profile picture; wordmark and label are within the circular crop |
| `hn-utilities-banner` / `hn-logs-banner` | 1360 × 480 | 17:6 | Bot profile banner; central text and clear lower-left avatar overlap |

Static, opaque PNGs, all below 2 MB and accepted by the Bots dashboard's upload limit. The banner exports are twice Discord's 680 × 240 minimum profile-banner dimensions. Discord's current profile guidance: https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles

Run `node brand/discord-bot/make-bot-profiles.cjs` from the repository. This renders the native SVG sources using the repository's Resvg dependency and approved Plus Jakarta Sans font files, and updates both source and Brand centre PNG/SVG copies. `bot-profile-parameters.json` records output dimensions and byte sizes. Older `hn-group-bot-*` artwork remains available for historical use; it is not a substitute for the approved transparent white wordmark used inside message embeds.

Download and upload the matching PNG through Bots → select the bot → Profile & application. Uploading Brand centre assets does not itself replace a live Discord profile.
