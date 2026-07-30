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

# Sparkle.framework を同梱（SPM の手作りバンドルでは自動で入らない）＋ rpath を通す
mkdir -p "$APP/Contents/Frameworks"
cp -R .build/release/Sparkle.framework "$APP/Contents/Frameworks/Sparkle.framework"
install_name_tool -add_rpath "@loader_path/../Frameworks" "$APP/Contents/MacOS/Pomo" 2>/dev/null || true

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
    <key>CFBundleShortVersionString</key><string>0.9.2</string>
    <key>CFBundleVersion</key><string>5</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>NSHighResolutionCapable</key><true/>
    <!-- Sparkle 自動アップデート（無料構成: EdDSA + GitHub Releases） -->
    <key>SUFeedURL</key><string>https://github.com/imutaroh/pomo/releases/latest/download/appcast.xml</string>
    <key>SUPublicEDKey</key><string>FE6etgDoS8qT6QYeYnbLzSu0EcGcwLrYvzGEULb24OE=</string>
    <key>SUEnableAutomaticChecks</key><true/>
    <!-- メニューバー常駐・Dock 常時表示（コードの setActivationPolicy(.regular) と対応。旧 .accessory から方針転換） -->
    <key>LSUIElement</key><false/>
    <!-- App Store / 配布で要求されるキー（ローカル ad-hoc ビルドでも害はない） -->
    <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
    <key>ITSAppUsesNonExemptEncryption</key><false/>
    <key>NSHumanReadableCopyright</key><string>Copyright © 2026 imutaakihiro. All rights reserved.</string>
</dict>
</plist>
PLIST

# ローカル開発は ad-hoc 署名・非サンドボックス（既存の ~/Library/Application Support/Pomo を読むため）。
# Mac App Store / Developer ID 配布の署名は project.yml（XcodeGen → Xcode）側で行う。
# Sparkle は入れ子バンドル（XPC/Updater.app）を持つので先に deep で署名してから外殻を署名する
codesign --force --deep --sign - "$APP/Contents/Frameworks/Sparkle.framework"
codesign --force --sign - "$APP"
echo "Built: $APP"
