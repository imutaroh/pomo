import { Series } from "remotion";
import { Boot } from "./Boot";
import { Noise } from "./Noise";

// 配色案 A「通知バナーの洪水」（比較用）。本編には使わない
export const BootNoiseA: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={90}>
      <Boot />
    </Series.Sequence>
    <Series.Sequence durationInFrames={360}>
      <Noise />
    </Series.Sequence>
  </Series>
);
