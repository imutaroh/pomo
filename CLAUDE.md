# Pomo — フローティング・ポモドーロタイマー（macOS native）

要件定義は `REQUIREMENTS.md`（これが地図。変更時は修正履歴に追記）。

## ビルドと起動

```sh
swift build                 # デバッグビルド（コンパイル確認）
./scripts/build.sh          # release ビルド → build/Pomo.app（ad-hoc 署名）
open build/Pomo.app         # 起動（メニューバー 🍅 常駐・Dock 非表示）
pkill -f "build/Pomo.app"   # 停止
```

GUI 挙動（フルスクリーン追従・透明化・ウィンドウのレスポンシブ）は Claude Code から確認できない。変更したら必ずユーザーに手動確認を依頼すること（受け入れ基準は REQUIREMENTS.md §10）。

> ローカル HTTP API（旧 `APIServer.swift` / `scripts/pomo`）は **App Sandbox（Mac App Store 必須）と衝突するため削除済み**（2026-06-13）。Claude Code からのタイマー操作機能は持たない。復活させない。

## アーキテクチャ（Sources/Pomo/）

- `TimerEngine.swift` — 心臓部。Date 差分ベース。フロー（カウントアップ→休憩自動算出）・クラシック（固定カウントダウン）・単純タイマー（任意分数カウントダウン、記録なし）の3モード
- `FloatingPanel.swift` — NSPanel の検証済みレシピ（nonactivating + canJoinAllSpaces + fullScreenAuxiliary）。**このフラグ構成を崩さないこと**
- `PanelView.swift` — パネルの SwiftUI。白基調の Liquid Glass ＋墨色文字＋琥珀。**テキスト入力を置かない**（フォーカス奪取の罠 §8）
- `MainWindow.swift` — 母艦ウィンドウ（通常 NSWindow）。サイドバー＋4ページ。パネルと排他切替（母艦が見える間はパネルをしまう）
- `DashboardPage / SessionsPage / StatsPage / SettingsPage.swift` — 母艦の4ページ。`CardStyle.swift` が共用部品（白カード・週チャート・セッション行）、`SessionStore.swift` が JSONL 読み出しの共有モデル
- `BreakOverlay.swift` — 全画面休憩モード（全ディスプレイ、クリック遮断、キーボードは奪わない）。`MeetingGuard.swift` でマイク使用中は全画面化を見送る
- `MenuBarController.swift` — 常駐メニュー（操作の場）。詳細設定は母艦の設定ページに一本化（モード切替だけ作業フローの一部として例外的にメニューにも残す）
- `SessionLogger.swift` — JSONL 追記（`~/Library/Application Support/Pomo/sessions.jsonl`。Sandbox 下ではコンテナ内へリダイレクト）
- 設計原則: ローカル完結・アカウントなし・テレメトリなし・罪悪感を生む機能（ストリーク等）を入れない
