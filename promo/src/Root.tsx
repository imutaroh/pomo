import { Composition, Folder } from "remotion";
import { QuietPromo } from "./QuietPromo";
import { SCENE_COMPONENTS } from "./scenes";
import { DURATION, FPS, HEIGHT, SCENE_DEFS, sceneLength, WIDTH } from "./timeline";
import { QuietPromoX } from "./x/QuietPromoX";
import { X_DURATION, X_SIZE } from "./x/segments";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="QuietPromo" component={QuietPromo} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
      {/* X 投稿版（正方形・60 秒以内）。本編から区間を抜き出してつなぐ（src/x/segments.ts） */}
      <Composition id="QuietPromoX" component={QuietPromoX} durationInFrames={X_DURATION} fps={FPS} width={X_SIZE} height={X_SIZE} />
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
    </>
  );
};
