import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Terminal } from "../components/Terminal";
import { clamp, color, ease, font } from "../theme";

// 55–60秒: 名前 → インストールの一行 → 要件。入りのフェード（f0–15）の間は何も出さない。
// f84 以降は全要素が止まり（65f ≈ 2.2 秒）、最終フレームがサムネになる

// 本物のインストーラ（#73）の呼び出し。コピペされる前提なので一字一句変えない
const COMMAND = "curl -fsSL https://imutaroh.github.io/pomo/install.sh | bash";

const LOGO_IN = 12;
const TERM_IN = 22;
// 最後の 2 秒の静止を残すため、タイプは 40f（約 1.3 秒）に収める
const TYPE: [number, number] = [36, 76];
const SUB_IN = 70;

const rise = (frame: number, from: number, len: number) => {
  const p = interpolate(frame, [from, from + len], [0, 1], { ...clamp, easing: ease });
  return { opacity: p, translate: `0px ${interpolate(p, [0, 1], [18, 0])}px` };
};

export const Install: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = interpolate(frame, TYPE, [0, COMMAND.length], clamp);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color.washi,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28, marginLeft: -38, ...rise(frame, LOGO_IN, 26) }}>
        {/* icon.png は内側に余白があり、そのままだと群が約 19px 右に寄って見える。marginLeft で左へ戻す */}
        <Img src={staticFile("icon.png")} style={{ width: 176, height: 176 }} />
        <div
          style={{
            fontFamily: font.mincho,
            fontWeight: 700,
            fontSize: 132,
            letterSpacing: "0.02em",
            color: color.sumi,
            lineHeight: 1,
          }}
        >
          Quiet
        </div>
      </div>

      <div style={{ marginTop: 64, ...rise(frame, TERM_IN, 22) }}>
        {/* frame を固定してキャレットを点灯のままにする。点滅させると最後の 2 秒が静止しない */}
        <Terminal command={COMMAND} typed={typed} frame={frame} blink={false} width={1640} fontSize={40} />
      </div>

      <div
        style={{
          marginTop: 56,
          fontFamily: font.sans,
          fontWeight: 700,
          fontSize: 44,
          letterSpacing: "0.08em",
          color: color.tealText,
          ...rise(frame, SUB_IN, 14),
        }}
      >
        macOS 14+・無料・local-first flow timer
      </div>
    </AbsoluteFill>
  );
};
