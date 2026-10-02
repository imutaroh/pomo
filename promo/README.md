# Quiet 紹介動画（Remotion）

60秒・1920×1080・30fps の横動画。コードだけで作っている（生成 AI 素材・画面収録なし）。

```sh
cd promo
npm i
npx remotion studio                                   # ブラウザでプレビュー・調整
npx remotion render QuietPromo out/quiet-promo.mp4    # 書き出し
```

## 構成

シーンの開始秒と切り替え方は `src/timeline.ts` に集約している。シーン単体は Studio の `Scenes/Scene-<id>` で確認できる（frame 0 = 本編の開始）。

| 秒 | シーン | ファイル |
|---|---|---|
| 0–3 | 黒地のターミナル → 「時間です。」 | `src/scenes/Boot.tsx` |
| 3–15 | ストリーク・点数・ランキングなど「評価と監視」が積み上がり、一枚ずつ消える | `src/scenes/Noise.tsx` |
| 15–17 | 白。無音 | `src/scenes/Silence.tsx` |
| 17–24 | 作業中の Mac の右上にパネル | `src/scenes/DesktopScene.tsx` |
| 24–31 | 作業中は溶け込み、ホバーで戻る（存在感の3段階） | `src/scenes/Presence.tsx` |
| 31–39 | 25分を越えて続ける → 休憩チップ → 全画面休憩 | `src/scenes/FlowBreak.tsx` |
| 39–45 | 4つのモード | `src/scenes/Modes.tsx` |
| 45–51 | 「ないもの」に線を引いて消す・会議中は割り込まない | `src/scenes/Promises.tsx` |
| 51–55 | 結びの二行 | `src/scenes/Words.tsx` |
| 55–60 | アイコン＋Quiet＋curl の一行 | `src/scenes/Install.tsx` |

共通部品は `src/components/`（`Panel` / `Desktop` / `Caption` / `Terminal` / `icons`）。
画面に映る UI・文言・数字はアプリ（`Sources/Pomo/`）と LP（`docs/index.html`）から取っている。
色とフォントはアプリ（`Sources/Pomo/DesignTokens.swift`）と LP のトークンを `src/theme.ts` に写している。

## 公開前の確認

最後に映る `curl -fsSL https://imutaroh.github.io/pomo/install.sh | bash` は、
インストーラ（#73）が main にマージされて GitHub Pages に出るまで 404 になる。
**本番 URL で実際にインストールできることを確かめてから動画を公開する。**

## BGM

`public/` に置くと自動で鳴る（無ければ無音で書き出す）。著作物なので Git には入れない（`.gitignore` 済み）。

- `public/bgm.mp3` — 前半のうるさい曲。15秒（ノイズが消えきる瞬間）で断ち切る
- `public/bgm-quiet.mp3` — 任意。2秒の無音のあと、17秒から鳴る静かな曲
