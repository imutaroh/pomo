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
1. Quiet を、右の「Applications」フォルダへドラッグします。
2. アプリケーションフォルダから Quiet を開きます。初回だけ、開けないという確認が
   出ます。ゴミ箱には入れずに閉じてください（macOS 15 以降は［完了］）。
   Apple の公証を受けていないためです。無料で配るための選択で、ソースはすべて公開しています。
3. macOS 15 以降: システム設定 → プライバシーとセキュリティ → 下のほうの「このまま開く」
   macOS 14: Quiet を右クリック →「開く」→［開く］
次からは普通に開けます。メニューバーと Dock にアイコンが出ます。
新しい版が出ると、アプリがアップデートをお知らせします。

開けないときは、ターミナルで次の1行を実行してください
（アプリケーションフォルダの Quiet を見つけて、その場所で入れ直します）:
  curl -fsSL https://quiet.imutaro.com/install.sh | bash

必要環境: macOS 14 (Sonoma) 以降・Apple Silicon（M1 以降）
詳しくは https://quiet.imutaro.com/
TXT

rm -f build/Quiet.dmg
hdiutil create -volname "Quiet" -srcfolder "$STAGE" -ov -format UDZO build/Quiet.dmg >/dev/null
rm -rf "$STAGE"
echo "Built: build/Quiet.dmg"
