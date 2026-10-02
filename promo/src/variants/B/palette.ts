// 案 B のノイズ側の無彩色。彩度ゼロの灰だけで刷り、赤（color.alarm）を一点だけ差す
export const INK = "#0D0D0D";
// 0 = 墨に近い黒 … 10 = 白。印刷の網点の濃度のように段で使う
export const GRAY = [
  "#141414",
  "#1F1F1F",
  "#2B2B2B",
  "#3A3A3A",
  "#4D4D4D",
  "#666666",
  "#808080",
  "#9C9C9C",
  "#BDBDBD",
  "#E6E6E6",
  "#FFFFFF",
] as const;
