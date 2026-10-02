import { color, font } from "../theme";
import { Icon } from "./icons";

// 「作業中の Mac の画面」。1920×1080 を、pt × SCREEN_SCALE で描いた macOS のデスクトップとして扱う。
// メニューバー（Quiet のステータス項目つき）＋ Go のコードが並ぶエディタ。パネルなどは children で重ねる。

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
      <span style={{ ...item, fontWeight: 700 }}>Code</span>
      {["ファイル", "編集", "選択", "表示", "移動", "実行"].map((m) => (
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

// ---------------------------------------------------------------- エディタ

type Tok = [string, keyof typeof syntax];
const syntax = {
  k: color.tealText, // キーワード
  t: "#6B4FA0", // 型
  s: "#8A5A00", // 文字列
  c: "rgba(26,35,48,0.42)", // コメント
  f: color.sumi, // 関数名
  p: "rgba(26,35,48,0.78)", // その他
};

// いむたろが書いていそうな Go（HTTP ハンドラ）。色分け済みのトークン列
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

const CODE_CHARS = GO_CODE.reduce((n, line) => n + line.reduce((m, [t]) => m + t.length, 0) + 1, 0);

export const Editor: React.FC<{
  /** 0..1。コードがどこまでタイプされているか（1 = 全部） */
  typed?: number;
  /** 0..1 の行ハイライト位置（-1 で無し） */
  activeLine?: number;
}> = ({ typed = 1, activeLine = -1 }) => {
  const k = SCREEN_SCALE;
  let budget = Math.floor(typed * CODE_CHARS);
  let caretPlaced = typed >= 1;
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        top: MENU_BAR_HEIGHT + 30,
        width: 1380,
        height: 1080 - MENU_BAR_HEIGHT - 70,
        borderRadius: 10 * k,
        overflow: "hidden",
        backgroundColor: "#fff",
        boxShadow: "0 30px 80px rgba(26,35,48,0.18), 0 0 0 0.5px rgba(26,35,48,0.14)",
        fontFamily: font.mono,
      }}
    >
      {/* タイトルバー */}
      <div
        style={{
          height: 28 * k,
          display: "flex",
          alignItems: "center",
          padding: `0 ${10 * k}px`,
          gap: 8 * k,
          backgroundColor: color.usugumo,
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span key={c} style={{ width: 12 * k, height: 12 * k, borderRadius: "50%", backgroundColor: c }} />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: font.sans,
            fontSize: 12 * k,
            fontWeight: 500,
            color: "rgba(26,35,48,0.6)",
            marginRight: 50 * k,
          }}
        >
          main.go — session
        </span>
      </div>
      {/* 本文 */}
      <div style={{ padding: `${14 * k}px 0`, fontSize: 13 * k, lineHeight: `${21 * k}px` }}>
        {GO_CODE.map((line, i) => {
          const parts: React.ReactNode[] = [];
          for (const [text, kind] of line) {
            if (budget <= 0) break;
            const shown = text.slice(0, budget);
            budget -= shown.length;
            parts.push(
              <span key={parts.length} style={{ color: syntax[kind] }}>
                {shown.replace(/\t/g, "    ")}
              </span>,
            );
          }
          // 文字数を使い切った行にだけキャレットを置く
          const caret = !caretPlaced && budget <= 0;
          if (caret) caretPlaced = true;
          budget -= 1;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                whiteSpace: "pre",
                backgroundColor: i === activeLine ? "rgba(0,135,168,0.06)" : undefined,
              }}
            >
              <span style={{ width: 52 * k, textAlign: "right", paddingRight: 18 * k, color: "rgba(26,35,48,0.28)" }}>
                {i + 1}
              </span>
              {parts}
              {caret ? <span style={{ width: 2 * k, backgroundColor: color.sumi }} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

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
