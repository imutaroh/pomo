import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Panel, PANEL_SIZE, PanelProps } from "../components/Panel";
import { clamp, color, ease, font, formatTime } from "../theme";
import { FPS } from "../timeline";

// 58–63秒（150f）: 「既定はフロー。区切りたい日は、ほかも選べる。」
// 冒頭で 25 分で断ち切るタイマーを痛みとして描いたので、ポモドーロを同格に並べず、
// フロー（LP の「フロー〈既定〉」）を大きく主役に置き、ほかの3つは右に小さく「選べる」ものとして並べる。
// 前後とも 15f のフェード。前のシーンとの二重写しを避けるため、見出しはフェード明けから立ち上がる。
// 右の3枚は f76 で出揃い、次のフェードが始まる f150 まで約 2.5 秒静止する（数字だけが実時間で進む）
// 説明文はメニューバーのモード項目（MenuBarController.swift:121-130）の括弧書きをそのまま使う

// スマホ幅（約 0.2 倍）でも主役のフローと見出しが読めることを優先する
const MAIN_SCALE = 2.3;
const SUB_SCALE = 0.86;

const HEAD_IN = 14;
const MAIN_IN = 20;
const SUB_LABEL_IN = 40;
const SUB_IN = 48;
const SUB_STAGGER = 6;
const RISE = 18; // 最後の1枚は SUB_IN + 2*SUB_STAGGER + RISE = f78 で静止する

// 「途中から覗いた」作業の経過秒。数字が全部 00 だと動きが読み取りにくいので、実行中の値から始める
const FLOW_START = 47 * 60 + 12; // LP の読み出し例（47:12）に揃える
const POMO_START = 12 * 60 + 30;
const TIMER_START = 2 * 60 + 45;
const CLOCK_START = 14 * 3600 + 32 * 60 + 8;

const flowPanel = (s: number): PanelProps => {
  const worked = FLOW_START + s;
  const banked = Math.floor(worked / 5);
  return {
    mode: "flow",
    phase: "work",
    time: formatTime(worked),
    progress: worked / (25 * 60),
    breakChip: `${Math.floor(banked / 60)}:${String(banked % 60).padStart(2, "0")}`,
  };
};

type Sub = { name: string; note: string; panel: (sec: number) => PanelProps };

const SUBS: Sub[] = [
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

// scale は見た目だけを拡大するので、拡大後の大きさの箱で包んで周りの文字の位置を合わせる
const ScaledPanel: React.FC<{ scale: number; props: PanelProps }> = ({ scale, props }) => (
  <div style={{ width: PANEL_SIZE * scale, height: PANEL_SIZE * scale, flexShrink: 0 }}>
    <div style={{ scale: String(scale), transformOrigin: "top left" }}>
      <Panel {...props} hover={1} />
    </div>
  </div>
);

const rise = (frame: number, from: number) => interpolate(frame, [from, from + RISE], [0, 1], { ...clamp, easing: ease });

export const Modes: React.FC = () => {
  const frame = useCurrentFrame();
  // すべて同じ時計で進める（実時間。速回しはしない）
  const sec = Math.floor(frame / FPS);

  const headIn = rise(frame, HEAD_IN);
  const mainIn = rise(frame, MAIN_IN);
  const subLabelIn = rise(frame, SUB_LABEL_IN);

  return (
    <AbsoluteFill style={{ backgroundColor: color.washi }}>
      {/* LP 718 の見出し */}
      <div
        style={{
          position: "absolute",
          top: 104,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: 64,
          letterSpacing: "0.06em",
          color: color.sumi,
          opacity: headIn,
          translate: `0px ${interpolate(headIn, [0, 1], [14, 0])}px`,
        }}
      >
        区切りは、自分で決める。
      </div>

      <div
        style={{
          position: "absolute",
          top: 262,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: 150,
        }}
      >
        {/* 主役: フロー（既定） */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: mainIn,
            translate: `0px ${interpolate(mainIn, [0, 1], [28, 0])}px`,
          }}
        >
          <ScaledPanel scale={MAIN_SCALE} props={flowPanel(sec)} />
          <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 20 }}>
            <span
              style={{
                fontFamily: font.sans,
                fontWeight: 700,
                fontSize: 64,
                color: color.sumi,
                letterSpacing: "0.04em",
              }}
            >
              フロー
            </span>
            {/* LP 836 の「既定」ピル */}
            <span
              style={{
                fontFamily: font.sans,
                fontWeight: 700,
                fontSize: 34,
                lineHeight: 1,
                padding: "10px 20px",
                borderRadius: 999,
                color: color.washi,
                backgroundColor: color.teal,
              }}
            >
              既定
            </span>
          </div>
          <div
            style={{
              marginTop: 14,
              fontFamily: font.sans,
              fontWeight: 500,
              fontSize: 40,
              color: "rgba(26,35,48,0.66)",
            }}
          >
            作業した時間の 1/5 が休憩になる
          </div>
        </div>

        {/* 脇役: 区切りたい日に選べる3つ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22, paddingTop: 6 }}>
          <div
            style={{
              fontFamily: font.mincho,
              fontWeight: 700,
              fontSize: 40,
              letterSpacing: "0.04em",
              color: "rgba(26,35,48,0.72)",
              marginBottom: 4,
              opacity: subLabelIn,
              translate: `0px ${interpolate(subLabelIn, [0, 1], [10, 0])}px`,
            }}
          >
            区切りたい日は、ほかも選べる。
          </div>
          {SUBS.map((c, i) => {
            const p = rise(frame, SUB_IN + i * SUB_STAGGER);
            return (
              <div
                key={c.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 30,
                  opacity: p,
                  translate: `${interpolate(p, [0, 1], [24, 0])}px 0px`,
                }}
              >
                <ScaledPanel scale={SUB_SCALE} props={c.panel(sec)} />
                <div>
                  <div
                    style={{
                      fontFamily: font.sans,
                      fontWeight: 700,
                      fontSize: 44,
                      color: color.sumi,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontFamily: font.sans,
                      fontWeight: 500,
                      fontSize: 32,
                      color: "rgba(26,35,48,0.6)",
                    }}
                  >
                    {c.note}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
