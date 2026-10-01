# HN Terminal — Build Instructions

## Prerequisites

- [Node.js](https://nodejs.org/) v18+ installed
- Windows 10/11
- Git

## Quick Start (Development)

```powershell
cd hn-terminal
npm install
npm run rebuild
npm start
```

## Build Installer (.exe)

```powershell
npm run build
```

The installer will be in `dist/HN Terminal Setup.exe`.

## Icon

To generate an `.ico` file from the SVG, use any SVG-to-ICO converter or:

```powershell
# Install a converter
npm install -g svg2ico

# Convert (or use an online tool like https://convertio.co)
```

Place the `.ico` file at `assets/icon.ico` before building.

## How It Works

1. On launch, the app pings the Tailscale IP (100.95.232.62)
2. If reachable, it opens an SSH session automatically — no password needed (Tailscale SSH handles auth)
3. If not reachable, it shows a waiting screen and checks every 3 seconds
4. When the VPN connects, it automatically starts the SSH session
5. If the connection drops, a reconnect bar appears
