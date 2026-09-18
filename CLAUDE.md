# Fika — フローティング・フロータイマー（macOS native）

**表示名も成果物名も Fika、bundle id とリポジトリは pomo のまま**（2026-08-21 に改名、成果物名は #59）。
UI 文言・`CFBundleName` / `CFBundleDisplayName`・`PRODUCT_NAME`・成果物（`build/Fika.app` /
`Fika.dmg`）・実行ファイル名が Fika。一方 **bundle identifier（`com.imutaakihiro.pomo`）・
`SUFeedURL`・リポジトリ名・Swift ターゲット名（`Sources/Pomo`）は Pomo のまま変えない**。

成果物名を変えても Sparkle の自動アップデートが壊れないのは、Sparkle が更新アーカイブ内の
アプリを **①旧バンドルのファイル名 → ②`CFBundleName`.app → ③bundle identifier 一致** の順で
探すため（`SUInstaller.m`）。①②が外れても③の `com.imutaakihiro.pomo` で必ず見つかる。
ただし**インストール先は既存パスのまま**（`SPARKLE_NORMALIZE_INSTALLED_APPLICATION_NAME = 0`
なので `installationPath = host.bundlePath`）。つまり **v0.9.3 以前からの既存ユーザーは
`/Applications/Pomo.app` のまま中身だけ Fika になる**。Finder は Pomo.app、Dock とメニューバーは
Fika という混在は仕様。新規インストールだけが `Fika.app` になる。名前またぎ更新は挙動ムラの
報告があるため、次のリリースでは **v0.9.3 からの実機アップデートテストを必須**とする。

要件定義は `REQUIREMENTS.md`（これが地図。変更時は修正履歴に追記）。

## ビルドと起動

```sh
swift build                 # デバッグビルド（コンパイル確認）
./scripts/build.sh          # release ビルド → build/Fika.app（ad-hoc 署名）
open build/Fika.app         # 起動（メニューバーにダイヤルアイコン常駐・Dock 常時表示）
pkill -f "build/Fika.app"   # 停止
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

**LP には配布ファイル名（`Fika.dmg` 等）を書かない。** 2 のリリースは 1 のマージと別操作なので、
LP に実物のファイル名を書くと「マージ済みだがまだリリースしていない」期間だけ LP が嘘になる
（#59 で実際に踏みかけた）。手順は「ダウンロードした .dmg を開き」のように名前非依存で書き、
LP のマージがリリース順序に縛られないようにする。

## アーキテクチャ（Sources/Pomo/）

- `TimerEngine.swift` — 心臓部。Date 差分ベース。フロー（今回の経過時間をカウントアップ→休憩自動算出）・ポモドーロ（残り時間＋今回の経過時間）・タイマー（任意分数カウントダウン）・時計（現在時刻のみ）の4モード。計測結果はメモリだけに保持し、永続化しない
- `FloatingPanel.swift` — NSPanel の検証済みレシピ（nonactivating + canJoinAllSpaces + fullScreenAuxiliary）。**このフラグ構成を崩さないこと**
- `PanelView.swift` — パネルの SwiftUI。白基調の Liquid Glass ＋墨色文字＋ティール（フィールドノートトーン。imutaro リポジトリ DESIGN.md 準拠、2026-07-30 に琥珀の和テイストから刷新）。**テキスト入力を置かない**（フォーカス奪取の罠 §8）。ボタンはホバーが 0.35 秒続いてから押せる（`armed`。通りすがりのクリックで「リセット」「休憩へ」が発火した対策 #69。`opacity(0)` はヒットテストを止めないので `allowsHitTesting` が必要）
- `MainWindow.swift` — 母艦ウィンドウ（通常 NSWindow）。**固定 420×540 の縦長カード、サイドバーなし**。4ページの行き来はフッターリンク（設定 / 願い / 仕組み）と ⌘1〜4、戻りは各ページ右肩の「タイマーへ」。母艦が見える間はパネルをしまう。**位置はパネルと右上角を共有**（開くときはパネルの角へ、閉じる/しまうときは母艦の角をパネルへ引き継ぐ。記憶は `panelFrame` 一本で、母艦は frameAutosave を持たない）。閉じ方で意図分離: 「パネルで始める」/フォーカスモード→パネル復帰、赤バツ/⌘W→すべてしまう（復帰は ⌃⌥T・メニューバー・Dock）
- `DashboardPage / SettingsPage / PhilosophyPage / MechanismPage.swift` — 母艦の4ページ（⌘1〜4）。`MechanismPage` はフロータイマーという手法と名前 fika の由来の説明ページで、本文は sans、結びだけ明朝（`PhilosophyPage` は全編明朝の「声」）。ダッシュボードはタイマーだけを主役にし、履歴・統計・メモ・検索を持たない。白カードで囲わず 190px のリングを地に直置きする（420 幅では枠が窓枠と二重に見えるため）。`CardStyle.swift` がヘアラインカード・eyebrow・SelectChip・InlineLink を提供
- `BreakOverlay.swift` — 全画面休憩モード（全ディスプレイ、クリック遮断、キーボードは奪わない）。`MeetingGuard.swift` でマイク使用中は全画面化を見送る
- `MenuBarController.swift` — 常駐メニュー（操作の場）。詳細設定は母艦の設定ページに一本化（モード切替だけ作業フローの一部として例外的にメニューにも残す）
- 設計原則: ローカル完結・アカウントなし・テレメトリなし・履歴なし。設定以外を保存せず、「今回どれだけやったか」だけを表示する。旧 `sessions.jsonl` / `sessions.db` は削除しないが、読み書きしない
