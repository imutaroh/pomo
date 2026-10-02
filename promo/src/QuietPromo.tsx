import { Audio } from "@remotion/media";
import { AbsoluteFill, getStaticFiles, Series, staticFile, useVideoConfig } from "remotion";
import { Boot } from "./scenes/Boot";
import { Noise } from "./scenes/Noise";
import { Outro } from "./scenes/Outro";
import { QuietScene } from "./scenes/QuietScene";

// 30fps × 900 フレーム = 30秒
// 0–2s Boot / 2–14s Noise（積み上げ→コピー→一枚ずつ消える）/ 14–24s Quiet / 24–30s Outro
export const SCENES = { boot: 60, noise: 360, quiet: 300, outro: 180 } as const;
export const DURATION = SCENES.boot + SCENES.noise + SCENES.quiet + SCENES.outro;

const NOISE_END = SCENES.boot + SCENES.noise;

// public/ に置かれていれば鳴らす。無ければ無音で書き出せる
const hasFile = (name: string) => getStaticFiles().some((f) => f.name === name);

export const QuietPromo: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <Series>
        <Series.Sequence name="Boot" durationInFrames={60} premountFor={fps}>
          <Boot />
        </Series.Sequence>
        <Series.Sequence name="Noise" durationInFrames={360} premountFor={fps}>
          <Noise />
        </Series.Sequence>
        <Series.Sequence name="Quiet" durationInFrames={300} premountFor={fps}>
          <QuietScene />
        </Series.Sequence>
        <Series.Sequence name="Outro" durationInFrames={180} premountFor={fps}>
          <Outro />
        </Series.Sequence>
      </Series>

      {/* うるさい曲は、ノイズが消えきる瞬間（14秒）で断ち切る */}
      {hasFile("bgm.mp3") ? (
        <Audio name="BGM (noise)" src={staticFile("bgm.mp3")} durationInFrames={NOISE_END} premountFor={fps} />
      ) : null}
      {/* 静かな曲は、2秒の無音を置いてから（16秒〜） */}
      {hasFile("bgm-quiet.mp3") ? (
        <Audio
          name="BGM (quiet)"
          src={staticFile("bgm-quiet.mp3")}
          from={NOISE_END + 2 * fps}
          premountFor={fps}
        />
      ) : null}
    </AbsoluteFill>
  );
};
