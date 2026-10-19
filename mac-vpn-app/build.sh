#!/bin/bash
# Builds "HN Secure Network.app" (Apple Silicon and Intel) and HN-Secure-Network-macOS.zip.
# Needs a Mac with Xcode or the Command Line Tools (xcode-select --install). Run: bash mac-vpn-app/build.sh
set -euo pipefail
cd "$(dirname "$0")"
OUT=build
APP="$OUT/HN Secure Network.app"
rm -rf "$OUT"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$OUT/obj"
for arch in arm64 x86_64; do
  swiftc -O -parse-as-library -swift-version 5 -target "$arch-apple-macos13.0" \
    -framework SwiftUI -framework AppKit -framework Security -framework CryptoKit -framework ServiceManagement \
    Sources/*.swift -o "$OUT/obj/HNGroupVPN-$arch"
done
lipo -create "$OUT/obj/HNGroupVPN-arm64" "$OUT/obj/HNGroupVPN-x86_64" -output "$APP/Contents/MacOS/HN Secure Network"
cp Info.plist "$APP/Contents/Info.plist"
# Version numbers: the version comes from VERSION; the build number goes up with every build
# (the GitHub Actions run number), which is how the app knows an update is newer.
VERSION=$(tr -d '[:space:]' < VERSION)
BUILD=${BUILD_NUMBER:-${GITHUB_RUN_NUMBER:-$(git rev-list --count HEAD 2>/dev/null || echo 1)}}
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" -c "Set :CFBundleVersion $BUILD" "$APP/Contents/Info.plist"
echo "Version $VERSION (build $BUILD)"
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
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT/HN-Secure-Network-macOS.zip"
echo "Built: mac-vpn-app/$OUT/HN Secure Network.app and mac-vpn-app/$OUT/HN-Secure-Network-macOS.zip"
