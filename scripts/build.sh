#!/bin/zsh
# Pomo を release ビルドして Pomo.app に束ね、ad-hoc 署名する（REQUIREMENTS.md §9 配布方針）
set -euo pipefail
cd "$(dirname "$0")/.."

swift build -c release

APP=build/Pomo.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp .build/release/Pomo "$APP/Contents/MacOS/Pomo"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>Pomo</string>
    <key>CFBundleIdentifier</key><string>com.imutaakihiro.pomo</string>
    <key>CFBundleName</key><string>Pomo</string>
    <key>CFBundleDisplayName</key><string>Pomo</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>LSUIElement</key><true/>
    <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

codesign --force --sign - "$APP"
echo "Built: $APP"
