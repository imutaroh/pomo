import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { clamp, color, font, formatTime } from "../theme";

// 14–24秒: 静寂のあと、Quiet のパネルだけが作業画面の上に浮かぶ。
// 25分を越えても止めない → 止めたとき、休憩が貯まっている → 全画面の休憩が静かに広がる

const WORKED = 52 * 60 + 10; // 今回の集中
const FLOW_RATIO = 5; // Settings.flowRatio の既定値（作業の 1/5 が休憩になる）
const BANKED = Math.floor(WORKED / FLOW_RATIO);

const PANEL_IN = 70;
const COUNT: [number, number] = [96, 196];
const PRESS = 202;
const REVEAL: [number, number] = [210, 236];
const OUT: [number, number] = [282, 300];
const PANEL_SCALE = 2.4;

// 作業画面のダミー（エディタの行）。主役ではないので薄く
const EditorMock: React.FC<{ opacity: number }> = ({ opacity }) => {
  const lines = [0.42, 0.66, 0.3, 0.78, 0.55, 0.2, 0.61, 0.47, 0.72, 0.36, 0.58, 0.25, 0.69, 0.44];
  return (
    <div
      style={{
        position: "absolute",
        left: 160,
        top: 120,
        width: 1600,
        height: 840,
        borderRadius: 18,
        backgroundColor: "#fff",
        border: `1px solid ${color.line}`,
        boxShadow: "0 30px 80px rgba(26,35,48,0.06)",
        opacity,
        padding: "70px 90px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      {lines.map((w, k) => (
        <div key={k} style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <div style={{ width: 28, height: 14, borderRadius: 4, backgroundColor: color.usugumo }} />
          <div
            style={{
              width: `${w * 100}%`,
              height: 14,
              borderRadius: 7,
              marginLeft: (k % 4) * 40,
              backgroundColor: k % 5 === 1 ? "rgba(0,135,168,0.16)" : color.usugumo,
            }}
          />
        </div>
      ))}
    </div>
  );
};

// パネル（Sources/Pomo/PanelView.swift の再現: 220×220・角丸18・上端の細い進捗・墨の数字・休憩チップ）
const Panel: React.FC<{ frame: number }> = ({ frame }) => {
  const worked = interpolate(frame, COUNT, [0, WORKED], {
    ...clamp,
    easing: Easing.bezier(0.45, 0, 0.2, 1),
  });
  const progress = Math.min(1, worked / (25 * 60));
  const saturated = worked >= 25 * 60;
  const press = interpolate(frame, [PRESS, PRESS + 4, PRESS + 9], [1, 0.9, 1], clamp);

  return (
    <div
      style={{
        width: 220,
        height: 220,
        borderRadius: 18,
        background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(250,251,252,0.78))",
        border: "1.2px solid rgba(255,255,255,0.8)",
        boxShadow: "0 18px 50px rgba(26,35,48,0.14), 0 0 0 0.5px rgba(26,35,48,0.08)",
        backdropFilter: "blur(20px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 14,
        fontFamily: font.mono,
      }}
    >
      <div style={{ width: 132, height: 3, borderRadius: 2, backgroundColor: "rgba(26,35,48,0.08)" }}>
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: 2,
            backgroundColor: color.teal,
            opacity: saturated ? 0.35 : 1,
          }}
        />
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 500, color: "rgba(26,35,48,0.5)" }}>集中</div>
      <div
        style={{
          fontSize: 54,
          fontWeight: 500,
          color: color.sumi,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.25,
        }}
      >
        {formatTime(worked)}
      </div>
      <div
        style={{
          marginTop: 6,
          padding: "4px 10px",
          borderRadius: 999,
          backgroundColor: "rgba(0,135,168,0.1)",
          color: color.tealDeep,
          fontSize: 12,
          fontWeight: 700,
          scale: String(press),
        }}
      >
        ☕ 休憩 +{formatTime(worked / FLOW_RATIO)}
      </div>
      <div style={{ flex: 1.1 }} />
    </div>
  );
};

const BreakOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  const radius = interpolate(frame, REVEAL, [0, 120], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const local = frame - REVEAL[0];
  // 4秒周期の呼吸（BreakOverlay.swift のグロー）
  const breathe = 1 + 0.1 * Math.sin((local / 120) * Math.PI * 2);
  const remaining = BANKED - Math.max(0, local - 20) / 30;
  const contentIn = interpolate(frame, [REVEAL[1] - 10, REVEAL[1] + 8], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "rgba(26,35,48,0.96)",
        clipPath: `circle(${radius}% at 50% 50%)`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,135,168,0.16), rgba(0,135,168,0) 65%)",
          scale: String(breathe),
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 26,
          opacity: contentIn,
          translate: `0px ${interpolate(contentIn, [0, 1], [16, 0])}px`,
        }}
      >
        <div style={{ fontFamily: font.sans, fontSize: 26, fontWeight: 500, color: "rgba(250,251,252,0.6)" }}>
          ひと休み
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 150,
            fontWeight: 500,
            color: color.washi,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {formatTime(remaining)}
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 500, color: color.teal }}>
          今回の集中 {formatTime(WORKED)}
        </div>
        <div style={{ fontFamily: font.sans, fontSize: 24, color: "rgba(250,251,252,0.5)" }}>
          画面から目を離して、少し伸びをしよう
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 110,
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: 50,
          letterSpacing: "0.06em",
          color: color.washi,
          opacity: interpolate(frame, [REVEAL[1] + 12, REVEAL[1] + 28], [0, 1], clamp),
        }}
      >
        休憩は、義務ではなく報酬。
      </div>
    </AbsoluteFill>
  );
};

export const QuietScene: React.FC = () => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [PANEL_IN, PANEL_IN + 24], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const captionIn = interpolate(frame, [COUNT[0] + 30, COUNT[0] + 48], [0, 1], clamp);
  const captionOut = interpolate(frame, [PRESS - 6, PRESS + 4], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: color.washi }}>
      <EditorMock opacity={interpolate(frame, [PANEL_IN - 20, PANEL_IN + 10], [0, 0.7], clamp)} />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            opacity: appear,
            scale: String(PANEL_SCALE * interpolate(appear, [0, 1], [0.96, 1])),
            translate: `0px ${interpolate(appear, [0, 1], [14, -40])}px`,
          }}
        >
          <Panel frame={frame} />
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          bottom: 96,
          width: "100%",
          textAlign: "center",
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: 50,
          letterSpacing: "0.06em",
          color: color.sumi,
          opacity: captionIn * captionOut,
        }}
      >
        25分で、切らない。
      </div>

      {frame >= REVEAL[0] ? <BreakOverlay frame={frame} /> : null}

      <AbsoluteFill
        style={{ backgroundColor: color.washi, opacity: interpolate(frame, OUT, [0, 1], clamp) }}
      />
    </AbsoluteFill>
  );
};
