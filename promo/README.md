# Quiet 紹介動画（Remotion）

30秒・1920×1080・30fps の横動画。コードだけで作っている（生成 AI 素材・画面収録なし）。

```sh
cd promo
npm i
npx remotion studio                                   # ブラウザでプレビュー・調整
npx remotion render QuietPromo out/quiet-promo.mp4    # 書き出し
```

## 構成

| 秒 | シーン | ファイル |
|---|---|---|
| 0–2 | 黒地のターミナル → 「時間です。」 | `src/scenes/Boot.tsx` |
| 2–14 | 通知・ストリーク・統計の「ノイズ」が積み上がり、一枚ずつ消える | `src/scenes/Noise.tsx` |
| 14–24 | 静寂 → Quiet のパネル → 全画面の休憩 | `src/scenes/QuietScene.tsx` |
| 24–30 | 結びの一文 → ロゴ | `src/scenes/Outro.tsx` |

色とフォントはアプリ（`Sources/Pomo/DesignTokens.swift`）と LP（`docs/index.html`）のトークンを `src/theme.ts` に写している。

## BGM

`public/` に置くと自動で鳴る（無ければ無音で書き出す）。著作物なので Git には入れない（`.gitignore` 済み）。

- `public/bgm.mp3` — 前半のうるさい曲。14秒（ノイズが消えきる瞬間）で断ち切る
- `public/bgm-quiet.mp3` — 任意。2秒の無音のあと、16秒から鳴る静かな曲
