import { Trail } from "@remotion/motion-blur";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { clamp, color, font } from "../../theme";
import { INK, GRAY } from "./palette";

// 案 B（墨と赤一点）: 3–15秒。構造と拍は本編の Noise と同じ。
// 色を黒・灰・白に落とし、赤は点数・下向き矢印・最後の棒・REC の点だけに差す。
// うるささは彩度ではなく、新聞の紙面のような文字の密度と網点で出す

type Popup = {
  title: string;
  body: string;
  // タイトルバーの灰の段（palette の GRAY の添字）
  tone: number;
  chart?: boolean;
};

// 赤を差す語: 点数の数字と下向きの矢印。絵文字は灰に落として、色の面積を作らない
const MARK = /(↓[\d,]*|62|🔥|🏅)/;
const Body: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(MARK).map((part, k) =>
      part === "🔥" || part === "🏅" ? (
        <span key={k} style={{ filter: "grayscale(1) contrast(1.4)" }}>
          {part}
        </span>
      ) : MARK.test(part) && part !== "" ? (
        <span key={k} style={{ color: color.alarm }}>
          {part}
        </span>
      ) : (
        part
      ),
    )}
  </>
);

// ノイズとして描くのは「評価と監視」だけ。タイマーや通知そのものは Quiet も持つので出さない
// 最初の5枚（READ 枚）は大きな文字で読ませる。以降は背景と割り切り、同じ言葉の反復で画面を埋める
const READ = 5;
const READ_POS: [number, number][] = [
  [80, 130],
  [1000, 120],
  [140, 620],
  [740, 420],
  [1240, 720],
  // 6枚目は Goal の直後に来るので、左の空きに逃がして Goal を読む時間を残す
  [60, 395],
];
const LEAD: Popup[] = [
  { title: "Streak", body: "🔥 12日連続！\n今日も途切れさせないで", tone: 0},
  { title: "Focus Score", body: "集中スコア 62 / 100\n平均を下回っています", tone: 4},
  { title: "Insight", body: "昨日より 18分\n少ないです", tone: 7},
  { title: "今週の集中時間", body: "", tone: 2, chart: true },
  { title: "Goal", body: "目標まで あと47分\n達成率 61%", tone: 8},
  { title: "Ranking", body: "ランキング 4,812位\n先週より ↓312", tone: 5},
  { title: "Badge", body: "🏅 バッジまで あと3日", tone: 1},
  { title: "Sync", body: "記録を同期しています… 37%", tone: 6},
  { title: "Weekly Report", body: "今週のレポートが\n届きました", tone: 3},
  { title: "Streak", body: "ストリークが\n途切れそうです！", tone: 0},
  { title: "Goal", body: "⚠ 今日の目標 未達成", tone: 0},
  { title: "History", body: "集中の記録 1,284件", tone: 7},
];
const FILLER: Popup[] = [
  { title: "Streak", body: "🔥 途切れさせないで", tone: 0},
  { title: "Score", body: "スコア ↓4", tone: 4},
  { title: "Goal", body: "目標 未達成", tone: 8},
  { title: "Ranking", body: "順位が下がりました", tone: 6},
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
const CAPTION = 246; // コピーが割り込む
// 消える後半は音が引いていくように、間隔を広げてゆっくり
const ERASE_START = 270;
const ERASE_END = 288;
// 消え方は opacity ではなく横からの拭き取り。半透明の窓は墨地の上で濁った灰の板になるため
const ERASE_FADE = 6;
// 白は中央から光が広がるように満ちる（全面を色補間すると途中で濁った灰色を通るため）。
// 最後の窓が拭き取られ終わる（ERASE_END + ERASE_FADE = 294）まで待ってから始める
const TO_WHITE: [number, number] = [298, 334];
// 白い円の縁のぼかし幅。広いと墨地との間に灰の輪ができるので細く固定する
const WHITE_EDGE = 18;
const CAPTION_OUT: [number, number] = [320, 340]; // 345 以降は washi 一色で止める

const ENTER_FRAMES = 5;

const popups = APPEAR.map((at, i) => {
  const p = i < LEAD.length ? LEAD[i] : FILLER[i % FILLER.length];
  const fontSize = i < READ ? 52 : 38;
  // 改行は本文の \n だけで決める（折り返させない）ので、最長行が収まる幅を下限にする
  const longest = Math.max(...p.body.split("\n").map((l) => l.length));
  const w = p.chart
    ? 520
    : i < READ
      ? longest * fontSize + 80
      : Math.max(470 + Math.round(random(`w${i}`) * 200), longest * fontSize + 80);
  const h = p.chart ? 300 : 200;
  // 読ませる枚は互いに重ならない位置に置く（後続に覆われるまで読めるように）
  const fixed = READ_POS[i];
  const x = fixed ? fixed[0] : 40 + random(`x${i}`) * (1920 - w - 80);
  const y = fixed ? fixed[1] : 80 + random(`y${i}`) * (1080 - h - 120);
  // 飛び込んでくる向き（上下左右のどれか）
  const angle = Math.floor(random(`dir${i}`) * 4) * (Math.PI / 2) + Math.PI / 4;
  // 消えるのは後から来たものから。後ろほど間が空く（Easing.in で終盤が疎になる）
  const order = (APPEAR.length - 1 - i) / (APPEAR.length - 1);
  const eraseAt = ERASE_START + Easing.in(Easing.quad)(order) * (ERASE_END - ERASE_START);
  return { ...p, at, w, h, x, y, angle, eraseAt, i, fontSize };
});

// 直前の拍からの経過（カメラの寄り・揺れを拍に同期させる）
const sinceBeat = (frame: number) => {
  const last = [...APPEAR].reverse().find((a) => a <= frame && a < FREEZE);
  return last === undefined ? Infinity : frame - last;
};

const Window: React.FC<{ p: (typeof popups)[number] }> = ({ p }) => {
  const frame = useCurrentFrame();
  const local = frame - p.at;
  if (local < 0) return null;
  // 0 → 100: 左から右へ拭き取る。影の斜線（右下へ 16px はみ出す）まで消すので inset を枠の外まで伸ばす
  const wipe = interpolate(frame, [p.eraseAt, p.eraseAt + ERASE_FADE], [0, 100], {
    ...clamp,
    easing: Easing.in(Easing.quad),
  });
  if (wipe >= 100) return null;

  const enter = interpolate(local, [0, ENTER_FRAMES], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const fly = (1 - enter) * 220;

  return (
    <div
      style={{
        position: "absolute",
        left: p.x,
        top: p.y,
        width: p.w,
        fontFamily: font.sans,
        translate: `${Math.cos(p.angle) * fly}px ${Math.sin(p.angle) * fly}px`,
        scale: String(interpolate(enter, [0, 1], [1.25, 1])),
        clipPath: wipe > 0 ? `inset(-24px -24px -24px calc(${wipe}% + ${wipe * 0.24}px))` : undefined,
      }}
    >
      {/* 影は塗りではなく斜線の網（刷り物の影）。暗い背景でも枠の外に段が読める */}
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          right: -16,
          bottom: -16,
          backgroundImage: `repeating-linear-gradient(-45deg, ${GRAY[7]} 0px, ${GRAY[7]} 3px, transparent 3px, transparent 8px)`,
        }}
      />
      {/* 黒枠の外に白い細枠を足す。#000 の枠だけだと墨地（INK）と同化して窓の輪郭が消える */}
      <div style={{ position: "relative", minHeight: p.h, backgroundColor: "#fff", border: "4px solid #000", outline: `2px solid ${GRAY[9]}` }}>
      <div
        style={{
          // 墨に近い段（0/1）は地に溶けるので、タイトルバーは GRAY[2] より明るくする
          backgroundColor: GRAY[Math.max(2, p.tone)],
          borderBottom: "4px solid #000",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: p.tone >= 7 ? "#000" : "#fff",
          fontWeight: 700,
          fontSize: 22,
        }}
      >
        <span style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((k) => (
            <span key={k} style={{ width: 14, height: 14, backgroundColor: p.tone >= 7 ? "#000" : "#fff", border: "2px solid #000" }} />
          ))}
        </span>
        <span style={{ fontFamily: font.mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
                height: `${interpolate(local, [2 + k, 14 + k], [0, v * 100], { ...clamp, easing: Easing.out(Easing.back(1.6)) })}%`,
                backgroundColor: k === 6 ? color.alarm : "#000",
              }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "26px 26px",
            fontSize: p.fontSize,
            fontWeight: 700,
            lineHeight: 1.35,
            color: "#000",
            whiteSpace: "pre",
          }}
        >
          <Body text={p.body} />
        </div>
      )}
      </div>
    </div>
  );
};

// 背景の「評価」の帯（スコア・ストリーク・順位）。積み上がるほど速く、濃くなる
const Bands: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  // 位置は速度の積分（frame^2）で、だんだん加速して流れる
  const travel = frame * 4 + frame * frame * 0.035;
  return (
    <AbsoluteFill style={{ opacity, justifyContent: "space-between", paddingTop: 40, rotate: "-4deg", scale: "1.12" }}>
      {[0, 1, 2, 3, 4, 5].map((row) => {
        const filled = row % 3 === 1;
        return (
          <div
            key={row}
            style={{
              fontFamily: font.mono,
              fontWeight: 700,
              fontSize: 168,
              lineHeight: 1,
              whiteSpace: "nowrap",
              color: filled ? GRAY[3] : "transparent",
              WebkitTextStroke: filled ? undefined : `3px ${row === 4 ? GRAY[8] : GRAY[6]}`,
              translate: `${(row % 2 === 0 ? -1 : 1) * travel - 600 - row * 130}px 0px`,
            }}
          >
            SCORE 62 ■ STREAK 12 ■ RANK 4,812 ■ SCORE 62 ■ STREAK 12 ■ RANK 4,812
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// 背景の紙面: 評価の数字だけで組んだ新聞の段組み。段の罫線と網点で「刷り物の密度」を出す
const PRINT_LINES = [
  "SCORE 62 / 100 ▼4",
  "STREAK 12 DAYS",
  "RANK 4,812 ▼312",
  "GOAL 61% — 47 MIN LEFT",
  "INSIGHT −18 MIN vs YDAY",
  "SYNC 37% ……",
  "HISTORY 1,284 SESSIONS",
  "BADGE IN 3 DAYS",
  "WEEKLY REPORT №38",
];
const COLS = 6;
const Newsprint: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const colW = 1920 / COLS;
  return (
    <AbsoluteFill
      style={{
        opacity,
        // 網点（ハーフトーン）
        backgroundImage: `radial-gradient(${GRAY[2]} 1.6px, transparent 2px)`,
        backgroundSize: "7px 7px",
      }}
    >
      {new Array(COLS).fill(0).map((_, c) => {
        // 段ごとに違う速さで上へ流す（輪転機の紙送り）
        const speed = 0.6 + random(`col-v-${c}`) * 1.2;
        const offset = -frame * speed - random(`col-o-${c}`) * 200;
        return (
          <div
            key={c}
            style={{
              position: "absolute",
              left: c * colW,
              top: 0,
              width: colW,
              height: 1080,
              borderLeft: c === 0 ? undefined : `2px solid ${GRAY[3]}`,
              padding: "0 18px",
              overflow: "hidden",
              fontFamily: font.mono,
              fontWeight: 500,
              fontSize: 19,
              lineHeight: 1.55,
              color: GRAY[4],
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ translate: `0px ${offset}px` }}>
              {new Array(80).fill(0).map((__, r) => {
                const line = PRINT_LINES[(r * 5 + c * 2) % PRINT_LINES.length];
                // ときどき見出しのように太く大きく刷る
                const head = random(`head-${c}-${r}`) < 0.1;
                return (
                  <div
                    key={r}
                    style={
                      head
                        ? { fontSize: 34, fontWeight: 700, color: GRAY[5], borderTop: `3px solid ${GRAY[4]}`, borderBottom: `1px solid ${GRAY[4]}`, margin: "6px 0" }
                        : undefined
                    }
                  >
                    {line}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const COPY = "集中にとって、ぜんぶノイズだった。";

// コピーの黒帯。割り込む瞬間だけ版ずれと横ずれで割れて、すぐに静止する（赤は細い版ずれだけ）
const CaptionBar: React.FC<{ frame: number }> = ({ frame }) => {
  const local = frame - CAPTION;
  if (local < 0) return null;
  const wipe = interpolate(local, [0, 8], [100, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const glitch = interpolate(local, [0, 9], [1, 0], clamp);
  const dx = (random(`cap-dx-${frame}`) - 0.5) * 70 * glitch;
  const split = 10 * glitch;
  // 消え際は opacity だと白地の上で灰色に濁るので、左から右へ拭き取る
  const erase = interpolate(frame, CAPTION_OUT, [0, 100], { ...clamp, easing: Easing.inOut(Easing.cubic) });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          backgroundColor: color.sumi,
          color: color.washi,
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: 88,
          padding: "40px 80px",
          letterSpacing: "0.04em",
          translate: `${dx}px 0px`,
          clipPath: `inset(0 ${wipe}% 0 ${erase}%)`,
          textShadow: split > 0.5 ? `${-split}px 0 0 ${color.alarm}, ${split}px 0 0 ${GRAY[6]}` : undefined,
          boxShadow: `0 0 0 ${interpolate(local, [0, 6], [14, 0], clamp)}px #fff`,
        }}
      >
        {COPY}
      </div>
    </AbsoluteFill>
  );
};

export const Noise: React.FC = () => {
  const frame = useCurrentFrame();
  const shown = popups.filter((p) => p.at <= Math.min(frame, FREEZE)).length;
  const beat = sinceBeat(frame);
  // 拍の直後だけ強く揺れて、3フレームで収まる
  const kick = Number.isFinite(beat) ? interpolate(beat, [0, 3], [1, 0], clamp) : 0;
  const density = interpolate(frame, [0, FREEZE], [0.4, 1], clamp);
  const shakeX = (random(`sx${frame}`) - 0.5) * 40 * kick * density;
  const shakeY = (random(`sy${frame}`) - 0.5) * 24 * kick * density;
  // カメラ: 積み上がるほど寄っていき、拍で一瞬押し込む。消える後半はゆっくり引く
  const push = interpolate(frame, [0, FREEZE, ERASE_START, ERASE_END + 10], [1, 1.07, 1.07, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.sin),
  });
  const zoom = push + kick * 0.018 * density;
  // 止まった瞬間の一撃（コピーが割り込む直前）。全面を白く飛ばすと目に刺さるので、
  // HUD の帯だけを2フレーム白黒反転させる（拍の ×NN 反転と同じ文法）
  const freezeHit = frame >= FREEZE && frame < FREEZE + 2;

  const light = interpolate(frame, TO_WHITE, [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const bandOpacity =
    interpolate(frame, [0, FREEZE], [0.12, 0.3], clamp) * interpolate(frame, [FREEZE, ERASE_START], [1, 0.5], clamp) *
    interpolate(frame, [ERASE_START, ERASE_START + 30], [1, 0], clamp);
  // 紙面は帯より先に濃くなり、消える後半で帯と一緒に退く
  const printOpacity =
    interpolate(frame, [0, FREEZE], [0.35, 1], clamp) * interpolate(frame, [ERASE_START, ERASE_START + 30], [1, 0], clamp);
  const hudOpacity = interpolate(frame, [ERASE_START - 10, ERASE_START + 10], [1, 0], clamp);
  // 通知が増えるほどスコアが下がる（ノイズ側の嘘の数字。Quiet は点数を持たない）
  const score = Math.max(0, 62 - (shown - 1) * 2);

  return (
    <AbsoluteFill style={{ backgroundColor: INK, overflow: "hidden" }}>
      <Newsprint frame={frame} opacity={printOpacity} />
      <Bands frame={frame} opacity={bandOpacity} />

      <AbsoluteFill style={{ translate: `${shakeX}px ${shakeY}px`, scale: String(zoom) }}>
        {popups.map((p) => {
          const local = frame - p.at;
          // 飛び込みの数フレームだけ残像を引く（Trail は重いので要所だけ）
          return local >= 0 && local < ENTER_FRAMES ? (
            <Trail key={p.i} layers={4} lagInFrames={0.5} trailOpacity={0.5}>
              <Window p={p} />
            </Trail>
          ) : (
            <Window key={p.i} p={p} />
          );
        })}
      </AbsoluteFill>

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: font.mono,
          fontWeight: 700,
          fontSize: 28,
          color: freezeHit ? INK : GRAY[9],
          opacity: hudOpacity,
          backgroundColor: freezeHit ? GRAY[9] : "#000",
          borderTop: `2px solid ${GRAY[9]}`,
          borderBottom: `2px solid ${GRAY[9]}`,
          padding: "8px 16px",
        }}
      >
        <span>
          FOCUS.EXE — INTERRUPTIONS{" "}
          <span
            style={{
              display: "inline-block",
              // 拍で白黒反転する（色ではなく明暗で殴る）
              color: kick > 0.5 || freezeHit ? "#000" : GRAY[9],
              backgroundColor: kick > 0.5 ? "#fff" : "transparent",
              padding: "0 6px",
              scale: String(1 + kick * 0.35),
            }}
          >
            ×{String(shown).padStart(2, "0")}
          </span>
        </span>
        <span>
          <span style={{ color: color.alarm, opacity: frame % 16 < 8 ? 1 : 0.15 }}>●</span> REC  STREAK{" "}
          <span style={{ filter: "grayscale(1) contrast(1.4)" }}>🔥</span>12  SCORE{" "}
          <span style={{ color: color.alarm }}>{String(score).padStart(2, "0")}</span>
        </span>
      </div>

      {light > 0 ? (
        <AbsoluteFill
          style={{
            // 縁をぼかした円。半径 0 → 画面の対角を覆うまで
            background: `radial-gradient(circle at 50% 50%, ${color.washi} ${light * 1150}px, rgba(250,251,252,0) ${light * 1150 + WHITE_EDGE}px)`,
          }}
        />
      ) : null}

      <CaptionBar frame={frame} />
    </AbsoluteFill>
  );
};
