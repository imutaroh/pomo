import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { Cursor, Desktop, SCREEN_SCALE } from "../components/Desktop";
import { clamp, color, font, formatTime } from "../theme";
import {
  BREAK_CHIP,
  BREAK_TOTAL,
  breakRemaining,
  clockString,
  CAM_NEAR,
  Camera,
  camEase,
  CAM_WIDE,
  camTopRight,
  chipString,
  CURSOR_EDITOR,
  cursorAt,
  DesktopPanel,
  FLOW_BASE,
  hoverAt,
  lerpCam,
  panelPoint,
  runningOpacity,
  TYPED_PRESENCE_END,
  WORKED_AT_CUT,
  WORKED_FINAL,
  workedAt,
} from "./DesktopShared";

// 31–39秒: 溶けたまま 16:00 から数え続け、手を乗せたところで 25 分を越える（進捗バーが満ちて薄まる）。
// それでも止めずに 52:10 まで。休憩チップ「休憩 +10:26」を押すと作業が終わり、全画面の休憩が現れる。
// frame 0 = Presence の最終フレーム。終わり際（226–240）に和紙へ抜け、末尾 15f は和紙のまま Modes のフェードの下に隠れる

const HOVER_IN = 29; // ポインタがパネルの縁を越えるフレーム（CURSOR_PATH から計算）
const SATURATE = 70; // ちょうど 25:00 になるフレーム
const PRESS = 138; // チップを押し込む
const BREAK_START = 142; // 離した瞬間に finishWork（ボタンは mouse up で発火）
const CAPTION_REWARD: [number, number] = [160, 228]; // 完全表示 178–216 の 38f
const WASHI_OUT: [number, number] = [226, 240];
const OVERLAY_FADE = 18; // BreakOverlay.swift: alphaValue 0→1 を 0.6 秒
const CAM_PUSH: [number, number] = [0, 70];
// 押す少し前から引き始め、休憩画面が濃くなる頃には中央が画面の中央に近づいている
const CAM_PULL: [number, number] = [PRESS - 12, BREAK_START + 26];
// スマホ幅でも数字とチップが読める寄り（パネル全体は画面内に収まる）
const CAM_CLOSE = camTopRight(2.0);
// 休憩は等倍の全景で。寄るとメニューバーの時計が端で切れる
const CAM_BREAK = CAM_WIDE;

const HOVER_SPOT = panelPoint(176, 126);
const CURSOR_PATH: [number, number, number][] = [
  [12, CURSOR_EDITOR.x, CURSOR_EDITOR.y],
  [40, HOVER_SPOT.x, HOVER_SPOT.y],
  [114, HOVER_SPOT.x, HOVER_SPOT.y],
  [132, BREAK_CHIP.x, BREAK_CHIP.y],
  [BREAK_START + 6, BREAK_CHIP.x, BREAK_CHIP.y],
  // 押したあとは手を少し引く（休憩画面の上で止まる）
  [BREAK_START + 46, BREAK_CHIP.x - 150, BREAK_CHIP.y + 160],
];
// 溶けている間は早回し、25:00 の前後はゆっくり、越えてからまた速く。押す直前の 10f は実時間
const WORKED_KEYS: [number, number][] = [
  [0, WORKED_AT_CUT],
  [38, 1430],
  [SATURATE, 25 * 60],
  [82, 1640],
  [96, 2120],
  [116, 2960],
  [130, WORKED_FINAL],
  [PRESS, WORKED_FINAL + 0.27],
];

// ---------------------------------------------------------------- 全画面の休憩（BreakOverlay.swift の再現）

const k = SCREEN_SCALE; // pt → 世界の px

const Pill: React.FC<{ label: string; opacity?: number }> = ({ label, opacity = 1 }) => (
  <div
    style={{
      padding: `${10 * k}px ${22 * k}px`,
      borderRadius: 999,
      backgroundColor: "rgba(250,251,252,0.12)",
      color: "rgba(250,251,252,0.9)",
      fontFamily: font.sans,
      fontSize: 14 * k,
      fontWeight: 700,
      opacity,
    }}
  >
    {label}
  </div>
);

const BreakOverlay: React.FC<{ local: number; remaining: number }> = ({ local, remaining }) => {
  // 4秒周期の呼吸（0.9 ⇄ 1.1、easeInOut）。表示から 4 秒で 1.1 に届く
  const breathe = 0.9 + 0.2 * interpolate(local, [0, 120], [0, 1], { ...clamp, easing: Easing.inOut(Easing.ease) });
  // スキップだけ 3 秒の間を置いてから押せる（0.4 秒 easeOut で濃くなる）
  const skip = interpolate(local, [90, 102], [0.35, 1], clamp);
  const dim = 1080 * 0.7;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "rgba(26,35,48,0.92)",
        opacity: interpolate(local, [0, OVERLAY_FADE], [0, 1], clamp),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: dim,
          height: dim,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(0,135,168,0.12) ${60 * k}px, rgba(0,135,168,0) ${380 * k}px)`,
          scale: String(breathe),
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 * k }}>
        <div style={{ fontFamily: font.sans, fontSize: 22 * k, fontWeight: 500, color: "rgba(250,251,252,0.6)" }}>ひと休み</div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 110 * k,
            fontWeight: 500,
            lineHeight: 1,
            color: color.washi,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatTime(remaining)}
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 15 * k, fontWeight: 500, color: color.teal }}>
          今回の集中 {formatTime(WORKED_FINAL)}
        </div>
        <div style={{ width: 360 * k, height: 4 * k, borderRadius: 2 * k, backgroundColor: "rgba(26,35,48,0.10)" }}>
          <div
            style={{
              width: `${(local / 30 / BREAK_TOTAL) * 100}%`,
              height: "100%",
              borderRadius: 2 * k,
              backgroundColor: color.teal,
            }}
          />
        </div>
        <div style={{ fontFamily: font.sans, fontSize: 14 * k, fontWeight: 500, color: "rgba(250,251,252,0.45)" }}>
          画面から目を離して、少し伸びをしよう
        </div>
        <div style={{ display: "flex", gap: 14 * k }}>
          <Pill label="+5分" />
          <Pill label="小さく" />
          <Pill label="スキップ" opacity={skip} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- シーン

export const FlowBreak: React.FC = () => {
  const frame = useCurrentFrame();
  const onBreak = frame >= BREAK_START;
  const local = frame - BREAK_START;
  const worked = workedAt(frame, WORKED_KEYS);
  const remaining = breakRemaining(local);
  const hover = hoverAt(frame, [[HOVER_IN, 1]]);
  const pointer = cursorAt(frame, CURSOR_PATH);
  const pointerOpacity = interpolate(frame, [8, 14], [0, 1], clamp);
  // アプリのチップは押しても縮まない（.plain）。ポインタが乗ると塗りが 22% → 40% に濃くなるだけ
  const chipHover = interpolate(frame, [PRESS - 6, PRESS - 2], [0, 1], clamp);
  const typed = interpolate(frame, [0, 36], [TYPED_PRESENCE_END, 0.95], clamp);

  const cam =
    frame >= CAM_PULL[0]
      ? lerpCam(CAM_CLOSE, CAM_BREAK, interpolate(frame, CAM_PULL, [0, 1], { ...clamp, easing: camEase }))
      : lerpCam(CAM_NEAR, CAM_CLOSE, interpolate(frame, CAM_PUSH, [0, 1], { ...clamp, easing: camEase }));

  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <Desktop
          typed={typed}
          statusIcon={onBreak ? "cup.and.saucer.fill" : "dial"}
          statusTitle={" " + formatTime(onBreak ? remaining : worked)}
          clock={clockString(onBreak ? WORKED_FINAL + local / 30 : worked)}
        >
          {onBreak ? (
            <DesktopPanel
              mode="flow"
              phase="break"
              time={formatTime(remaining)}
              progress={Math.max(0, local) / 30 / BREAK_TOTAL}
              detail={`今回の集中 ${formatTime(WORKED_FINAL)}`}
              // 休憩画面がポインタの下に出るので、パネルのホバーは外れる
              hover={0}
              opacity={runningOpacity(0)}
            />
          ) : (
            <DesktopPanel
              mode="flow"
              phase="work"
              time={formatTime(worked)}
              progress={worked / FLOW_BASE}
              saturated={worked >= FLOW_BASE}
              breakChip={chipString(worked)}
              chipHover={chipHover}
              hover={hover}
              opacity={runningOpacity(hover)}
            />
          )}
          {onBreak ? <BreakOverlay local={local} remaining={remaining} /> : null}
          {pointerOpacity > 0 ? <Cursor x={pointer.x} y={pointer.y} opacity={pointerOpacity} /> : null}
        </Desktop>
      </Camera>
      <Caption text="25分で、切らない。" from={SATURATE} to={PRESS} backdrop />
      <Caption text="休憩は、義務ではなく報酬。" from={CAPTION_REWARD[0]} to={CAPTION_REWARD[1]} tone="washi" />
      {/* 次の Modes は和紙の上でフェードインするので、こちらも和紙へ抜けておく（灰色の濁りと二重写しを避ける） */}
      <AbsoluteFill style={{ backgroundColor: color.washi, opacity: interpolate(frame, WASHI_OUT, [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};
