import { Easing, interpolate } from "remotion";
import { clamp, font } from "../theme";
import { AppWindow, Caret, keyTimes, typedCount, Z } from "./ZoneChrome";

// モンタージュ ② 表計算。売上の列に数式を一つ入れて Enter、下へ引くと列が一気に埋まり、横のグラフが立ち上がる。
// そのまま次の列（前年比）を打ち始める。t はこのカットの頭からのフレーム（4 分割でも続く）

const MONTHS = ["4月", "5月", "6月", "7月", "8月", "9月"];
const COUNTS = [120, 135, 150, 170, 190, 230];
const PRICE = 3200;
const SALES = COUNTS.map((c) => c * PRICE);
const TOTAL = SALES.reduce((a, b) => a + b, 0);
const YOY = ["+8%", "+11%", "+9%", "+14%", "+16%", "+21%"];
const yen = (n: number) => n.toLocaleString("en-US");

const FORMULA = "=B2*C2";
const F_KEYS = keyTimes(FORMULA.length, 2, 3, 2.4, "sf");
export const SHEET_ENTER = 22; // Enter で D2 が値になる
const FILL_FROM = 28; // 右下の点をつまんで下へ引く
const FILL_STEP = 2.5;
const TOTAL_AT = FILL_FROM + FILL_STEP * 6 + 4;
const BARS_FROM = 40;
// 前年比の列。このカットは t=0〜100、4 分割では t=240〜330 で映る（間は画面に出ない）。
// カットの終わりで見出しを打ち、4 分割の間に 4月〜9月を順に埋めていく
const E_HEAD = keyTimes(3, 78, 5, 4, "se");
const E_CELLS = YOY.map((v, i) => keyTimes(v.length, 234 + i * 18, 4.5, 4, `se${i}`));

const ROW_H = 76;
const COLS = [
  { key: "#", w: 64 },
  { key: "A", w: 140 },
  { key: "B", w: 170 },
  { key: "C", w: 170 },
  { key: "D", w: 240 },
  { key: "E", w: 170 },
];
const colX = (c: number) => COLS.slice(0, c).reduce((a, b) => a + b.w, 0);
const GRID_X = 40;
const GRID_Y = 92;
const FONT = 32;

const Cell: React.FC<{ c: number; r: number; children?: React.ReactNode; align?: "left" | "right"; bold?: boolean; dim?: boolean }> = ({
  c,
  r,
  children,
  align = "right",
  bold,
  dim,
}) => (
  <div
    style={{
      position: "absolute",
      left: GRID_X + colX(c),
      top: GRID_Y + r * ROW_H,
      width: COLS[c].w,
      height: ROW_H,
      display: "flex",
      alignItems: "center",
      justifyContent: align === "right" ? "flex-end" : "flex-start",
      padding: "0 16px",
      boxSizing: "border-box",
      fontFamily: font.sans,
      fontWeight: bold ? 700 : 500,
      fontSize: FONT,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "pre",
      color: dim ? Z.dim : Z.text,
    }}
  >
    {children}
  </div>
);

export const SheetApp: React.FC<{ t: number }> = ({ t }) => {
  const fTyped = typedCount(F_KEYS, t);
  const entered = t >= SHEET_ENTER;
  const filled = (i: number) => (i === 0 ? entered : t >= FILL_FROM + FILL_STEP * i);
  const fillSel = interpolate(t, [FILL_FROM - 2, FILL_FROM + FILL_STEP * 5], [0, 5], clamp);
  const eHead = typedCount(E_HEAD, t);
  const eTyped = E_CELLS.map((k) => typedCount(k, t));

  // 選択中のセル（列, 行の範囲）と、数式バーに出す中身
  let sel = { c: 4, r0: 1, r1: 1 };
  let bar = FORMULA.slice(0, fTyped);
  let caretAt: [number, number] | null = [4, 1];
  if (entered && t < FILL_FROM + FILL_STEP * 6 + 10) {
    sel = { c: 4, r0: 1, r1: 1 + Math.round(fillSel) };
    bar = FORMULA;
    caretAt = null;
  } else if (t >= FILL_FROM + FILL_STEP * 6 + 10) {
    // 前年比の列へ。打っているセルに移っていく
    const active = eTyped.findIndex((n, i) => n < YOY[i].length && E_CELLS[i][0] <= t + 6);
    const r = eHead < 3 ? 0 : active >= 0 ? active + 1 : 6;
    sel = { c: 5, r0: r, r1: r };
    bar = r === 0 ? "前年比".slice(0, eHead) : (YOY[r - 1] ?? "").slice(0, eTyped[r - 1] ?? 0);
    caretAt = [5, r];
  }
  const lastKey = Math.max(...[...F_KEYS, ...E_HEAD, ...E_CELLS.flat()].filter((k) => k <= t), -99);
  const caretOn = t - lastKey < 6 || Math.floor(t / 15) % 2 === 0;

  const gridW = colX(COLS.length);
  // 参照している B2・C2 を色の枠で示す（数式を打っている間だけ）
  const refs = !entered && fTyped >= 3;

  // グラフ（右）
  const CH = { x: GRID_X + gridW + 70, y: 150, w: 600, h: 560 };
  const max = 800000;

  return (
    <AppWindow
      app="表"
      menus={["ファイル", "編集", "挿入", "データ", "表示"]}
      title="上半期の売上 — 表"
      tools={[{ w: 110 }, { w: 0 }, { w: 34 }, { w: 34 }, { w: 34 }, { w: 0 }, { w: 64 }, { w: 64, on: true }, { w: 0 }, { w: 44 }]}
    >
      {/* 数式バー */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 64,
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "0 40px",
          borderBottom: `1px solid ${Z.hair}`,
          fontFamily: font.mono,
          fontSize: 30,
          color: Z.text,
        }}
      >
        <span style={{ width: 80, color: Z.dim, fontFamily: font.sans, fontWeight: 700 }}>{`${COLS[sel.c].key}${sel.r0 + 1}`}</span>
        <span style={{ color: Z.faint, fontStyle: "italic" }}>fx</span>
        <span style={{ whiteSpace: "pre" }}>
          {bar}
          {caretAt ? <Caret h={32} on={caretOn} /> : null}
        </span>
      </div>

      {/* 列見出しと行番号 */}
      {COLS.slice(1).map((c, i) => (
        <div
          key={c.key}
          style={{
            position: "absolute",
            left: GRID_X + colX(i + 1),
            top: GRID_Y - 40,
            width: c.w,
            height: 40,
            textAlign: "center",
            fontFamily: font.sans,
            fontWeight: 500,
            fontSize: 20,
            lineHeight: "40px",
            color: sel.c === i + 1 ? Z.text : Z.faint,
          }}
        >
          {c.key}
        </div>
      ))}
      {new Array(8).fill(0).map((_, r) => (
        <Cell key={r} c={0} r={r} align="left" dim>
          <span style={{ fontSize: 20 }}>{r + 1}</span>
        </Cell>
      ))}
      {/* 罫線 */}
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={1864} height={888}>
        {new Array(9).fill(0).map((_, r) => (
          <line key={`r${r}`} x1={GRID_X} x2={GRID_X + gridW} y1={GRID_Y + r * ROW_H} y2={GRID_Y + r * ROW_H} stroke={Z.hair} strokeWidth={1.5} />
        ))}
        {COLS.map((_, c) => (
          <line key={`c${c}`} x1={GRID_X + colX(c + 1)} x2={GRID_X + colX(c + 1)} y1={GRID_Y} y2={GRID_Y + 8 * ROW_H} stroke={Z.hair} strokeWidth={1.5} />
        ))}
      </svg>

      {/* 見出し行 */}
      {["月", "件数", "単価", "売上"].map((h, i) => (
        <Cell key={h} c={i + 1} r={0} align={i === 0 ? "left" : "right"} bold>
          {h}
        </Cell>
      ))}
      <Cell c={5} r={0} bold>
        {"前年比".slice(0, eHead)}
      </Cell>
      {MONTHS.map((m, i) => (
        <div key={m}>
          <Cell c={1} r={i + 1} align="left">
            {m}
          </Cell>
          <Cell c={2} r={i + 1}>
            {COUNTS[i]}
          </Cell>
          <Cell c={3} r={i + 1}>
            {`¥${yen(PRICE)}`}
          </Cell>
          <Cell c={4} r={i + 1}>
            {i === 0 && !entered ? <span style={{ fontFamily: font.mono, fontSize: 28 }}>{FORMULA.slice(0, fTyped)}</span> : filled(i) ? yen(SALES[i]) : ""}
          </Cell>
          <Cell c={5} r={i + 1}>
            <span style={{ color: Z.ok }}>{YOY[i].slice(0, eTyped[i])}</span>
          </Cell>
        </div>
      ))}
      <Cell c={1} r={7} align="left" bold>
        合計
      </Cell>
      <Cell c={4} r={7} bold>
        {t >= TOTAL_AT ? yen(TOTAL) : ""}
      </Cell>

      {/* 数式が参照しているセル */}
      {refs
        ? [2, 3].map((c, k) => (
            <div
              key={c}
              style={{
                position: "absolute",
                left: GRID_X + colX(c),
                top: GRID_Y + ROW_H,
                width: COLS[c].w,
                height: ROW_H,
                boxSizing: "border-box",
                border: `3px dashed ${k === 0 ? "#BF5AF2" : "#FF9F0A"}`,
              }}
            />
          ))
        : null}
      {/* 選択枠（下へ引くと伸びる） */}
      <div
        style={{
          position: "absolute",
          left: GRID_X + colX(sel.c) - 2,
          top: GRID_Y + sel.r0 * ROW_H - 2,
          width: COLS[sel.c].w + 4,
          height: (sel.r1 - sel.r0 + 1) * ROW_H + 4,
          boxSizing: "border-box",
          border: `4px solid ${Z.blue}`,
          backgroundColor: sel.r1 > sel.r0 ? "rgba(10,132,255,0.12)" : undefined,
        }}
      >
        <span style={{ position: "absolute", right: -9, bottom: -9, width: 14, height: 14, backgroundColor: Z.blue, border: `2px solid ${Z.surface}` }} />
      </div>

      {/* グラフ: 列が埋まると、棒が順に立ち上がる */}
      <div style={{ position: "absolute", left: CH.x, top: CH.y - 70, fontFamily: font.sans, fontWeight: 700, fontSize: 30, color: Z.text }}>月別の売上</div>
      <svg style={{ position: "absolute", left: CH.x, top: CH.y }} width={CH.w} height={CH.h + 50}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={0} x2={CH.w} y1={CH.h * (1 - g)} y2={CH.h * (1 - g)} stroke={Z.hair} strokeWidth={1.5} />
        ))}
        <line x1={0} x2={CH.w} y1={CH.h} y2={CH.h} stroke={Z.faint} strokeWidth={2} />
        {SALES.map((v, i) => {
          const p = interpolate(t, [BARS_FROM + i * 4, BARS_FROM + i * 4 + 16], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
          const bw = 62;
          const x = 22 + i * ((CH.w - 44) / 6) + ((CH.w - 44) / 6 - bw) / 2;
          const h = (v / max) * CH.h * p;
          return (
            <g key={i}>
              <rect x={x} y={CH.h - h} width={bw} height={Math.max(0, h)} rx={6} fill={i === 5 ? Z.blue : "rgba(10,132,255,0.55)"} />
              <text x={x + bw / 2} y={CH.h + 38} textAnchor="middle" fill={Z.dim} style={{ fontFamily: font.sans, fontSize: 24, fontWeight: 500 }}>
                {MONTHS[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </AppWindow>
  );
};
