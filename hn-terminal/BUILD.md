# HN Terminal — Build Instructions

## Prerequisites

- [Node.js](https://nodejs.org/) v18+ (LTS recommended)
- Windows 10/11 (x64)
- Git

## Quick Start (Development)

```powershell
cd hn-terminal
npm install
npm run rebuild
npm start
```

## Build Installer

```powershell
npm run build
```

This produces `dist/HN-Terminal-Setup-1.0.0.exe` — a full Windows installer with:

- Custom branded sidebar and header graphics
- EULA / licence agreement screen
- Install directory selection
- Desktop shortcut creation
- Start menu shortcut under "Horizon Network"
- Clean uninstaller via Add/Remove Programs

## What the App Does

1. Shows a branded splash screen on launch
2. Checks Tailscale VPN connectivity by pinging 100.95.232.62
3. **VPN connected** → opens SSH session automatically (Tailscale SSH handles auth)
4. **VPN not connected** → shows a waiting screen, checks every 3 seconds, auto-connects when VPN comes online
5. **Connection lost** → reconnect bar appears; also available via system tray
6. Minimise to system tray — double-click tray icon to restore
7. Right-click tray for reconnect and quit options

## Updating the Version

Change `version` in `package.json` — the installer filename and splash screen update automatically.
