#!/bin/zsh
# Pomo を release ビルドして Pomo.app に束ね、ad-hoc 署名する（REQUIREMENTS.md §9 配布方針）
set -euo pipefail
cd "$(dirname "$0")/.."

swift build -c release

APP=build/Pomo.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp .build/release/Pomo "$APP/Contents/MacOS/Pomo"
[ -f assets/AppIcon.icns ] && cp assets/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key><string>ja</string>
    <key>CFBundleExecutable</key><string>Pomo</string>
    <key>CFBundleIdentifier</key><string>com.imutaakihiro.pomo</string>
    <key>CFBundleName</key><string>Pomo</string>
    <key>CFBundleDisplayName</key><string>Pomo</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.9.0</string>
    <key>CFBundleVersion</key><string>3</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>NSHighResolutionCapable</key><true/>
    <!-- メニューバー常駐・Dock 非表示（コードの setActivationPolicy(.accessory) と二重に効かせる） -->
    <key>LSUIElement</key><true/>
    <!-- App Store / 配布で要求されるキー（ローカル ad-hoc ビルドでも害はない） -->
    <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
    <key>ITSAppUsesNonExemptEncryption</key><false/>
    <key>NSHumanReadableCopyright</key><string>Copyright © 2026 imutaakihiro. All rights reserved.</string>
</dict>
</plist>
PLIST

# ローカル開発は ad-hoc 署名・非サンドボックス（既存の ~/Library/Application Support/Pomo を読むため）。
# Mac App Store / Developer ID 配布の署名は project.yml（XcodeGen → Xcode）側で行う。
codesign --force --sign - "$APP"
echo "Built: $APP"
