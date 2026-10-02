import { color, font } from "../theme";
import { Icon, IconName } from "./icons";

// フローティングパネル（Sources/Pomo/PanelView.swift の再現）。
// 寸法はアプリの pt そのまま（ガラス 196×196・角丸18）。画面上の大きさは呼び出し側が scale で決める。
// 状態はすべて props で受け取り、アニメーションは持たない（フレーム計算は各シーンの責務）。

export type PanelMode = "flow" | "pomodoro" | "timer" | "clock";
export type PanelPhase = "idle" | "work" | "break";

export type PanelProps = {
  mode: PanelMode;
  phase: PanelPhase;
  /** 大きな数字（"52:10" / "25:00" / "12:34:56"） */
  time: string;
  /** 進捗 0..1（上端のバー） */
  progress?: number;
  /** フローで基準25分を越えたら進捗バー全体を 35% に落とす */
  saturated?: boolean;
  /** ポモドーロ作業中の「今回の経過 mm:ss」、休憩中の「今回の集中 mm:ss」 */
  detail?: string;
  /** フロー作業中の休憩チップ（"10:26" を渡すと「休憩 +10:26」） */
  breakChip?: string;
  /** 休憩チップの押し込み（1 = 通常、0.9 = 押した瞬間） */
  chipScale?: number;
  /** ホバーの度合い 0..1。ラベルと操作ボタンの出方に使う */
  hover?: number;
  /** パネル全体の不透明度。実行中の既定は focusOpacity = 0.3、ホバーで 1 */
  opacity?: number;
  /** 一時停止中（ボタンが play.fill になる） */
  paused?: boolean;
};

export const PANEL_SIZE = 196;

const phaseLabel = (mode: PanelMode, phase: PanelPhase, paused: boolean) => {
  if (phase === "idle") return mode === "clock" ? "現在時刻" : "いつでもどうぞ";
  if (paused) return "一時停止";
  if (phase === "break") return "休憩";
  return mode === "timer" ? "タイマー" : "集中";
};

const CircleButton: React.FC<{ symbol: IconName; prominent?: boolean }> = ({ symbol, prominent }) => {
  const d = prominent ? 40 : 32;
  return (
    <div
      style={{
        width: d,
        height: d,
        borderRadius: "50%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: prominent ? color.sumi : "rgba(255,255,255,0.55)",
        boxShadow: prominent ? undefined : "inset 0 0 0 0.8px rgba(255,255,255,0.5)",
      }}
    >
      <Icon name={symbol} size={prominent ? 15 : 12} color={prominent ? color.washi : "rgba(26,35,48,0.75)"} />
    </div>
  );
};

const controlsFor = (mode: PanelMode, phase: PanelPhase, paused: boolean): { symbol: IconName; prominent?: boolean }[] => {
  const toggle: IconName = paused ? "play.fill" : "pause.fill";
  if (phase === "idle") {
    if (mode === "clock") return [];
    if (mode === "timer") return [{ symbol: "minus" }, { symbol: "play.fill", prominent: true }, { symbol: "plus" }];
    return [{ symbol: "play.fill", prominent: true }];
  }
  if (phase === "break") {
    return [{ symbol: "goforward.plus" }, { symbol: toggle, prominent: true }, { symbol: "forward.end.fill" }];
  }
  const out: { symbol: IconName; prominent?: boolean }[] = [
    { symbol: "arrow.counterclockwise" },
    { symbol: toggle, prominent: true },
  ];
  if (mode === "flow" || mode === "pomodoro") out.push({ symbol: "cup.and.saucer.fill" });
  return out;
};

export const Panel: React.FC<PanelProps> = ({
  mode,
  phase,
  time,
  progress = 0,
  saturated = false,
  detail,
  breakChip,
  chipScale = 1,
  hover = 0,
  opacity = 1,
  paused = false,
}) => {
  const idle = phase === "idle";
  // 待機中・一時停止中はラベルも操作も常時表示、実行中はホバー時だけ
  const reveal = idle || paused ? 1 : hover;
  const controls = controlsFor(mode, phase, paused);
  const clockIdle = idle && mode === "clock";

  return (
    <div
      style={{
        width: PANEL_SIZE,
        height: PANEL_SIZE,
        borderRadius: 18,
        position: "relative",
        overflow: "hidden",
        opacity,
        // Liquid Glass（.clear ＋ 和紙15%の下敷き）を、ぼかし＋白の薄いグラデーション＋縁の光で近似する
        background: "linear-gradient(180deg, rgba(255,255,255,0.62), rgba(250,251,252,0.42))",
        backdropFilter: "blur(18px) saturate(1.4)",
        boxShadow:
          "0 14px 40px rgba(26,35,48,0.16), 0 0 0 0.5px rgba(26,35,48,0.10), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 0 1.2px rgba(255,255,255,0.45)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: font.mono,
      }}
    >
      {/* 上端中央の細い進捗 */}
      <div
        style={{
          marginTop: 14,
          width: 132,
          height: 3,
          borderRadius: 2,
          backgroundColor: "rgba(26,35,48,0.10)",
          opacity: saturated ? 0.35 : idle ? 0.4 : 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(1, Math.max(0, progress)) * 100}%`,
            height: "100%",
            borderRadius: 2,
            backgroundColor: color.teal,
          }}
        />
      </div>

      {/* 右上の「ダッシュボードを開く」 */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 26,
          height: 26,
          borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.55)",
          boxShadow: "inset 0 0 0 0.8px rgba(255,255,255,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Icon name="macwindow" size={11} color="rgba(26,35,48,0.5)" />
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          fontFamily: font.sans,
          fontSize: 12,
          fontWeight: 500,
          lineHeight: "16px",
          color: "rgba(26,35,48,0.5)",
          opacity: reveal,
        }}
      >
        {phaseLabel(mode, phase, paused)}
      </div>

      <div
        style={{
          fontSize: clockIdle ? 40 : 54,
          fontWeight: 500,
          lineHeight: 1.2,
          color: color.sumi,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}
      >
        {time}
      </div>

      {detail ? (
        <div style={{ fontSize: 11, fontWeight: 500, color: color.tealDeep, lineHeight: "14px" }}>{detail}</div>
      ) : null}

      {phase === "work" && mode === "flow" && breakChip ? (
        <div
          style={{
            marginTop: 2,
            height: 23,
            padding: "0 10px",
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            gap: 4,
            backgroundColor: "rgba(0,135,168,0.22)",
            color: color.tealDeep,
            fontSize: 12,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            scale: String(chipScale),
          }}
        >
          <Icon name="cup.and.saucer.fill" size={11} />
          休憩 +{breakChip}
        </div>
      ) : (
        <div style={{ height: 23 }} />
      )}

      <div style={{ flex: 1 }} />

      <div
        style={{
          height: 40,
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: clockIdle ? 0 : idle ? 1 : hover,
        }}
      >
        {controls.map((c) => (
          <CircleButton key={c.symbol} symbol={c.symbol} prominent={c.prominent} />
        ))}
      </div>
    </div>
  );
};
