import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, color, font } from "../theme";

// 24–30秒: PhilosophyPage の結びを明朝で置き、名前とアイコンで閉じる

const LINE1 = 0;
const LINE2 = 34;
const TEXT_OUT: [number, number] = [92, 106];
const LOGO_IN = 108;

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const Line: React.FC<{ from: number; frame: number; children: string }> = ({ from, frame, children }) => (
  <div
    style={{
      opacity: interpolate(frame, [from, from + 20], [0, 1], clamp),
      translate: `0px ${interpolate(frame, [from, from + 24], [14, 0], { ...clamp, easing: ease })}px`,
    }}
  >
    {children}
  </div>
);

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = interpolate(frame, [LOGO_IN, LOGO_IN + 26], [0, 1], { ...clamp, easing: ease });
  const sub = interpolate(frame, [LOGO_IN + 18, LOGO_IN + 38], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: color.washi, justifyContent: "center", alignItems: "center" }}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 30,
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: 60,
          letterSpacing: "0.06em",
          color: color.sumi,
          opacity: interpolate(frame, TEXT_OUT, [1, 0], clamp),
        }}
      >
        <Line from={LINE1} frame={frame}>
          集中を止めるものを、ひとつずつ消していきました。
        </Line>
        <Line from={LINE2} frame={frame}>
          最後に残った静けさが、この道具の名前です。
        </Line>
      </AbsoluteFill>

      {frame >= LOGO_IN ? (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 44,
              opacity: logo,
              translate: `0px ${interpolate(logo, [0, 1], [18, 0])}px`,
            }}
          >
            <Img src={staticFile("icon.png")} style={{ width: 190, height: 190 }} />
            <div
              style={{
                fontFamily: font.mincho,
                fontWeight: 700,
                fontSize: 180,
                letterSpacing: "0.02em",
                color: color.sumi,
                lineHeight: 1,
              }}
            >
              Quiet
            </div>
          </div>
          <div
            style={{
              marginTop: 48,
              fontFamily: font.sans,
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: color.tealText,
              opacity: sub,
            }}
          >
            local-first flow timer · macOS · 無料
          </div>
          <div
            style={{
              marginTop: 22,
              fontFamily: font.mono,
              fontWeight: 500,
              fontSize: 28,
              color: "rgba(26,35,48,0.62)",
              opacity: sub,
            }}
          >
            imutaroh.github.io/pomo
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
