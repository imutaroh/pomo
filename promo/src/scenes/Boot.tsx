import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { clamp, color, font, formatTime } from "../theme";

// 0–2秒: 黒地のターミナル。ポモドーロが始まり、25分が一瞬で溶けて「時間です。」で割れる
const COMMAND = "> focus.start --pomodoro 25m";

export const Boot: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = COMMAND.slice(0, Math.floor(interpolate(frame, [2, 20], [0, COMMAND.length], clamp)));
  const remaining = interpolate(frame, [22, 44], [25 * 60, 0], clamp);
  const alarm = frame >= 44;
  // アラーム後は毎フレーム横ずれ（グリッチ）
  const jitter = alarm ? (random(`boot-${frame}`) - 0.5) * 60 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: alarm ? color.alarm : "#000", fontFamily: font.mono }}>
      <div style={{ position: "absolute", left: 80, top: 64, color: "#3DFF8A", fontSize: 30, lineHeight: 1.6 }}>
        <div style={{ opacity: 0.55, fontSize: 20 }}>FOCUS.EXE v25.0 — (c) every productivity app</div>
        <div>
          {typed}
          <span style={{ opacity: frame % 10 < 5 ? 1 : 0 }}>█</span>
        </div>
      </div>

      {frame >= 22 && !alarm ? (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ color: "#fff", fontSize: 300, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {formatTime(remaining)}
          </div>
        </AbsoluteFill>
      ) : null}

      {alarm ? (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", translate: `${jitter}px 0px` }}>
          <div
            style={{
              fontFamily: font.sans,
              fontWeight: 700,
              fontSize: 260,
              color: "#fff",
              textShadow: `${-12 + jitter / 4}px 0 0 #00E5FF, ${12 - jitter / 4}px 0 0 #000`,
            }}
          >
            時間です。
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
