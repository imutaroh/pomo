import type { SceneId } from "../timeline";
import { Boot } from "./Boot";
import { DesktopScene } from "./DesktopScene";
import { FlowBreak } from "./FlowBreak";
import { Follow } from "./Follow";
import { Install } from "./Install";
import { Modes } from "./Modes";
import { Noise } from "./Noise";
import { Presence } from "./Presence";
import { Promises } from "./Promises";
import { Silence } from "./Silence";
import { Words } from "./Words";

export const SCENE_COMPONENTS: Record<SceneId, React.FC> = {
  boot: Boot,
  noise: Noise,
  silence: Silence,
  desktop: DesktopScene,
  presence: Presence,
  follow: Follow,
  flowBreak: FlowBreak,
  modes: Modes,
  promises: Promises,
  words: Words,
  install: Install,
};
