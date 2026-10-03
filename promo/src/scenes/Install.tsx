import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, color, ease, font } from "../theme";

// 74–79秒: 名前 → URL → 要件。入りのフェード（f0–15）の間は何も出さない。
// f64 以降は全要素が止まり（86f ≈ 2.9 秒）、最終フレームがサムネになる

const URL_TEXT = "quiet.imutaro.com";

const LOGO_IN = 16;
const URL_IN = 30;
const SUB_IN = 46;

const rise = (frame: number, from: number, len: number) => {
  const p = interpolate(frame, [from, from + len], [0, 1], { ...clamp, easing: ease });
  return { opacity: p, translate: `0px ${interpolate(p, [0, 1], [18, 0])}px` };
};

export const Install: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color.washi,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginLeft: -32, ...rise(frame, LOGO_IN, 24) }}>
        {/* icon.png は内側に余白があり、そのままだと群が右に寄って見える。marginLeft で左へ戻す */}
        <Img src={staticFile("icon.png")} style={{ width: 150, height: 150 }} />
        <div
          style={{
            fontFamily: font.mincho,
            fontWeight: 700,
            fontSize: 112,
            letterSpacing: "0.02em",
            color: color.sumi,
            lineHeight: 1,
          }}
        >
          Quiet
        </div>
      </div>

      {/* 動画を見た人が打ち込む・検索する唯一の手がかり。スマホ幅（×0.203）でも 25px 前後で読める大きさにし、
          字形の取り違え（i / l）が起きにくいサンセリフで組む */}
      <div
        style={{
          marginTop: 72,
          fontFamily: font.sans,
          fontWeight: 700,
          fontSize: 124,
          letterSpacing: "0.01em",
          color: color.sumi,
          lineHeight: 1,
          ...rise(frame, URL_IN, 22),
        }}
      >
        {URL_TEXT}
      </div>

      {/* URL の下にティールの細線を一本。リンクであることを示し、群の重心を下に置く */}
      <div
        style={{
          marginTop: 28,
          width: interpolate(frame, [URL_IN + 6, URL_IN + 30], [0, 220], { ...clamp, easing: ease }),
          height: 6,
          borderRadius: 3,
          backgroundColor: color.teal,
        }}
      />

      <div
        style={{
          marginTop: 52,
          display: "flex",
          alignItems: "baseline",
          gap: 28,
          ...rise(frame, SUB_IN, 18),
        }}
      >
        <div
          style={{
            fontFamily: font.sans,
            fontWeight: 700,
            fontSize: 56,
            letterSpacing: "0.08em",
            color: color.tealText,
          }}
        >
          Mac 用・無料
        </div>
        <div
          style={{
            fontFamily: font.sans,
            fontWeight: 500,
            fontSize: 34,
            letterSpacing: "0.04em",
            color: color.sumi,
            opacity: 0.6,
          }}
        >
          macOS 14 以降・Apple Silicon
        </div>
      </div>
    </AbsoluteFill>
  );
};
