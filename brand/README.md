# HN Group brand logos

Logos modelled on the BT / BT Group roundel: a thin indigo ring with the initials inside, in BT indigo `#5514B4`. As with BT Business and BT Sport, each division is the same roundel with its name written beside it.

| Brand | Logo |
|---|---|
| HN Group | (HN) Group |
| Horizon Network | (HN) on its own, the main brand mark like the BT roundel |
| Horizon Advertising | (HN) Advertising |
| Horizon Development | (HN) Development |

For each brand, `logos/` (SVG) and `png/` (512px high, transparent) contain:

- `*-logo` – indigo logo for light backgrounds
- `*-logo-white` – white logo for indigo, dark or photo backgrounds
- `*-roundel` / `*-roundel-white` – the ring and initials only
- `*-app-icon` – white roundel on an indigo square

There are also alternative roundels, `horizon-advertising-roundel-alt-HA` and `horizon-development-roundel-alt-HD`, if a division should use its own initials.

The SVGs use outlined paths, so they don't depend on installed fonts. To regenerate: `pip install fonttools && python3 brand/tools/generate.py`

## HN Group multicolour versions

- `hn-group-bars` / `-white` – six multicolour vertical bars before the roundel and "Group"
- `hn-group-ring` / `-white` – roundel ring split into six coloured segments, plus "Group"
- `hn-group-ring-roundel` / `-white` – the multicolour ring on its own
