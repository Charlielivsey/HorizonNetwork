# HN Group brand logos

A family of logos in the style of the BT roundel: a solid circle holding bold initials, with a wordmark beside it.

| Brand | Mark | Colour |
|---|---|---|
| HN Group | `HN` + "Group" | Deep violet `#4C1D95` |
| Horizon Network | `HN` | Violet `#6D28D9` |
| Horizon Advertising | `HA` | Magenta `#C026D3` |
| Horizon Development | `HD` | Teal `#0F766E` |

Each brand has these files in `logos/` (SVG) and `png/` (512px high):

- `*-roundel` – coloured circle with white letters (favicons, app icons, social avatars)
- `*-roundel-reversed` – white circle with coloured letters, for coloured or photo backgrounds
- `*-lockup` – roundel plus wordmark, for light backgrounds
- `*-lockup-on-dark` – the same with white text, for dark backgrounds

The letters are custom geometric paths and the wordmark text is converted to outlines, so the SVGs look the same everywhere without needing fonts installed.

To regenerate after changing colours or glyphs: `pip install fonttools && python3 brand/tools/generate.py`
