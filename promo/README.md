# Quiet 紹介動画（Remotion）

60秒・1920×1080・30fps の横動画。コードだけで作っている（生成 AI 素材・画面収録なし）。

```sh
cd promo
npm i
npx remotion studio    # ブラウザでプレビュー・調整（音も鳴る）
npm run render         # 書き出し → out/quiet-promo.mp4（映像を書き出し、ffmpeg で音を重ねる）
```

## 構成

シーンの開始秒と切り替え方は `src/timeline.ts` に集約している。シーン単体は Studio の `Scenes/Scene-<id>` で確認できる（frame 0 = 本編の開始）。

| 秒 | シーン | ファイル |
|---|---|---|
| 0–3 | 黒地のターミナル → 「時間です。」 | `src/scenes/Boot.tsx` |
| 3–15 | ストリーク・点数・ランキングなど「評価と監視」の通知バナーが積み上がり、一枚ずつ消える | `src/scenes/Noise.tsx` |
| 15–17 | 白。無音 | `src/scenes/Silence.tsx` |
| 17–22 | 作業中の Mac の右上にパネル | `src/scenes/DesktopScene.tsx` |
| 22–28 | 作業中は溶け込み、ホバーで戻る（存在感の3段階） | `src/scenes/Presence.tsx` |
| 28–33 | 別アプリを前に出しても、Space・フルスクリーンを移っても居続ける | `src/scenes/Follow.tsx` |
| 33–40 | 25分を越えて続ける → 休憩チップ → 全画面休憩 | `src/scenes/FlowBreak.tsx` |
| 40–45 | 4つのモード | `src/scenes/Modes.tsx` |
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

## 音

BGM と効果音はすべて `audio/` の Python（numpy / scipy）で合成している。外部の音源・サンプル・システムサウンドは使っていない。乱数は固定シードなので、何度作っても同じ音になる。

```sh
npm run cues    # 絵の出来事（打鍵・通知・クリック・スワイプなど）を本編の絶対フレームで audio/cues.json に書き出す
npm run audio   # cues.json から前半（noise.py）・後半（quiet.py）を合成し、mix.py で public/score.mp3 に仕上げる
```

シーンのタイミングを変えたら `npm run cues && npm run audio` で音を作り直す（音は cues.json の数値で置いているので、絵に追従する）。
前半は 15 秒で断ち切り、15〜17 秒は完全な無音、後半は 17 秒から。全体は -14 LUFS・True Peak -1.5 dBTP。

書き出しで `<Audio>` を載せると 1 フレームごとに長い待ちが入るため、音は Studio のプレビューでだけ鳴らし、`npm run render` が書き出した映像に ffmpeg で重ねている。
