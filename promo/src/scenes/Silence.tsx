import { AbsoluteFill } from "remotion";
import { color } from "../theme";

// 15–17秒: 白。何も起きない、何も鳴らない 2 秒
export const Silence: React.FC = () => <AbsoluteFill style={{ backgroundColor: color.washi }} />;
