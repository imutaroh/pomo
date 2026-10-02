import { Series } from "remotion";
import { Boot } from "./Boot";
import { Noise } from "./Noise";

// 配色案 C（比較用）: くすみ多色。構造とタイミングは本編のまま、色と質感だけ替える。本編には使わない
export const BootNoiseC: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={90}>
      <Boot />
    </Series.Sequence>
    <Series.Sequence durationInFrames={360}>
      <Noise />
    </Series.Sequence>
  </Series>
);
