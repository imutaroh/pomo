import { Easing, interpolate } from "remotion";
import {
  docTypedAt,
  Editor,
  MENU_BAR_HEIGHT,
  MenuBar,
  PANEL_POS,
  SCREEN_SCALE,
  StatusIcon,
  Wallpaper,
} from "../components/Desktop";
import { Icon } from "../components/icons";
import { Panel, PanelProps } from "../components/Panel";
import { clamp, color, font } from "../theme";

// DesktopScene → Presence → Follow → FlowBreak は同じデスクトップの上でハードカットで繋がる。
// 境界フレームの見た目（カメラ・パネル・カーソル・文書・計測値）をここで一か所に決め、
// 各シーンは「自分の frame 0 = 前のシーンの最終フレーム」になるようにこの定数から始める。

// ---------------------------------------------------------------- 数字（嘘にしない）

export const FLOW_RATIO = 5; // Settings.flowRatio の既定値
export const FLOW_BASE = 25 * 60; // フローの進捗バーの基準（TimerEngine: worked / (25 * 60)）
export const WORKED_FINAL = 52 * 60 + 10; // 休憩チップを押す瞬間の集中
// 貯まる休憩は最低 1 分（TimerEngine: max(60, worked / flowRatio)。finishWork も同じ）
export const bankedBreak = (worked: number) =>
  Math.max(60, Math.floor(Math.floor(worked) / FLOW_RATIO));
export const BREAK_TOTAL = bankedBreak(WORKED_FINAL); // 626 秒 = 10:26

// TimerEngine.bankedBreakString は "%d:%02d"（分は 0 埋めしない）
export const chipString = (worked: number) => {
  const b = bankedBreak(worked);
  return `${Math.floor(b / 60)}:${String(b % 60).padStart(2, "0")}`;
};

// 休憩の残りは切り上げて表示する（TimerEngine の displaySeconds は rounded(.up)）。押した直後は 10:26 から
export const breakRemaining = (sinceBreak: number) =>
  Math.ceil(BREAK_TOTAL - Math.max(0, sinceBreak) / 30);

// メニューバーの時計: 14:05 に再生 → 押す時 14:57 → 休憩中も進む。タイマーの早回しと同じだけ進める
const CLOCK_AT_PLAY = 14 * 3600 + 5 * 60;
export const clockString = (sinceStart: number) => {
  const t = CLOCK_AT_PLAY + Math.max(0, sinceStart);
  return `10月2日(木) ${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}`;
};

// 区間ごとに速さを変えた経過秒。[frame, seconds] の折れ線（ホバー中は実時間 1秒/30f、溶けている間は早回し）
export const workedAt = (
  frame: number,
  keys: [number, number][],
  easing?: (t: number) => number,
) =>
  interpolate(
    frame,
    keys.map((k) => k[0]),
    keys.map((k) => k[1]),
    { ...clamp, easing },
  );

// シーン境界での経過。Presence の最終フレーム = Follow の frame 0 で 9:00、
// Follow の最終フレーム = FlowBreak の frame 0 で 20:00（その先で 25:00 を越え、52:10 で押す）
export const WORKED_PRESENCE_END = 9 * 60;
export const WORKED_FOLLOW_END = 20 * 60;

// ---------------------------------------------------------------- カメラ

// 画面座標 = 世界座標 × s + (tx, ty)。世界 = 1920×1080 のデスクトップ。
// tx ∈ [1920(1-s), 0] を守れば壁紙の外は映らない。制約が s と tx に線形なので、
// 同じ進み具合で補間する限り途中の状態もはみ出さない
export type Cam = { s: number; tx: number; ty: number };
export const camTopRight = (s: number): Cam => ({
  s,
  tx: 1920 * (1 - s),
  ty: 0,
});
export const camTopCenter = (s: number): Cam => ({
  s,
  tx: 960 * (1 - s),
  ty: 0,
});
export const CAM_WIDE: Cam = { s: 1, tx: 0, ty: 0 };
// パネルに寄った構図（DesktopScene の終わり〜Presence 全体〜FlowBreak の始まり）
export const CAM_NEAR = camTopRight(1.22);
// Follow で画面ごと切り替わるのを見せる構図。全景まで引くとパネルが小さくなりすぎるので、
// 画面の 8 割弱が映るところで止める（Follow の終わり = FlowBreak の始まり）
export const CAM_FOLLOW = camTopRight(1.28);

export const lerpCam = (a: Cam, b: Cam, t: number): Cam => ({
  s: a.s + (b.s - a.s) * t,
  tx: a.tx + (b.tx - a.tx) * t,
  ty: a.ty + (b.ty - a.ty) * t,
});

export const Camera: React.FC<{ cam: Cam; children: React.ReactNode }> = ({
  cam,
  children,
}) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      transformOrigin: "0 0",
      transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`,
    }}
  >
    {children}
  </div>
);

// ゆっくり寄る・引く（速すぎず、止まり際だけ柔らかく）
export const camEase = Easing.bezier(0.45, 0, 0.2, 1);

// ---------------------------------------------------------------- パネル

// パネル内の pt 座標 → 世界座標
export const panelPoint = (px: number, py: number) => ({
  x: PANEL_POS.x + px * SCREEN_SCALE,
  y: PANEL_POS.y + py * SCREEN_SCALE,
});

// PanelView のレイアウトから求めた押せる場所（pt）。still で位置を確認済み
export const PLAY_BUTTON = panelPoint(98, 162);
// 休憩チップはカップと「休憩」のあたりを押す（数字「+10:26」をポインタで隠さない）
export const BREAK_CHIP = panelPoint(66, 123);
// ホバーしたまま数字を隠さない置き場所（パネル右下の余白）
export const PANEL_REST = panelPoint(184, 178);

export const DesktopPanel: React.FC<PanelProps & { y?: number }> = ({
  y = 0,
  ...props
}) => (
  <div
    style={{
      position: "absolute",
      left: PANEL_POS.x,
      top: PANEL_POS.y + y,
      scale: String(SCREEN_SCALE),
      transformOrigin: "top left",
    }}
  >
    <Panel {...props} />
  </div>
);

// PanelView の .animation(.easeOut(duration: Tokens.fadeDuration = 0.45)) ≒ 14 フレーム
const FADE = 14;
const swiftEaseOut = Easing.bezier(0, 0, 0.58, 1);

/** ホバーの出入り（[frame, 0|1] の切り替え）を 0.45 秒 easeOut でなめらかにした値 */
export const hoverAt = (
  frame: number,
  events: [number, number][],
  initial = 0,
) => {
  let from = initial;
  let target = initial;
  let start: number | null = null;
  const progress = (f: number) =>
    start === null
      ? 1
      : interpolate(f, [start, start + FADE], [0, 1], {
          ...clamp,
          easing: swiftEaseOut,
        });
  for (const [t, v] of events) {
    if (frame < t) break;
    // 切り替えの瞬間の値から次の目標へ向かう（途中で切り替わっても跳ねない）
    from = from + (target - from) * progress(t);
    target = v;
    start = t;
  }
  return from + (target - from) * progress(frame);
};

// 実行中の不透明度: focusOpacity（既定 0.3）⇄ ホバーで 1.0
export const FOCUS_OPACITY = 0.3;
export const runningOpacity = (hover: number) =>
  FOCUS_OPACITY + (1 - FOCUS_OPACITY) * hover;

// ---------------------------------------------------------------- カーソル

/** [frame, x, y] の通過点を、点と点の間だけ ease で動く道のりにする */
export const cursorAt = (frame: number, path: [number, number, number][]) => {
  if (frame <= path[0][0]) return { x: path[0][1], y: path[0][2] };
  for (let i = 1; i < path.length; i++) {
    const [t0, x0, y0] = path[i - 1];
    const [t1, x1, y1] = path[i];
    if (frame <= t1) {
      if (x0 === x1 && y0 === y1) return { x: x0, y: y0 };
      const p = interpolate(frame, [t0, t1], [0, 1], {
        ...clamp,
        easing: Easing.inOut(Easing.cubic),
      });
      return { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * p };
    }
  }
  const last = path[path.length - 1];
  return { x: last[1], y: last[2] };
};

// 文書でタイプ中の置き場所（macOS はタイプ中にポインタを隠すので、ここでは見えない）
export const CURSOR_EDITOR = { x: 1120, y: 600 };

// パネル（ガラス 196pt 四方）の世界座標での一辺と矩形
export const PANEL_SIZE_WORLD = 196 * SCREEN_SCALE;
const PANEL_RECT = {
  x0: PANEL_POS.x,
  y0: PANEL_POS.y,
  x1: PANEL_POS.x + PANEL_SIZE_WORLD,
  y1: PANEL_POS.y + PANEL_SIZE_WORLD,
};

/** カーソルの道のりから、先端がパネルの縁を越えるフレーム（[frame, 1=入る / 0=出る]）を求める */
export const hoverEventsFor = (
  path: [number, number, number][],
): [number, number][] => {
  const events: [number, number][] = [];
  let inside = false;
  for (let f = path[0][0]; f <= path[path.length - 1][0]; f++) {
    const p = cursorAt(f, path);
    const now =
      p.x >= PANEL_RECT.x0 &&
      p.x <= PANEL_RECT.x1 &&
      p.y >= PANEL_RECT.y0 &&
      p.y <= PANEL_RECT.y1;
    if (now !== inside) events.push([f, now ? 1 : 0]);
    inside = now;
  }
  return events;
};

// ---------------------------------------------------------------- 文書（提案書）の進み具合

// DOC_LINES の行番号で決める。DesktopScene は「1. 背景」の途中から「2. 提案」の見出しまで、
// Presence は「2. 提案」を書き上げる（溶けている間に進む）。Follow は手を止めて参考資料を読み、
// FlowBreak で冒頭（ZoneDoc）で切られた「3. 期待効果」の続きを書き上げる
export const TYPED_DESKTOP: [number, number] = [docTypedAt(3, 0.2), docTypedAt(6, 0)];
export const TYPED_PRESENCE_MID = docTypedAt(7, 0.4);
export const TYPED_PRESENCE_END = docTypedAt(9, 0);

// ---------------------------------------------------------------- 作業中のデスクトップ

// 参考資料（先月の問い合わせの分析）を開いたブラウザ。Presence までは隠してある（⌘H）ので画面に出ない。
// Follow の ⌘Tab で前に出ると、パネルの真下にブラウザの本文（右の目次）が入ってくる。
// 文書へ戻ったあとは、文書の後ろで右端（目次）がのぞいたまま残る。後ろに回ったときはアドレス欄を描かない
// （ツールバーの上端だけが文書の上にのぞき、文字が横に半分切れて描画の崩れに見えるため）。
// 実在のサイトやブラウザのロゴ・固有の UI は描かない（汎用のウインドウ枠＋アドレス欄だけ）
export const BROWSER_RECT = { x: 700, y: MENU_BAR_HEIGHT + 8, w: 1210, h: 996 };
export type BrowserState = "hidden" | "back" | "front";

const REPORT_INDEX = ["概要", "集計の方法", "件数の推移", "質問の内訳", "課題", "まとめ"];
const REPORT_ACTIVE = "質問の内訳";
// 問い合わせの内訳（%）。上位 4 つで 6 割になり、提案書の「1. 背景」の根拠として読んでいる
export const REPORT_BARS: [string, number][] = [
  ["パスワード再設定", 24],
  ["請求書の再発行", 18],
  ["配送状況の確認", 12],
  ["解約の手続き", 8],
];

export const BrowserWindow: React.FC<{ state?: BrowserState }> = ({ state = "front" }) => {
  const k = SCREEN_SCALE;
  const text = {
    fontFamily: font.sans,
    fontSize: 23,
    fontWeight: 500,
    lineHeight: 1.7,
    color: "rgba(26,35,48,0.78)",
  } as const;
  const h2 = {
    marginTop: 34,
    fontFamily: font.sans,
    fontSize: 30,
    fontWeight: 700,
    color: color.sumi,
  } as const;
  return (
    <div
      style={{
        position: "absolute",
        left: BROWSER_RECT.x,
        top: BROWSER_RECT.y,
        width: BROWSER_RECT.w,
        height: BROWSER_RECT.h,
        borderRadius: 10 * k,
        overflow: "hidden",
        backgroundColor: "#fff",
        boxShadow:
          "0 30px 80px rgba(26,35,48,0.18), 0 0 0 0.5px rgba(26,35,48,0.14)",
      }}
    >
      {/* ツールバー（信号機・戻る/進む・アドレス欄） */}
      <div
        style={{
          height: 38 * k,
          display: "flex",
          alignItems: "center",
          gap: 8 * k,
          padding: `0 ${12 * k}px`,
          backgroundColor: color.usugumo,
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span
            key={c}
            style={{
              width: 12 * k,
              height: 12 * k,
              borderRadius: "50%",
              backgroundColor: c,
            }}
          />
        ))}
        <span
          style={{
            marginLeft: 14 * k,
            fontFamily: font.sans,
            fontSize: 15 * k,
            color: "rgba(26,35,48,0.35)",
          }}
        >
          ‹ ›
        </span>
        {state === "back" ? null : (
          <div
            style={{
              marginLeft: 40 * k,
              width: 300 * k,
              height: 24 * k,
              borderRadius: 7 * k,
              backgroundColor: "#fff",
              boxShadow: `0 0 0 1px ${color.line}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.sans,
              fontSize: 12 * k,
              fontWeight: 500,
              color: "rgba(26,35,48,0.6)",
            }}
          >
            参考資料 — 問い合わせ分析
          </div>
        )}
      </div>
      <div style={{ display: "flex" }}>
        {/* 本文（分析レポートの 1 ページ） */}
        <div style={{ flex: 1, minWidth: 0, padding: "40px 56px" }}>
          <div
            style={{
              fontFamily: font.sans,
              fontSize: 22,
              fontWeight: 700,
              color: color.tealText,
              letterSpacing: "0.06em",
            }}
          >
            問い合わせ分析　9月
          </div>
          <div
            style={{
              marginTop: 8,
              fontFamily: font.sans,
              fontSize: 42,
              fontWeight: 700,
              lineHeight: 1.35,
              color: color.sumi,
            }}
          >
            問い合わせの中身
          </div>
          <div style={{ ...text, marginTop: 18 }}>
            先月の問い合わせ 3,400 件を分類した。対応にかかった
            <br />
            時間は、月に 120 時間。
          </div>
          <div style={h2}>質問の内訳</div>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            {REPORT_BARS.map(([label, pct]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ ...text, width: 210, flexShrink: 0, lineHeight: 1.3 }}>{label}</div>
                {/* 棒は短めに。Follow の ⌘Tab の注釈（パネルの下に右揃えで出る）と重ならず、
                    文書の後ろに回ったときは数字まで文書の陰（x 1440 より左）に隠れる長さ */}
                <div
                  style={{
                    width: pct * 8,
                    height: 26,
                    borderRadius: 4,
                    backgroundColor: color.teal,
                    opacity: 0.35 + pct / 40,
                  }}
                />
                <div style={{ ...text, fontFamily: font.mono, lineHeight: 1.3, color: color.sumi }}>
                  {pct}%
                </div>
              </div>
            ))}
          </div>
          <div style={h2}>課題</div>
          <div style={{ ...text, marginTop: 12 }}>
            上の 4 つだけで、全体の 6 割を占めている。
            <br />
            回答は、担当者がそのつど一から書いている。
          </div>
        </div>
        {/* 右の目次。前に出たとき、目次欄の白い地がパネルの真下に来る。
            文字まで真下に置くと 30% の数字と混ざって読めないので、書き出しはパネルの下端より下から */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            alignSelf: "stretch",
            minHeight: BROWSER_RECT.h - 38 * k,
            padding: `${PANEL_POS.y + PANEL_SIZE_WORLD + 64 - (BROWSER_RECT.y + 38 * k)}px 32px 40px`,
            boxSizing: "border-box",
            borderLeft: `1px solid ${color.line}`,
            fontFamily: font.sans,
            fontSize: 22,
            fontWeight: 500,
            lineHeight: 2,
            color: "rgba(26,35,48,0.72)",
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: color.sumi,
              marginBottom: 8,
            }}
          >
            目次
          </div>
          {REPORT_INDEX.map((t) => (
            <div
              key={t}
              style={{
                color: t === REPORT_ACTIVE ? color.tealText : undefined,
                fontWeight: t === REPORT_ACTIVE ? 700 : 500,
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** 作業中のデスクトップ。Desktop（共有部品）と同じ重なり順に、文書の後ろのブラウザを足したもの */
export const WorkDesktop: React.FC<{
  statusIcon?: StatusIcon;
  statusTitle?: string;
  clock?: string;
  typed?: number;
  /** 文書のスクロール量（世界の px） */
  scroll?: number;
  /** ブラウザの状態。前面ならメニューバーもブラウザのものになる */
  browser?: BrowserState;
  children?: React.ReactNode;
}> = ({ statusIcon, statusTitle, clock, typed, scroll, browser = "hidden", children }) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <Wallpaper />
    {browser === "back" ? <BrowserWindow state="back" /> : null}
    <Editor typed={typed} scroll={scroll} />
    {browser === "front" ? <BrowserWindow /> : null}
    {children}
    {browser !== "front" ? (
      <MenuBar
        statusIcon={statusIcon}
        statusTitle={statusTitle}
        clock={clock}
      />
    ) : (
      <AppMenuBar
        statusIcon={statusIcon}
        statusTitle={statusTitle}
        clock={clock}
      />
    )}
  </div>
);

// ブラウザが前面のときのメニューバー。共有の MenuBar はアプリ名とメニューが文書アプリ固定なので、
// 見た目（寸法・色・ステータス項目・時計）を揃えたまま項目だけ差し替えて描く
type AppMenu = { name: string; items: string[] };
const BROWSER_MENU: AppMenu = {
  name: "ブラウザ",
  items: ["ファイル", "編集", "表示", "履歴", "ブックマーク", "ウインドウ"],
};

const AppMenuBar: React.FC<{
  app?: AppMenu;
  statusIcon?: StatusIcon;
  statusTitle?: string;
  clock?: string;
}> = ({ app = BROWSER_MENU, statusIcon = "dial", statusTitle = "", clock = "" }) => {
  const k = SCREEN_SCALE;
  const item = {
    fontSize: 13 * k,
    fontWeight: 500,
    color: color.sumi,
  } as const;
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
      <span style={{ ...item, fontWeight: 700 }}>{app.name}</span>
      {app.items.map((m) => (
        <span key={m} style={item}>
          {m}
        </span>
      ))}
      <div style={{ flex: 1 }} />
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3 * k,
          color: color.sumi,
        }}
      >
        <Icon name={statusIcon} size={16 * k} />
        {statusTitle ? (
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 12 * k,
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {statusTitle}
          </span>
        ) : null}
      </span>
      <span style={{ ...item, fontVariantNumeric: "tabular-nums" }}>
        {clock}
      </span>
    </div>
  );
};
