import { color, font } from "../theme";
import { Icon } from "./icons";

// 「作業中の Mac の画面」。1920×1080 を、pt × SCREEN_SCALE で描いた macOS のデスクトップとして扱う。
// メニューバー（Quiet のステータス項目つき）＋ 提案書を書いている文書アプリ。パネルなどは children で重ねる。
// 文書アプリは実在のアプリに似せない汎用の見た目（白い用紙・左に目次・最小限のツールバー）

export const SCREEN_SCALE = 1.5; // 1pt = 1.5px。パネル 196pt → 294px
export const MENU_BAR_HEIGHT = 24 * SCREEN_SCALE;

// パネルの既定位置（右上。メニューバーの下に 16pt、右端から 16pt。ガラスの左上の座標）
export const PANEL_POS = {
  x: 1920 - (196 + 16) * SCREEN_SCALE,
  y: MENU_BAR_HEIGHT + 16 * SCREEN_SCALE,
};

// ---------------------------------------------------------------- メニューバー

export type StatusIcon = "dial" | "cup.and.saucer.fill" | "pause.fill";

export const MenuBar: React.FC<{ statusIcon?: StatusIcon; statusTitle?: string; clock?: string }> = ({
  statusIcon = "dial",
  statusTitle = "",
  clock = "10月2日(木) 14:32",
}) => {
  const k = SCREEN_SCALE;
  const item = { fontSize: 13 * k, fontWeight: 500, color: color.sumi } as const;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        height: MENU_BAR_HEIGHT,
        display: "flex",
        alignItems: "center",
        padding: `0 ${14 * k}px`,
        gap: 20 * k,
        fontFamily: font.sans,
        background: "rgba(250,251,252,0.72)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 0.5px 0 rgba(26,35,48,0.08)",
      }}
    >
      <span style={{ ...item, fontWeight: 700 }}>ドキュメント</span>
      {["ファイル", "編集", "表示", "挿入", "書式", "ウインドウ"].map((m) => (
        <span key={m} style={item}>
          {m}
        </span>
      ))}
      <div style={{ flex: 1 }} />
      {/* Quiet のステータス項目: ダイヤル＋" 12:34"（12pt mono） */}
      <span style={{ display: "flex", alignItems: "center", gap: 3 * k, color: color.sumi }}>
        <Icon name={statusIcon} size={16 * k} />
        {statusTitle ? (
          <span style={{ fontFamily: font.mono, fontSize: 12 * k, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
            {statusTitle}
          </span>
        ) : null}
      </span>
      <span style={{ ...item, fontVariantNumeric: "tabular-nums" }}>{clock}</span>
    </div>
  );
};

// ---------------------------------------------------------------- 文書（提案書）

// 冒頭モンタージュの「資料」（ZoneDoc）と同じ提案書。題名・見出し・数字を揃え、冒頭で切られた仕事の続きに見せる。1 要素 = 用紙の 1 行
export type DocLine =
  | { kind: "title" | "meta" | "h" | "p" | "li"; text: string }
  | { kind: "kpi"; cells: [string, string][] };

export const DOC_TITLE = "問い合わせ対応 改善のご提案";

export const DOC_LINES: DocLine[] = [
  { kind: "title", text: DOC_TITLE },
  { kind: "meta", text: "サポート部　2026年10月　下書き" },
  { kind: "h", text: "1. 背景" },
  { kind: "p", text: "問い合わせ対応に、毎月 120 時間かかっている。" },
  { kind: "p", text: "同じ質問への回答が、全体の 6 割を占めている。" },
  { kind: "h", text: "2. 提案" },
  { kind: "p", text: "よくある質問には、自動で一次回答を返す。" },
  { kind: "li", text: "・回答の文面を、質問ごとにひな形として用意する" },
  { kind: "li", text: "・担当者は、込み入った相談に集中する" },
  { kind: "h", text: "3. 期待効果" },
  { kind: "p", text: "対応時間を減らし、浮いた時間で新しい窓口を試す。" },
  {
    kind: "kpi",
    cells: [
      ["月の対応時間", "40時間"],
      ["待ち時間", "半分"],
      ["自動で返せる", "6割"],
    ],
  },
  { kind: "h", text: "4. 進め方" },
  { kind: "li", text: "・11月　一部の窓口で小さく始める" },
  { kind: "li", text: "・12月　月末の定例で効果を確かめる" },
  { kind: "li", text: "・1月　すべての窓口へ広げる" },
];

// 1 行の高さ（世界の px）。行の位置を外から求められるよう、レイアウトは固定値で組む
const LINE_HEIGHT: Record<DocLine["kind"], number> = {
  title: 64,
  meta: 44,
  h: 74,
  p: 42,
  li: 42,
  kpi: 140,
};

const lineChars = (line: DocLine) =>
  line.kind === "kpi" ? line.cells.reduce((n, [a, b]) => n + a.length + b.length, 0) : line.text.length;

// 改行も 1 文字として数える
const DOC_CHARS = DOC_LINES.reduce((n, line) => n + lineChars(line) + 1, 0);

/** i 行目の within（0..1）まで打ち終えたときの typed */
export const docTypedAt = (i: number, within = 0) => {
  let n = 0;
  for (let j = 0; j < i; j++) n += lineChars(DOC_LINES[j]) + 1;
  return (n + Math.round(lineChars(DOC_LINES[i]) * within)) / DOC_CHARS;
};

// エディタのウインドウ（世界座標）
export const EDITOR_RECT = { x: 60, y: MENU_BAR_HEIGHT + 30, w: 1380, h: 1080 - MENU_BAR_HEIGHT - 70 };
const TITLE_H = 28 * SCREEN_SCALE;
const TOOL_H = 30 * SCREEN_SCALE;
const SIDEBAR_W = 300;
// 用紙（エディタ内の座標）。本文の左端は世界の x 570（寄った構図でも左が切れない位置）
const SHEET = { x: 380, top: 24, w: 940, padX: 130, padTop: 52 };

/** 用紙が見える範囲の上端（ツールバーの下端。世界の y） */
export const DOC_VIEW_TOP = EDITOR_RECT.y + TITLE_H + TOOL_H;

/** i 行目の上端（世界の y、スクロール前） */
export const docLineTop = (i: number) => {
  let y = DOC_VIEW_TOP + SHEET.top + SHEET.padTop;
  for (let j = 0; j < i; j++) y += LINE_HEIGHT[DOC_LINES[j].kind];
  return y;
};

const Caret: React.FC<{ h: number }> = ({ h }) => (
  <span
    style={{
      display: "inline-block",
      width: 3,
      height: h,
      marginLeft: 2,
      verticalAlign: "middle",
      backgroundColor: color.sumi,
    }}
  />
);

const LineBody: React.FC<{ line: DocLine; chars: number; caret: boolean }> = ({ line, chars, caret }) => {
  if (line.kind === "kpi") {
    // 期待効果の数字。表の 1 行のように 3 つ並べる（打った文字数の分だけ、ラベル → 数字の順に出る）
    let off = 0;
    return (
      <div style={{ display: "flex", gap: 20, paddingTop: 14 }}>
        {line.cells.map(([label, value], i) => {
          const len = label.length + value.length;
          const own = Math.max(0, Math.min(len, chars - off));
          const l = label.slice(0, own);
          const v = value.slice(0, Math.max(0, own - label.length));
          const isLast = i === line.cells.length - 1;
          // 打ち終わりがこのセルの中（最後のセルなら末尾も含む）にあるときだけキャレットを置く
          const caretHere = caret && chars >= off && (chars < off + len || (isLast && chars === off + len));
          off += len;
          const started = l.length > 0;
          return (
            <div
              key={i}
              style={{
                width: 210,
                height: 108,
                boxSizing: "border-box",
                padding: "8px 0 0 18px",
                borderLeft: `4px solid ${started ? color.teal : "transparent"}`,
              }}
            >
              <div style={{ fontSize: 19, fontWeight: 500, lineHeight: "28px", color: "rgba(26,35,48,0.56)", whiteSpace: "pre" }}>
                {l}
                {caretHere && v.length === 0 ? <Caret h={24} /> : null}
              </div>
              <div
                style={{
                  fontSize: 52,
                  fontWeight: 700,
                  lineHeight: "64px",
                  color: color.tealText,
                  whiteSpace: "pre",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {v}
                {caretHere && v.length > 0 ? <Caret h={48} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  const text = line.text.slice(0, chars);
  const style: React.CSSProperties =
    line.kind === "title"
      ? { fontSize: 40, fontWeight: 700, lineHeight: "64px", color: color.sumi }
      : line.kind === "meta"
        ? { fontSize: 19, fontWeight: 500, lineHeight: "44px", color: "rgba(26,35,48,0.5)" }
        : line.kind === "h"
          ? { fontSize: 29, fontWeight: 700, lineHeight: "52px", paddingTop: 22, color: color.sumi }
          : { fontSize: 22, fontWeight: 500, lineHeight: "42px", color: "rgba(26,35,48,0.82)" };
  const caretH = line.kind === "title" ? 44 : line.kind === "h" ? 34 : 26;
  return (
    <div style={{ ...style, whiteSpace: "pre" }}>
      {text}
      {caret ? <Caret h={caretH} /> : null}
    </div>
  );
};

export const Editor: React.FC<{
  /** 0..1。文書がどこまでタイプされているか（1 = 全部） */
  typed?: number;
  /** 行ハイライトする行の番号（-1 で無し） */
  activeLine?: number;
  /** 用紙のスクロール量（世界の px。下へ書き進めたときに上へ送る） */
  scroll?: number;
}> = ({ typed = 1, activeLine = -1, scroll = 0 }) => {
  const k = SCREEN_SCALE;
  let budget = Math.floor(typed * DOC_CHARS);
  let caretPlaced = typed >= 1;
  let caretLine = DOC_LINES.length - 1;
  const rows = DOC_LINES.map((line, i) => {
    const n = lineChars(line);
    const chars = Math.max(0, Math.min(n, budget));
    budget -= chars;
    // 文字数を使い切った行にだけキャレットを置く
    const caret = !caretPlaced && budget <= 0;
    if (caret) {
      caretPlaced = true;
      caretLine = i;
    }
    budget -= 1;
    return { line, chars, caret };
  });
  // 目次は、いま書いている節を示す
  const headings = DOC_LINES.map((l, i) => [l, i] as const).filter(([l]) => l.kind === "h");
  const currentSection = [...headings].reverse().find(([, i]) => i <= caretLine)?.[1] ?? -1;

  return (
    <div
      style={{
        position: "absolute",
        left: EDITOR_RECT.x,
        top: EDITOR_RECT.y,
        width: EDITOR_RECT.w,
        height: EDITOR_RECT.h,
        borderRadius: 10 * k,
        overflow: "hidden",
        backgroundColor: color.usugumo,
        boxShadow: "0 30px 80px rgba(26,35,48,0.18), 0 0 0 0.5px rgba(26,35,48,0.14)",
        fontFamily: font.sans,
      }}
    >
      {/* タイトルバー */}
      <div
        style={{
          height: TITLE_H,
          display: "flex",
          alignItems: "center",
          padding: `0 ${10 * k}px`,
          gap: 8 * k,
          backgroundColor: color.washi,
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span key={c} style={{ width: 12 * k, height: 12 * k, borderRadius: "50%", backgroundColor: c }} />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 12 * k,
            fontWeight: 500,
            color: "rgba(26,35,48,0.6)",
            marginRight: 50 * k,
          }}
        >
          {DOC_TITLE} — ドキュメント
        </span>
      </div>
      {/* ツールバー（段落スタイル・太字/斜体/下線・挿入）。汎用の最小限 */}
      <div
        style={{
          height: TOOL_H,
          display: "flex",
          alignItems: "center",
          gap: 12 * k,
          padding: `0 ${14 * k}px`,
          backgroundColor: color.washi,
          borderBottom: `1px solid ${color.line}`,
          fontSize: 12 * k,
          fontWeight: 500,
          color: "rgba(26,35,48,0.62)",
        }}
      >
        <span
          style={{
            padding: `${2 * k}px ${10 * k}px`,
            borderRadius: 5 * k,
            boxShadow: `0 0 0 1px ${color.line}`,
            backgroundColor: "#fff",
          }}
        >
          本文　▾
        </span>
        <span style={{ width: 1, height: 16 * k, backgroundColor: color.line }} />
        <span style={{ fontWeight: 700, color: color.sumi }}>B</span>
        <span style={{ fontStyle: "italic", color: color.sumi }}>I</span>
        <span style={{ textDecoration: "underline", color: color.sumi }}>U</span>
        <span style={{ width: 1, height: 16 * k, backgroundColor: color.line }} />
        <span>箇条書き</span>
        <span>表</span>
        <span>画像</span>
        <span>コメント</span>
      </div>
      <div style={{ position: "relative", height: EDITOR_RECT.h - TITLE_H - TOOL_H, overflow: "hidden" }}>
        {/* 左の目次 */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: SIDEBAR_W,
            boxSizing: "border-box",
            padding: "34px 0 0 30px",
            backgroundColor: color.washi,
            borderRight: `1px solid ${color.line}`,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, color: "rgba(26,35,48,0.45)", letterSpacing: "0.08em" }}>目次</div>
          {headings.map(([l, i]) => {
            const on = i === currentSection;
            return (
              <div
                key={i}
                style={{
                  marginTop: 14,
                  marginLeft: -30,
                  paddingLeft: 26,
                  borderLeft: `4px solid ${on ? color.teal : "transparent"}`,
                  fontSize: 21,
                  fontWeight: on ? 700 : 500,
                  lineHeight: "34px",
                  color: on ? color.tealText : "rgba(26,35,48,0.7)",
                }}
              >
                {l.kind === "kpi" ? "" : l.text}
              </div>
            );
          })}
        </div>
        {/* 用紙（スクロールで上へ送る） */}
        <div
          style={{
            position: "absolute",
            left: SHEET.x,
            top: SHEET.top - scroll,
            width: SHEET.w,
            minHeight: 1400,
            boxSizing: "border-box",
            padding: `${SHEET.padTop}px ${SHEET.padX}px`,
            backgroundColor: "#fff",
            boxShadow: "0 1px 3px rgba(26,35,48,0.08), 0 0 0 1px rgba(26,35,48,0.05)",
          }}
        >
          {rows.map(({ line, chars, caret }, i) => (
            <div
              key={i}
              style={{
                height: LINE_HEIGHT[line.kind],
                marginLeft: -12,
                paddingLeft: 12,
                backgroundColor: i === activeLine ? "rgba(0,135,168,0.06)" : undefined,
              }}
            >
              <LineBody line={line} chars={chars} caret={caret} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- コード（冒頭のコードのカット用）

type Tok = [string, keyof typeof syntax];
const syntax = {
  k: color.tealText, // キーワード
  t: "#6B4FA0", // 型
  s: "#8A5A00", // 文字列
  c: "rgba(26,35,48,0.42)", // コメント
  f: color.sumi, // 関数名
  p: "rgba(26,35,48,0.78)", // その他
};

// 冒頭（ZoneScreen）が夜のエディタで書く Go。後半の作業画面では使わない
export const GO_CODE: Tok[][] = [
  [["package", "k"], [" main", "p"]],
  [],
  [["import", "k"], [" (", "p"]],
  [['\t"encoding/json"', "s"]],
  [['\t"net/http"', "s"]],
  [['\t"time"', "s"]],
  [[")", "p"]],
  [],
  [["// Session は、いま進んでいる作業だけを持つ（履歴は持たない）", "c"]],
  [["type", "k"], [" Session ", "t"], ["struct", "k"], [" {", "p"]],
  [["\tStartedAt ", "p"], ["time.Time", "t"], [' `json:"startedAt"`', "s"]],
  [["\tElapsed   ", "p"], ["time.Duration", "t"], [' `json:"elapsed"`', "s"]],
  [["}", "p"]],
  [],
  [["func", "k"], [" handleSession", "f"], ["(w ", "p"], ["http.ResponseWriter", "t"], [", r *", "p"], ["http.Request", "t"], [") {", "p"]],
  [["\ts := ", "p"], ["Session", "t"], ["{StartedAt: start, Elapsed: time.Since(start)}", "p"]],
  [["\tw.Header().Set(", "p"], ['"Content-Type"', "s"], [", ", "p"], ['"application/json"', "s"], [")", "p"]],
  [["\tif", "k"], [" err := json.NewEncoder(w).Encode(s); err != ", "p"], ["nil", "k"], [" {", "p"]],
  [["\t\thttp.Error(w, err.Error(), http.StatusInternalServerError)", "p"]],
  [["\t}", "p"]],
  [["}", "p"]],
];

// ---------------------------------------------------------------- 壁紙とデスクトップ

export const Wallpaper: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "radial-gradient(120% 90% at 85% 0%, #DCEBF0 0%, rgba(220,235,240,0) 60%), radial-gradient(90% 80% at 0% 100%, #E6E9EF 0%, rgba(230,233,239,0) 70%), #F3F5F8",
    }}
  />
);

export const Desktop: React.FC<{
  statusIcon?: StatusIcon;
  statusTitle?: string;
  /** メニューバー右端の時計（"10月2日(木) 14:32"）。早回しするシーンでは経過に合わせて進める */
  clock?: string;
  typed?: number;
  activeLine?: number;
  children?: React.ReactNode;
}> = ({ statusIcon, statusTitle, clock, typed, activeLine, children }) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <Wallpaper />
    <Editor typed={typed} activeLine={activeLine} />
    {children}
    <MenuBar statusIcon={statusIcon} statusTitle={statusTitle} clock={clock} />
  </div>
);

// ---------------------------------------------------------------- カーソル

/** macOS の矢印カーソル。(x, y) が先端 */
export const Cursor: React.FC<{ x: number; y: number; opacity?: number; scale?: number }> = ({
  x,
  y,
  opacity = 1,
  scale = SCREEN_SCALE,
}) => (
  <svg
    width={17 * scale}
    height={25 * scale}
    viewBox="0 0 17 25"
    style={{ position: "absolute", left: x - 1 * scale, top: y - 1 * scale, opacity, overflow: "visible" }}
  >
    <path
      d="M1 1v20.5l5-4.8 3.3 7.4 3.4-1.5-3.3-7.2h6.8z"
      fill="#000"
      stroke="#fff"
      strokeWidth={1.4}
      strokeLinejoin="round"
      style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))" }}
    />
  </svg>
);
