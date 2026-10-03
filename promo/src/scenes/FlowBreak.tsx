import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { Cursor, SCREEN_SCALE } from "../components/Desktop";
import { clamp, color, font, formatTime } from "../theme";
import {
  BREAK_CHIP,
  BREAK_TOTAL,
  breakRemaining,
  clockString,
  Camera,
  camEase,
  CAM_FOLLOW,
  CAM_WIDE,
  camTopRight,
  chipString,
  CURSOR_EDITOR,
  cursorAt,
  DesktopPanel,
  FLOW_BASE,
  hoverAt,
  hoverEventsFor,
  lerpCam,
  panelPoint,
  runningOpacity,
  TYPED_PRESENCE_END,
  WORKED_FINAL,
  WORKED_FOLLOW_END,
  WorkDesktop,
  workedAt,
} from "./DesktopShared";

// 47–58秒: 冒頭（Zone/Cut）で「いいところ」を 25 分で断ち切られたことへの答え。
// 溶けたまま 20:00 から数え続けるパネルの横で、書き上げたコードのテストを走らせる。テストの途中で
// 25:00 を越えるが、何も起きない（進捗バーが満ちて薄まるだけ）。その 1 秒は普通の時計の速さで見せ、カメラも
// パネルへ寄せておく。テストが通りきるのはそのあと。そのまま続けて 52:10、自分で手を止めて
// 休憩チップ「休憩 +10:26」を押すと作業が終わり、全画面の休憩が現れる。
// frame 0 = Follow の最終フレーム。終わり際（316–330）に和紙へ抜け、末尾 15f は和紙のまま Modes のフェードの下に隠れる

const SATURATE = 100; // ちょうど 25:00 になるフレーム
const PRESS = 232; // チップを押し込む
const BREAK_START = 236; // 離した瞬間に finishWork（ボタンは mouse up で発火）
// 25:00 を見て、テストが通りきるのを見てから出す
const CAPTION_SATURATE: [number, number] = [118, 184]; // 完全表示 136–172 の 36f
const CAPTION_STOP: [number, number] = [184, 250]; // 完全表示 202–238 の 36f（手がパネルへ向かうところから押すまで）
const CAPTION_REWARD: [number, number] = [250, 318]; // 完全表示 268–306 の 38f
const WASHI_OUT: [number, number] = [316, 330];
const OVERLAY_FADE = 18; // BreakOverlay.swift: alphaValue 0→1 を 0.6 秒
// テストとパネルが一緒に収まる構図へ寄り、25:00 が近づいたらもう一段パネルへ寄せる
// （1.7 でもターミナルの左端が画面に残る位置に TERM_RECT を置いている）
const CAM_TEST = camTopRight(1.5);
const CAM_PUSH: [number, number] = [0, 52];
const CAM_SAT = camTopRight(1.7);
const CAM_SAT_AT: [number, number] = [54, SATURATE - 4];
// 25 分を越えて早回しになったら、押す手元（数字とチップ）がスマホ幅でも読める寄りへ
const CAM_CLOSE_AT: [number, number] = [166, 210];
const CAM_CLOSE = camTopRight(2.0);
// 押す少し前から引き始め、休憩画面が濃くなる頃には中央が画面の中央に近づいている
const CAM_PULL: [number, number] = [PRESS - 12, BREAK_START + 26];
// 休憩は等倍の全景で。寄るとメニューバーの時計が端で切れる
const CAM_BREAK = CAM_WIDE;

const HOVER_SPOT = panelPoint(176, 126);
const CURSOR_PATH: [number, number, number][] = [
  [184, CURSOR_EDITOR.x, CURSOR_EDITOR.y],
  [204, HOVER_SPOT.x, HOVER_SPOT.y],
  [212, HOVER_SPOT.x, HOVER_SPOT.y],
  [224, BREAK_CHIP.x, BREAK_CHIP.y],
  [BREAK_START + 6, BREAK_CHIP.x, BREAK_CHIP.y],
  // 押したあとは手を少し引く（休憩画面の上で止まる）
  [BREAK_START + 46, BREAK_CHIP.x - 150, BREAK_CHIP.y + 160],
];
// ポインタがパネルの縁を越えるフレーム。ここから押すまで armDelay（0.35 秒 ≒ 11f）以上ある
const HOVER_IN = hoverEventsFor(CURSOR_PATH)[0][0];
// テストを書いている間は早回し。24:58 → 25:00 → 25:01 の前後（52〜136）は実時間 1 秒/30f で、
// 越えても何も起きないのを普通の時計の速さで見せる。そのあとはまた速く。押す直前の 8f は実時間
const WORKED_KEYS: [number, number][] = [
  [0, WORKED_FOLLOW_END],
  [40, 1410],
  [52, 25 * 60 - (SATURATE - 52) / 30],
  [SATURATE, 25 * 60],
  [136, 25 * 60 + (136 - SATURATE) / 30],
  [150, 1600],
  [176, 2420],
  [206, 2990],
  [224, WORKED_FINAL],
  [PRESS, WORKED_FINAL + 8 / 30],
];

const k = SCREEN_SCALE; // pt → 世界の px

// ---------------------------------------------------------------- テスト（冒頭と同じ「いいところ」）

// エディタで書いていた handleSession のテスト。go test -v の実際の出力の形
const TEST_CMD = "go test -v ./...";
const TEST_TYPE_FROM = 46; // 1 フレーム 1 文字
const TEST_LINES: { at: number; text: string; pass?: boolean }[] = [
  { at: 66, text: "=== RUN   TestHandleSession" },
  { at: 72, text: "--- PASS: TestHandleSession (0.00s)", pass: true },
  { at: 78, text: "=== RUN   TestSessionJSON" },
  { at: 84, text: "--- PASS: TestSessionJSON (0.00s)", pass: true },
  // 84〜SATURATE+12 はターミナルを動かさず、視線をパネルの 25:00 へ渡す。越えて少ししてから通りきる
  { at: SATURATE + 12, text: "PASS", pass: true },
  { at: SATURATE + 16, text: "ok  \tsession\t0.214s", pass: true },
];
const TERM_IN: [number, number] = [36, 44];
// 通りきって「25分で、切らない。」を見せたら、エディタへ戻って続きを書く（ターミナルはエディタの後ろへ）。
// 寄った構図ではエディタのコードが画面の外なので、字幕の間は通ったテストを映したままにする
const TERM_BACK = 176;
// 世界座標。パネル（x 1602〜）の左、エディタの上。CAM_SAT（1.7 倍）で左端が切れないよう右へ寄せ、
// 最長行（--- PASS: TestHandleSession (0.00s)）が収まる幅にする。下端は字幕の帯にかからない高さ。
// 右端はエディタ（〜x 1440）の内側に収め、エディタの後ろに回ったら全部隠れるようにする
const TERM_RECT = { x: 800, y: 110, w: 630 };
const TERMINAL_MENU = { name: "ターミナル", items: ["シェル", "編集", "表示", "ウインドウ", "ヘルプ"] };

const TestTerminal: React.FC<{ frame: number }> = ({ frame }) => {
  const o = interpolate(frame, TERM_IN, [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const typedChars = Math.max(0, Math.floor(frame - TEST_TYPE_FROM));
  const shown = TEST_CMD.slice(0, typedChars);
  const lines = TEST_LINES.filter((l) => frame >= l.at);
  const done = lines.length === TEST_LINES.length;
  const fs = 26;
  return (
    <div
      style={{
        position: "absolute",
        left: TERM_RECT.x,
        top: TERM_RECT.y,
        width: TERM_RECT.w,
        borderRadius: 10 * k,
        overflow: "hidden",
        backgroundColor: color.night,
        boxShadow: "0 30px 80px rgba(26,35,48,0.24), 0 0 0 0.5px rgba(26,35,48,0.3)",
        fontFamily: font.mono,
        opacity: o,
        translate: `0px ${interpolate(o, [0, 1], [12, 0])}px`,
      }}
    >
      <div
        style={{
          height: 28 * k,
          display: "flex",
          alignItems: "center",
          gap: 8 * k,
          padding: `0 ${10 * k}px`,
          backgroundColor: "#1C2836",
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span key={c} style={{ width: 12 * k, height: 12 * k, borderRadius: "50%", backgroundColor: c }} />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            marginRight: 50 * k,
            fontFamily: font.sans,
            fontSize: 12 * k,
            fontWeight: 500,
            color: "rgba(250,251,252,0.5)",
          }}
        >
          session — zsh
        </span>
      </div>
      <div
        style={{
          padding: "20px 30px 24px",
          fontSize: fs,
          lineHeight: 1.5,
          color: "rgba(250,251,252,0.62)",
          whiteSpace: "pre",
          height: fs * 1.5 * 8 + 44,
          boxSizing: "border-box",
        }}
      >
        <div style={{ color: color.washi }}>
          <span style={{ color: color.teal }}>session % </span>
          {shown}
          {lines.length === 0 ? <Caret size={fs} /> : null}
        </div>
        {lines.map((l) => (
          <div
            key={l.text}
            style={{ color: l.pass ? color.teal : undefined, fontWeight: l.pass ? 700 : 500 }}
          >
            {l.text}
          </div>
        ))}
        {/* 通りきったら次のプロンプトへ。キャレットは点滅 */}
        {done ? (
          <div>
            <span style={{ color: color.teal }}>session % </span>
            {Math.floor(frame / 15) % 2 === 0 ? <Caret size={fs} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const Caret: React.FC<{ size: number }> = ({ size }) => (
  <span
    style={{
      display: "inline-block",
      width: size * 0.58,
      height: size * 1.1,
      verticalAlign: "text-bottom",
      backgroundColor: "rgba(250,251,252,0.85)",
    }}
  />
);

// ---------------------------------------------------------------- 全画面の休憩（BreakOverlay.swift の再現）

const Pill: React.FC<{ label: string; opacity?: number }> = ({ label, opacity = 1 }) => (
  <div
    style={{
      padding: `${10 * k}px ${22 * k}px`,
      borderRadius: 999,
      backgroundColor: "rgba(250,251,252,0.12)",
      color: "rgba(250,251,252,0.9)",
      fontFamily: font.sans,
      fontSize: 14 * k,
      fontWeight: 700,
      opacity,
    }}
  >
    {label}
  </div>
);

const BreakOverlay: React.FC<{ local: number; remaining: number }> = ({ local, remaining }) => {
  // 4秒周期の呼吸（0.9 ⇄ 1.1、easeInOut）。表示から 4 秒で 1.1 に届く
  const breathe = 0.9 + 0.2 * interpolate(local, [0, 120], [0, 1], { ...clamp, easing: Easing.inOut(Easing.ease) });
  // スキップだけ 3 秒の間を置いてから押せる（0.4 秒 easeOut で濃くなる）
  const skip = interpolate(local, [90, 102], [0.35, 1], clamp);
  const dim = 1080 * 0.7;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "rgba(26,35,48,0.92)",
        opacity: interpolate(local, [0, OVERLAY_FADE], [0, 1], clamp),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: dim,
          height: dim,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(0,135,168,0.12) ${60 * k}px, rgba(0,135,168,0) ${380 * k}px)`,
          scale: String(breathe),
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 * k }}>
        <div style={{ fontFamily: font.sans, fontSize: 22 * k, fontWeight: 500, color: "rgba(250,251,252,0.6)" }}>ひと休み</div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 110 * k,
            fontWeight: 500,
            lineHeight: 1,
            color: color.washi,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatTime(remaining)}
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 15 * k, fontWeight: 500, color: color.teal }}>
          今回の集中 {formatTime(WORKED_FINAL)}
        </div>
        <div style={{ width: 360 * k, height: 4 * k, borderRadius: 2 * k, backgroundColor: "rgba(26,35,48,0.10)" }}>
          <div
            style={{
              width: `${(local / 30 / BREAK_TOTAL) * 100}%`,
              height: "100%",
              borderRadius: 2 * k,
              backgroundColor: color.teal,
            }}
          />
        </div>
        <div style={{ fontFamily: font.sans, fontSize: 14 * k, fontWeight: 500, color: "rgba(250,251,252,0.45)" }}>
          画面から目を離して、少し伸びをしよう
        </div>
        <div style={{ display: "flex", gap: 14 * k }}>
          <Pill label="+5分" />
          <Pill label="小さく" />
          <Pill label="スキップ" opacity={skip} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- シーン

export const FlowBreak: React.FC = () => {
  const frame = useCurrentFrame();
  const onBreak = frame >= BREAK_START;
  const local = frame - BREAK_START;
  const worked = workedAt(frame, WORKED_KEYS);
  const remaining = breakRemaining(local);
  const hover = hoverAt(frame, [[HOVER_IN, 1]]);
  const pointer = cursorAt(frame, CURSOR_PATH);
  // タイプとテストの間はポインタを隠したまま（macOS はタイプ中に隠す）。手を止めてマウスに持ち替えたところで現れる
  const pointerOpacity = interpolate(frame, [CURSOR_PATH[0][0] - 4, CURSOR_PATH[0][0] + 2], [0, 1], clamp);
  // アプリのチップは押しても縮まない（.plain）。ポインタが乗ると塗りが 22% → 40% に濃くなるだけ
  const chipHover = interpolate(frame, [PRESS - 6, PRESS - 2], [0, 1], clamp);
  // Follow の間は読んでいたので、エディタへ戻ってから最初の 1 秒で書き足し、そのテストを走らせる。通ったら最後まで書き切る
  const typed = interpolate(frame, [0, 32, TERM_BACK, TERM_BACK + 40], [TYPED_PRESENCE_END, 0.95, 0.95, 1], clamp);

  const camT = (range: [number, number]) => interpolate(frame, range, [0, 1], { ...clamp, easing: camEase });
  const cam =
    frame >= CAM_PULL[0]
      ? lerpCam(CAM_CLOSE, CAM_BREAK, camT(CAM_PULL))
      : frame >= CAM_CLOSE_AT[0]
        ? lerpCam(CAM_SAT, CAM_CLOSE, camT(CAM_CLOSE_AT))
        : frame >= CAM_SAT_AT[0]
          ? lerpCam(CAM_TEST, CAM_SAT, camT(CAM_SAT_AT))
          : lerpCam(CAM_FOLLOW, CAM_TEST, camT(CAM_PUSH));
  const terminalFront = frame >= TERM_IN[0] && frame < TERM_BACK;

  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <WorkDesktop
          typed={typed}
          // Follow で出したブラウザは、エディタの後ろに回ったまま残る
          browser="back"
          frontApp={terminalFront ? TERMINAL_MENU : undefined}
          behind={frame >= TERM_BACK ? <TestTerminal frame={frame} /> : null}
          statusIcon={onBreak ? "cup.and.saucer.fill" : "dial"}
          statusTitle={" " + formatTime(onBreak ? remaining : worked)}
          clock={clockString(onBreak ? WORKED_FINAL + local / 30 : worked)}
        >
          {terminalFront ? <TestTerminal frame={frame} /> : null}
          {onBreak ? (
            <DesktopPanel
              mode="flow"
              phase="break"
              time={formatTime(remaining)}
              progress={Math.max(0, local) / 30 / BREAK_TOTAL}
              detail={`今回の集中 ${formatTime(WORKED_FINAL)}`}
              // 休憩画面がポインタの下に出るので、パネルのホバーは外れる
              hover={0}
              opacity={runningOpacity(0)}
            />
          ) : (
            <DesktopPanel
              mode="flow"
              phase="work"
              time={formatTime(worked)}
              progress={worked / FLOW_BASE}
              saturated={worked >= FLOW_BASE}
              breakChip={chipString(worked)}
              chipHover={chipHover}
              hover={hover}
              opacity={runningOpacity(hover)}
            />
          )}
          {onBreak ? <BreakOverlay local={local} remaining={remaining} /> : null}
          {pointerOpacity > 0 ? <Cursor x={pointer.x} y={pointer.y} opacity={pointerOpacity} /> : null}
        </WorkDesktop>
      </Camera>
      <Caption text="25分で、切らない。" from={CAPTION_SATURATE[0]} to={CAPTION_SATURATE[1]} backdrop />
      {/* LP「区切りは、止めたところ。」（flow 節の見出し）。手を止めてパネルへ向かうところから、押すまで */}
      <Caption text="区切りは、止めたところ。" from={CAPTION_STOP[0]} to={CAPTION_STOP[1]} backdrop />
      <Caption text="休憩は、義務ではなく報酬。" from={CAPTION_REWARD[0]} to={CAPTION_REWARD[1]} tone="washi" />
      {/* 次の Modes は和紙の上でフェードインするので、こちらも和紙へ抜けておく（灰色の濁りと二重写しを避ける） */}
      <AbsoluteFill style={{ backgroundColor: color.washi, opacity: interpolate(frame, WASHI_OUT, [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};
