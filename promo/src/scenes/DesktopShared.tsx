import { Easing, interpolate } from "remotion";
import { PANEL_POS, SCREEN_SCALE } from "../components/Desktop";
import { Panel, PanelProps } from "../components/Panel";
import { clamp } from "../theme";

// DesktopScene → Presence → FlowBreak は同じデスクトップの上でハードカットで繋がる。
// 境界フレームの見た目（カメラ・パネル・カーソル・エディタ・計測値）をここで一か所に決め、
// 各シーンは「自分の frame 0 = 前のシーンの最終フレーム」になるようにこの定数から始める。

// ---------------------------------------------------------------- 数字（嘘にしない）

export const FLOW_RATIO = 5; // Settings.flowRatio の既定値
export const FLOW_BASE = 25 * 60; // フローの進捗バーの基準（TimerEngine: worked / (25 * 60)）
export const WORKED_FINAL = 52 * 60 + 10; // 休憩チップを押す瞬間の集中
// 貯まる休憩は最低 1 分（TimerEngine: max(60, worked / flowRatio)。finishWork も同じ）
export const bankedBreak = (worked: number) => Math.max(60, Math.floor(Math.floor(worked) / FLOW_RATIO));
export const BREAK_TOTAL = bankedBreak(WORKED_FINAL); // 626 秒 = 10:26

// TimerEngine.bankedBreakString は "%d:%02d"（分は 0 埋めしない）
export const chipString = (worked: number) => {
  const b = bankedBreak(worked);
  return `${Math.floor(b / 60)}:${String(b % 60).padStart(2, "0")}`;
};

// 休憩の残りは切り上げて表示する（TimerEngine の displaySeconds は rounded(.up)）。押した直後は 10:26 から
export const breakRemaining = (sinceBreak: number) => Math.ceil(BREAK_TOTAL - Math.max(0, sinceBreak) / 30);

// メニューバーの時計: 14:05 に再生 → 押す時 14:57 → 休憩中も進む。タイマーの早回しと同じだけ進める
const CLOCK_AT_PLAY = 14 * 3600 + 5 * 60;
export const clockString = (sinceStart: number) => {
  const t = CLOCK_AT_PLAY + Math.max(0, sinceStart);
  return `10月2日(木) ${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}`;
};

// 区間ごとに速さを変えた経過秒。[frame, seconds] の折れ線（ホバー中は実時間 1秒/30f、溶けている間は早回し）
export const workedAt = (frame: number, keys: [number, number][], easing?: (t: number) => number) =>
  interpolate(
    frame,
    keys.map((k) => k[0]),
    keys.map((k) => k[1]),
    { ...clamp, easing },
  );

// Presence と FlowBreak の境界値。Presence の最終フレームで 16:00、FlowBreak の frame 0 も 16:00
export const WORKED_AT_CUT = 16 * 60;

// ---------------------------------------------------------------- カメラ

// 画面座標 = 世界座標 × s + (tx, ty)。世界 = 1920×1080 のデスクトップ。
// tx ∈ [1920(1-s), 0] を守れば壁紙の外は映らない。制約が s と tx に線形なので、
// 同じ進み具合で補間する限り途中の状態もはみ出さない
export type Cam = { s: number; tx: number; ty: number };
export const camTopRight = (s: number): Cam => ({ s, tx: 1920 * (1 - s), ty: 0 });
export const camTopCenter = (s: number): Cam => ({ s, tx: 960 * (1 - s), ty: 0 });
export const CAM_WIDE: Cam = { s: 1, tx: 0, ty: 0 };
// パネルに寄った構図（DesktopScene の終わり〜Presence 全体〜FlowBreak の始まり）
export const CAM_NEAR = camTopRight(1.22);

export const lerpCam = (a: Cam, b: Cam, t: number): Cam => ({
  s: a.s + (b.s - a.s) * t,
  tx: a.tx + (b.tx - a.tx) * t,
  ty: a.ty + (b.ty - a.ty) * t,
});

export const Camera: React.FC<{ cam: Cam; children: React.ReactNode }> = ({ cam, children }) => (
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

export const DesktopPanel: React.FC<PanelProps & { y?: number }> = ({ y = 0, ...props }) => (
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
export const hoverAt = (frame: number, events: [number, number][], initial = 0) => {
  let from = initial;
  let target = initial;
  let start: number | null = null;
  const progress = (f: number) =>
    start === null ? 1 : interpolate(f, [start, start + FADE], [0, 1], { ...clamp, easing: swiftEaseOut });
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
export const runningOpacity = (hover: number) => FOCUS_OPACITY + (1 - FOCUS_OPACITY) * hover;

// ---------------------------------------------------------------- カーソル

/** [frame, x, y] の通過点を、点と点の間だけ ease で動く道のりにする */
export const cursorAt = (frame: number, path: [number, number, number][]) => {
  if (frame <= path[0][0]) return { x: path[0][1], y: path[0][2] };
  for (let i = 1; i < path.length; i++) {
    const [t0, x0, y0] = path[i - 1];
    const [t1, x1, y1] = path[i];
    if (frame <= t1) {
      if (x0 === x1 && y0 === y1) return { x: x0, y: y0 };
      const p = interpolate(frame, [t0, t1], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
      return { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * p };
    }
  }
  const last = path[path.length - 1];
  return { x: last[1], y: last[2] };
};

// エディタでタイプ中の置き場所（macOS はタイプ中にポインタを隠すので、ここでは見えない）
export const CURSOR_EDITOR = { x: 1120, y: 600 };

// ---------------------------------------------------------------- エディタ

// タイプの進み具合。DesktopScene 0.30→0.50、Presence 0.50→0.74、FlowBreak 0.74→0.95
export const TYPED_DESKTOP: [number, number] = [0.3, 0.5];
export const TYPED_PRESENCE_END = 0.74;
