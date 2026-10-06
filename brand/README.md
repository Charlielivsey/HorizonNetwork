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

## HN Group wordmark (main group logo)

Modelled on the BT Group logo: a heavy "HN Group" wordmark above a stepped line of eight colour bars.

- `hn-group-wordmark` – black text, for light backgrounds
- `hn-group-wordmark-white` – white text, for dark backgrounds (the last bar turns white)

## Email signature

`email-signature/signature.html` uses the HN Group logo on a white background. To install it, open the file in a browser, select all, copy, and paste into Gmail or Outlook signature settings.

The logo image loads from `website/public/brand/hn-group-email-logo.png`, served by the website at `http://217.154.34.205/brand/hn-group-email-logo.png`. Once the site is on hngroup.org.uk over HTTPS, update the `img src` to that address.
