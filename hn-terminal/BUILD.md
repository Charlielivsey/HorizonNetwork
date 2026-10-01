# HN Secure Enclave — Build Instructions

## Build on the VPS (recommended)

```bash
cd ~/HorizonNetwork
git pull origin claude/vps-welcome-screen-m373a1
sudo bash hn-terminal/build-and-share.sh
```

This builds the Windows installer and copies it to the `HN Secure Enclave` folder on the GATEWAY Samba share.

## Build on Windows (development)

Requires Node.js 18+.

```powershell
cd hn-terminal
npm install
npm start          # run the app
npm run build      # produce dist\HN-Secure-Enclave-Setup-<version>.exe
```

## How it works

1. On launch it makes **one** SSH connection attempt to the server in Settings (default `root@217.154.34.205:22`). It does not retry automatically.
2. Servers that let you in without a password (e.g. Tailscale SSH) log straight in. Keys in `~/.ssh` (`id_ed25519`, `id_ecdsa`, `id_rsa`) are tried next.
3. Otherwise it asks for the password. Passwords are never saved.
4. If the server can't be reached, it shows the reason with **Try again** and **Settings** buttons.
5. **Settings** (top right) changes the IP, username and port. Settings are saved to `%APPDATA%\hn-secure-enclave\config.json`.
6. The server's host key is remembered on first connect. If it changes, the app refuses to connect until you click **Forget** in Settings.
7. Ctrl+C copies when text is selected, Ctrl+V pastes, and right-click copies or pastes, like Windows Terminal.
8. Minimising sends the app to the system tray. Double-click the tray icon to restore it.
