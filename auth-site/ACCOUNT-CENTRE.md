# Account centre and Secure Access Terminal

Direct Auth visits open `/account/`. The original Auth authorize and native APIs stay at their existing paths. `AUTH_ACCOUNT_CENTRE=1` enables the proxy to the existing account service; that service uses `ACCOUNTS_ORIGIN=https://auth.hngroup.org.uk` and `ACCOUNTS_BASE_PATH=/account`. The registered accounts callback is `/account/auth/callback`. Keep the account nginx upload allowance at 3m without widening other Auth routes.

`AUTH_SAT_SITE=1` selects `https://sat.hngroup.org.uk/auth/callback` for the existing vpn client. VPN_ORIGIN is SAT; VPN_ENDPOINT remains vpn.hngroup.org.uk:51820 for existing clients. Preserve legacy VPN /api routes when redirecting web pages. Include SAT in the central control allowlist.

Downloads uses HN_BROWSER_DISCONTINUED=1 to retain the saved Browser release without polling upstream. Archive installers remain downloadable; automatic Browser workflow publication is removed, while manual archive builds remain available.
