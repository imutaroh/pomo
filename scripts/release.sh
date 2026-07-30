#!/bin/zsh
# リリース自動化（Issue #48・無料構成）:
#   dmg 生成 → Sparkle EdDSA 署名 → appcast.xml 生成 → GitHub Release 公開
# 使い方: ./scripts/release.sh "リリースノート（省略可）"
# 前提: バージョンは Pomo-Info.plist / project.yml / scripts/build.sh の3箇所を上げてから実行。
#       EdDSA 秘密鍵は Keychain（generate_keys で生成済み）。gh CLI ログイン済み。
# appcast は各リリースに添付し、SUFeedURL は releases/latest/download/appcast.xml の
# 安定URLを指す（= 最新リリースの appcast が常に配信される）。
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" Pomo-Info.plist)
BUILDNUM=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" Pomo-Info.plist)
NOTES="${1:-Pomo v$VERSION}"
SIGN_UPDATE=".build/artifacts/sparkle/Sparkle/bin/sign_update"
[ -x "$SIGN_UPDATE" ] || { echo "sign_update が見つからない（swift build を先に）"; exit 1; }

# 同一タグの二重公開を防ぐ
if gh release view "v$VERSION" >/dev/null 2>&1; then
  echo "v$VERSION は既に公開済み。バージョンを上げてから実行してください"; exit 1
fi

./scripts/dmg.sh

# EdDSA 署名（出力例: sparkle:edSignature="..." length="..."）
SIGNATURE=$("$SIGN_UPDATE" build/Pomo.dmg)
echo "signature: $SIGNATURE"

DMG_URL="https://github.com/imutaroh/pomo/releases/download/v$VERSION/Pomo.dmg"
PUBDATE=$(LC_ALL=en_US.UTF-8 date -u "+%a, %d %b %Y %H:%M:%S +0000")

cat > build/appcast.xml <<XML
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Pomo</title>
    <item>
      <title>Pomo v$VERSION</title>
      <pubDate>$PUBDATE</pubDate>
      <sparkle:version>$BUILDNUM</sparkle:version>
      <sparkle:shortVersionString>$VERSION</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
      <enclosure url="$DMG_URL" $SIGNATURE type="application/octet-stream"/>
    </item>
  </channel>
</rss>
XML

gh release create "v$VERSION" build/Pomo.dmg build/appcast.xml \
  --title "Pomo v$VERSION" --notes "$NOTES"
echo "公開完了: https://github.com/imutaroh/pomo/releases/tag/v$VERSION"
echo "appcast: https://github.com/imutaroh/pomo/releases/latest/download/appcast.xml"
