import { Composition, Folder } from "remotion";
import { QuietPromo } from "./QuietPromo";
import { SCENE_COMPONENTS } from "./scenes";
import { BootNoiseA } from "./variants/A";
import { BootNoiseB } from "./variants/B";
import { BootNoiseC } from "./variants/C";
import { BootNoiseD } from "./variants/D";
import { DURATION, FPS, HEIGHT, SCENE_DEFS, sceneLength, WIDTH } from "./timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="QuietPromo" component={QuietPromo} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
      {/* シーン単体（still の書き出し・調整用）。frame 0 = 本編の各シーン開始 */}
      <Folder name="Scenes">
        {SCENE_DEFS.map((def) => (
          <Composition
            key={def.id}
            id={`Scene-${def.id}`}
            component={SCENE_COMPONENTS[def.id]}
            durationInFrames={sceneLength(def.id)}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
        ))}
      </Folder>
      {/* Boot + Noise の配色案（比較用。本編には入らない）。frame 0–89 = Boot、90–449 = Noise */}
      <Folder name="Variants">
        {[
          ["A", BootNoiseA],
          ["B", BootNoiseB],
          ["C", BootNoiseC],
          ["D", BootNoiseD],
        ].map(([id, C]) => (
          <Composition
            key={id as string}
            id={`Variant-${id}`}
            component={C as React.FC}
            durationInFrames={450}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
        ))}
      </Folder>
    </>
  );
};
