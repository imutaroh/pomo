import { Audio } from "@remotion/media";
import { linearTiming, TransitionPresentation, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { Fragment } from "react";
import { AbsoluteFill, Easing, getStaticFiles, staticFile, useVideoConfig } from "remotion";
import { SCENE_COMPONENTS } from "./scenes";
import { NOISE_END, QUIET_BGM_FROM, SCENE_DEFS, sequenceLength, TransitionIn } from "./timeline";

// 30fps × 1800 フレーム = 60秒。シーンの開始と切り替え方は timeline.ts に集約している

// public/ に置かれていれば鳴らす。無ければ無音で書き出せる
const hasFile = (name: string) => getStaticFiles().some((f) => f.name === name);

// presentation ごとに props の型が違うので、TransitionSeries に渡す共通の型へ広げる
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

const presentationOf = (t: Exclude<TransitionIn, { kind: "none" }>): AnyPresentation => {
  if (t.kind === "wipe") return wipe({ direction: "from-left" }) as AnyPresentation;
  if (t.kind === "slide") return slide({ direction: "from-right" }) as AnyPresentation;
  return fade() as AnyPresentation;
};

export const QuietPromo: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <TransitionSeries>
        {SCENE_DEFS.map((def) => {
          const Scene = SCENE_COMPONENTS[def.id];
          const t = def.transitionIn;
          return (
            <Fragment key={def.id}>
              {t.kind !== "none" ? (
                <TransitionSeries.Transition
                  presentation={presentationOf(t)}
                  timing={linearTiming({ durationInFrames: t.frames, easing: Easing.inOut(Easing.quad) })}
                />
              ) : null}
              <TransitionSeries.Sequence name={def.id} durationInFrames={sequenceLength(def.id)} premountFor={fps}>
                <Scene />
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>

      {/* うるさい曲は、ノイズが消えきる瞬間（15秒）で断ち切る */}
      {hasFile("bgm.mp3") ? (
        <Audio name="BGM (noise)" src={staticFile("bgm.mp3")} durationInFrames={NOISE_END} premountFor={fps} />
      ) : null}
      {/* 静かな曲は、2秒の無音を置いてから（17秒〜） */}
      {hasFile("bgm-quiet.mp3") ? (
        <Audio name="BGM (quiet)" src={staticFile("bgm-quiet.mp3")} from={QUIET_BGM_FROM} premountFor={fps} />
      ) : null}
    </AbsoluteFill>
  );
};
