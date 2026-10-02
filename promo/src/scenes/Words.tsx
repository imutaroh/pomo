import { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { clamp, color, ease, font } from "../theme";

// 51–55秒: 結びの二行。2行目が揃ったら動かさず、終端は Install のフェードに任せる。
// 入りのフェード（f0–15）の間は何も出さない。2行目と「静けさ」の染まりは f70 で止まり、
// Install のフェードが始まる f120 まで 50f（約 1.7 秒）静止する

const LINE1 = 12;
const LINE2 = 44;

const Line: React.FC<{ from: number; frame: number; children: React.ReactNode }> = ({ from, frame, children }) => (
  <div
    style={{
      opacity: interpolate(frame, [from, from + 20], [0, 1], clamp),
      translate: `0px ${interpolate(frame, [from, from + 24], [14, 0], { ...clamp, easing: ease })}px`,
    }}
  >
    {children}
  </div>
);

export const Words: React.FC = () => {
  const frame = useCurrentFrame();
  // 「静けさ」は次の画面の名前（Quiet）そのものなので、2行目が着地してからティールに染める
  const tint = interpolate(frame, [LINE2 + 10, LINE2 + 26], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color.washi,
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 34,
        fontFamily: font.mincho,
        fontWeight: 700,
        fontSize: 62,
        letterSpacing: "0.06em",
        lineHeight: 1.4,
        color: color.sumi,
      }}
    >
      <Line from={LINE1} frame={frame}>
        集中を止めるものを、ひとつずつ消していきました。
      </Line>
      <Line from={LINE2} frame={frame}>
        最後に残った
        <span style={{ color: interpolateColors(tint, [0, 1], [color.sumi, color.teal]) }}>静けさ</span>
        が、この道具の名前です。
      </Line>
    </AbsoluteFill>
  );
};
