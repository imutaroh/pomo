# Pomo 配布・提出ガイド（2026-06-13）

このドキュメントは「コードはどこまで提出可能な状態か」「ご主人様が外部でやる作業は何か」をまとめたもの。
GUI 挙動・署名・公証は Claude Code から検証できないため、最後の確認は人間の手で行う必要がある。

---

## 0. いまの状態（コード側で完了していること）

| 項目 | 状態 |
|------|------|
| App Sandbox 用エンタイトルメント | ✅ `Pomo.entitlements`（`com.apple.security.app-sandbox` のみ。ネットワーク不使用・外部ファイルアクセスなし・録音なしのため追加権限は不要） |
| MAS 必須の Info.plist キー | ✅ `LSUIElement` / `LSApplicationCategoryType=public.app-category.productivity` / `ITSAppUsesNonExemptEncryption=false` / `NSHumanReadableCopyright` / `CFBundleDevelopmentRegion=ja` |
| Dock 非表示（メニューバー常駐） | ✅ `setActivationPolicy(.accessory)` + `LSUIElement`（母艦ウィンドウ追加時に抜けていた回帰を修正） |
| アプリアイコン | ✅ `Resources/Assets.xcassets/AppIcon.appiconset`（16〜1024px 揃い）。`assets/AppIcon.icns` も再生成済み |
| Xcode プロジェクト生成 | ✅ `project.yml`（XcodeGen）。`xcodegen generate` で `Pomo.xcodeproj` を生成（生成物は .gitignore 済み） |
| Sandbox 下での JSONL パス | ✅ コード変更不要。`~/Library/Containers/com.imutaakihiro.pomo/Data/...` へ OS が自動リダイレクト |
| データ収集 | ✅ なし（外部送信・テレメトリ・アカウント・URLSession いずれも不使用）。App Privacy は「データを収集しない」で申告できる |
| localhost API | ✅ 削除済み（Sandbox と衝突するため） |

⚠️ **私（Claude Code）が検証できなかった2点（このマシンの制約）**
1. **完全な Xcode が未インストール**（Command Line Tools のみ）。`xcodebuild`＝アーカイブ・署名は完全 Xcode 必須。`xcodegen generate` の成功と entitlements/Info.plist の中身までは確認したが、`.xcodeproj` の実コンパイルは未検証。
2. **GUI 挙動全般**（レスポンシブ・透明化・通知の見え方・VoiceOver・Reduce Motion）。下の §4 チェックリストで手動確認が必要。

---

## 1. まず決める: 配布チャネル

`docs/MARKET.md` の結論は **「Developer ID 直販（Paddle）を先行 → MAS は後追い任意（P2）」**。
理由: MAS は審査・サンドボックス・証明書が重く、ユーティリティアプリは直販の支払い意欲が高い。
ただし「App Store に並べたい」なら MAS も用意済み。コードは両対応（Sandbox 有効は両方で無害）。

| | A. Developer ID 直販（推奨・近道） | B. Mac App Store |
|---|---|---|
| 必要な証明書 | Developer ID Application | 3rd Party Mac Developer Application + Installer |
| 公証 | notarytool で自分で公証 | Apple 側が実施 |
| Xcode プロジェクト | **不要**（`./scripts/build.sh` の .app をそのまま署名・公証できる） | **必要**（`xcodegen generate`） |
| 集金 | Paddle 等（手数料 低） | Apple（30%、小規模は15%） |
| 審査 | なし | あり（数日〜） |

---

## 2. 共通の前提（どちらの道でも必要）

1. **Apple Developer Program 加入**（$99/年）— ご主人様の支出判断が要る唯一の項目。
2. **完全な Xcode をインストール**（App Store から。MAS では必須。直販でも notarytool に Xcode 同梱が楽）。
   インストール後: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
3. developer.apple.com で App ID `com.imutaakihiro.pomo` を登録。

---

## 3. 手順

### A. Developer ID 直販（近道）
```sh
./scripts/build.sh                       # build/Pomo.app を生成
# Developer ID で署名し直す（ad-hoc を上書き）:
codesign --force --deep --options runtime \
  --sign "Developer ID Application: <Your Name> (<TEAMID>)" \
  --entitlements Pomo.entitlements build/Pomo.app
# 公証:
ditto -c -k --keepParent build/Pomo.app Pomo.zip
xcrun notarytool submit Pomo.zip --apple-id <id> --team-id <TEAMID> --password <app専用pw> --wait
xcrun stapler staple build/Pomo.app
```
配布は .dmg か zip。自動更新は将来 Sparkle を検討（MARKET.md P0）。

### B. Mac App Store
```sh
xcodegen generate                        # Pomo.xcodeproj
open Pomo.xcodeproj
```
Xcode で:
1. Pomo ターゲット → Signing & Capabilities → Team を選択（自動署名）。`project.yml` の `DEVELOPMENT_TEAM` に Team ID を入れてもよい。
2. App Sandbox が付いていることを確認（`Pomo.entitlements` 由来）。
3. Product → Archive → Distribute App → App Store Connect。
4. App Store Connect で新規 App 作成（Bundle ID = com.imutaakihiro.pomo）、スクリーンショット・説明文・価格・**App Privacy =「データを収集しない」**を設定。
5. 審査で MeetingGuard を問われたら「`AudioObjectGetPropertyData` の公開プロパティでマイク使用状態を読むだけ・録音なし」と回答（`NSMicrophoneUsageDescription` は不要）。

---

## 4. 提出前の手動 GUI 確認チェックリスト（必須）

Claude Code は GUI を確認できない。`./scripts/build.sh && open build/Pomo.app` で起動し、以下を目視:

**回帰・基本**
- [ ] Dock にアイコンが出ない（メニューバー 🍅 のみ）
- [ ] 初回起動（`defaults delete com.imutaakihiro.pomo didOnboard` でリセット可）で母艦ウィンドウが自動で開く
- [ ] フルスクリーンの別アプリ上にパネルが追従する（§10-1,2,3）

**今回の変更点**
- [ ] 母艦ウィンドウを**横幅いっぱい〜最小(760)まで伸縮**して、各ページ（ダッシュボード/セッション/統計/設定）が崩れない
- [ ] 統計のヒートマップが、狭いとき横スクロールで見られる（はみ出し・クリップなし）
- [ ] 設定ページのピッカー/スライダーが最小幅でもラベルを潰さない
- [ ] クラシック/単純タイマーで**残り1分**になるとパネルの進捗バーが濃い琥珀に変わる
- [ ] 作業/休憩おわりに**システム通知**が出る（初回は許可ダイアログ→以後アクションボタン）。通知の音とアプリ音が二重に鳴らない
- [ ] 会議（マイク使用）中に休憩へ入ると全画面オーバーレイが出ず、通話終了後に出る
- [ ] システム設定で「視差効果を減らす(Reduce Motion)」ON 時、休憩オーバーレイの呼吸アニメと一覧のスライドが止まる
- [ ] システム設定の「文字を大きく」でメイン画面の文字が追従して拡大する（巨大タイマー数字は固定でよい）
- [ ] VoiceOver でタイマーのボタンが「作業を開始」等と読まれる（記号名でない）

**性能（§10-5）**
- [ ] アイドル時 CPU 1% 未満・メモリ 100MB 以下
