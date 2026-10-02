import { Series } from "remotion";
import { Boot } from "./Boot";
import { Noise } from "./Noise";

// 配色案 B「墨と赤一点」（比較用）。本編の Boot / Noise を写して無彩色に塗り替えたもの。本編には使わない
export const BootNoiseB: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={90}>
      <Boot />
    </Series.Sequence>
    <Series.Sequence durationInFrames={360}>
      <Noise />
    </Series.Sequence>
  </Series>
);
