#!/bin/zsh
# Pomo をビルドして /Applications にインストールし、起動し直す
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/build.sh
pkill -x Pomo 2>/dev/null || true
sleep 1
rm -rf /Applications/Pomo.app
cp -R build/Pomo.app /Applications/Pomo.app
open /Applications/Pomo.app
echo "インストール完了: /Applications/Pomo.app（Spotlight で「Pomo」と打てば起動できます）"
