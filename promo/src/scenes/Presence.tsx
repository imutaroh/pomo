import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { Cursor } from "../components/Desktop";
import { clamp, color, font, formatTime } from "../theme";
import {
  CAM_NEAR,
  Camera,
  chipString,
  clockString,
  CURSOR_EDITOR,
  cursorAt,
  DesktopPanel,
  FLOW_BASE,
  hoverAt,
  hoverEventsFor,
  panelPoint,
  PLAY_BUTTON,
  runningOpacity,
  TYPED_DESKTOP,
  TYPED_PRESENCE_END,
  WORKED_PRESENCE_END,
  WorkDesktop,
  workedAt,
} from "./DesktopShared";

// 22–28秒: 存在感の3段階。待機のパネルを再生 → ポインタが離れると 30% に溶け込み、作業が進む
// → 手を乗せると 100% に戻って操作が顔を出す → 離れるとまた溶ける。
// 右の段階表（LP「存在感の3段階」）は、いまのパネルの状態と連動して光る。
// frame 0 = DesktopScene の最終フレーム、最終フレーム = Follow の frame 0（9:00・溶けた状態・ポインタ非表示）

// 待機は DesktopScene で十分見せたので、入ってすぐ再生する。ホバー開始（24）から押すまで armDelay（0.35 秒 = 11f）以上空ける
const PLAY = 40;
const REST = panelPoint(176, 126); // 2回目に手を乗せる場所（休憩チップの右の余白。数字を隠さない）
const CURSOR_PATH: [number, number, number][] = [
  [8, CURSOR_EDITOR.x, CURSOR_EDITOR.y],
  [32, PLAY_BUTTON.x, PLAY_BUTTON.y],
  [44, PLAY_BUTTON.x, PLAY_BUTTON.y],
  [64, CURSOR_EDITOR.x - 40, CURSOR_EDITOR.y + 20],
  [86, CURSOR_EDITOR.x - 40, CURSOR_EDITOR.y + 20],
  [108, REST.x, REST.y],
  [138, REST.x, REST.y],
  [160, CURSOR_EDITOR.x, CURSOR_EDITOR.y],
];
// ホバーの出入り = ポインタがパネルの縁を越えるフレーム（24 入 / 51 出 / 99 入 / 148 出）
const HOVER = hoverEventsFor(CURSOR_PATH);
// 再生から 0.7 秒は実時間、溶けている間は早回し、手を乗せている間はまた実時間
const WORKED_KEYS: [number, number][] = [
  [PLAY, 0],
  [60, 0.67],
  [72, 30],
  [HOVER[2][0], 420],
  [HOVER[3][0], 420 + (HOVER[3][0] - HOVER[2][0]) / 30],
  [179, WORKED_PRESENCE_END],
];

type StateId = "op" | "wait" | "melt";
const STATES: { id: StateId; title: string; meter: number }[] = [
  { id: "op", title: "操作", meter: 1 },
  { id: "wait", title: "待機", meter: 0.64 },
  { id: "melt", title: "溶け込む", meter: 0.28 },
];
// 段階表が指す状態: 再生前の何もしていないパネル → 再生してボタン列と休憩チップが出る → 離れて溶ける…
// （待機中のホバーではパネルの見た目が変わらないので、「操作」は再生の瞬間から点ける）
const STATE_LINE: [number, StateId][] = [
  [0, "wait"],
  [PLAY, "op"],
  [HOVER[1][0], "melt"],
  [HOVER[2][0], "op"],
  [HOVER[3][0], "melt"],
];
const RAIL_IN: [number, number] = [4, 20];
const RAIL_OUT: [number, number] = [160, 176];
const CAPTION: [number, number] = [46, 168]; // 完全表示 64–156

const stateAmount = (frame: number, id: StateId) => {
  let amount = 0;
  STATE_LINE.forEach(([start, s], i) => {
    if (s !== id) return;
    const end = STATE_LINE[i + 1]?.[0] ?? Infinity;
    const rise = start === 0 ? 1 : interpolate(frame, [start, start + 8], [0, 1], clamp);
    const fall = Number.isFinite(end) ? interpolate(frame, [end, end + 8], [1, 0], clamp) : 1;
    amount = Math.max(amount, Math.min(rise, fall));
  });
  return amount;
};

const StateRail: React.FC<{ frame: number }> = ({ frame }) => {
  const o = interpolate(frame, RAIL_IN, [0, 1], clamp) * interpolate(frame, RAIL_OUT, [1, 0], clamp);
  // パネル（CAM_NEAR での画面上の位置）の真下に、同じ幅で置く
  const panelLeft = PANEL_SCREEN.left;
  return (
    <div
      style={{
        position: "absolute",
        left: panelLeft,
        top: PANEL_SCREEN.bottom + 36,
        width: PANEL_SCREEN.width,
        boxSizing: "border-box",
        padding: "26px 30px 30px",
        borderRadius: 18,
        backgroundColor: "rgba(250,251,252,0.86)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 10px 40px rgba(26,35,48,0.10)",
        opacity: o,
        translate: `0px ${(1 - interpolate(frame, RAIL_IN, [0, 1], clamp)) * 12}px`,
      }}
    >
      <div style={{ fontFamily: font.sans, fontSize: 22, fontWeight: 700, color: color.tealText, letterSpacing: "0.08em" }}>
        存在感の3段階
      </div>
      {STATES.map((st) => {
        const a = stateAmount(frame, st.id);
        return (
          <div key={st.id} style={{ marginTop: 20, opacity: 0.3 + 0.7 * a }}>
            <div style={{ fontFamily: font.mincho, fontWeight: 700, fontSize: 52, lineHeight: 1.25, color: color.sumi, letterSpacing: "0.04em" }}>
              {st.title}
            </div>
            <div style={{ marginTop: 8, height: 6, borderRadius: 3, backgroundColor: color.line, overflow: "hidden" }}>
              <div
                style={{
                  width: `${st.meter * 100}%`,
                  height: "100%",
                  borderRadius: 3,
                  backgroundColor: a > 0.5 ? color.teal : "rgba(26,35,48,0.28)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// CAM_NEAR で映したときのパネルの画面上の矩形
const PANEL_SCREEN = (() => {
  const tl = panelPoint(0, 0);
  const br = panelPoint(196, 196);
  const s = CAM_NEAR.s;
  return { left: tl.x * s + CAM_NEAR.tx, width: (br.x - tl.x) * s, bottom: br.y * s + CAM_NEAR.ty };
})();

export const Presence: React.FC = () => {
  const frame = useCurrentFrame();
  const running = frame >= PLAY;
  const hover = hoverAt(frame, HOVER);
  const worked = running ? workedAt(frame, WORKED_KEYS) : 0;
  const pointer = cursorAt(frame, CURSOR_PATH);
  // 動かしている間だけポインタが見える（macOS はタイプ中にポインタを隠す）
  const pointerOpacity =
    interpolate(frame, [4, 10], [0, 1], clamp) *
    interpolate(frame, [66, 72], [1, 0], clamp) +
    interpolate(frame, [84, 90], [0, 1], clamp) * interpolate(frame, [162, 170], [1, 0], clamp);
  const typed = interpolate(frame, [0, 66, 84, 160, 179], [TYPED_DESKTOP[1], TYPED_DESKTOP[1], 0.62, 0.62, TYPED_PRESENCE_END], clamp);

  return (
    <AbsoluteFill>
      <Camera cam={CAM_NEAR}>
        <WorkDesktop typed={typed} statusTitle={running ? " " + formatTime(worked) : ""} clock={clockString(worked)}>
          {running ? (
            <DesktopPanel
              mode="flow"
              phase="work"
              time={formatTime(worked)}
              progress={worked / FLOW_BASE}
              breakChip={chipString(worked)}
              hover={hover}
              opacity={runningOpacity(hover)}
            />
          ) : (
            <DesktopPanel mode="flow" phase="idle" time="00:00" hover={hover} />
          )}
          {pointerOpacity > 0 ? <Cursor x={pointer.x} y={pointer.y} opacity={pointerOpacity} /> : null}
        </WorkDesktop>
      </Camera>
      <StateRail frame={frame} />
      <Caption text="うるさくない。でも、忘れさせない。" from={CAPTION[0]} to={CAPTION[1]} backdrop />
    </AbsoluteFill>
  );
};
