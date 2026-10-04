import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { interpolate, useCurrentFrame } from "remotion";
import { clamp, color, ease, font } from "../theme";

// 明朝のコピー。from で 18 フレームかけて下から浮かび、to の手前 12 フレームで消える。
// 位置は bottom（画面下・既定）/ center / top を選べる。改行は "\n"。
//
// X 版（src/x/QuietPromoX.tsx）は本編を縮めて正方形の中央に置くので、映像の中の字幕はスマホで読めない大きさになる。
// そこで CaptionBand で囲まれているときだけ、映像の中には描かず、target（下の帯）へポータルで大きく描く。
// 囲まれていない本編では、これまでどおり映像の中に描く

export type CaptionBandValue = {
  /** 字幕を描く先（X 版の下の帯）。まだ無ければ何も描かない */
  target: HTMLElement | null;
  /** 帯の地に合わせた文字色 */
  textColor: string;
  /** 1 行の文字の大きさ（帯の座標系の px） */
  size: number;
  /** 1 行に収める幅（px）。超えたら読点・句点で 2 行に折る */
  maxWidth: number;
};

export const CaptionBand = createContext<CaptionBandValue | null>(null);

const LETTER_SPACING = 0.06;

// 1 行に収まらないとき、真ん中に近い「、」「。」の後ろで折る（末尾の句点では折らない）
const wrapForBand = (text: string, size: number, maxWidth: number) => {
  if (text.includes("\n") || text.length * size * (1 + LETTER_SPACING) <= maxWidth) return text;
  const breaks = [...text.slice(0, -1)].flatMap((ch, i) => (ch === "、" || ch === "。" ? [i + 1] : []));
  if (breaks.length === 0) return text;
  const at = breaks.reduce((best, i) => (Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2) ? i : best));
  return `${text.slice(0, at)}\n${text.slice(at)}`;
};

export const Caption: React.FC<{
  text: string;
  from: number;
  to?: number;
  position?: "bottom" | "center" | "top";
  size?: number;
  tone?: "sumi" | "washi";
  /** 文字の後ろに敷く和紙の帯（デスクトップの上に載せるとき読みやすくする） */
  backdrop?: boolean;
}> = ({ text, from, to = Infinity, position = "bottom", size = 50, tone = "sumi", backdrop = false }) => {
  const frame = useCurrentFrame();
  const band = useContext(CaptionBand);
  const inP = interpolate(frame, [from, from + 18], [0, 1], { ...clamp, easing: ease });
  const outP = Number.isFinite(to) ? interpolate(frame, [to - 12, to], [1, 0], clamp) : 1;
  const o = inP * outP;
  if (o <= 0) return null;

  if (band) {
    if (!band.target) return null;
    return createPortal(
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            fontFamily: font.mincho,
            fontWeight: 700,
            fontSize: band.size,
            letterSpacing: `${LETTER_SPACING}em`,
            lineHeight: 1.5,
            textAlign: "center",
            whiteSpace: "pre-line",
            color: band.textColor,
            opacity: o,
            translate: `0px ${interpolate(inP, [0, 1], [10, 0])}px`,
          }}
        >
          {wrapForBand(text, band.size, band.maxWidth)}
        </div>
      </div>,
      band.target,
    );
  }

  const pos: React.CSSProperties =
    position === "bottom"
      ? { bottom: 96 }
      : position === "top"
        ? { top: 110 }
        : { top: 0, bottom: 0, alignItems: "center" };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        ...pos,
      }}
    >
      <div
        style={{
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: size,
          letterSpacing: "0.06em",
          lineHeight: 1.6,
          textAlign: "center",
          whiteSpace: "pre-line",
          color: tone === "sumi" ? color.sumi : color.washi,
          opacity: o,
          translate: `0px ${interpolate(inP, [0, 1], [14, 0])}px`,
          padding: backdrop ? "14px 40px" : undefined,
          borderRadius: backdrop ? 14 : undefined,
          backgroundColor: backdrop ? "rgba(250,251,252,0.82)" : undefined,
          backdropFilter: backdrop ? "blur(16px)" : undefined,
          boxShadow: backdrop ? "0 10px 40px rgba(26,35,48,0.10)" : undefined,
        }}
      >
        {text}
      </div>
    </div>
  );
};
