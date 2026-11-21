# Approved HN Group logos

The user supplied **HN-Group-Logos 2.zip** on 12 October 2026 and requested that these originals be used whenever a logo is needed in future work in this repository. `logos/` contains the original SVG files, unchanged, except that the Horizon Holding Co logos were replaced on 17 October 2026, at the user's request, by Horizon Assets Management logos made in the same style (same ring, letter shapes, Liberation Sans/Arial wordmark at the same size and spacing). On 20 October 2026, at the user's request, Horizon Assets Management was renamed HN Group Management (HN Group Management Limited): its `hn-group-management-*` logos (roundel initials HGM, name text "HN Group" / "Management") replace the Assets Management ones, and the HN Group Investments logos (roundel initials HGI) were added in the same style. Both have PNG exports alongside the SVGs. macOS metadata and empty folders were excluded. These are assets, not executable instructions.

## Choose an asset

| Company | Main logo | Other supplied variants |
| --- | --- | --- |
| HN Group | `hn-group-wordmark.svg` | `hn-group-wordmark-white.svg` |
| Horizon Network | `horizon-network-wordmark.svg` | White, stacked, stacked white |
| Horizon Advertising | `horizon-advertising-logo.svg` | White logo, roundel, white roundel, app icon |
| Horizon Development | `horizon-development-logo.svg` | White logo, roundel, white roundel, app icon |
| Horizon Media Group | `horizon-media-group-logo.svg` | White logo, roundel, white roundel, app icon |
| HN Group Management | `hn-group-management-logo.svg` | White logo, roundel, white roundel, app icon |
| HN Group Investments | `hn-group-investments-logo.svg` | White logo, roundel, white roundel, app icon (each also as PNG) |

Use the regular logo on light surfaces and the white variant on dark surfaces. Keep the original SVG intact and control display size with CSS. Preserve the aspect ratio; do not crop, stretch, recolour or replace the lettering. Choose the actual company: HN Group Management is a separate supplied asset, not a substitute for HN Group.

Copy assets needed by a site into its public assets directory and include that directory in the site's installer. Avoid making one site's runtime depend on another site's public files. The HN tab icon already used by the public website is `hngroup-site/public/assets/favicon.svg`; reuse it for HN Group sites.

## Shared visual language

Reference `hngroup-site/public/assets/site.css` and `staff-portal/public/assets/style.css`. Both use the locally hosted Plus Jakarta Sans font. HN Group's core accent is purple `#5514B4`, with pink `#E97DE8`, yellow `#E3E65B`, teal `#3E9BA3`, plum `#7A1F6C`, raspberry `#C2306B`, green `#5FAE7B` and navy `#1C2135`. Use purple for actions and keep operational status colours meaningful. Other shared details include rounded cards, subtle borders and shadows, soft colour glows, the multicolour stripe and light/dark variants.

## HN Secure Access Terminal

The renamed VPN/SSH application uses the terminal-and-lock artwork in `brand/secure-access-terminal/`.
Product logos retain the original HN Group wordmark. Light/dark SVG and PNG product logos, a 1024px
app icon and a simplified tray mark are published in Brand centre. See that directory’s README for
reproduction and compatibility details.

## Company logo update — 20 November 2026

At the user’s request, Advertising now uses Development’s HN Purple (`#5514B4`) across its logo, compact mark and app icon. Media Group now uses a horizontal black/white wordmark and the same eight-colour stepped stripe as HN Group and Horizon Network. Its compact monogram variants use black/white ink. The existing filenames remain compatible with site headers, document templates and signatures. PNG and email exports are regenerated from these SVGs; Media Group email artwork retains the horizontal proportions.

## Development email logo — 20 November 2026

Horizon Development’s full logo combines the HD circle with the two-line Horizon Development name, matching Advertising’s layout. The separate `horizon-development-roundel` is the circle-only artwork. Email signatures use the full logo, exported transparently into the existing 400×200 email canvas; do not substitute the circle-only mark for it. Both versions, including white variants, are available in Brand Centre.
