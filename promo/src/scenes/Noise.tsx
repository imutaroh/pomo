import { Trail } from "@remotion/motion-blur";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { clamp, color, font } from "../theme";

// 19–29秒: Cut（25分で断ち切られる）に続く二つ目のノイズ＝積み上がる記録。評価の通知が拍ごとに積み上がり、
// 「25分で鳴るタイマーも、積み上がっていく記録も、ノイズだった。」で止まって、一枚ずつ静かに消えていく
// 案 A「通知バナーの洪水」: 原色のブルータリズムをやめ、macOS ダークモードの通知バナーの質感で描く。
// 色はアプリアイコンの小さな四角にだけ（彩度を落として）。うるささは量・積み上がり・揺れで出す

type Popup = {
  title: string;
  body: string;
  accent: string;
  chart?: boolean;
};

// ダークモードの通知バナーの素材（半透明の濃いグレー＋細い明るい縁）
const BANNER_EDGE = "rgba(255,255,255,0.13)";
// 暗いバナーどうしが重なると境目が溶けて「暗い塊」になるので、実物のバナーに倣って
// 下方向の深い影・上辺のハイライト・0.5px の明るい外枠・背後のぼかしで一枚ずつ切り分ける
const BANNER_SHADOW = [
  "inset 0 1px 0 rgba(255,255,255,0.3)",
  "0 0 0 0.5px rgba(255,255,255,0.34)",
  "0 30px 80px rgba(0,0,0,0.7)",
  "0 8px 18px rgba(0,0,0,0.5)",
].join(", ");
// 後から来たものほどわずかに明るい（奥行きの順が明るさで読める）。無彩色のまま
const bannerBg = (i: number, n: number) => {
  const l = Math.round(38 + (30 * i) / Math.max(1, n - 1));
  return `rgba(${l},${l},${l + 4},0.74)`;
};
const TEXT_PRIMARY = "#F2F2F7";
const TEXT_SECONDARY = "rgba(235,235,245,0.6)";

// ノイズとして描くのは「記録と評価」だけ。25分で鳴るタイマーは直前の Cut で描いたので、ここでは出さない
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
  { title: "Streak", body: "🔥 12日連続！\n今日も途切れさせないで", accent: "#FF9F0A" },
  { title: "Focus Score", body: "集中スコア 62 / 100\n平均を下回っています", accent: color.warn },
  { title: "Insight", body: "昨日より 18分\n少ないです", accent: "#BF5AF2" },
  { title: "今週の集中時間", body: "", accent: "#BF5AF2", chart: true },
  { title: "Goal", body: "目標まで あと47分\n達成率 61%", accent: "#30D158" },
  { title: "Ranking", body: "ランキング 4,812位\n先週より ↓312", accent: "#0A84FF" },
  { title: "Badge", body: "🏅 バッジまで あと3日", accent: "#FF9F0A" },
  { title: "Sync", body: "記録を同期しています… 37%", accent: "#0A84FF" },
  { title: "Weekly Report", body: "今週のレポートが\n届きました", accent: "#BF5AF2" },
  { title: "Streak", body: "ストリークが\n途切れそうです！", accent: "#FF9F0A" },
  { title: "Goal", body: "⚠ 今日の目標 未達成", accent: color.alarm },
  { title: "History", body: "集中の記録 1,284件", accent: "#30D158" },
];
const FILLER: Popup[] = [
  { title: "Streak", body: "途切れさせないで", accent: "#FF9F0A" },
  { title: "Score", body: "スコア ↓4", accent: color.warn },
  { title: "Goal", body: "目標 未達成", accent: color.alarm },
  { title: "Ranking", body: "順位が下がりました", accent: "#0A84FF" },
];

// 出現フレーム: 最初はゆっくり、だんだん詰まっていく
const APPEAR: number[] = (() => {
  const out: number[] = [];
  let t = 0;
  let gap = 20;
  while (t < 168) {
    out.push(Math.round(t));
    t += gap;
    gap = Math.max(3, gap * 0.86);
  }
  return out;
})();

// 密集は 170f 前後で足りるので早めに止め、コピーを読む時間に回す
const FREEZE = 172; // ここで積み上げが止まる
const CAPTION = 176; // コピーが割り込む（184 で拭き込み完了）
// 消える後半は音が引いていくように、間隔を広げてゆっくり
const ERASE_START = 214;
const ERASE_END = 246;
const ERASE_FADE = 10;
// 白は中央から光が広がるように満ちる（全面を色補間すると途中で濁った灰色を通るため）
const TO_WHITE: [number, number] = [242, 272];
// 2 行のコピーを 184–278 の 94f 読ませる。290 以降（最後の 10f）は washi 一色で止める（後ろの Silence の白 60f が間になる）
const CAPTION_OUT: [number, number] = [278, 290];

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
  // バナーらしく、飛び込みは短い距離で
  const fly = (1 - enter) * 140;
  const titleSize = p.i < READ ? 26 : 22;
  const icon = p.i < READ ? 52 : 44;

  return (
    <div
      style={{
        position: "absolute",
        left: p.x,
        top: p.y,
        width: p.w,
        // 本物のバナーは中身の高さで決まる。h は配置の計算にだけ使う
        minHeight: p.chart ? p.h : undefined,
        backgroundColor: bannerBg(p.i, APPEAR.length),
        // 下のバナーの文字をにじませ、手前の一枚の文字だけがくっきり読めるようにする
        backdropFilter: "blur(14px) brightness(0.8)",
        border: `1px solid ${BANNER_EDGE}`,
        borderRadius: 22,
        boxShadow: BANNER_SHADOW,
        fontFamily: font.sans,
        opacity: gone * interpolate(enter, [0, 1], [0.4, 1]),
        translate: `${Math.cos(p.angle) * fly}px ${Math.sin(p.angle) * fly + (1 - gone) * 18}px`,
        scale: String(interpolate(enter, [0, 1], [1.08, 1]) * interpolate(gone, [0, 1], [0.97, 1])),
        filter: gone < 1 ? `blur(${(1 - gone) * 3}px)` : undefined,
        padding: "22px 26px 24px",
        boxSizing: "border-box",
      }}
    >
      {/* ヘッダー: アプリアイコン（色はここだけ。彩度を落とす）＋アプリ名＋「今」 */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: icon,
            height: icon,
            borderRadius: icon * 0.24,
            backgroundColor: p.accent,
            filter: "saturate(0.55) brightness(0.9)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "rgba(255,255,255,0.92)",
            fontFamily: font.mono,
            fontWeight: 700,
            fontSize: icon * 0.5,
            flexShrink: 0,
          }}
        >
          {/* アプリ名の頭文字。和文タイトル（今週の集中時間）は週報アプリとして W */}
          {/^[A-Za-z]/.test(p.title) ? p.title.slice(0, 1) : "W"}
        </div>
        <span style={{ flex: 1, color: TEXT_SECONDARY, fontWeight: 500, fontSize: titleSize, letterSpacing: "0.02em" }}>
          {p.title}
        </span>
        <span style={{ color: TEXT_SECONDARY, fontWeight: 500, fontSize: titleSize - 2 }}>今</span>
      </div>
      {p.chart ? (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 200, padding: "22px 6px 0" }}>
          {[0.42, 0.7, 0.55, 0.9, 0.3, 0.78, 0.18].map((v, k) => (
            <div
              key={k}
              style={{
                flex: 1,
                borderRadius: 6,
                height: `${interpolate(local, [2 + k, 14 + k], [0, v * 100], { ...clamp, easing: Easing.out(Easing.back(1.6)) })}%`,
                // 赤で刺さないよう、今日だけ白を濃くして「低い」ことを形で見せる
                backgroundColor: k === 6 ? "rgba(235,235,245,0.92)" : "rgba(235,235,245,0.4)",
              }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            marginTop: 14,
            fontSize: p.fontSize,
            fontWeight: 700,
            lineHeight: 1.3,
            color: TEXT_PRIMARY,
            whiteSpace: "pre",
            // 絵文字（🔥🏅）の原色を抑える。白い文字には効かない
            filter: "saturate(0.5)",
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
              // 低コントラストのグレー。壁紙に刷り込まれた文字のように、読めるが主張しない
              color: filled ? "rgba(235,235,245,0.22)" : "transparent",
              WebkitTextStroke: filled ? undefined : "2px rgba(235,235,245,0.3)",
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

// 暗い壁紙（ぼかし）。ノイズ側の色をごく薄く滲ませ、ゆっくり漂わせる
const Wallpaper: React.FC<{ frame: number }> = ({ frame }) => {
  const drift = frame * 0.6;
  return (
    <AbsoluteFill
      style={{
        background: [
          `radial-gradient(ellipse 900px 700px at ${420 + drift}px ${300}px, rgba(10,132,255,0.22), transparent 70%)`,
          `radial-gradient(ellipse 1000px 800px at ${1500 - drift}px ${820}px, rgba(191,90,242,0.18), transparent 70%)`,
          `radial-gradient(ellipse 800px 600px at ${1100}px ${150 + drift * 0.5}px, rgba(255,159,10,0.08), transparent 70%)`,
          color.night,
        ].join(", "),
        filter: "blur(40px)",
        scale: "1.1",
      }}
    />
  );
};

// LP 159 の言葉。Cut の「25分で断ち切られる」とこの場の記録を一文で束ねる
const COPY = "25分で鳴るタイマーも、\n積み上がっていく記録も、ノイズだった。";

// コピーの黒帯。割り込む瞬間だけ色収差と横ずれで割れて、すぐに静止する
const CaptionBar: React.FC<{ frame: number }> = ({ frame }) => {
  const local = frame - CAPTION;
  if (local < 0) return null;
  const wipe = interpolate(local, [0, 8], [100, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const glitch = interpolate(local, [0, 9], [1, 0], clamp);
  const dx = (random(`cap-dx-${frame}`) - 0.5) * 50 * glitch;
  const split = 6 * glitch;
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
          fontSize: 76,
          lineHeight: 1.45,
          whiteSpace: "pre",
          padding: "40px 72px",
          letterSpacing: "0.04em",
          translate: `${dx}px 0px`,
          clipPath: `inset(0 ${wipe}% 0 ${erase}%)`,
          textShadow: split > 0.5 ? `${-split}px 0 0 rgba(255,59,48,0.7)` : undefined,
          boxShadow: `0 0 0 ${interpolate(local, [0, 6], [3, 0], clamp)}px ${color.alarm}`,
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
  // 止まった瞬間の一閃。1フレームだけ白く飛ばす（濃いと画面全体が灰色のベールになるので控えめに）
  const freezeHit = frame === FREEZE ? 0.18 : 0;

  const light = interpolate(frame, TO_WHITE, [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const bandOpacity =
    interpolate(frame, [0, FREEZE], [0.12, 0.3], clamp) * interpolate(frame, [FREEZE, ERASE_START], [1, 0.5], clamp) *
    interpolate(frame, [ERASE_START, ERASE_START + 24], [1, 0], clamp);
  const hudOpacity = interpolate(frame, [ERASE_START - 10, ERASE_START + 10], [1, 0], clamp);
  // 通知が増えるほどスコアが下がる（ノイズ側の嘘の数字。Quiet は点数を持たない）
  const score = Math.max(0, 62 - (shown - 1) * 2);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0B0D12", overflow: "hidden" }}>
      <Wallpaper frame={frame} />
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
          fontWeight: 500,
          fontSize: 26,
          color: TEXT_SECONDARY,
          opacity: hudOpacity,
          backgroundColor: "rgba(28,28,30,0.6)",
          border: `1px solid ${BANNER_EDGE}`,
          borderRadius: 14,
          padding: "8px 20px",
        }}
      >
        <span>
          FOCUS.EXE — INTERRUPTIONS{" "}
          <span
            style={{
              display: "inline-block",
              color: TEXT_PRIMARY,
              fontWeight: 700,
              scale: String(1 + kick * 0.25),
            }}
          >
            ×{String(shown).padStart(2, "0")}
          </span>
        </span>
        <span>
          {/* 赤は録画ランプの小さな点だけ */}
          <span style={{ color: color.alarm, opacity: frame % 16 < 10 ? 1 : 0.35 }}>●</span> REC  STREAK 12  SCORE{" "}
          <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{String(score).padStart(2, "0")}</span>
        </span>
      </div>

      {light > 0 ? (
        <AbsoluteFill
          style={{
            // 縁のくっきりした円。半径 0 → 画面の対角を覆うまで。
            // 縁をぼかすと暗い地と washi の半透明の混色＝濁った灰色の輪になるので、ぼけ幅は 2px だけ
            background: `radial-gradient(circle at 50% 50%, ${color.washi} ${light * 1150}px, rgba(250,251,252,0) ${light * 1150 + 2}px)`,
          }}
        />
      ) : null}

      <CaptionBar frame={frame} />
    </AbsoluteFill>
  );
};
