import { AbsoluteFill } from "remotion";
import { color, font } from "../theme";

// スタブ。担当エージェントが実装する
export const Words: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: color.washi, justifyContent: "center", alignItems: "center" }}>
    <div style={{ fontFamily: font.mono, fontSize: 60, color: color.sumi }}>Words</div>
  </AbsoluteFill>
);
