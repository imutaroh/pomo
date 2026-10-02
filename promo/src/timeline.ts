// 全シーンの開始フレームと、シーンへ入るときのトランジションを一か所に集約する。
// QuietPromo.tsx（本編）と Root.tsx（シーン単体の Composition）はここだけを参照する。
//
// TransitionSeries ではトランジションの長さぶん前後のシーンが重なる。
// 「各シーンの frame 0 = from」を保つため、前のシーンの長さをトランジション分だけ延ばしている
// （延びた末尾は次のシーンのフェードの下に隠れる）。

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 60 * FPS; // 1800

export type SceneId =
  | "boot"
  | "noise"
  | "silence"
  | "desktop"
  | "presence"
  | "flowBreak"
  | "modes"
  | "promises"
  | "words"
  | "install";

export type TransitionIn = { kind: "none" } | { kind: "fade" | "wipe" | "slide"; frames: number };

type SceneDef = { id: SceneId; from: number; transitionIn: TransitionIn };

const s = (sec: number) => Math.round(sec * FPS);
const cut: TransitionIn = { kind: "none" };

export const SCENE_DEFS: SceneDef[] = [
  { id: "boot", from: s(0), transitionIn: cut },
  // ノイズ側はハードカット（グリッチは各シーン内で描く）
  { id: "noise", from: s(3), transitionIn: cut },
  // Noise は最後に白へ抜けきるので、静寂へはカットで繋がる
  { id: "silence", from: s(15), transitionIn: cut },
  { id: "desktop", from: s(17), transitionIn: { kind: "fade", frames: 20 } },
  // Desktop → Presence → FlowBreak は同じデスクトップの上で続くので、カットで繋ぐ
  // （境界フレームでパネルの状態を揃えるのは各シーンの責務）
  { id: "presence", from: s(24), transitionIn: cut },
  { id: "flowBreak", from: s(31), transitionIn: cut },
  { id: "modes", from: s(39), transitionIn: { kind: "fade", frames: 15 } },
  { id: "promises", from: s(45), transitionIn: { kind: "fade", frames: 15 } },
  { id: "words", from: s(51), transitionIn: { kind: "fade", frames: 15 } },
  { id: "install", from: s(55), transitionIn: { kind: "fade", frames: 15 } },
];

const transitionFrames = (t: TransitionIn) => (t.kind === "none" ? 0 : t.frames);

// シーンが画面に出ている長さ（次のシーンの開始まで）
export const sceneLength = (id: SceneId): number => {
  const i = SCENE_DEFS.findIndex((d) => d.id === id);
  const next = SCENE_DEFS[i + 1];
  return (next ? next.from : DURATION) - SCENE_DEFS[i].from;
};

// TransitionSeries.Sequence に渡す長さ（次のシーンのフェードの下に隠れる分を含む）
export const sequenceLength = (id: SceneId): number => {
  const i = SCENE_DEFS.findIndex((d) => d.id === id);
  const next = SCENE_DEFS[i + 1];
  return sceneLength(id) + (next ? transitionFrames(next.transitionIn) : 0);
};

export const sceneFrom = (id: SceneId): number => SCENE_DEFS.find((d) => d.id === id)!.from;

// BGM: うるさい曲はノイズが消えきる瞬間で断ち切り、静かな曲は静寂が明けてから
export const NOISE_END = sceneFrom("silence");
export const QUIET_BGM_FROM = sceneFrom("desktop");
