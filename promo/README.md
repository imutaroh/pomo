# Quiet 紹介動画（Remotion）

79秒・1920×1080・30fps の横動画。コードだけで作っている（生成 AI 素材・画面収録なし）。

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
| 0–15 | 夜の作業。テストが通っていき「いま、いいところ」。隅の汎用ポモドーロが減っていく | `src/scenes/Zone.tsx`（描画は `ZoneScreen.tsx`） |
| 15–19 | 00:00 →「時間です。」で断ち切られる →「いま、いいところだったのに。」 | `src/scenes/Cut.tsx` |
| 19–29 | ストリーク・点数・ランキングなど「記録」の通知バナーが積み上がり、一枚ずつ消える | `src/scenes/Noise.tsx` |
| 29–31 | 白。無音 | `src/scenes/Silence.tsx` |
| 31–36 | 作業中の Mac の右上にパネル | `src/scenes/DesktopScene.tsx` |
| 36–42 | 作業中は溶け込み、ホバーで戻る（存在感の3段階） | `src/scenes/Presence.tsx` |
| 42–47 | 別アプリを前に出しても、Space・フルスクリーンを移っても居続ける | `src/scenes/Follow.tsx` |
| 47–58 | 25:00 を越えても止めない →「区切りは、止めたところ。」→ 休憩チップ → 全画面休憩 | `src/scenes/FlowBreak.tsx` |
| 58–63 | 既定はフロー。ほかのモードは選べる | `src/scenes/Modes.tsx` |
| 63–69 | 「ないもの」に線を引いて消す →「今回の時間だけ。」 | `src/scenes/Promises.tsx` |
| 69–74 | 結びの二行（アプリの PhilosophyPage の結び） | `src/scenes/Words.tsx` |
| 74–79 | アイコン＋Quiet＋curl の一行 | `src/scenes/Install.tsx` |

伝えたい価値は 2 つ。①いいところで止められない（25 分で外から断ち切らない）、②記録に追われない（ストリーク・履歴を持たない）。

共通部品は `src/components/`（`Panel` / `Desktop` / `Caption` / `Terminal` / `icons`）。
画面に映る UI・文言・数字はアプリ（`Sources/Pomo/`）と LP（`docs/index.html`）から取っている。
色とフォントはアプリ（`Sources/Pomo/DesignTokens.swift`）と LP のトークンを `src/theme.ts` に写している。
フォントは `public/fonts/` に同梱した TTF（SIL OFL 1.1）を読む（Google Fonts から読むと並列の書き出しで取得が詰まるため）。

## 公開前の確認

最後に映る `curl -fsSL https://quiet.imutaro.com/install.sh | bash` はインストーラ（#73）を quiet.imutaro.com で配っている（旧 imutaroh.github.io/pomo/install.sh も同じ中身）。
**実機の Mac で、この一行から実際にインストールして起動できることを確かめてから動画を公開する。**
また、1 行で入るのは最新リリースのアプリなので、Quiet 名義のリリースが出るまでは Pomo 名義のアプリが入る。

## 音

BGM と効果音はすべて `audio/` の Python（numpy / scipy）で合成している。外部の音源・サンプル・システムサウンドは使っていない。乱数は固定シードなので、何度作っても同じ音になる。

```sh
npm run cues    # 絵の出来事（打鍵・通知・クリック・スワイプなど）を本編の絶対フレームで audio/cues.json に書き出す
npm run audio   # cues.json から前半（noise.py）・後半（quiet.py）を合成し、mix.py で public/score.mp3 に仕上げる
```

シーンのタイミングを変えたら `npm run cues && npm run audio` で音を作り直す（音は cues.json の数値で置いているので、絵に追従する）。
Zone は乗ってくるローファイ、Cut で断ち切り、Noise は 29 秒で消え、29〜31 秒は完全な無音、後半は 31 秒から。全体は -14 LUFS・True Peak -1.5 dBTP。

書き出しで `<Audio>` を載せると 1 フレームごとに長い待ちが入るため、音は Studio のプレビューでだけ鳴らし、`npm run render` が書き出した映像に ffmpeg で重ねている。
