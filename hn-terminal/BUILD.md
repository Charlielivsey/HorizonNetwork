# HN Secure Enclave — Build Instructions

## Build on the VPS (recommended)

```bash
cd ~/HorizonNetwork
sudo bash hn-terminal/build-and-share.sh
```

This builds the Windows installer and copies it to `\\GATEWAY\HN Secure Enclave\`.
Open File Explorer on Windows, navigate to the share, and run the installer.

## Build on Windows (development)

### Prerequisites
- Node.js v18+ (LTS)
- Windows 10/11 (x64)

```powershell
cd hn-terminal
npm install
npm start
```

To build the installer:
```powershell
npm run build
```

Produces `dist\HN-Secure-Enclave-Setup-1.0.0.exe`.

## How It Works

1. Branded splash screen on launch
2. Pings Tailscale IP (100.95.232.62) to check VPN status
3. VPN connected → SSH session opens automatically using your SSH key
4. VPN not connected → waiting screen, checks every 3 seconds, auto-connects
5. Connection lost → reconnect bar and tray menu option
6. Minimise to system tray, double-click to restore
