import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { clamp, color, font, formatTime } from "../../theme";
import { INK, GRAY } from "./palette";

// 案 B（墨と赤一点）: 0–3秒。黒地のターミナルは白と灰だけで描き、赤はアラームの下線だけに絞る
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
  // 溶ける速さに比例して版ずれを開く（色収差ではなく、刷りの版がずれたような灰の二重像）
  const speed = interpolate(frame, [COUNT_MELT, ALARM - 1], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const split = 2 + speed * 22;

  // アラーム: 最初の2フレームだけ白黒を反転させ（白で飛ばすと目に刺さる）、以後は黒地のままグリッチ
  const flash = frame >= ALARM && frame < ALARM + 2;
  const glitch = alarm && !flash ? interpolate(frame, [ALARM + 2, ALARM + 8, 88, 89], [110, 30, 30, 160], clamp) : 0;
  const punch = alarm ? interpolate(frame, [ALARM, ALARM + 6], [1.22, 1], { ...clamp, easing: Easing.out(Easing.cubic) }) : 1;
  const underline = alarm ? interpolate(frame, [ALARM + 3, ALARM + 9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }) : 0;
  const bg = flash ? GRAY[9] : INK;
  const ink = flash ? INK : "#fff";

  return (
    <AbsoluteFill style={{ backgroundColor: bg, fontFamily: font.mono, overflow: "hidden" }}>
      {!alarm ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 120,
              top: 110,
              color: GRAY[9],
              fontSize: 54,
              lineHeight: 1.5,
              textShadow: `-2px 0 0 ${GRAY[3]}, 2px 0 0 ${GRAY[5]}`,
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
              <div style={{ fontSize: 30, color: GRAY[6] }}>
                {frame >= ENTER + 2 ? "[OK] session started  --  do not disturb: OFF" : ""}
              </div>
            ) : null}
          </div>

          {frame >= COUNT_FROM ? (
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingTop: 140 }}>
              <div
                style={{
                  color: "#fff",
                  fontSize: 340,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  scale: String(interpolate(frame, [COUNT_FROM, COUNT_FROM + 3], [1.15, 1], clamp) + speed * 0.12),
                  textShadow: `${-split}px 0 0 ${GRAY[4]}, ${split}px 0 0 ${GRAY[2]}`,
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
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    fontFamily: font.sans,
                    fontWeight: 700,
                    fontSize: 280,
                    color: ink,
                    textShadow: flash ? undefined : `-14px 0 0 ${GRAY[3]}`,
                  }}
                >
                  時間です。
                </div>
                {/* 赤はこの下線一本だけ。左から引かれる */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: -6,
                    height: 22,
                    width: `${underline * 100}%`,
                    backgroundColor: color.alarm,
                  }}
                />
              </div>
            </AbsoluteFill>
          </Sliced>
          {/* ノイズブロック（灰の階調だけ） */}
          {new Array(flash ? 0 : 9).fill(0).map((_, k) => {
            const seed = `blk-${Math.floor(frame / 2)}-${k}`;
            if (random(`${seed}-on`) < 0.45) return null;
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: random(`${seed}-x`) * 1800,
                  top: random(`${seed}-y`) * 1040,
                  width: 60 + random(`${seed}-w`) * 420,
                  height: 6 + random(`${seed}-h`) * 34,
                  backgroundColor: [GRAY[7], "#fff", GRAY[3], GRAY[5]][k % 4],
                  opacity: 0.85,
                }}
              />
            );
          })}
        </AbsoluteFill>
      ) : null}

      {/* スキャンライン（ブラウン管の横縞）と、ゆっくり下る明るい帯 */}
      <AbsoluteFill
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 2px, transparent 2px, transparent 5px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: 180,
          top: ((frame * 14) % 1300) - 200,
          background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.05), transparent)",
        }}
      />
    </AbsoluteFill>
  );
};
