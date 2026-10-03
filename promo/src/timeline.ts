// 全シーンの開始フレームと、シーンへ入るときのトランジションを一か所に集約する。
// QuietPromo.tsx（本編）と Root.tsx（シーン単体の Composition）はここだけを参照する。
//
// TransitionSeries ではトランジションの長さぶん前後のシーンが重なる。
// 「各シーンの frame 0 = from」を保つため、前のシーンの長さをトランジション分だけ延ばしている
// （延びた末尾は次のシーンのフェードの下に隠れる）。

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 79 * FPS; // 2370

export type SceneId =
  | "zone"
  | "cut"
  | "noise"
  | "silence"
  | "desktop"
  | "presence"
  | "follow"
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
  // 前半は「集中を止めるもの」2つ: 乗ってきたところで切る 25 分のタイマーと、積み上がる記録
  { id: "zone", from: s(0), transitionIn: cut },
  { id: "cut", from: s(15), transitionIn: cut },
  { id: "noise", from: s(19), transitionIn: cut },
  // Noise は最後に白へ抜けきるので、静寂へはカットで繋がる
  { id: "silence", from: s(29), transitionIn: cut },
  { id: "desktop", from: s(31), transitionIn: { kind: "fade", frames: 20 } },
  // Desktop → Presence → Follow → FlowBreak は同じデスクトップの上で続くので、カットで繋ぐ
  // （境界フレームでパネルの状態を揃えるのは各シーンの責務）
  { id: "presence", from: s(36), transitionIn: cut },
  { id: "follow", from: s(42), transitionIn: cut },
  { id: "flowBreak", from: s(47), transitionIn: cut },
  { id: "modes", from: s(58), transitionIn: { kind: "fade", frames: 15 } },
  { id: "promises", from: s(63), transitionIn: { kind: "fade", frames: 15 } },
  { id: "words", from: s(69), transitionIn: { kind: "fade", frames: 15 } },
  { id: "install", from: s(74), transitionIn: { kind: "fade", frames: 15 } },
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
