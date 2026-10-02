import { AbsoluteFill, random } from "remotion";

// 案 D の 2 色（ノイズ側だけで使う。後半の白・墨・ティールとは混ぜない）
export const D = {
  navy: "#0D1520",
  amber: "#D9A441",
  paper: "#EDE6D6",
  // ポップアップの地。線が重なっても絡まないよう、紺で塗りつぶす
  fill: "rgba(13,21,32,0.92)",
};

// フィルムの粒（amount は粒 1 つの濃さの倍率）。スマホ幅（×0.2）と X の圧縮でも潰れないよう、
// 数を絞って粒を大きく濃くする。撒き直しは 3 フレームごと（細かく撒き直すほど圧縮でビットレートを食うだけになる）
export const Grain: React.FC<{ frame: number; amount?: number; count?: number }> = ({
  frame,
  amount = 1,
  count = 420,
}) => {
  if (amount <= 0) return null;
  const seed = Math.floor(frame / 3);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        {new Array(count).fill(0).map((_, k) => {
          const r = random(`g-${seed}-${k}`);
          const size = 4 + random(`gs-${seed}-${k}`) * 4;
          return (
            <rect
              key={k}
              x={random(`gx-${seed}-${k}`) * 1920}
              y={random(`gy-${seed}-${k}`) * 1080}
              width={size}
              height={size}
              // 大半は紙色の白い粒、2割だけアンバーの粒
              fill={r < 0.2 ? D.amber : D.paper}
              opacity={Math.min(0.7, (0.25 + random(`go-${seed}-${k}`) * 0.25) * amount)}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// スキャンラインとゆっくり下る明るい帯（縮小しても縞が残るよう 2px 線・6px 周期）
export const Scan: React.FC<{ frame: number; opacity?: number }> = ({ frame, opacity = 1 }) => (
  <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
    <AbsoluteFill
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 2px, transparent 2px, transparent 6px)",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height: 220,
        top: ((frame * 9) % 1400) - 260,
        background: "linear-gradient(180deg, transparent, rgba(237,230,214,0.06), transparent)",
      }}
    />
  </AbsoluteFill>
);

// 四隅の減光（フィルムの周辺落ち）
export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(4,8,14,0.55) 100%)",
    }}
  />
);
