# Pomo — フローティング・ポモドーロタイマー（macOS native）

要件定義は `REQUIREMENTS.md`（これが地図。変更時は修正履歴に追記）。

## ビルドと起動

```sh
swift build                 # デバッグビルド（コンパイル確認）
./scripts/build.sh          # release ビルド → build/Pomo.app（ad-hoc 署名）
open build/Pomo.app         # 起動（メニューバー 🍅 常駐・Dock 非表示）
pkill -f "build/Pomo.app"   # 停止
```

GUI 挙動（フルスクリーン追従・透明化）は Claude Code から確認できない。変更したら必ずユーザーに手動確認を依頼すること（受け入れ基準は REQUIREMENTS.md §10）。

## ローカル API（Claude Code はこれでタイマーを操作する）

Pomo 起動中は `http://127.0.0.1:51766` で HTTP API が立つ。ループバック限定・**トークン認証あり**。
トークンは `~/Library/Application Support/Pomo/token`（初回起動時に自動生成、0600）。
全リクエストに `Authorization: Bearer <token>` を付ける。**`./scripts/pomo` CLI は自動で付けるので、基本は CLI を使うこと。**

| エンドポイント | 説明 |
|---|---|
| `GET /status` | 現在の状態（phase: idle/work/break、seconds、mode、**active_mode**、banked_break_seconds、memo 等）。`mode` はユーザーの現選択値、`active_mode` は実行中セッションのスナップショット |
| `GET /stats` | 今日・今週の完了セッション数と作業秒数 |
| `GET /sessions` | 全セッション履歴（JSONL そのまま） |
| `POST /start` | 作業開始（simple モードの場合は設定分数のカウントダウンを開始） |
| `POST /pause` | 一時停止 ⇄ 再開 |
| `POST /finish` | 作業を終える（フロー: 休憩自動開始、クラシック: 終了、**simple: 音＋idle 復帰・JSONL 記録なし**） |
| `POST /memo` | 進行中の作業にメモを付ける。body: `{"text": "Go の学習"}` |
| `POST /break/skip` | 休憩をスキップ |
| `POST /break/extend` | 休憩を5分延長 |
| `POST /reset` | リセット（idle へ）。simple 実行中は無音・無記録 |

CLI ラッパ: `./scripts/pomo start`, `./scripts/pomo memo "作業内容"`, `./scripts/pomo stats` など。

ユーザーが作業を始めるとき、Claude Code はタスク内容をメモに付けてタイマーを開始できる:

```sh
./scripts/pomo start
./scripts/pomo memo "pomo の API 実装"
# curl 直叩きの場合:
# TOKEN=$(cat ~/Library/Application\ Support/Pomo/token)
# curl -s -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:51766/start
```

## アーキテクチャ（Sources/Pomo/）

- `TimerEngine.swift` — 心臓部。Date 差分ベース。フロー（カウントアップ→休憩自動算出）・クラシック（固定カウントダウン）・単純タイマー（任意分数カウントダウン、記録なし）の3モード
- `FloatingPanel.swift` — NSPanel の検証済みレシピ（nonactivating + canJoinAllSpaces + fullScreenAuxiliary）。**このフラグ構成を崩さないこと**
- `PanelView.swift` — パネルの SwiftUI。暗いガラス＋白文字＋琥珀。**テキスト入力を置かない**（フォーカス奪取の罠 §8）
- `BreakOverlay.swift` — 全画面休憩モード（全ディスプレイ、クリック遮断、キーボードは奪わない）
- `APIServer.swift` — NWListener の素朴な HTTP サーバ
- `MenuBarController.swift` — 常駐メニュー。設定はすべてここのサブメニュー（設定ウィンドウなし）
- `SessionLogger.swift` — JSONL 追記（`~/Library/Application Support/Pomo/sessions.jsonl`）
- 設計原則: ローカル完結・アカウントなし・罪悪感を生む機能（ストリーク等)を入れない
