# Pomo — フローティング・ポモドーロタイマー（macOS native）

要件定義は `REQUIREMENTS.md`（これが地図。変更時は修正履歴に追記）。

## ビルドと起動

```sh
swift build                 # デバッグビルド（コンパイル確認）
./scripts/build.sh          # release ビルド → build/Pomo.app（ad-hoc 署名）
open build/Pomo.app         # 起動（メニューバーにダイヤルアイコン常駐・Dock 常時表示）
pkill -f "build/Pomo.app"   # 停止
```

GUI 挙動（フルスクリーン追従・透明化・ウィンドウのレスポンシブ）は Claude Code から確認できない。変更したら必ずユーザーに手動確認を依頼すること（受け入れ基準は REQUIREMENTS.md §10）。

> ローカル HTTP API（旧 `APIServer.swift` / `scripts/pomo`）は **App Sandbox（Mac App Store 必須）と衝突するため削除済み**（2026-06-13）。Claude Code からのタイマー操作機能は持たない。復活させない。

## リリースと本番反映の境界

このプロジェクトには独立した「本番」が2つある。混同しないこと。

1. **LP 本番** — `docs/index.html` を main にマージすると GitHub Pages に自動反映される
2. **アプリ本番** — `scripts/release.sh` による GitHub Release + appcast 更新。
   これは **既存ユーザー全員へ Sparkle で自動配信される取り消し不能な操作**

「本番までやって」のような範囲が一意に決まらない指示を受けたときは、
**どちらの本番を指すかを実行前に確認する**。特に 2 は、バージョン採番を含めて
明示的に指示されたときだけ実行し、推測で範囲に足さない。

また `install.sh` でインストールしたビルドは、バージョン採番前だと Info.plist の
表記が旧版のまま残る。動作確認用インストールとリリース用ビルドは別物として報告する。

## アーキテクチャ（Sources/Pomo/）

- `TimerEngine.swift` — 心臓部。Date 差分ベース。フロー（カウントアップ→休憩自動算出）・クラシック（固定カウントダウン）・単純タイマー（任意分数カウントダウン、記録なし）の3モード
- `FloatingPanel.swift` — NSPanel の検証済みレシピ（nonactivating + canJoinAllSpaces + fullScreenAuxiliary）。**このフラグ構成を崩さないこと**
- `PanelView.swift` — パネルの SwiftUI。白基調の Liquid Glass ＋墨色文字＋ティール（フィールドノートトーン。imutaro リポジトリ DESIGN.md 準拠、2026-07-30 に琥珀の和テイストから刷新）。**テキスト入力を置かない**（フォーカス奪取の罠 §8）
- `MainWindow.swift` — 母艦ウィンドウ（通常 NSWindow）。サイドバー＋5ページ。母艦が見える間はパネルをしまう。閉じ方で意図分離: 「パネルに戻る」/フォーカスモード→パネル復帰、赤バツ/⌘W→すべてしまう（復帰は ⌃⌥T・メニューバー・Dock）
- `DashboardPage / SessionsPage / StatsPage / SettingsPage / PhilosophyPage.swift` — 母艦の5ページ。`CardStyle.swift` が共用部品（ヘアラインカード・eyebrow・SelectChip・週チャート・セッション行）、`SessionStore.swift` が JSONL 読み出しの共有モデル
- `BreakOverlay.swift` — 全画面休憩モード（全ディスプレイ、クリック遮断、キーボードは奪わない）。`MeetingGuard.swift` でマイク使用中は全画面化を見送る
- `MenuBarController.swift` — 常駐メニュー（操作の場）。詳細設定は母艦の設定ページに一本化（モード切替だけ作業フローの一部として例外的にメニューにも残す）
- `SessionLogger.swift` — JSONL 追記（`~/Library/Application Support/Pomo/sessions.jsonl`。Sandbox 下ではコンテナ内へリダイレクト）
- 設計原則: ローカル完結・アカウントなし・テレメトリなし・罪悪感を生む機能（ストリーク等）を入れない
