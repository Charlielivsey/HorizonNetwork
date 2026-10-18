#!/bin/bash
# Builds "HN Group VPN.app" (Apple Silicon and Intel) and HN-Group-VPN-macOS.zip.
# Needs a Mac with Xcode or the Command Line Tools (xcode-select --install). Run: bash mac-vpn-app/build.sh
set -euo pipefail
cd "$(dirname "$0")"
OUT=build
APP="$OUT/HN Group VPN.app"
rm -rf "$OUT"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$OUT/obj"
for arch in arm64 x86_64; do
  swiftc -O -parse-as-library -swift-version 5 -target "$arch-apple-macos13.0" \
    -framework SwiftUI -framework AppKit -framework Security -framework CryptoKit -framework ServiceManagement \
    Sources/*.swift -o "$OUT/obj/HNGroupVPN-$arch"
done
lipo -create "$OUT/obj/HNGroupVPN-arm64" "$OUT/obj/HNGroupVPN-x86_64" -output "$APP/Contents/MacOS/HNGroupVPN"
cp Info.plist "$APP/Contents/Info.plist"
cp Resources/wordmark.png Resources/wordmark-white.png Resources/PlusJakartaSans.ttf "$APP/Contents/Resources/"
install -m 755 Resources/hn-vpn-ctl "$APP/Contents/Resources/hn-vpn-ctl"
# App icon from the 1024px artwork.
ICONSET="$OUT/AppIcon.iconset"; mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size Resources/AppIcon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) Resources/AppIcon.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
# Ad-hoc signature: enough to run on Macs that open it with right-click > Open the first time.
codesign --force --deep --sign - "$APP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT/HN-Group-VPN-macOS.zip"
echo "Built: mac-vpn-app/$OUT/HN Group VPN.app and mac-vpn-app/$OUT/HN-Group-VPN-macOS.zip"
