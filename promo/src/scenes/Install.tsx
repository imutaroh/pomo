import { useContext } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Caption, CaptionBand } from "../components/Caption";
import { clamp, color, ease, font } from "../theme";

// 74–79秒: 名前 → 近日公開 → X で開発を追ってもらう。ダウンロードはまだ求めない（いむたろの判断）。
// Quiet は「アカウントなし・送信なし」が売りなので、メールは集めず X のフォローに誘う。
// 入りのフェード（f0–15）の間は何も出さない。f64 以降は全要素が止まり、最終フレームがサムネになる

const SOON = "近日公開";
const HANDLE = "@imutaroh";
const URL_TEXT = "quiet.imutaro.com";
// X 版（正方形）の下の帯に大きく出す一文（「近日公開」は映像の中に大きく出ているので繰り返さない）
const BAND_LINE = `開発の様子は X の ${HANDLE} で。`;

const LOGO_IN = 16;
const SOON_IN = 30;
const FOLLOW_IN = 46;

const rise = (frame: number, from: number, len: number) => {
  const p = interpolate(frame, [from, from + len], [0, 1], { ...clamp, easing: ease });
  return { opacity: p, translate: `0px ${interpolate(p, [0, 1], [18, 0])}px` };
};

export const Install: React.FC = () => {
  const frame = useCurrentFrame();
  // X 版では映像が縮むので、締めの一文は字幕と同じく下の帯へ大きく出し、映像の中の X の案内は描かない
  const inBand = useContext(CaptionBand) !== null;

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

      <div
        style={{
          marginTop: 64,
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: 132,
          letterSpacing: "0.12em",
          color: color.sumi,
          lineHeight: 1,
          ...rise(frame, SOON_IN, 22),
        }}
      >
        {SOON}
      </div>

      <div
        style={{
          marginTop: 40,
          width: 220,
          height: 6,
          borderRadius: 3,
          backgroundColor: color.teal,
          transformOrigin: "center",
          scale: `${interpolate(frame, [SOON_IN + 6, SOON_IN + 30], [0, 1], { ...clamp, easing: ease })} 1`,
        }}
      />

      {inBand ? <Caption text={BAND_LINE} from={FOLLOW_IN} /> : null}
      <div
        style={{
          marginTop: 44,
          display: inBand ? "none" : "flex",
          alignItems: "baseline",
          gap: 20,
          ...rise(frame, FOLLOW_IN, 18),
        }}
      >
        <span style={{ fontFamily: font.sans, fontWeight: 500, fontSize: 48, color: color.sumi, opacity: 0.75 }}>
          開発の様子は X で
        </span>
        <span style={{ fontFamily: font.sans, fontWeight: 700, fontSize: 64, color: color.tealText }}>{HANDLE}</span>
      </div>

      <div style={{ marginTop: inBand ? 40 : 30, ...rise(frame, FOLLOW_IN + 6, 18) }}>
        <div
          style={{
            fontFamily: font.sans,
            fontWeight: 500,
            fontSize: inBand ? 56 : 38,
            letterSpacing: "0.02em",
            color: color.sumi,
            opacity: 0.6,
          }}
        >
          {URL_TEXT}
        </div>
      </div>
    </AbsoluteFill>
  );
};
