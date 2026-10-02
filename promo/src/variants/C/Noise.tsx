import { Trail } from "@remotion/motion-blur";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { clamp, color, font } from "../../theme";
import { dusty, grain } from "./palette";

// 3–15秒: 集中を邪魔する「ノイズ」が拍ごとに積み上がり、
// 「集中にとって、ぜんぶノイズだった。」で止まって、一枚ずつ静かに消えていく

type Popup = {
  title: string;
  body: string;
  accent: string;
  chart?: boolean;
};

// 案 C: 色ずれの相方もシアンではなく灰青
const CYAN = dusty.slate;

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
  { title: "Streak", body: "🔥 12日連続！\n今日も途切れさせないで", accent: dusty.apricot },
  { title: "Focus Score", body: "集中スコア 62 / 100\n平均を下回っています", accent: dusty.ochre },
  { title: "Insight", body: "昨日より 18分\n少ないです", accent: dusty.mauve },
  { title: "今週の集中時間", body: "", accent: dusty.mauve, chart: true },
  { title: "Goal", body: "目標まで あと47分\n達成率 61%", accent: dusty.sage },
  { title: "Ranking", body: "ランキング 4,812位\n先週より ↓312", accent: dusty.slate },
  { title: "Badge", body: "🏅 バッジまで あと3日", accent: dusty.apricot },
  { title: "Sync", body: "記録を同期しています… 37%", accent: dusty.slate },
  { title: "Weekly Report", body: "今週のレポートが\n届きました", accent: dusty.mauve },
  { title: "Streak", body: "ストリークが\n途切れそうです！", accent: dusty.apricot },
  { title: "Goal", body: "⚠ 今日の目標 未達成", accent: dusty.coral },
  { title: "History", body: "集中の記録 1,284件", accent: dusty.sage },
];
const FILLER: Popup[] = [
  { title: "Streak", body: "🔥 途切れさせないで", accent: dusty.apricot },
  { title: "Score", body: "スコア ↓4", accent: dusty.ochre },
  { title: "Goal", body: "目標 未達成", accent: dusty.coral },
  { title: "Ranking", body: "順位が下がりました", accent: dusty.slate },
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
const ERASE_END = 306;
const ERASE_FADE = 12;
// 白は中央から光が広がるように満ちる（全面を色補間すると途中で濁った灰色を通るため）
const TO_WHITE: [number, number] = [298, 334];
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
  const gone = interpolate(frame, [p.eraseAt, p.eraseAt + ERASE_FADE], [1, 0], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });
  if (gone <= 0) return null;

  const enter = interpolate(local, [0, ENTER_FRAMES], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const fly = (1 - enter) * 220;

  return (
    <div
      style={{
        position: "absolute",
        left: p.x,
        top: p.y,
        width: p.w,
        minHeight: p.h,
        // 太枠と落ち影の構造は残し、墨より浅いインクと生成りの地で硬さを抜く
        backgroundColor: dusty.paper,
        border: `4px solid ${dusty.ink}`,
        boxShadow: `12px 12px 0 ${dusty.ink}`,
        fontFamily: font.sans,
        // 半透明で暗い地に溶かすと生成りが泥っぽい灰を通るので、不透明のまま上から拭き取る
        // （右と下は落ち影 12px のぶん余白をとり、拭き終わりに影だけ残らないよう下端も影ごと越える）
        clipPath:
          gone < 1
            ? `inset(calc(${(1 - gone) * 100}% + ${(1 - gone) * 16}px) -16px -16px -16px)`
            : undefined,
        translate: `${Math.cos(p.angle) * fly}px ${Math.sin(p.angle) * fly}px`,
        scale: String(interpolate(enter, [0, 1], [1.25, 1])),
      }}
    >
      <div
        style={{
          backgroundColor: p.accent,
          borderBottom: `4px solid ${dusty.ink}`,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          // くすんだ地に白文字は沈むので、タイトルはインクで載せる
          color: dusty.ink,
          fontWeight: 700,
          fontSize: 22,
        }}
      >
        <span style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((k) => (
            <span key={k} style={{ width: 14, height: 14, backgroundColor: dusty.paper, border: `2px solid ${dusty.ink}` }} />
          ))}
        </span>
        <span style={{ fontFamily: font.mono, letterSpacing: "0.04em" }}>
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
                backgroundColor: k === 6 ? dusty.coral : dusty.ink,
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
            color: dusty.ink,
            whiteSpace: "pre",
          }}
        >
          {p.body}
        </div>
      )}
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
              color: filled ? "rgba(201,139,122,0.55)" : "transparent",
              // 行ごとに色相を変えて多色のうるささは保つ。どれも同じくすみ具合にそろえる
              WebkitTextStroke: filled ? undefined : `3px ${[dusty.coral, dusty.coral, dusty.slate, dusty.sage, dusty.ochre, dusty.mauve][row]}`,
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

const COPY = "集中にとって、ぜんぶノイズだった。";

// コピーの黒帯。割り込む瞬間だけ色収差と横ずれで割れて、すぐに静止する
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
          textShadow: split > 0.5 ? `${-split}px 0 0 ${dusty.coral}, ${split}px 0 0 ${CYAN}` : undefined,
          boxShadow: `0 0 0 ${interpolate(local, [0, 6], [14, 0], clamp)}px ${dusty.coral}`,
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
  // 止まった瞬間の一撃（コピーが割り込む直前）
  // 止まった瞬間の一閃。1フレームだけ白く飛ばす（薄く長いと灰色のベールに見える）
  const freezeHit = frame === FREEZE ? 0.92 : 0;

  const light = interpolate(frame, TO_WHITE, [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const bandOpacity =
    interpolate(frame, [0, FREEZE], [0.12, 0.3], clamp) * interpolate(frame, [FREEZE, ERASE_START], [1, 0.5], clamp) *
    interpolate(frame, [ERASE_START, ERASE_START + 30], [1, 0], clamp);
  const hudOpacity = interpolate(frame, [ERASE_START - 10, ERASE_START + 10], [1, 0], clamp);
  // 通知が増えるほどスコアが下がる（ノイズ側の嘘の数字。Quiet は点数を持たない）
  const score = Math.max(0, 62 - (shown - 1) * 2);

  return (
    <AbsoluteFill style={{ backgroundColor: dusty.ground, overflow: "hidden" }}>
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

      {/* 紙の粒子。白へ抜ける円より下に置き、washi 一色の終わりには乗せない */}
      <AbsoluteFill
        style={{
          backgroundImage: grain(frame % 6, 0.2),
          backgroundSize: "480px 480px",
          mixBlendMode: "overlay",
        }}
      />

      {/* 止まった瞬間の白い一閃 */}
      {freezeHit > 0 ? <AbsoluteFill style={{ backgroundColor: color.washi, opacity: freezeHit }} /> : null}

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
          color: dusty.coral,
          opacity: hudOpacity,
          backgroundColor: "rgba(20,24,30,0.7)",
          padding: "8px 16px",
        }}
      >
        <span>
          FOCUS.EXE — INTERRUPTIONS{" "}
          <span
            style={{
              display: "inline-block",
              color: kick > 0.5 ? dusty.ochre : dusty.coral,
              scale: String(1 + kick * 0.35),
            }}
          >
            ×{String(shown).padStart(2, "0")}
          </span>
        </span>
        <span style={{ color: frame % 8 < 4 ? dusty.ochre : dusty.coral }}>
          ● REC  STREAK 🔥12  SCORE {String(score).padStart(2, "0")}
        </span>
      </div>

      {light > 0 ? (
        <AbsoluteFill
          style={{
            // 縁のはっきりした紙の円。ぼかすと発光と灰色のリングが出るので、clipPath で切る
            // 半径 0 → 画面の対角（半分で約 1101px）を覆うまで
            backgroundColor: color.washi,
            clipPath: `circle(${light * 1150}px at 50% 50%)`,
          }}
        />
      ) : null}

      <CaptionBar frame={frame} />
    </AbsoluteFill>
  );
};
