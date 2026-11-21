# Public network information commands

HN Utilities provides `/coc [page]` and `/servers [page]`. Both acknowledge publicly and update the interaction response in the invoking channel. They are global builtins; do not register duplicate guild definitions.

COC reads the existing authenticated `/api/auth/discord-staff-list` projection each time, selects Horizon Network roles and orders them by the saved HR position list. Includes all current holders and recorded supervisor/collective-board names. It does not expose directory account permissions.

Servers selects the current Horizon Network record from the existing network store, excludes every registered staff server before loading guild names through the existing paced Discord request lane, and lists current memberships. No invites or channels are created. Embeds disable mentions and pack long output within Discord limits; optional page selects the next batch.

Run `node --test auth-site/network-information.test.cjs auth-site/bot-manager.test.cjs auth-site/managed-bots.test.cjs`.
