import { Composition, Folder } from "remotion";
import { DURATION, QuietPromo, SCENES } from "./QuietPromo";
import { Boot } from "./scenes/Boot";
import { Noise } from "./scenes/Noise";
import { Outro } from "./scenes/Outro";
import { QuietScene } from "./scenes/QuietScene";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="QuietPromo"
        component={QuietPromo}
        durationInFrames={DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Folder name="Scenes">
        <Composition id="Boot" component={Boot} durationInFrames={SCENES.boot} fps={30} width={1920} height={1080} />
        <Composition id="Noise" component={Noise} durationInFrames={SCENES.noise} fps={30} width={1920} height={1080} />
        <Composition id="Quiet" component={QuietScene} durationInFrames={SCENES.quiet} fps={30} width={1920} height={1080} />
        <Composition id="Outro" component={Outro} durationInFrames={SCENES.outro} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
