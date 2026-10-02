import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { clamp, font, formatTime } from "../../theme";
import { D, Grain, Scan, Vignette } from "./Texture";

// 案 D: 0–3秒。紺地のターミナル。色はアンバーと紙色の 2 色だけ。
// 25分の集中が始まり、加速しながら溶けて「時間です。」で割れる（タイミングは本編と同じ）
const COMMAND = "> focus.start --strict 25m";

const ENTER = 44; // Enter キー
const COUNT_FROM = 50; // 25:00 が出る
const COUNT_MELT = 59; // ここから溶け始める（25:00 を一拍読ませてから）
const ALARM = 72; // 00:00 → 割れる

// 1文字ごとの打鍵フレーム。単語の切れ目（空白）の前で一拍ためて、人が打つリズムにする
const KEY_AT: number[] = (() => {
  const out: number[] = [];
  let t = 4;
  for (let i = 0; i < COMMAND.length; i++) {
    out.push(Math.round(t));
    const ch = COMMAND[i];
    t += ch === " " ? 2 + random(`gap${i}`) * 1.5 : 0.7 + random(`key${i}`) * 0.7;
  }
  return out;
})();

// 文字を横帯に切って、帯ごとにずらす（アラーム時のグリッチ）
const Sliced: React.FC<{ frame: number; strength: number; bands: number; children: React.ReactNode }> = ({
  frame,
  strength,
  bands,
  children,
}) => {
  if (strength <= 0) return <>{children}</>;
  // 2フレームごとに帯の切り方を変える（毎フレームだと読めなくなる）
  const seed = Math.floor(frame / 2);
  const cuts = new Array(bands - 1)
    .fill(0)
    .map((_, k) => random(`cut-${seed}-${k}`) * 100)
    .sort((a, b) => a - b);
  const edges = [0, ...cuts, 100];
  return (
    <>
      {edges.slice(0, -1).map((top, k) => {
        const bottom = 100 - edges[k + 1];
        const dx = (random(`dx-${seed}-${k}`) - 0.5) * 2 * strength * (random(`on-${seed}-${k}`) < (strength > 60 ? 0.6 : 0.2) ? 1 : 0);
        return (
          <AbsoluteFill key={k} style={{ clipPath: `inset(${top}% 0 ${bottom}% 0)`, translate: `${dx}px 0px` }}>
            {children}
          </AbsoluteFill>
        );
      })}
    </>
  );
};

export const Boot: React.FC = () => {
  const frame = useCurrentFrame();
  const typedCount = KEY_AT.filter((at) => at <= frame).length;
  const typed = COMMAND.slice(0, typedCount);
  const alarm = frame >= ALARM;

  // 25:00 → 00:00。後半ほど速く溶ける
  const remaining = interpolate(frame, [COUNT_MELT, ALARM - 1], [25 * 60, 0], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  // 溶ける速さに比例してアンバーのずれ（版ずれ）を開く。色を増やさず、同じ 2 色をずらす
  const speed = interpolate(frame, [COUNT_MELT, ALARM - 1], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const split = 2 + speed * 22;

  // アラーム: 全面を光らせず（面が光ると刺さる）、紺地のまま拡大の一撃と粒の量で頭を立てる
  const glitch = alarm ? interpolate(frame, [ALARM + 1, ALARM + 8, 88, 89], [110, 30, 30, 160], clamp) : 0;
  const punch = alarm ? interpolate(frame, [ALARM, ALARM + 6], [1.22, 1], { ...clamp, easing: Easing.out(Easing.cubic) }) : 1;
  // 鳴っている間は粒を濃く荒くする（色の面積ではなく質感でうるささを出す）
  const grain = alarm ? interpolate(frame, [ALARM, ALARM + 6], [1.4, 1.1], clamp) : 0.8;

  return (
    <AbsoluteFill style={{ backgroundColor: D.navy, fontFamily: font.mono, overflow: "hidden" }}>
      {!alarm ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 120,
              top: 110,
              color: D.amber,
              fontSize: 54,
              lineHeight: 1.5,
              textShadow: "0 0 18px rgba(217,164,65,0.35)",
            }}
          >
            <div style={{ opacity: interpolate(frame, [0, 1, 2, 3], [0, 0.6, 0.2, 0.6], clamp), fontSize: 28 }}>
              FOCUS.EXE v25.0 — session manager
            </div>
            <div style={{ marginTop: 18 }}>
              {typed}
              {/* 打鍵中は点灯したまま、止まったら点滅 */}
              {frame < ENTER && (frame - (KEY_AT[typedCount - 1] ?? 0) < 4 || frame % 10 < 5) ? (
                <span>█</span>
              ) : null}
            </div>
            {frame >= ENTER ? (
              <div style={{ fontSize: 30, color: D.paper, opacity: 0.6 }}>
                {frame >= ENTER + 2 ? "[OK] session started  --  do not disturb: OFF" : ""}
              </div>
            ) : null}
          </div>

          {frame >= COUNT_FROM ? (
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingTop: 140 }}>
              <div
                style={{
                  color: D.paper,
                  fontSize: 340,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  scale: String(interpolate(frame, [COUNT_FROM, COUNT_FROM + 3], [1.15, 1], clamp) + speed * 0.12),
                  textShadow: `${-split}px 0 0 rgba(217,164,65,0.85), ${split}px 0 0 rgba(217,164,65,0.35)`,
                  filter: `blur(${speed * 3}px)`,
                }}
              >
                {formatTime(remaining)}
              </div>
            </AbsoluteFill>
          ) : null}
        </>
      ) : null}

      {alarm ? (
        <AbsoluteFill style={{ scale: String(punch) }}>
          <Sliced frame={frame} strength={glitch} bands={7}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
              <div
                style={{
                  fontFamily: font.sans,
                  fontWeight: 700,
                  fontSize: 280,
                  color: D.amber,
                  // 塗りのアンバーに、紙色の輪郭だけをずらして重ねる
                  textShadow: `-12px 0 0 rgba(237,230,214,0.55), 0 0 40px rgba(217,164,65,0.35)`,
                }}
              >
                時間です。
              </div>
            </AbsoluteFill>
          </Sliced>
          {/* ノイズブロックは塗りではなく細い線で走らせる */}
          {new Array(11).fill(0).map((_, k) => {
            const seed = `blk-${Math.floor(frame / 2)}-${k}`;
            if (random(`${seed}-on`) < 0.4) return null;
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: random(`${seed}-x`) * 1800,
                  top: random(`${seed}-y`) * 1040,
                  width: 60 + random(`${seed}-w`) * 520,
                  height: 4 + random(`${seed}-h`) * 26,
                  border: `2px solid ${k % 3 === 0 ? D.paper : D.amber}`,
                  opacity: 0.7,
                }}
              />
            );
          })}
        </AbsoluteFill>
      ) : null}

      <Grain frame={frame} amount={grain} count={alarm ? 700 : 420} />
      <Scan frame={frame} />
      <Vignette />
    </AbsoluteFill>
  );
};
