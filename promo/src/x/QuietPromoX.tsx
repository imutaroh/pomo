import { useMemo, useState } from "react";
import { AbsoluteFill, interpolate, interpolateColors, Sequence, useCurrentFrame } from "remotion";
import { CaptionBand, CaptionBandValue } from "../components/Caption";
import { QuietPromo } from "../QuietPromo";
import { clamp, color, ease, font } from "../theme";
import { EDGES } from "./edges.gen";
import { BAND_H, lengthOf, SEGMENTS, VIDEO_H, VIDEO_SCALE, X_SIZE, X_STARTS } from "./segments";

// X 投稿版: 1080×1080 の正方形。中央に本編を幅 1080 に縮めて置き、上下の帯に見出しと字幕を大きく出す。
// 絵は本編 QuietPromo をそのまま区間ごとに頭出しして描く（本編と別の絵を持たない）。
// 帯の地は本編のそのフレームの上端・下端の色（edges.gen.ts）にして、映像の延長に見せる。
// 映像の上下 FEATHER px は帯の色へぼかして、端の模様と帯の平らな色の段差を消す

const FEATHER = 14;
// スマホのタイムライン（幅 390pt ≒ ×0.36）で、字幕 56px → 20pt、見出し 46px → 16.6pt
const CAPTION_SIZE = 56;
const HEADLINE_SIZE = 46;
const SIDE = 56;

const parseEdge = (hex: string, i: number) => `#${hex.slice(i * 6, i * 6 + 6)}`;

// 本編のフレームの上端・下端の色。表に無いフレームは和紙
const edgeAt = (mainFrame: number, side: "top" | "bottom") => {
  const e = EDGES.find((x) => mainFrame >= x.from && mainFrame < x.to);
  if (!e) return color.washi;
  return parseEdge(e[side], mainFrame - e.from);
};

// 地の明るさ（0–1）から文字色を決める。境目のあたりは墨と和紙の間を連続に動かして、色の跳びを抑える
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const inkOn = (bg: string) => interpolateColors(luminance(bg), [0.42, 0.58], [color.washi, color.sumi]);

const segmentAt = (frame: number) => {
  for (let i = SEGMENTS.length - 1; i >= 0; i--) if (frame >= X_STARTS[i]) return i;
  return 0;
};

// 上の帯の見出し。区間の頭（headlineAt の始め）から 18f で浮かび、終わりの 12f で消える
const Headline: React.FC<{ index: number; local: number; ink: string }> = ({ index, local, ink }) => {
  const s = SEGMENTS[index];
  if (!s.headline) return null;
  const [a, b] = s.headlineAt ?? [0, lengthOf(s)];
  const inP = interpolate(local, [a + 6, a + 24], [0, 1], { ...clamp, easing: ease });
  const outP = interpolate(local, [b - 12, b], [1, 0], clamp);
  const o = inP * outP;
  if (o <= 0) return null;
  return (
    <div
      style={{
        fontFamily: font.mincho,
        fontWeight: 700,
        fontSize: HEADLINE_SIZE,
        letterSpacing: "0.06em",
        lineHeight: 1.5,
        color: ink,
        opacity: o,
        translate: `0px ${interpolate(inP, [0, 1], [10, 0])}px`,
        whiteSpace: "pre",
      }}
    >
      {s.headline}
    </div>
  );
};

export const QuietPromoX: React.FC = () => {
  const frame = useCurrentFrame();
  const [captionTarget, setCaptionTarget] = useState<HTMLDivElement | null>(null);

  const index = segmentAt(frame);
  const local = frame - X_STARTS[index];
  const mainFrame = SEGMENTS[index].from + local;
  const top = edgeAt(mainFrame, "top");
  const bottom = edgeAt(mainFrame, "bottom");

  const bottomInk = inkOn(bottom);
  const band = useMemo<CaptionBandValue>(
    () => ({ target: captionTarget, textColor: bottomInk, size: CAPTION_SIZE, maxWidth: X_SIZE - SIDE * 2 }),
    [captionTarget, bottomInk],
  );

  const fade = `linear-gradient(to bottom, transparent 0, #000 ${FEATHER}px, #000 calc(100% - ${FEATHER}px), transparent 100%)`;

  return (
    <AbsoluteFill>
      {/* 帯の地。映像の後ろまで伸ばし、ぼかした端から透けて見えるようにする */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: X_SIZE / 2, backgroundColor: top }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: X_SIZE / 2, backgroundColor: bottom }} />

      <div
        style={{
          position: "absolute",
          left: 0,
          top: BAND_H,
          width: X_SIZE,
          height: VIDEO_H,
          overflow: "hidden",
          maskImage: fade,
          WebkitMaskImage: fade,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${VIDEO_SCALE})`, transformOrigin: "0 0" }}>
          <CaptionBand.Provider value={band}>
            {SEGMENTS.map((s, i) => (
              <Sequence key={s.id} name={`x-${s.id}`} from={X_STARTS[i]} durationInFrames={lengthOf(s)}>
                {/* 本編を s.from から再生する。本編の音（Studio のプレビューでだけ鳴る）も同じ区間で切れる */}
                <Sequence from={-s.from}>
                  <QuietPromo />
                </Sequence>
              </Sequence>
            ))}
          </CaptionBand.Provider>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: SIDE,
          right: SIDE,
          top: 0,
          height: BAND_H,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Headline index={index} local={local} ink={inkOn(top)} />
      </div>
      {/* 字幕のポータル先。Caption が CaptionBand を見てここへ描く */}
      <div ref={setCaptionTarget} style={{ position: "absolute", left: SIDE, right: SIDE, bottom: 0, height: BAND_H }} />
    </AbsoluteFill>
  );
};
