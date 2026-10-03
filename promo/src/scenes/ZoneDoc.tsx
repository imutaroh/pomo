import { Easing, interpolate } from "remotion";
import { clamp, font } from "../theme";
import { AppWindow, Caret, keyTimes, typedCount, Z } from "./ZoneChrome";

// モンタージュ ① 資料。提案書の「背景」を書いている途中で、残りの見出し（提案・期待効果）が並び、
// 構成が見えた瞬間から箇条書きが一気に埋まっていく。t はこのカットの頭からのフレーム（4 分割でもそのまま続く）

// ghost: 打つ前から薄い「・」と行の影だけ先に出ている（構成が見えた）
type Line = { kind: "title" | "head" | "bullet"; text: string; keys?: number[]; appear?: number; ghost?: number };

// 見出しが並ぶ瞬間（構成が見えた）
export const DOC_OUTLINE = 34;

const HEIGHT = { title: 112, head: 86, bullet: 66 } as const;
const SIZE = { title: 62, head: 48, bullet: 40 } as const;

const typed = (text: string, start: number, gap0: number, gap1: number, seed: string): Line => ({
  kind: "bullet",
  text,
  keys: keyTimes(text.length, start, gap0, gap1, seed),
});

// 打ち始めはふつうの速さ、見出しが見えてからは間隔が詰まっていく。
// このカットは t=0〜120、4 分割では t=360〜450 で映る（間は画面に出ない）。4 分割の間も「4. 進め方」の行を打ち続けている
const L3 = typed("・同じ質問への回答が全体の6割", -2, 1.9, 1.6, "d3");
const L5 = typed("・よくある質問は自動で一次回答する", 44, 0.8, 0.5, "d5");
const L6 = typed("・担当者は込み入った相談に集中する", L5.keys![L5.keys!.length - 1] + 3, 0.5, 0.4, "d6");
const L8 = typed("・対応時間を月40時間まで減らす", L6.keys![L6.keys!.length - 1] + 4, 0.45, 0.35, "d8");
const L9 = typed("・お客さまの待ち時間を半分に", L8.keys![L8.keys!.length - 1] + 3, 0.4, 0.35, "d9");
const L10 = typed("・浮いた時間で新しい窓口を試す", L9.keys![L9.keys!.length - 1] + 6, 2.2, 2.6, "d10");
const L12 = typed("・11月に一部の窓口で小さく始める", 352, 2.8, 3, "d12");
const L13 = typed("・効果は月末の定例で確かめる", L12.keys![L12.keys!.length - 1] + 5, 3.2, 3.6, "d13");

const LINES: Line[] = [
  { kind: "title", text: "問い合わせ対応 改善のご提案" },
  { kind: "head", text: "1. 背景" },
  { kind: "bullet", text: "・問い合わせ対応に月120時間かかっている" },
  L3,
  { kind: "head", text: "2. 提案", appear: DOC_OUTLINE },
  { ...L5, ghost: DOC_OUTLINE + 2 },
  { ...L6, ghost: DOC_OUTLINE + 3 },
  { kind: "head", text: "3. 期待効果", appear: DOC_OUTLINE + 5 },
  { ...L8, ghost: DOC_OUTLINE + 7 },
  { ...L9, ghost: DOC_OUTLINE + 8 },
  L10,
  { kind: "head", text: "4. 進め方", appear: 300 },
  L12,
  L13,
];

// 行が「ある」か（見出しは appear から、打つ行は最初の一打から）
const exists = (l: Line, t: number) => (l.keys ? Math.min(l.keys[0], l.ghost ?? Infinity) <= t : l.appear === undefined || l.appear <= t);

const PAD_TOP = 44;
const VIEW_H = 1080 - 60 - 40 - 112; // 窓の本文の高さ

export const DocApp: React.FC<{ t: number }> = ({ t }) => {
  // いま打っている行（最後に打鍵があった行）
  let caretLine = -1;
  let lastKey = -99;
  LINES.forEach((l, i) => {
    if (!l.keys) return;
    const n = typedCount(l.keys, t);
    if (n > 0 && l.keys[n - 1] >= lastKey) {
      lastKey = l.keys[n - 1];
      caretLine = i;
    }
  });
  const caretOn = t - lastKey < 6 || Math.floor(t / 15) % 2 === 0;

  // 行が増えて下に溢れそうになったら、本文を上へ送る（なめらかに）
  const ys: number[] = [];
  let y = PAD_TOP;
  LINES.forEach((l, i) => {
    // 2 つ目以降の見出しの前だけ、少し空ける
    if (l.kind === "head" && i > 1) y += 18;
    ys.push(y);
    y += HEIGHT[l.kind];
  });
  const bottomOf = (i: number) => ys[i] + HEIGHT[LINES[i].kind] + 40;
  const scrollFor = (i: number) => Math.max(0, bottomOf(i) - VIEW_H);
  // 行 i が現れる時刻をまたいで 10f かけて送る
  let scroll = 0;
  LINES.forEach((l, i) => {
    const at = l.keys ? Math.min(l.keys[0], l.ghost ?? Infinity) : (l.appear ?? -99);
    const p = interpolate(t, [at - 4, at + 6], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    scroll = Math.max(scroll, scrollFor(i) * p);
  });

  return (
    <AppWindow
      app="ドキュメント"
      menus={["ファイル", "編集", "挿入", "書式", "表示"]}
      title="提案書 — ドキュメント"
      tools={[{ w: 120 }, { w: 64 }, { w: 0 }, { w: 34, on: true }, { w: 34 }, { w: 34 }, { w: 0 }, { w: 44 }, { w: 44 }, { w: 44 }]}
    >
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 150, right: 420, top: 0, translate: `0px ${-scroll}px` }}>
          {LINES.map((l, i) => {
            if (!exists(l, t)) return null;
            const n = l.keys ? typedCount(l.keys, t) : l.text.length;
            // 構成が見えた瞬間: 見出しが左から滑り込み、一瞬だけ明るく残る
            const inP = l.appear !== undefined ? interpolate(t, [l.appear, l.appear + 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }) : 1;
            const glow = l.appear !== undefined ? interpolate(t, [l.appear, l.appear + 3, l.appear + 24], [0, 1, 0], clamp) : 0;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  top: ys[i],
                  height: HEIGHT[l.kind],
                  display: "flex",
                  alignItems: "center",
                  whiteSpace: "pre",
                  opacity: inP,
                  translate: `${(1 - inP) * -30}px 0px`,
                  fontFamily: font.sans,
                  fontWeight: l.kind === "bullet" ? 500 : 700,
                  fontSize: SIZE[l.kind],
                  color: l.kind === "bullet" ? "rgba(235,235,245,0.88)" : Z.text,
                  textShadow: glow > 0 ? `0 0 ${24 * glow}px rgba(10,132,255,${0.9 * glow})` : undefined,
                  borderBottom: l.kind === "title" ? `2px solid ${Z.hair}` : undefined,
                  paddingLeft: l.kind === "bullet" ? 18 : 0,
                }}
              >
                {n === 0 && l.ghost !== undefined ? (
                  <>
                    <span style={{ color: Z.faint }}>・</span>
                    <span
                      style={{
                        width: (l.text.length - 1) * SIZE.bullet * 0.7,
                        height: SIZE.bullet * 0.5,
                        borderRadius: 8,
                        backgroundColor: "rgba(235,235,245,0.07)",
                        opacity: interpolate(t, [l.ghost, l.ghost + 5], [0, 1], clamp),
                      }}
                    />
                  </>
                ) : (
                  l.text.slice(0, n)
                )}
                {i === caretLine ? <Caret h={SIZE[l.kind] * 1.15} on={caretOn} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </AppWindow>
  );
};
