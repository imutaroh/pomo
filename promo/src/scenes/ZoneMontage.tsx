import { interpolate } from "remotion";
import { clamp } from "../theme";
import { TIMER_SCREEN } from "./ZoneChrome";
import { DesignApp } from "./ZoneDesign";
import { DocApp } from "./ZoneDoc";
import { MailApp } from "./ZoneMail";
import { GenericTimer, ZONE_LENGTH } from "./ZoneScreen";
import { SheetApp } from "./ZoneSheet";

// Zone の「いろんな仕事のモンタージュ」。資料 → 表 → デザイン → メールと切り替わるたびにカットが短くなり（4→3.3→2.7→2秒）、
// 最後の 3 秒は 4 人が同時に乗っている 4 分割。どの画面の隅にも同じ汎用ポモドーロがあり、同じ残り時間が実時間で減っていく。
// 描画はフレーム番号（Zone の時間軸）だけで決まるので、Cut の f0 も ZoneSplit を同じ構図で描ける

export const CUTS = {
  doc: 0,
  sheet: 120,
  design: 220,
  mail: 300,
  split: 360,
} as const;

// 各画面の中身（4 分割でも同じ時間軸で続けて動かす）
const Doc: React.FC<{ frame: number }> = ({ frame }) => <DocApp t={frame - CUTS.doc} />;
const Sheet: React.FC<{ frame: number }> = ({ frame }) => <SheetApp t={frame - CUTS.sheet} />;
const Design: React.FC<{ frame: number }> = ({ frame }) => <DesignApp t={frame - CUTS.design} />;
const Mail: React.FC<{ frame: number }> = ({ frame }) => <MailApp t={frame - CUTS.mail} />;

// 1 カットの中で、ほんの少しずつ寄る（止まって見えないように）。origin は作業している場所
const Push: React.FC<{ p: number; origin: string; children: React.ReactNode }> = ({ p, origin, children }) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0, transformOrigin: origin, scale: String(1 + 0.05 * p) }}>{children}</div>
  </div>
);

export const ZoneCut: React.FC<{ frame: number }> = ({ frame }) => {
  const span = (from: number, to: number) => interpolate(frame, [from, to], [0, 1], clamp);
  let body: React.ReactNode;
  if (frame < CUTS.sheet) body = <Push p={span(CUTS.doc, CUTS.sheet)} origin="30% 50%"><Doc frame={frame} /></Push>;
  else if (frame < CUTS.design) body = <Push p={span(CUTS.sheet, CUTS.design)} origin="40% 45%"><Sheet frame={frame} /></Push>;
  else if (frame < CUTS.mail) body = <Push p={span(CUTS.design, CUTS.mail)} origin="35% 50%"><Design frame={frame} /></Push>;
  else body = <Push p={span(CUTS.mail, CUTS.split)} origin="45% 75%"><Mail frame={frame} /></Push>;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {body}
      {/* タイマーは寄りの外（画面に対して固定）。全カットで同じ場所・同じ大きさ */}
      <GenericTimer frame={frame} left={TIMER_SCREEN.left} top={TIMER_SCREEN.top} />
    </div>
  );
};

// ---------------------------------------------------------------- 4 分割

const GAP = 8;
const QUADS: { C: React.FC<{ frame: number }>; x: number; y: number }[] = [
  { C: Doc, x: 0, y: 0 },
  { C: Sheet, x: 1, y: 0 },
  { C: Design, x: 0, y: 1 },
  { C: Mail, x: 1, y: 1 },
];
const QW = (1920 - GAP) / 2;
const QH = (1080 - GAP) / 2;
const QS = QW / 1920;
// 分割の中でもタイマーは読める大きさに（画面の縮小より大きく残す）
const Q_TIMER = 0.82;

export const ZoneSplit: React.FC<{ frame: number }> = ({ frame }) => {
  // 4 分割の 3 秒をかけて、ほんの少し寄る
  const push = interpolate(frame, [CUTS.split, ZONE_LENGTH], [1, 1.025], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, backgroundColor: "#000", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, scale: String(push) }}>
        {QUADS.map(({ C, x, y }, i) => {
          const left = x * (QW + GAP);
          const top = y * (QH + GAP);
          return (
            <div key={i} style={{ position: "absolute", left, top, width: QW, height: QH, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", scale: String(QS) }}>
                <C frame={frame} />
              </div>
              <GenericTimer frame={frame} left={QW - 24 - 352} top={22} scale={Q_TIMER} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ZoneMontage: React.FC<{ frame: number }> = ({ frame }) =>
  frame < CUTS.split ? <ZoneCut frame={frame} /> : <ZoneSplit frame={frame} />;
