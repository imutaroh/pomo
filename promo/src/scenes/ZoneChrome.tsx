import { random } from "remotion";
import { color, font } from "../theme";

// Zone のモンタージュ（資料・表・デザイン）が共有する、汎用のダークなアプリの枠。
// 実在のアプリ（リボン・固有の配色・ツールバーの配置）に似せないため、枠は「信号＋汎用の題名＋細い道具の列」だけにする。
// 色は ZoneScreen（コードの場面）と同じダーク。4 カットの暗さを揃え、Cut の赤と Noise の暗い地へそのまま渡す

export const Z = {
  desk: "#0B0D12",
  chrome: "#1C2836",
  surface: color.night,
  text: "#F2F2F7",
  dim: "rgba(235,235,245,0.6)",
  faint: "rgba(235,235,245,0.25)",
  hair: "rgba(255,255,255,0.08)",
  // 選択・ガイド・グラフなど「手が動いている」印。Quiet のティールは使わない（v1 Noise のシステム色）
  blue: "#0A84FF",
  ok: "#30D158",
};

// 画面の枠。メニューバーの下に、窓が画面いっぱいに開いている
export const MENU_H = 40;
export const WIN = { x: 28, y: MENU_H + 20, w: 1920 - 56, h: 1080 - MENU_H - 40 };
export const TITLE_H = 48;
export const TOOL_H = 64;

// 汎用ポモドーロは全カットで画面の右上の同じ場所に浮かぶ（どの仕事でも同じタイマーが減っていく）
export const TIMER_SCREEN = { left: 1920 - 40 - 352, top: MENU_H + 96 };

const MenuBar: React.FC<{ app: string; menus: string[] }> = ({ app, menus }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      right: 0,
      height: MENU_H,
      display: "flex",
      alignItems: "center",
      gap: 32,
      padding: "0 26px",
      fontFamily: font.sans,
      fontSize: 21,
      fontWeight: 500,
      color: "rgba(235,235,245,0.85)",
      backgroundColor: "rgba(20,31,43,0.9)",
      boxShadow: `0 0.5px 0 ${Z.hair}`,
    }}
  >
    <span style={{ fontWeight: 700, color: Z.text }}>{app}</span>
    {menus.map((m) => (
      <span key={m}>{m}</span>
    ))}
  </div>
);

// 道具の列は抽象的な形だけ（特定のアプリのアイコン配置を思わせない）
export type Tool = { w: number; on?: boolean };

export const AppWindow: React.FC<{
  app: string;
  menus: string[];
  title: string;
  tools: Tool[];
  children: React.ReactNode;
}> = ({ app, menus, title, tools, children }) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", backgroundColor: Z.desk }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: [
          "radial-gradient(ellipse 900px 700px at 300px 200px, rgba(10,132,255,0.16), transparent 70%)",
          "radial-gradient(ellipse 1000px 800px at 1600px 900px, rgba(191,90,242,0.12), transparent 70%)",
          color.night,
        ].join(", "),
      }}
    />
    <div
      style={{
        position: "absolute",
        left: WIN.x,
        top: WIN.y,
        width: WIN.w,
        height: WIN.h,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: Z.surface,
        boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px ${Z.hair}`,
      }}
    >
      <div style={{ height: TITLE_H, display: "flex", alignItems: "center", gap: 12, padding: "0 18px", backgroundColor: Z.chrome }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span key={c} style={{ width: 17, height: 17, borderRadius: "50%", backgroundColor: c }} />
        ))}
        <span style={{ flex: 1, textAlign: "center", marginRight: 90, fontFamily: font.sans, fontWeight: 500, fontSize: 21, color: Z.dim }}>{title}</span>
      </div>
      <div
        style={{
          height: TOOL_H,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 26px",
          backgroundColor: Z.desk,
          borderBottom: `1px solid ${Z.hair}`,
        }}
      >
        {tools.map((t, i) =>
          t.w === 0 ? (
            <span key={i} style={{ width: 1, height: 28, margin: "0 8px", backgroundColor: Z.hair }} />
          ) : (
            <span
              key={i}
              style={{
                width: t.w,
                height: 30,
                borderRadius: 8,
                backgroundColor: t.on ? "rgba(10,132,255,0.35)" : "rgba(235,235,245,0.1)",
              }}
            />
          ),
        )}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: TITLE_H + TOOL_H, bottom: 0 }}>{children}</div>
    </div>
    <MenuBar app={app} menus={menus} />
  </div>
);

// 文字を打つ時刻列。間隔 gap0 → gap1 へ詰まっていく（＝乗ってくる）。間隔は乱数で揺らす
export const keyTimes = (count: number, start: number, gap0: number, gap1: number, seed: string) => {
  const out: number[] = [];
  let t = start;
  for (let i = 0; i < count; i++) {
    out.push(t);
    const g = gap0 + (gap1 - gap0) * (i / Math.max(1, count - 1));
    t += g * (0.6 + random(`${seed}-${i}`) * 0.8);
  }
  return out;
};

export const typedCount = (keys: number[], frame: number) => keys.filter((k) => k <= frame).length;

export const Caret: React.FC<{ h: number; on: boolean }> = ({ h, on }) => (
  <span style={{ display: "inline-block", width: 3, height: h, marginLeft: 2, verticalAlign: "middle", backgroundColor: on ? Z.text : "transparent" }} />
);

// 矢印カーソル（汎用）
export const Pointer: React.FC<{ x: number; y: number; size?: number }> = ({ x, y, size = 34 }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" style={{ position: "absolute", left: x, top: y, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
    <path d="M1 1 L1 22 L6.5 16.8 L10.5 26 L14 24.5 L10 15.5 L17.5 15.5 Z" fill="#fff" stroke="#000" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);
