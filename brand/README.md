# HN Group brand logos

All files are in `logos/` (SVG) and `png/` (512px high, transparent).

## HN Group and Horizon Network: wordmarks

These follow the BT Group style: a heavy black wordmark above a stepped line of eight colour bars.

- `hn-group-wordmark` / `-white`
- `horizon-network-wordmark` / `-white` – on one line
- `horizon-network-wordmark-stacked` / `-white` – "Horizon" over "Network", for small spaces such as email

The `-white` versions have white text for dark backgrounds, and the last bar turns white.

## Other divisions: roundels

These follow the BT roundel: a thick ring with heavy initials inside. Horizon Advertising is lavender (`#7B52C4`); the others are indigo (`#5514B4`).

| Division | Initials |
|---|---|
| Horizon Advertising | HA |
| Horizon Development | HD |
| Horizon Media Group | HM |
| Horizon Holding Co | HH |

Each division has:

- `*-roundel` / `*-roundel-white` – the ring and initials only
- `*-logo` / `*-logo-white` – the roundel with the division name beside it
- `*-app-icon` – a white roundel on an indigo square

The SVGs use outlined paths, so they don't depend on installed fonts. To regenerate: `pip install fonttools && python3 brand/tools/generate.py`

## Email signatures

- `email-signature/horizon-advertising.html` – Executive Director, Horizon Advertising Limited (horizonadvertising.co.uk)
- `email-signature/horizon-network.html` – President, Horizon Network Limited (horizon-network.co.uk)
- `email-signature/horizon-network-jack-vinckx.html` – Jack Vinckx, Vice President, Horizon Network Limited
- `email-signature/horizon-network-human.html` – Human, Director of Human Resources, Horizon Network Limited

To install one, open it in a browser, select all, copy, and paste into Gmail or Outlook signature settings.

The logo images load from `website/public/brand/`, served by the website at `http://217.154.34.205/brand/`. Redeploy the website so the images exist. Once the domains run over HTTPS, update each `img src`.
