import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { clamp, color, font } from "../theme";
import { ZONE_LENGTH, ZoneScreen } from "./ZoneScreen";

// 15–19秒: Zone の最終フレーム（タイマーに寄った構図）からカットで 00:00。
// 白く飛んで、赤地のグリッチで「時間です。」（v1 Boot のアラーム表現）→ 暗転して明朝で
// 「いま、いいところだったのに。」。暗いまま Noise（暗い壁紙に通知バナー）へカットで渡す

const CYAN = "#00E5FF";
const DARK = "#0B0D12"; // Noise の地と同じ

const ZERO_TO = 6; // 00:00 を見せる長さ
const ALARM = ZERO_TO + 2; // 白飛び 2 フレームのあと赤
const ALARM_OUT = 60; // ここで暗転
const COPY_FROM = 64;
const COPY = "いま、いいところだったのに。";

// 文字を横帯に切って、帯ごとにずらす（アラーム時のグリッチ。v1 Boot から）
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
        const on = random(`on-${seed}-${k}`) < (strength > 60 ? 0.6 : 0.2) ? 1 : 0;
        const dx = (random(`dx-${seed}-${k}`) - 0.5) * 2 * strength * on;
        return (
          <AbsoluteFill key={k} style={{ clipPath: `inset(${top}% 0 ${bottom}% 0)`, translate: `${dx}px 0px` }}>
            {children}
          </AbsoluteFill>
        );
      })}
    </>
  );
};

const Alarm: React.FC<{ frame: number }> = ({ frame }) => {
  // 入りで大きく割れ、読める程度に静まり、暗転の直前にもう一度割れる
  const glitch = interpolate(frame, [ALARM, ALARM + 6, ALARM + 12, ALARM_OUT - 5, ALARM_OUT], [110, 30, 8, 8, 150], clamp);
  const punch = interpolate(frame, [ALARM, ALARM + 6], [1.22, 1], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: color.alarm, overflow: "hidden" }}>
      <AbsoluteFill style={{ scale: String(punch) }}>
        <Sliced frame={frame} strength={glitch} bands={7}>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <div
              style={{
                fontFamily: font.sans,
                fontWeight: 700,
                fontSize: 280,
                color: "#fff",
                textShadow: `-14px 0 0 ${CYAN}, 14px 0 0 #000`,
              }}
            >
              時間です。
            </div>
          </AbsoluteFill>
        </Sliced>
        {/* ノイズブロック。静まっている間は数を減らす */}
        {new Array(9).fill(0).map((_, k) => {
          const seed = `blk-${Math.floor(frame / 2)}-${k}`;
          if (random(`${seed}-on`) < (glitch > 20 ? 0.45 : 0.85)) return null;
          return (
            <div
              key={k}
              style={{
                position: "absolute",
                left: random(`${seed}-x`) * 1800,
                top: random(`${seed}-y`) * 1040,
                width: 60 + random(`${seed}-w`) * 420,
                height: 6 + random(`${seed}-h`) * 34,
                backgroundColor: [color.warn, "#000", "#fff", CYAN][k % 4],
                opacity: 0.85,
              }}
            />
          );
        })}
      </AbsoluteFill>
      {/* スキャンライン */}
      <AbsoluteFill
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 2px, transparent 2px, transparent 5px)",
        }}
      />
    </AbsoluteFill>
  );
};

export const Cut: React.FC = () => {
  const frame = useCurrentFrame();

  if (frame < ZERO_TO) {
    // Zone の続き。タイマーは 00:00 で赤く染まり、画面が小さく揺れる
    const shake = interpolate(frame, [0, ZERO_TO], [10, 3], clamp);
    return (
      <AbsoluteFill style={{ backgroundColor: DARK }}>
        <AbsoluteFill style={{ translate: `${(random(`sx-${frame}`) - 0.5) * 2 * shake}px ${(random(`sy-${frame}`) - 0.5) * 2 * shake}px` }}>
          <ZoneScreen frame={ZONE_LENGTH} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  if (frame < ALARM) return <AbsoluteFill style={{ backgroundColor: "#fff" }} />;
  if (frame < ALARM_OUT) return <Alarm frame={frame} />;

  // 暗転。明朝の一行をフェードで置いて、そのまま Noise へ切る
  const o = interpolate(frame, [COPY_FROM, COPY_FROM + 14], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: DARK, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          opacity: o,
          translate: `0px ${interpolate(o, [0, 1], [10, 0])}px`,
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: 92,
          letterSpacing: "0.08em",
          color: color.washi,
        }}
      >
        {COPY}
      </div>
    </AbsoluteFill>
  );
};
