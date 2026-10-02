// 案 C「くすみ多色」の色。高彩度のアクセントを、同じ色相のまま彩度と明度を落とした色に置き換える
// 多色でうるさいが、ネオンや発光はしない。Quiet のティールは後半との対比のため使わない
export const dusty = {
  coral: "#C98B7A", // 旧 alarm #FF3B30
  ochre: "#C9A86A", // 旧 warn #FFD60A
  apricot: "#CFA07E", // 旧 #FF9F0A
  slate: "#8FA3B8", // 旧 #0A84FF
  sage: "#9BB09A", // 旧 #30D158
  mauve: "#A891B8", // 旧 #BF5AF2
  ink: "#2A3340", // 枠・影・本文。sumi より一段浅い
  paper: "#EFEAE3", // ポップアップの地。白の終わり（washi）と混ざらないよう生成りに寄せる
  ground: "#1F242B", // 背景。night より少しだけ灰に寄せた暗色
  phosphor: "#A9C2A0", // Boot のターミナル文字。蛍光緑を枯らした色
};

// 紙の粒子（フィルムグレイン）。seed をフレームで回して、止め絵でも生きた質感にする
export const grain = (seed: number, alpha: number) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  )}")`;
