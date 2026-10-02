import { AbsoluteFill, Easing, interpolate, interpolateColors, random, useCurrentFrame } from "remotion";
import { clamp, color, font } from "../theme";

// 2–14秒: 集中を邪魔する「ノイズ」が拍ごとに積み上がり、
// 「集中にとって、ぜんぶノイズだった。」で止まって、一枚ずつ消えていく

type Popup = {
  title: string;
  body: string;
  accent: string;
  chart?: boolean;
};

// 最初の12枚は中身を読ませる。以降は同じ言葉の反復で画面を埋める
const LEAD: Popup[] = [
  { title: "Pomodoro", body: "25:00 が経過しました。\n集中を中断してください。", accent: color.alarm },
  { title: "通知", body: "休憩の時間です ☕️", accent: "#0A84FF" },
  { title: "Streak", body: "🔥 12日連続！\n今日も途切れさせないで", accent: "#FF9F0A" },
  { title: "今週の集中時間", body: "", accent: "#BF5AF2", chart: true },
  { title: "リマインダー", body: "今日は何分できた？", accent: color.alarm },
  { title: "Goal", body: "目標まで あと 47分", accent: "#30D158" },
  { title: "Focus Score", body: "⚠ 集中スコア 62 / 100", accent: color.warn },
  { title: "Sync", body: "記録を同期しています… 37%", accent: "#0A84FF" },
  { title: "Pomodoro", body: "次のポモドーロまで 04:59", accent: color.alarm },
  { title: "Insight", body: "昨日より 18分 少ないです", accent: "#BF5AF2" },
  { title: "Streak", body: "ストリークが途切れそうです！", accent: "#FF9F0A" },
  { title: "Alarm", body: "⏰ 25:00", accent: color.alarm },
];
const FILLER: Popup[] = [
  { title: "Pomodoro", body: "25分経ちました。", accent: color.alarm },
  { title: "ERROR", body: "集中が中断されました", accent: color.alarm },
  { title: "リマインダー", body: "今日は何分できた？", accent: "#0A84FF" },
  { title: "Streak", body: "🔥 途切れさせないで", accent: "#FF9F0A" },
];

// 出現フレーム: 最初はゆっくり、だんだん詰まっていく
const APPEAR: number[] = (() => {
  const out: number[] = [];
  let t = 0;
  let gap = 20;
  while (t < 236) {
    out.push(Math.round(t));
    t += gap;
    gap = Math.max(3, gap * 0.86);
  }
  return out;
})();

const FREEZE = 240; // ここで積み上げが止まる
const CAPTION = 248; // コピーが出る
const ERASE_START = 284;
const ERASE_END = 336;
const TO_WHITE: [number, number] = [330, 344];

const popups = APPEAR.map((at, i) => {
  const p = i < LEAD.length ? LEAD[i] : FILLER[i % FILLER.length];
  const w = p.chart ? 520 : 400 + Math.round(random(`w${i}`) * 220);
  const h = p.chart ? 300 : 200;
  const x = 40 + random(`x${i}`) * (1920 - w - 80);
  const y = 70 + random(`y${i}`) * (1080 - h - 110);
  // 消えるのは後から来たものから。最後の1枚まで「ひとつずつ」
  const eraseAt = interpolate(i, [0, APPEAR.length - 1], [ERASE_END - 8, ERASE_START]);
  return { ...p, at, w, h, x, y, eraseAt, i };
});

const Window: React.FC<{ p: (typeof popups)[number]; frame: number }> = ({ p, frame }) => {
  const local = frame - p.at;
  if (local < 0) return null;
  const gone = interpolate(frame, [p.eraseAt, p.eraseAt + 5], [1, 0], clamp);
  if (gone <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: p.x,
        top: p.y,
        width: p.w,
        minHeight: p.h,
        backgroundColor: "#fff",
        border: "4px solid #000",
        boxShadow: "12px 12px 0 #000",
        fontFamily: font.sans,
        opacity: gone,
        scale: String(
          interpolate(local, [0, 4], [1.18, 1], { ...clamp, easing: Easing.out(Easing.back(2)) }) *
            interpolate(gone, [0, 1], [0.94, 1]),
        ),
      }}
    >
      <div
        style={{
          backgroundColor: p.accent,
          borderBottom: "4px solid #000",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "#fff",
          fontWeight: 700,
          fontSize: 22,
        }}
      >
        <span style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((k) => (
            <span key={k} style={{ width: 14, height: 14, backgroundColor: "#fff", border: "2px solid #000" }} />
          ))}
        </span>
        <span style={{ fontFamily: font.mono, letterSpacing: "0.04em", textShadow: "2px 2px 0 #000" }}>
          {p.title}
        </span>
      </div>
      {p.chart ? (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 210, padding: "20px 28px" }}>
          {[0.42, 0.7, 0.55, 0.9, 0.3, 0.78, 0.18].map((v, k) => (
            <div
              key={k}
              style={{
                flex: 1,
                height: `${interpolate(local, [0, 14], [0, v * 100], clamp)}%`,
                backgroundColor: k === 6 ? color.alarm : "#000",
              }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "26px 26px",
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 1.35,
            color: "#000",
            whiteSpace: "pre-line",
          }}
        >
          {p.body}
        </div>
      )}
    </div>
  );
};

export const Noise: React.FC = () => {
  const frame = useCurrentFrame();
  const shown = popups.filter((p) => p.at <= Math.min(frame, FREEZE)).length;
  const isBeat = APPEAR.includes(frame) && frame < FREEZE;
  // 拍のたびに画面全体を揺らす
  const shake = isBeat ? (random(`s${frame}`) - 0.5) * 36 : 0;
  const bg = interpolateColors(frame, TO_WHITE, [color.night, color.washi]);
  const hudOpacity = interpolate(frame, [ERASE_START - 10, ERASE_START], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: bg, overflow: "hidden" }}>
      {/* 背景に流れる「25:00」の帯（参考動画のロゴ壁紙のオマージュ） */}
      <AbsoluteFill style={{ opacity: hudOpacity * 0.16, justifyContent: "space-around" }}>
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            style={{
              fontFamily: font.mono,
              fontWeight: 700,
              fontSize: 190,
              lineHeight: 1,
              whiteSpace: "nowrap",
              color: "transparent",
              WebkitTextStroke: `3px ${color.alarm}`,
              translate: `${(row % 2 === 0 ? -1 : 1) * frame * 6 - 400}px 0px`,
            }}
          >
            25:00 25:00 25:00 25:00 25:00 25:00 25:00
          </div>
        ))}
      </AbsoluteFill>

      <AbsoluteFill style={{ translate: `${shake}px ${-shake / 2}px` }}>
        {popups.map((p) => (
          <Window key={p.i} p={p} frame={frame} />
        ))}
      </AbsoluteFill>

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: 22,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: font.mono,
          fontWeight: 700,
          fontSize: 24,
          color: color.alarm,
          opacity: hudOpacity,
        }}
      >
        <span>FOCUS.EXE — INTERRUPTIONS ×{String(shown).padStart(2, "0")}</span>
        <span style={{ color: frame % 8 < 4 ? color.warn : color.alarm }}>● REC  STREAK 🔥12  SCORE 62</span>
      </div>

      {/* コピー: 積み上げが止まった瞬間に、黒帯で割り込む */}
      {frame >= CAPTION ? (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div
            style={{
              backgroundColor: color.sumi,
              color: color.washi,
              fontFamily: font.mincho,
              fontWeight: 700,
              fontSize: 84,
              padding: "36px 72px",
              letterSpacing: "0.04em",
              opacity: interpolate(frame, [TO_WHITE[0], TO_WHITE[0] + 18], [1, 0], clamp),
              clipPath: `inset(0 ${interpolate(frame, [CAPTION, CAPTION + 10], [100, 0], {
                ...clamp,
                easing: Easing.out(Easing.cubic),
              })}% 0 0)`,
            }}
          >
            集中にとって、ぜんぶノイズだった。
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
