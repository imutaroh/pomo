import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { Desktop } from "../components/Desktop";
import { clamp, ease } from "../theme";
import { CAM_NEAR, CAM_WIDE, Camera, camEase, clockString, DesktopPanel, lerpCam, TYPED_DESKTOP } from "./DesktopShared";

// 17–24秒: 白から、Go を書いている最中の Mac が現れる。右上にパネルが静かに出てきて、
// カメラはそのパネルへゆっくり寄る。パネルはまだ待機（00:00・いつでもどうぞ）。
// 最終フレーム = Presence の frame 0（CAM_NEAR・待機のパネル・ポインタはタイプ中で非表示）

const PANEL_IN: [number, number] = [34, 62];
const PUSH: [number, number] = [50, 170];
const CAPTION: [number, number] = [76, 200];

export const DesktopScene: React.FC = () => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, PANEL_IN, [0, 1], { ...clamp, easing: ease });
  const cam = lerpCam(CAM_WIDE, CAM_NEAR, interpolate(frame, PUSH, [0, 1], { ...clamp, easing: camEase }));
  const typed = interpolate(frame, [0, 209], TYPED_DESKTOP, clamp);

  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <Desktop typed={typed} clock={clockString(0)}>
          {appear > 0 ? (
            <DesktopPanel mode="flow" phase="idle" time="00:00" opacity={appear} y={(1 - appear) * 10} />
          ) : null}
        </Desktop>
      </Camera>
      <Caption text={"作業画面を、一切邪魔しない。\nでも、ちゃんとそこにいる。"} from={CAPTION[0]} to={CAPTION[1]} backdrop />
    </AbsoluteFill>
  );
};
