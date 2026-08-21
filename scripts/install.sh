#!/bin/zsh
# Fika をビルドして /Applications にインストールし、起動し直す
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/build.sh
pkill -x Fika 2>/dev/null || true
pkill -x Pomo 2>/dev/null || true  # 旧名の実行ファイルが動いていた場合の移行措置
sleep 1
rm -rf /Applications/Fika.app
cp -R build/Fika.app /Applications/Fika.app
open /Applications/Fika.app
echo "インストール完了: /Applications/Fika.app（Spotlight で「Fika」と打てば起動できます）"

# 旧名のバンドルが残っていると、同じ bundle id の .app が2つ並び LaunchServices が
# どちらを起動するか不定になる。消すかどうかは人が決めることなので、知らせるだけにする。
if [ -d /Applications/Pomo.app ]; then
  echo ""
  echo "⚠️  旧バージョンの /Applications/Pomo.app が残っています。"
  echo "   bundle id が Fika.app と同一（com.imutaakihiro.pomo）なので、両方あると"
  echo "   どちらが起動するか不定になります。不要なら削除してください:"
  echo "     rm -rf /Applications/Pomo.app"
fi
