# Discord server icons

The 17 November 2026 service icons use white outlined symbols, HN Purple and the approved multicolour stripe, matching the HN Appeals service icon. Corporate wordmarks remain unchanged.

- HQ: headquarters building.
- Staff: people.
- Advertising: megaphone.
- Development: code brackets.
- Appeals: the existing `hn-appeals-app-icon` from Brand centre.

Run `node brand/discord-servers/make-service-icons.cjs` to regenerate the four SVG masters, 1024 × 1024 PNGs and Brand centre exports. The older `make-icons.cjs` is retained only for the superseded artwork.

Utilities reads the approved manifest from Brand centre and synchronises current network servers through the existing paced Discord request lane. Unknown server names require a Brand centre mapping; they are never assigned a guessed icon.
