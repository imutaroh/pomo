import { Series } from "remotion";
import { Boot } from "./Boot";
import { Noise } from "./Noise";

// 配色案 D（比較用）: 紺地にアンバーと紙色の 2 トーン、線のポップアップ、フィルムの粒。本編には使わない
export const BootNoiseD: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={90}>
      <Boot />
    </Series.Sequence>
    <Series.Sequence durationInFrames={360}>
      <Noise />
    </Series.Sequence>
  </Series>
);
