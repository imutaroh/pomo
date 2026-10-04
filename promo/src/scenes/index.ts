import type { SceneId } from "../timeline";
import { Cut } from "./Cut";
import { DesktopScene } from "./DesktopScene";
import { FlowBreak } from "./FlowBreak";
import { Follow } from "./Follow";
import { Install } from "./Install";
import { Modes } from "./Modes";
import { Noise } from "./Noise";
import { Presence } from "./Presence";
import { Promises } from "./Promises";
import { Zone } from "./Zone";
import { Silence } from "./Silence";
import { Words } from "./Words";

export const SCENE_COMPONENTS: Record<SceneId, React.FC> = {
  zone: Zone,
  cut: Cut,
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
