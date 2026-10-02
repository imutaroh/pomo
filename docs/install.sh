#!/bin/bash
# Quiet インストーラ — https://imutaroh.github.io/pomo/
#
#   curl -fsSL https://imutaroh.github.io/pomo/install.sh | bash
#
# 先に中身を読む場合:
#   curl -fsSL https://imutaroh.github.io/pomo/install.sh -o quiet-install.sh
#   less quiet-install.sh
#   bash quiet-install.sh
#
# すること
#   1. GitHub の最新リリースの更新情報（appcast.xml。アプリの自動更新と同じもの）から .dmg を特定
#   2. ダウンロードし、サイズと SHA-256 を照合（破損・途中切れの検出。配布元の真正性までは保証しない）
#   3. 中のアプリの識別子・対応 CPU・対応 OS・コード署名を確認
#   4. /Applications に置いて起動（すでに入っていれば、その場所で更新。2つにはしない）
# しないこと
#   sudo / Gatekeeper の設定変更 / quarantine 属性の操作 / 利用データの送信 / 途中での質問
# 知っておいてほしいこと
#   curl で取得したファイルには macOS の quarantine 属性が付かないため、この経路では
#   Gatekeeper の「開けません」の確認が出ません。だからこそ、このスクリプトを公開しています。
# 環境変数
#   QUIET_DRY_RUN=1  何を入れるかを表示するだけで、アプリには何も書き込まない
#   QUIET_FORCE=1    同じ版でも入れ直す
#   QUIET_NO_OPEN=1  入れたあと起動しない
#
# 途中までしか届かなかった場合に何も実行しないよう、処理はすべて関数の中にあり、
# 最終行の main で初めて動きます。

if [ -z "${BASH_VERSION:-}" ]; then
  echo "bash で実行してください: curl -fsSL https://imutaroh.github.io/pomo/install.sh | bash" >&2
  exit 1
fi
set -euo pipefail

REPO="imutaroh/pomo"
BUNDLE_ID="com.imutaakihiro.pomo"
APPCAST_URL="https://github.com/${REPO}/releases/latest/download/appcast.xml"
DL_PREFIX="https://github.com/${REPO}/releases/download/"
API_TAGS="https://api.github.com/repos/${REPO}/releases/tags"
MANUAL_URL="https://imutaroh.github.io/pomo/#install"
PROTO="=https"
APPS_DIRS=("/Applications" "$HOME/Applications")

TMP="" MNT="" STAGE="" BACKUP="" DEST="" EXISTING="" SRC_APP=""
OS_VER="" HOST_ARCH=""
DMG_URL="" DMG_LEN="" DMG_NAME="" DMG="" TAG="" NEW_VER="" NEW_BUILD="" EXPECTED_SHA=""

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
warn() { printf '注意: %s\n' "$*" >&2; }
die()  { printf '\nエラー: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "必要なコマンドが見つかりません: $1"; }
fetch() { curl -fsSL --proto "$PROTO" --proto-redir "$PROTO" --tlsv1.2 --retry 3 --connect-timeout 15 "$@"; }
plist_get() { local v; if v=$(/usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null); then printf '%s' "$v"; fi; }
bundle_id_of() { plist_get "$1/Contents/Info.plist" CFBundleIdentifier; }
xml_get() { xmllint --xpath "string($2)" "$1" 2>/dev/null || true; }
is_quarantined() { xattr -p com.apple.quarantine "$1" >/dev/null 2>&1; }

# "14.4" のような版を、メジャーとマイナーの2段で比べる。$1 が $2 より古ければ真
version_lt() {
  local a=$1 b=$2 a1 a2 b1 b2
  a1=${a%%.*}; a2=0; if [ "$a" != "$a1" ]; then a2=${a#*.}; a2=${a2%%.*}; fi
  b1=${b%%.*}; b2=0; if [ "$b" != "$b1" ]; then b2=${b#*.}; b2=${b2%%.*}; fi
  if [ "$a1" -ne "$b1" ]; then [ "$a1" -lt "$b1" ]; return; fi
  [ "$a2" -lt "$b2" ]
}

cleanup() {
  # 後始末は途中で失敗しても最後まで進める。旧版を戻す処理を最優先にする
  set +e
  if [ -n "$BACKUP" ] && [ -d "$BACKUP" ]; then
    if [ ! -e "$DEST" ]; then
      mv "$BACKUP" "$DEST" && warn "失敗したため、元のアプリに戻しました: $DEST"
    else
      rm -rf "$BACKUP"
    fi
  fi
  if [ -n "$STAGE" ] && [ -d "$STAGE" ]; then rm -rf "$STAGE"; fi
  if [ -n "$MNT" ]; then
    if ! hdiutil detach "$MNT" -quiet 2>/dev/null && ! hdiutil detach "$MNT" -force -quiet 2>/dev/null; then
      TMP=""   # マウントが残っている間は一時ディレクトリを消さない
    fi
  fi
  if [ -n "$TMP" ]; then rm -rf "$TMP"; fi
}

check_env() {
  [ "$(uname -s)" = "Darwin" ] || die "Quiet は macOS 専用です。"
  [ "$(id -u)" -ne 0 ] || die "sudo を付けずに実行してください（管理者権限は使いません）。"
  OS_VER=$(sw_vers -productVersion)
  if version_lt "$OS_VER" 14.0; then die "macOS 14 (Sonoma) 以降が必要です（この Mac: macOS ${OS_VER}）。"; fi
  [ -x /usr/libexec/PlistBuddy ] || die "必要なコマンドが見つかりません: PlistBuddy"
  local c
  # lipo は Command Line Tools のシムなので使わない。CPU は OS 標準の file で見る
  for c in curl xmllint plutil shasum hdiutil ditto codesign file xattr pgrep ps stat open; do need "$c"; done
  # Rosetta 経由のシェルでも、本体の CPU を見る
  if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then HOST_ARCH=arm64; else HOST_ARCH=x86_64; fi
}

apply_test_overrides() {
  # 開発用。実機の /Applications に触れずに試すための差し替え口（利用者向けには案内しない）
  if [ "${QUIET_TEST:-0}" != "1" ]; then return 0; fi
  [ -n "${QUIET_APPS_DIR:-}" ] || die "QUIET_TEST=1 では QUIET_APPS_DIR が必須です。"
  APPS_DIRS=("$QUIET_APPS_DIR")
  APPCAST_URL="${QUIET_APPCAST_URL:-$APPCAST_URL}"
  PROTO="=https,file"
  warn "テストモード: 配置先 $QUIET_APPS_DIR / 更新情報 $APPCAST_URL"
}

resolve_release() {
  step "最新版を確認しています"
  local xml="$TMP/appcast.xml" item='//*[local-name()="item"][1]'
  fetch -o "$xml" "$APPCAST_URL" || die "更新情報を取得できませんでした。ネットワークを確認してください。"
  DMG_URL=$(xml_get "$xml" "$item/*[local-name()=\"enclosure\"]/@url")
  DMG_LEN=$(xml_get "$xml" "$item/*[local-name()=\"enclosure\"]/@length")
  NEW_VER=$(xml_get "$xml" "$item/*[local-name()=\"shortVersionString\"]")
  NEW_BUILD=$(xml_get "$xml" "$item/*[local-name()=\"version\"]")
  case "$DMG_URL" in
    "$DL_PREFIX"*/*.dmg) TAG=${DMG_URL#"$DL_PREFIX"}; TAG=${TAG%%/*} ;;
    file://*.dmg) [ "${QUIET_TEST:-0}" = "1" ] || die "想定外のダウンロード先です: $DMG_URL"; TAG="" ;;
    *) die "想定外のダウンロード先です: ${DMG_URL:-（空）}" ;;
  esac
  DMG_NAME=${DMG_URL##*/}
  case "$DMG_NAME$TAG" in *[!A-Za-z0-9._-]*) die "想定外のファイル名です: $DMG_NAME" ;; esac
  case "$NEW_BUILD" in ''|*[!0-9]*) die "更新情報の版番号を読めませんでした。" ;; esac
  case "$DMG_LEN" in *[!0-9]*) DMG_LEN="" ;; esac
  say "最新版: v${NEW_VER:-?}"
}

find_existing() {
  local d p others=""
  for d in "${APPS_DIRS[@]}"; do
    if [ ! -d "$d" ]; then continue; fi
    for p in "$d"/*.app; do
      if [ ! -d "$p" ]; then continue; fi
      if [ "$(bundle_id_of "$p")" != "$BUNDLE_ID" ]; then continue; fi
      if [ -z "$EXISTING" ]; then EXISTING="$p"; else others="${others}  ${p}"$'\n'; fi
    done
  done
  if [ -n "$others" ]; then
    warn "同じアプリが複数あります。$EXISTING を更新します。次のものは不要ならゴミ箱へ移してください:"
    printf '%s' "$others" >&2
  fi
}

already_latest() {
  if [ -z "$EXISTING" ] || [ "${QUIET_FORCE:-0}" = "1" ]; then return 1; fi
  if is_quarantined "$EXISTING"; then
    say "入っているアプリに macOS の「ダウンロードした印」が付いているため、入れ直します。"
    return 1
  fi
  local cur; cur=$(plist_get "$EXISTING/Contents/Info.plist" CFBundleVersion)
  case "$cur" in ''|*[!0-9]*) return 1 ;; esac
  [ "$cur" -ge "$NEW_BUILD" ]
}

resolve_digest() {
  EXPECTED_SHA=""
  if [ -z "$TAG" ]; then warn "SHA-256 の照合を省略します（テストモード）。"; return 0; fi
  local json="$TMP/release.json" i=0 name
  if fetch -H 'Accept: application/vnd.github+json' -o "$json" "$API_TAGS/$TAG" 2>/dev/null; then
    while name=$(plutil -extract "assets.$i.name" raw -o - "$json" 2>/dev/null); do
      if [ "$name" = "$DMG_NAME" ]; then
        EXPECTED_SHA=$(plutil -extract "assets.$i.digest" raw -o - "$json" 2>/dev/null || true)
        EXPECTED_SHA=${EXPECTED_SHA#sha256:}
        break
      fi
      i=$((i + 1))
    done
  fi
  case "$EXPECTED_SHA" in ''|*[!0-9a-f]*) EXPECTED_SHA="" ;; esac
  if [ ${#EXPECTED_SHA} -ne 64 ]; then
    EXPECTED_SHA=""
    warn "GitHub から SHA-256 を取得できませんでした（回数制限など）。サイズの照合だけで続けます。"
  fi
}

download_and_verify() {
  step "ダウンロードしています"
  DMG="$TMP/$DMG_NAME"
  fetch -o "$DMG" "$DMG_URL" || die "ダウンロードに失敗しました: $DMG_URL"
  local size; size=$(stat -f %z "$DMG")
  if [ -n "$DMG_LEN" ] && [ "$size" != "$DMG_LEN" ]; then
    die "ファイルサイズが一致しません（期待 $DMG_LEN / 実際 ${size}）。もう一度お試しください。"
  fi
  if [ -n "$EXPECTED_SHA" ]; then
    local got; got=$(shasum -a 256 "$DMG" | awk '{print $1}')
    [ "$got" = "$EXPECTED_SHA" ] || die "SHA-256 が一致しません。ダウンロードが壊れている可能性があります。"
    say "整合性を確認しました（サイズ・SHA-256）"
  else
    say "整合性を確認しました（サイズのみ）"
  fi
}

mount_and_inspect() {
  step "中身を確認しています"
  MNT="$TMP/mnt"; mkdir -p "$MNT"
  if ! hdiutil attach "$DMG" -nobrowse -readonly -noautoopen -mountpoint "$MNT" -quiet; then
    MNT=""; die "ディスクイメージを開けませんでした。"
  fi
  local p n=0
  for p in "$MNT"/*.app; do
    if [ -d "$p" ]; then SRC_APP="$p"; n=$((n + 1)); fi
  done
  [ "$n" -eq 1 ] || die "ディスクイメージ内のアプリが想定と違います（$n 個）。"
  local plist="$SRC_APP/Contents/Info.plist" exe kind minos
  [ "$(bundle_id_of "$SRC_APP")" = "$BUNDLE_ID" ] || die "アプリの識別子が一致しません。"
  exe=$(plist_get "$plist" CFBundleExecutable)
  kind=$(file -b "$SRC_APP/Contents/MacOS/$exe" 2>/dev/null || true)
  case "$kind" in
    *"$HOST_ARCH"*) ;;
    *)
      if [ "$HOST_ARCH" = "x86_64" ]; then die "この Mac（Intel）では動きません。Quiet は Apple Silicon（M1 以降）専用です。"; fi
      die "この Mac（${HOST_ARCH}）に対応した版ではありません（${kind:-種類を判別できません}）。" ;;
  esac
  minos=$(plist_get "$plist" LSMinimumSystemVersion)
  if [ -n "$minos" ] && version_lt "$OS_VER" "$minos"; then
    die "macOS $minos 以降が必要です（この Mac: ${OS_VER}）。"
  fi
  codesign --verify --deep --strict "$SRC_APP" 2>/dev/null || die "アプリのコード署名を検証できませんでした。"
}

choose_dest() {
  if [ -n "$EXISTING" ]; then DEST="$EXISTING"; return 0; fi   # Sparkle と同じく既存パスのまま更新
  local d
  for d in "${APPS_DIRS[@]}"; do
    if mkdir -p "$d" 2>/dev/null && [ -w "$d" ]; then
      DEST="$d/$(basename "$SRC_APP")"
      # 同じ名前の別アプリ（識別子が違う）は上書きしない
      if [ -e "$DEST" ] && [ "$(bundle_id_of "$DEST")" != "$BUNDLE_ID" ]; then
        die "同じ名前の別のアプリがあります: $DEST
移動するか名前を変えてから、もう一度実行してください。"
      fi
      if [ "$d" != "${APPS_DIRS[0]}" ]; then warn "${APPS_DIRS[0]} に書き込めないため $d に入れます。"; fi
      return 0
    fi
  done
  die "アプリを置けるフォルダがありません（sudo は使いません）。手動の手順: $MANUAL_URL"
}

# 自分のユーザーで動いている、このアプリのプロセス ID を列挙する。
# パスではなく実行ファイル名で探し、親バンドルの識別子で絞る（App Translocation 中の版も拾う）
running_pids() {
  local name pid path app
  for name in "$@"; do
    if [ -z "$name" ]; then continue; fi
    for pid in $(pgrep -U "$(id -u)" -x "$name" 2>/dev/null || true); do
      path=$(ps -o comm= -p "$pid" 2>/dev/null || true)
      app=${path%/Contents/MacOS/*}
      if [ "$app" = "$path" ]; then continue; fi
      # テストモードでは、実機で動いている本物のアプリに触れない
      if [ "${QUIET_TEST:-0}" = "1" ] && [ "${app#"$QUIET_APPS_DIR"/}" = "$app" ]; then continue; fi
      if [ "$(bundle_id_of "$app")" = "$BUNDLE_ID" ]; then
        printf '%s\n' "$pid"
      fi
    done
  done | sort -u
}

quit_running() {
  local old_exe="" new_exe pids n=0
  if [ -n "$EXISTING" ]; then old_exe=$(plist_get "$EXISTING/Contents/Info.plist" CFBundleExecutable); fi
  new_exe=$(plist_get "$SRC_APP/Contents/Info.plist" CFBundleExecutable)
  pids=$(running_pids "$old_exe" "$new_exe")
  if [ -z "$pids" ]; then return 0; fi
  say "起動中のアプリを終了します（計測中の時間はリセットされます。設定は残ります）"
  # shellcheck disable=SC2086 # pids は数字の並び
  kill -TERM $pids 2>/dev/null || true
  while [ -n "$(running_pids "$old_exe" "$new_exe")" ]; do
    n=$((n + 1))
    if [ "$n" -ge 20 ]; then
      # shellcheck disable=SC2086
      kill -KILL $pids 2>/dev/null || true
      break
    fi
    sleep 0.5
  done
}

install_app() {
  local dir; dir=$(dirname "$DEST")
  step "インストールしています → $DEST"
  if [ ! -w "$dir" ] || { [ -e "$DEST" ] && [ ! -w "$DEST" ]; }; then
    die "$dir に書き込む権限がありません（管理者が入れた場合など。sudo は使いません）。
手動の手順: $MANUAL_URL"
  fi
  STAGE="$dir/.quiet-install-$$.app"
  ditto "$SRC_APP" "$STAGE"
  codesign --verify --deep --strict "$STAGE" 2>/dev/null || die "コピー後の署名検証に失敗しました。"
  quit_running
  if [ -e "$DEST" ]; then BACKUP="$dir/.quiet-old-$$.app"; mv "$DEST" "$BACKUP"; fi
  mv "$STAGE" "$DEST"; STAGE=""
  if [ -n "$BACKUP" ]; then rm -rf "$BACKUP"; BACKUP=""; fi
}

finish() {
  local name ver base
  name=$(plist_get "$DEST/Contents/Info.plist" CFBundleName)
  ver=$(plist_get "$DEST/Contents/Info.plist" CFBundleShortVersionString)
  base=$(basename "$DEST" .app)
  if is_quarantined "$DEST"; then
    warn "想定外: quarantine 属性が付いています。初回は macOS の確認が出る場合があります（手順: ${MANUAL_URL}）"
  fi
  if [ "${QUIET_NO_OPEN:-0}" != "1" ]; then open "$DEST"; fi
  say ""
  say "${name:-Quiet} v${ver:-?} を入れました: $DEST"
  if [ -n "$name" ] && [ "$base" != "$name" ]; then
    say "Finder 上の名前は ${base}.app のままですが、中身は ${name} です（自動更新と同じ扱いです）。"
  fi
  if [ -n "$name" ] && [ "$name" != "Quiet" ]; then
    say "この版はまだ旧名の ${name} で配布されています。新しい版が出ると、アプリの自動更新で Quiet に切り替わります。"
  fi
  say "メニューバーと Dock にアイコンが出ます。今後の更新はアプリが自動で行います。"
  say ""
  say "アンインストール: アプリを終了し、$DEST をゴミ箱へ。設定も消す場合は"
  say "  defaults delete $BUNDLE_ID"
  say "  rm -f ~/Library/LaunchAgents/$BUNDLE_ID.plist   # ログイン時に起動をオンにしていた場合"
}

main() {
  trap cleanup EXIT
  trap 'exit 130' INT TERM
  check_env
  apply_test_overrides
  say "Quiet をインストールします（sudo は使いません。中身: https://github.com/${REPO}/blob/main/docs/install.sh）"
  TMP=$(mktemp -d "${TMPDIR:-/tmp}/quiet-install.XXXXXX")
  resolve_release
  find_existing
  if already_latest; then
    say "すでに最新版です（v${NEW_VER}）: $EXISTING"
    say "入れ直す場合は QUIET_FORCE=1 を付けて実行してください。"
    return 0
  fi
  if [ "${QUIET_DRY_RUN:-0}" = "1" ]; then
    if [ -n "$EXISTING" ]; then
      say "（確認のみ）v$NEW_VER で $EXISTING を更新します。アプリには何も書き込まずに終了します。"
    else
      say "（確認のみ）v$NEW_VER を ${APPS_DIRS[0]} に新しく入れます。アプリには何も書き込まずに終了します。"
    fi
    return 0
  fi
  resolve_digest
  download_and_verify
  mount_and_inspect
  choose_dest
  install_app
  finish
}

main "$@"
