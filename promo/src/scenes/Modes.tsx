import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Panel, PANEL_SIZE, PanelProps } from "../components/Panel";
import { clamp, color, ease, font, formatTime } from "../theme";
import { FPS } from "../timeline";

// 39–45秒: フロー / ポモドーロ / タイマー / 時計 の4枚が順に並び、それぞれの数字が実時間で進む。
// 説明文はメニューバーのモード項目（MenuBarController.swift）の括弧書きをそのまま使う

// スマホ幅（約 0.2 倍）でもモード名と説明文が読めることを優先する。パネル内の小さい文字は読めなくてよい
const SCALE = 1.8;
const COL = 430;
const GAP = 16;
const STAGGER = 8;
const ENTER = 20; // 1枚目が出始めるフレーム（見出しを先に読ませてから）

// 「途中から覗いた」作業の経過秒。数字が全部 00 だと動きが読み取りにくいので、実行中の値から始める
const FLOW_START = 23 * 60 + 15;
const POMO_START = 6 * 60 + 20;
const TIMER_START = 2 * 60 + 45;
const CLOCK_START = 14 * 3600 + 32 * 60 + 8;

type Col = { name: string; note: string; panel: (sec: number) => PanelProps };

const COLS: Col[] = [
  {
    name: "フロー",
    note: "作業した時間の 1/5 が\n休憩になる",
    panel: (s) => {
      const worked = FLOW_START + s;
      const banked = Math.floor(worked / 5);
      return {
        mode: "flow",
        phase: "work",
        time: formatTime(worked),
        progress: worked / (25 * 60),
        breakChip: `${Math.floor(banked / 60)}:${String(banked % 60).padStart(2, "0")}`,
      };
    },
  },
  {
    name: "ポモドーロ",
    note: "25分作業 → 5分休憩",
    panel: (s) => {
      const worked = POMO_START + s;
      return {
        mode: "pomodoro",
        phase: "work",
        time: formatTime(25 * 60 - worked),
        progress: worked / (25 * 60),
        detail: `今回の経過 ${formatTime(worked)}`,
      };
    },
  },
  {
    name: "タイマー",
    note: "好きな時間を測る",
    panel: (s) => {
      const worked = TIMER_START + s;
      return {
        mode: "timer",
        phase: "work",
        time: formatTime(10 * 60 - worked),
        progress: worked / (10 * 60),
      };
    },
  },
  {
    name: "時計",
    note: "現在時刻を表示",
    panel: (s) => {
      const t = CLOCK_START + s;
      const hh = String(Math.floor(t / 3600)).padStart(2, "0");
      return { mode: "clock", phase: "idle", time: `${hh}:${formatTime(t % 3600)}` };
    },
  },
];

export const Modes: React.FC = () => {
  const frame = useCurrentFrame();
  // 4枚とも同じ時計で進める（実時間。速回しはしない）
  const sec = Math.floor(frame / FPS);

  const headIn = interpolate(frame, [6, 24], [0, 1], { ...clamp, easing: ease });

  return (
    <AbsoluteFill style={{ backgroundColor: color.washi, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: 132,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: 58,
          letterSpacing: "0.06em",
          color: color.sumi,
          opacity: headIn,
          translate: `0px ${interpolate(headIn, [0, 1], [14, 0])}px`,
        }}
      >
        4つのモード。
      </div>

      <div style={{ display: "flex", gap: GAP, marginTop: 110 }}>
        {COLS.map((c, i) => {
          const p = interpolate(frame, [ENTER + i * STAGGER, ENTER + i * STAGGER + 22], [0, 1], {
            ...clamp,
            easing: ease,
          });
          return (
            <div
              key={c.name}
              style={{
                width: COL,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                opacity: p,
                translate: `0px ${interpolate(p, [0, 1], [28, 0])}px`,
              }}
            >
              {/* scale は見た目だけを拡大するので、拡大後の大きさの箱で包んで下の文字の位置を合わせる */}
              <div style={{ width: PANEL_SIZE * SCALE, height: PANEL_SIZE * SCALE }}>
                <div style={{ scale: String(SCALE), transformOrigin: "top left" }}>
                  <Panel {...c.panel(sec)} hover={1} />
                </div>
              </div>
              <div
                style={{
                  marginTop: 36,
                  fontFamily: font.sans,
                  fontWeight: 700,
                  fontSize: 52,
                  color: color.sumi,
                  letterSpacing: "0.04em",
                }}
              >
                {c.name}
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontFamily: font.sans,
                  fontWeight: 500,
                  fontSize: 36,
                  lineHeight: 1.5,
                  color: "rgba(26,35,48,0.6)",
                  textAlign: "center",
                  whiteSpace: "pre-line",
                }}
              >
                {c.note}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
