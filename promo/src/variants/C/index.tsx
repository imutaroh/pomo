import { Series } from "remotion";
import { Boot } from "../../scenes/Boot";
import { Noise } from "../../scenes/Noise";

// 配色案 C（比較用）。担当エージェントが Boot / Noise をこのフォルダに写して塗り替える。本編には使わない
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
