import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { clamp, ease } from "../theme";
import { CAM_NEAR, CAM_WIDE, Camera, camEase, clockString, DesktopPanel, lerpCam, TYPED_DESKTOP, WorkDesktop } from "./DesktopShared";

// 17–22秒: 白から、Go を書いている最中の Mac が現れる。右上にパネルが静かに出てきて、
// カメラはそのパネルへゆっくり寄る。パネルはまだ待機（00:00・いつでもどうぞ）。
// 待機を長く見せすぎない（Presence の 1.3 秒目で再生する）。
// 最終フレーム = Presence の frame 0（CAM_NEAR・待機のパネル・ポインタはタイプ中で非表示）

const PANEL_IN: [number, number] = [20, 44];
const PUSH: [number, number] = [30, 130];
// LP の og:title と同じ一文（docs/index.html:8）。「ちゃんとそこにいる」は Follow で初めて言う
const CAPTION: [number, number] = [44, 142]; // 完全表示 62–130 の 68f

export const DesktopScene: React.FC = () => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, PANEL_IN, [0, 1], { ...clamp, easing: ease });
  const cam = lerpCam(CAM_WIDE, CAM_NEAR, interpolate(frame, PUSH, [0, 1], { ...clamp, easing: camEase }));
  const typed = interpolate(frame, [0, 149], TYPED_DESKTOP, clamp);

  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <WorkDesktop typed={typed} clock={clockString(0)}>
          {appear > 0 ? (
            <DesktopPanel mode="flow" phase="idle" time="00:00" opacity={appear} y={(1 - appear) * 10} />
          ) : null}
        </WorkDesktop>
      </Camera>
      <Caption text="作業画面を、一切邪魔しない。" from={CAPTION[0]} to={CAPTION[1]} backdrop />
    </AbsoluteFill>
  );
};
