import { Easing, interpolate } from "remotion";
import { clamp, color, font } from "../theme";
import { AppWindow, Caret, keyTimes, Pointer, typedCount, Z } from "./ZoneChrome";

// モンタージュ ③ デザイン。説明会のスライドで、ずれていた見出し・日時・ボタン・画像を一つずつ掴んで寄せると、
// ガイド線に吸い付いて左端と上端がぴたりと揃う。揃ったらそのまま一行書き足し始める。
// t はこのカットの頭からのフレーム（4 分割でも続く）

const BOARD = { x: 150, y: 96, w: 1240, h: 698 }; // 窓の本文座標
const GUIDE = "#FF9F0A";
const LEFT = 90; // 揃える左端（スライド座標）
const TOP = 110; // 揃える上端

type El = { id: string; w: number; h: number; from: [number, number]; to: [number, number]; drag?: [number, number] };
// drag: 掴んで動かす区間。最後の数フレームでガイドに吸い付く
const ELS: El[] = [
  { id: "title", w: 640, h: 90, from: [LEFT, TOP], to: [LEFT, TOP] },
  { id: "sub", w: 620, h: 50, from: [LEFT + 150, 284], to: [LEFT, 240], drag: [0, 16] },
  { id: "button", w: 330, h: 84, from: [LEFT + 190, 520], to: [LEFT, 430], drag: [20, 34] },
  { id: "image", w: 400, h: 400, from: [810, 200], to: [760, TOP], drag: [38, 50] },
];
export const DESIGN_ALIGNED = 54;
// 揃ったあとに書き足す一行。このカットは t=0〜80、4 分割では t=140〜230 で映る（間は画面に出ない）。
// カットの終わりに 2 文字打ち、4 分割の間に残りを打ち続ける
const NOTE = "参加無料・先着100名";
const NOTE_KEYS = [64, 71, ...keyTimes(NOTE.length - 2, 146, 11, 12, "dn")];

const posOf = (el: El, t: number): [number, number] => {
  if (!el.drag) return el.to;
  const [a, b] = el.drag;
  // 掴んで寄せる（ease-in-out）→ 最後の 3f でガイドへ吸い付く
  const p = interpolate(t, [a, b - 3], [0, 0.9], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const snap = interpolate(t, [b - 3, b], [0, 1], clamp);
  const k = p + (1 - 0.9) * snap * (p >= 0.9 ? 1 : 0);
  return [el.from[0] + (el.to[0] - el.from[0]) * k, el.from[1] + (el.to[1] - el.from[1]) * k];
};

export const DesignApp: React.FC<{ t: number }> = ({ t }) => {
  const pos = Object.fromEntries(ELS.map((el) => [el.id, posOf(el, t)])) as Record<string, [number, number]>;
  const dragging = ELS.find((el) => el.drag && t >= el.drag[0] && t <= el.drag[1] + 4);
  const selected = dragging ?? (t < 2 ? ELS[1] : t >= DESIGN_ALIGNED ? undefined : ELS.find((el) => el.drag && t < el.drag[0]));
  // 吸い付いた瞬間だけガイドが出る。最後は全部揃ったことを一度に見せる
  const snapGlow = (b: number) => interpolate(t, [b - 3, b, b + 12, b + 18], [0, 1, 1, 0], clamp);
  const all = interpolate(t, [DESIGN_ALIGNED - 2, DESIGN_ALIGNED, DESIGN_ALIGNED + 16, DESIGN_ALIGNED + 24], [0, 1, 1, 0], clamp);
  const leftGuide = Math.max(snapGlow(16), snapGlow(34), all);
  const topGuide = Math.max(snapGlow(50), all);
  const noteN = typedCount(NOTE_KEYS, t);
  const lastKey = Math.max(...NOTE_KEYS.filter((k) => k <= t), -99);

  // カーソル: 掴んでいる要素の中ほど。揃ったあとは書き足す行の先へ
  let cursor: [number, number] = [pos.sub[0] + 200, pos.sub[1] + 30];
  if (dragging) cursor = [pos[dragging.id][0] + Math.min(200, dragging.w / 2), pos[dragging.id][1] + dragging.h / 2];
  else if (t > 34 && t < 38) cursor = [pos.image[0] + 200, pos.image[1] + 200];
  else if (t >= DESIGN_ALIGNED) cursor = [LEFT + 420, 340];

  const box = (id: string): React.CSSProperties => ({ position: "absolute", left: pos[id][0], top: pos[id][1] });

  return (
    <AppWindow
      app="キャンバス"
      menus={["ファイル", "編集", "配置", "表示", "ウインドウ"]}
      title="説明会スライド — キャンバス"
      tools={[{ w: 34, on: true }, { w: 34 }, { w: 34 }, { w: 34 }, { w: 0 }, { w: 90 }, { w: 0 }, { w: 64 }]}
    >
      {/* キャンバスの地（細かい点） */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: Z.desk,
          backgroundImage: "radial-gradient(rgba(235,235,245,0.1) 1.5px, transparent 1.5px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div style={{ position: "absolute", left: BOARD.x, top: BOARD.y - 44, fontFamily: font.sans, fontWeight: 500, fontSize: 22, color: Z.dim }}>
        スライド 3
      </div>
      <div
        style={{
          position: "absolute",
          left: BOARD.x,
          top: BOARD.y,
          width: BOARD.w,
          height: BOARD.h,
          backgroundColor: color.washi,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ ...box("title"), fontFamily: font.sans, fontWeight: 700, fontSize: 62, lineHeight: "90px", color: color.sumi, whiteSpace: "pre" }}>
          秋の新サービス説明会
        </div>
        <div style={{ ...box("sub"), fontFamily: font.sans, fontWeight: 500, fontSize: 36, lineHeight: "50px", color: color.sumi, whiteSpace: "pre" }}>
          10月24日（金）14:00〜 オンライン
        </div>
        {noteN > 0 ? (
          <div style={{ position: "absolute", left: LEFT, top: 310, fontFamily: font.sans, fontWeight: 500, fontSize: 32, lineHeight: "48px", color: color.sumi, whiteSpace: "pre" }}>
            {NOTE.slice(0, noteN)}
            <Caret h={38} on={t - lastKey < 6 || Math.floor(t / 15) % 2 === 0} />
          </div>
        ) : null}
        <div
          style={{
            ...box("button"),
            width: 330,
            height: 84,
            borderRadius: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: Z.blue,
            fontFamily: font.sans,
            fontWeight: 700,
            fontSize: 32,
            color: "#fff",
          }}
        >
          参加を申し込む
        </div>
        {/* 画像の置き場（山と太陽の簡単な絵） */}
        <svg style={box("image")} width={400} height={400} viewBox="0 0 400 400">
          <rect width={400} height={400} rx={18} fill={color.line} />
          <circle cx={290} cy={120} r={44} fill="#FF9F0A" />
          <path d="M0 400 L0 300 L120 170 L230 290 L290 230 L400 340 L400 400 Z" fill="#BF5AF2" opacity={0.55} />
          <path d="M0 400 L0 340 L150 240 L270 330 L400 280 L400 400 Z" fill="#0A84FF" opacity={0.6} />
        </svg>

        {/* ガイド線（スライドの上に重ねる） */}
        {leftGuide > 0 ? <div style={{ position: "absolute", left: LEFT - 1.5, top: 40, width: 3, height: BOARD.h - 80, backgroundColor: GUIDE, opacity: leftGuide }} /> : null}
        {topGuide > 0 ? <div style={{ position: "absolute", left: 40, top: TOP - 1.5, width: BOARD.w - 80, height: 3, backgroundColor: GUIDE, opacity: topGuide }} /> : null}

        {/* 選択枠 */}
        {selected ? (
          <div
            style={{
              position: "absolute",
              left: pos[selected.id][0] - 8,
              top: pos[selected.id][1] - 8,
              width: selected.w + 16,
              height: selected.h + 16,
              border: `3px solid ${Z.blue}`,
            }}
          >
            {[
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ].map(([cx, cy]) => (
              <span
                key={`${cx}${cy}`}
                style={{
                  position: "absolute",
                  left: `calc(${cx * 100}% - 8px)`,
                  top: `calc(${cy * 100}% - 8px)`,
                  width: 14,
                  height: 14,
                  backgroundColor: "#fff",
                  border: `2px solid ${Z.blue}`,
                }}
              />
            ))}
          </div>
        ) : null}
        <Pointer x={cursor[0]} y={cursor[1]} size={38} />
      </div>
    </AppWindow>
  );
};
