# HN Account — accounts.hngroup.org.uk

The public face of the staff account service. PM2 `hn-account-web`, loopback port 5300, no data of its own (sign-ins are held in memory for 12 hours; a restart just asks people to sign in again).

`hn-accounts` (port 3250) is the private staff-account backend that every HN Group sign-in relies on. It is **never** put on the internet; this site talks to it over loopback and only passes on a fixed list of account requests.

## What staff can do

- **Overview**: account health (password, PIN, photo), roles and permissions.
- **Profile**: photo (resized to 600px in the browser), display name, phone, location, time zone, skills, languages and About me, the same fields staff can edit in the staff portal.
- **Password & PIN**: change the password (needs the current one) and the six-digit sign-in PIN.
- **Devices**: every signed-in session, with sign out of one or all others.
- **Websites**: every HN Group website that uses staff accounts and whether this account can use it.
- **Sign-in accounts** (people who can manage staff; the user's request, 28 October 2026): sign-in accounts are separate from staff records and are **only created here**. Each account has its own username (any email address or a plain username), password, PIN, Google sign-in and **permissions** (roles; giving or removing roles needs "Manage roles", and roles with guarded permissions can only be given by people who have them). An account can use **any number of profiles** (each company on a staff record is its own profile) with one **default**, several accounts can share a profile, and an account can have **no profile** at all (it works on the HN Group websites but not the staff portal). HN Group Auth asks which profile to use at every sign-in, with the default first. Reset password/PIN, disable/enable and delete (someone's own account can only be disabled) are under More.
- **Staff records** (same people): every staff record with its own sign-in account: create one, reset its password or PIN, disable or enable it. Adding staff and editing records stay in the staff portal.

## How sign-in works

1. `/auth/login` sends people to HN Group Auth as the registered `accounts` application (PIN, account setup and permissions are Auth's).
2. `/auth/callback` swaps Auth's one-time code at `/api/sso/exchange`. Like the staff portal, Auth hands over its staff session instead of keeping it.
3. The site swaps that session at the backend's `/api/auth/accounts-session` (service secret `/var/lib/hn-status-sso/secret`) for its own staff session, recorded as "HN Account" in Devices and the sign-in log.
4. The browser only gets an `__Host-hn_account` cookie. The staff session token stays on the server.

## Protections

- `/api/*` is an allowlist (`ROUTES` in `server.js`); everything else is 404. The backend still applies its own permission checks.
- Every POST needs the same Origin and the page's `X-CSRF-Token`.
- Staff admin routes also need `ownerAccess` or Super Admin membership (`statusAdminAllowed`).
- If the backend says the session has ended (signed out elsewhere, disabled, password reset), the local sign-in ends too.
- Strict CSP: no inline scripts or styles.

## Install / update

`cd /root/HorizonNetwork && git pull && sudo bash install.sh` (runs `accounts-site/install.sh` when this folder changes; Auth's and the staff portal's installers bring the `accounts` application and the session swap). The backend is 3250 when central control's `/var/lib/hn-control/accounts-enabled` or `accounts-independent` exists, otherwise 3200. DNS: `accounts` A record to 217.154.34.205 (DNS only).

## Tests

`node --test accounts-site/test.cjs` runs the real staff account service and the real HN Group Auth with temporary data. It covers the sign-in flow, profile, devices, CSRF/origin/allowlist checks, admin-only access, password change, disabling (which signs the person out), password reset and sign-out. `node --test accounts-site/sign-in-accounts.test.cjs` covers sign-in accounts: converted logins, the staff portal refusing to create accounts, creating accounts with several profiles, a default and their own permissions, the profile choice at Auth and what applications receive, profile-id account checks, disabling, accounts with no profile, and deletion.
