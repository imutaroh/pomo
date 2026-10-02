#!/bin/zsh
# Quiet を release ビルドして配布用 .dmg を作る（無料・ad-hoc 署名のまま）。
# 注意: 公証(notarize)していないので、受け取った人は初回だけ Gatekeeper を回避する必要がある
#       （右クリック→開く / システム設定→プライバシーとセキュリティ→「このまま開く」）。
#       dmg は「入れ物」であって、警告そのものを消すものではない。
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/build.sh

STAGE=$(mktemp -d)
cp -R build/Quiet.app "$STAGE/Quiet.app"
ln -s /Applications "$STAGE/Applications"

cat > "$STAGE/はじめにお読みください.txt" <<'TXT'
Quiet のインストール方法
─────────────────────────
1. 「Quiet.app」を、右の「Applications」フォルダにドラッグしてコピー
2. 初回だけ: アプリケーションフォルダの Quiet を「右クリック →『開く』→『開く』」
   ※「開発元を確認できないため開けません」と出たら:
     システム設定 → プライバシーとセキュリティ → 下のほうの「このまま開く」
3. 起動すると、メニューバーと Dock にアイコンが出ます

必要環境: macOS 14 (Sonoma) 以降
TXT

rm -f build/Quiet.dmg
hdiutil create -volname "Quiet" -srcfolder "$STAGE" -ov -format UDZO build/Quiet.dmg >/dev/null
rm -rf "$STAGE"
echo "Built: build/Quiet.dmg"
