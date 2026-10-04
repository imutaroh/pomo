// X 投稿版（QuietPromoX）の区間表。本編 QuietPromo の絶対フレームで [from, to) を並べ、そのままつなぐ。
// 映像（QuietPromoX.tsx）と音（audio/x.py が npm run x:segments で書き出した JSON を読む）はここだけを参照する。
//
// 切れ目はシーン境界か、画面が一色になっている所に置く。尺は 60 秒以内（X の推奨）に収める。
// 本編から落としたもの: silence（白・無音の 2 秒）、modes / promises / words（機能の並べ立て）。

export type Segment = {
  id: string;
  from: number;
  to: number;
  /** 上の帯の見出し。null なら出さない */
  headline: string | null;
  /** 見出しを出す区間（区間内のフレーム）。省略時は区間の頭から終わりまで */
  headlineAt?: [number, number];
};

export const SEGMENTS: Segment[] = [
  // Zone＋Cut: 問いかけ → 仕事のモンタージュ → 時間です → いま、いいところだったのに。
  // 最初の 4 秒は映像の中の問いかけ（Zone の HOOK、〜132f）と重なるので、見出しはそのあとに出す。
  // Cut（450f〜）の「時間です。」「いま、いいところだったのに。」は画面だけで見せたいので、その手前で引く
  { id: "zone", from: 0, to: 570, headline: "25分で、切られていませんか。", headlineAt: [140, 450] },
  // Noise: 通知が積み上がる。746f（シーン内 176f）で映像の中に同じ趣旨の黒帯が出るので、そこで見出しは引く。
  // 862f で和紙一色に抜けきったところで切る（本編の 862–870 は白のまま）
  { id: "noise", from: 570, to: 862, headline: "積み上がる記録も、ノイズ。", headlineAt: [0, 172] },
  // Desktop＋Presence: Silence を落とし、Desktop の頭（20f の白からのフェード）から入る。Noise の末尾の和紙からそのまま絵が浮かぶ。
  // 後半の曲は 930f ちょうどで鳴り出すので、頭を詰めると出だしの音が欠ける
  // 見出しは字幕（「作業画面を、一切邪魔しない。」「うるさくない。でも、忘れさせない。」）と語が重ならない LP 733 の見出し
  { id: "desktop", from: 930, to: 1260, headline: "端に浮かぶ、小さなパネル。" },
  // Follow は頭（7f〜）から字幕「画面を切り替えても、ちゃんとそこにいる。」と映像の中のタグが出ていて、
  // 見出しを足すと同じ意味の文字が 3 層になるので出さない
  { id: "follow", from: 1260, to: 1410, headline: null },
  // FlowBreak: 末尾は和紙へ抜ける。1740 からは Modes のフェードなので手前で切る。
  // 見出しは字幕（「25分で、切らない。」「区切りは、止めたところ。」）と語が重ならない、LP 809 の「乗ってきたところで手が止まる」の裏返し
  { id: "flowBreak", from: 1410, to: 1740, headline: "乗ってきたところで、手が止まらない。" },
  // Install: 本編の頭 15f は Words からのフェード（Words の文字が残る）なので、それが消えきった 2235 から入る。
  // URL が出そろう（〜2290f）と止め絵なので、2.4 秒見せたら終える（曲の余韻は audio/x.py が末尾で絞る）
  { id: "install", from: 2235, to: 2361, headline: null },
];

export const lengthOf = (s: Segment) => s.to - s.from;

// X 版での各区間の開始フレーム
export const X_STARTS: number[] = SEGMENTS.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + lengthOf(SEGMENTS[i - 1])], []);

export const X_DURATION = SEGMENTS.reduce((sum, s) => sum + lengthOf(s), 0);

export const X_SIZE = 1080;
// 本編 1920×1080 を幅 1080 に縮めた大きさと、上下の帯の高さ
export const VIDEO_SCALE = X_SIZE / 1920;
export const VIDEO_H = Math.round(1080 * VIDEO_SCALE); // 608
export const BAND_H = (X_SIZE - VIDEO_H) / 2; // 236
