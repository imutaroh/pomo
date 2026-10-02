import { AbsoluteFill } from "remotion";
import { Desktop, PANEL_POS, SCREEN_SCALE, Cursor } from "../components/Desktop";
import { Panel } from "../components/Panel";

// スタブ（共通部品の見た目確認用）。担当エージェントが実装する
export const DesktopScene: React.FC = () => (
  <AbsoluteFill>
    <Desktop statusTitle=" 52:10" typed={0.8}>
      <div style={{ position: "absolute", left: PANEL_POS.x, top: PANEL_POS.y, scale: String(SCREEN_SCALE), transformOrigin: "top left" }}>
        <Panel mode="flow" phase="work" time="52:10" progress={1} saturated breakChip="10:26" hover={1} />
      </div>
      <div style={{ position: "absolute", left: PANEL_POS.x - 400, top: PANEL_POS.y, scale: String(SCREEN_SCALE), transformOrigin: "top left" }}>
        <Panel mode="pomodoro" phase="work" time="18:42" progress={0.25} detail="今回の経過 06:18" hover={0} />
      </div>
      <Cursor x={1700} y={300} />
    </Desktop>
  </AbsoluteFill>
);
