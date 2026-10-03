import { CameraMotionBlur } from "@remotion/motion-blur";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { SCREEN_SCALE } from "../components/Desktop";
import { clamp, color, ease, font, formatTime } from "../theme";
import {
  Cam,
  CAM_FOLLOW,
  CAM_NEAR,
  Camera,
  camEase,
  chipString,
  clockString,
  DesktopPanel,
  FLOW_BASE,
  lerpCam,
  PANEL_SIZE_WORLD,
  panelPoint,
  REPORT_BARS,
  runningOpacity,
  TYPED_PRESENCE_END,
  WORKED_FOLLOW_END,
  WORKED_PRESENCE_END,
  WorkDesktop,
} from "./DesktopShared";

// 42–47秒: 実行中（30% に溶けたまま・手は乗せない）のパネルが、画面を切り替えても居続ける。
// ① ⌘Tab で隠してあったブラウザ（参考資料の問い合わせ分析）を前に出す → パネルの真下が壁紙からブラウザの目次に変わるが、
//    パネルはその上（level .floating）
// ② 3本指スワイプで隣の Space（フルスクリーンにした発表用スライド）へ → 壁紙もウインドウもメニューバーも横へ流れるが、
//    パネルは同じ画面位置に留まる（canJoinAllSpaces + fullScreenAuxiliary）。フルスクリーンではメニューバーが隠れる
// ③ 元の Space へ戻り、⌘Tab で文書へ（ブラウザは後ろに回って右端がのぞく）→ FlowBreak の frame 0 と同じ画面
// パネルのまわりのリング・キーキャップ・ラベルは動画側の注釈（アプリには無い）。パネル自体は光らせない。
// frame 0 = Presence の最終フレーム（CAM_NEAR・9:00）、最終フレーム = FlowBreak の frame 0（CAM_FOLLOW・20:00）

const PULL: [number, number] = [0, 16]; // 画面全体が動くので、少しだけ引く
const TO_BROWSER = 24; // ⌘Tab（引き終わってから。前面の切り替えは一瞬）
const SWIPE_OUT: [number, number] = [76, 92];
const SWIPE_BACK: [number, number] = [128, 142];
const TO_EDITOR = 145;
// 最終フレーム（149）で消えきる（FlowBreak の frame 0 と画素で揃える）。完全表示 24–137
const CAPTION: [number, number] = [6, 149];
const LABEL_FADE = 8;
// 操作の注釈（キーキャップ）とその結果のラベルを1行に並べる。キーは操作の少し前に出て、押した瞬間に沈む
const STEPS: {
  keys: string[];
  press: number;
  keyFrom: number;
  keyTo: number;
  text: string;
  from: number;
  to: number;
}[] = [
  {
    keys: ["⌘", "tab"],
    press: TO_BROWSER,
    keyFrom: 12,
    keyTo: 44,
    text: "別のアプリを前に出しても",
    from: 14,
    to: 76,
  }, // キーと同時に出す。ラベル完全表示 22–68 の 46f。次のキーとは位置が違うので、消え際に重なってよい
  {
    keys: ["3本指スワイプ"],
    press: SWIPE_OUT[0],
    keyFrom: 68,
    keyTo: 98,
    text: "フルスクリーンの画面に移っても",
    from: SWIPE_OUT[1] - 10,
    to: 137,
  }, // 完全表示 90–129 の 39f。戻りのスワイプの途中まで残す
];
// 注釈のリングを打つフレーム（前面が変わった瞬間と、Space が着いた瞬間）
const PINGS = [TO_BROWSER, SWIPE_OUT[1] - 2];

// スワイプは指の速さで出て、着く直前に吸い付く
const swipeEase = Easing.bezier(0.35, 0, 0.15, 1);
const spaceAt = (f: number) =>
  interpolate(f, SWIPE_OUT, [0, 1], { ...clamp, easing: swipeEase }) -
  interpolate(f, SWIPE_BACK, [0, 1], { ...clamp, easing: swipeEase });
const isSwiping = (f: number) =>
  (f > SWIPE_OUT[0] && f < SWIPE_OUT[1]) ||
  (f > SWIPE_BACK[0] && f < SWIPE_BACK[1]);

// ---------------------------------------------------------------- 隣の Space（フルスクリーンにした発表用スライド）

// 同じ提案の発表用スライドを、スライドのアプリでフルスクリーンにして作っている。
// 実在のアプリに似せない汎用の見た目（暗い作業面・左にスライド一覧・中央に白いスライド・下にノート）。
// パネルが重なる右上（x 1602〜, y 60〜354）には何も置かない（30% の数字と混ざらないように）
const SLIDES = ["表紙", "1. 背景", "2. 提案", "3. 期待効果", "4. 進め方"];
const CURRENT_SLIDE = 1;
const CANVAS = { x: 380, y: 130, w: 1160, h: 652 };
const dimText = "rgba(250,251,252,0.62)";

const SlideCanvas: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: CANVAS.x,
      top: CANVAS.y,
      width: CANVAS.w,
      height: CANVAS.h,
      boxSizing: "border-box",
      padding: "64px 80px",
      backgroundColor: "#fff",
      boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
      fontFamily: font.sans,
      color: color.sumi,
    }}
  >
    <div style={{ fontSize: 28, fontWeight: 700, color: color.tealText, letterSpacing: "0.06em" }}>1. 背景</div>
    <div style={{ marginTop: 10, fontSize: 60, fontWeight: 700, lineHeight: 1.3 }}>問い合わせに、毎月 120 時間。</div>
    <div style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 20 }}>
      {REPORT_BARS.map(([label, pct]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 250, flexShrink: 0, fontSize: 26, fontWeight: 500, color: "rgba(26,35,48,0.78)" }}>
            {label}
          </div>
          <div
            style={{
              width: pct * 22,
              height: 34,
              borderRadius: 5,
              backgroundColor: color.teal,
              opacity: 0.35 + pct / 40,
            }}
          />
          <div style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 500 }}>{pct}%</div>
        </div>
      ))}
    </div>
  </div>
);

// フルスクリーンのアプリはメニューバーもウインドウ枠も出さない（画面の上端までがアプリ）
const FullscreenSlides: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundColor: color.night,
      fontFamily: font.sans,
    }}
  >
    {/* 上のツールバー（右上はパネルの場所なので空ける） */}
    <div
      style={{
        position: "absolute",
        left: 40,
        top: 30,
        display: "flex",
        alignItems: "center",
        gap: 40,
        fontSize: 22,
        fontWeight: 500,
        color: dimText,
      }}
    >
      <span style={{ fontWeight: 700, color: color.washi }}>問い合わせ対応の改善 — スライド</span>
      {["＋ スライド", "テキスト", "図形", "グラフ"].map((t) => (
        <span key={t}>{t}</span>
      ))}
    </div>
    {/* 左のスライド一覧 */}
    {SLIDES.map((title, i) => {
      const on = i === CURRENT_SLIDE;
      return (
        <div key={title} style={{ position: "absolute", left: 40, top: CANVAS.y + i * 176, display: "flex", gap: 14 }}>
          <div style={{ width: 22, textAlign: "right", fontSize: 18, fontWeight: 500, color: dimText }}>{i + 1}</div>
          <div
            style={{
              width: 256,
              height: 144,
              boxSizing: "border-box",
              padding: "18px 20px",
              borderRadius: 6,
              backgroundColor: "#fff",
              boxShadow: on ? `0 0 0 4px ${color.teal}` : undefined,
              opacity: on ? 1 : 0.86,
              fontSize: 18,
              fontWeight: 700,
              color: color.sumi,
            }}
          >
            {title}
            <div style={{ marginTop: 14, width: 150, height: 8, borderRadius: 4, backgroundColor: color.line }} />
            <div style={{ marginTop: 8, width: 110, height: 8, borderRadius: 4, backgroundColor: color.line }} />
          </div>
        </div>
      );
    })}
    <SlideCanvas />
    {/* 発表者のノート */}
    <div
      style={{
        position: "absolute",
        left: CANVAS.x,
        top: CANVAS.y + CANVAS.h + 34,
        width: CANVAS.w,
        paddingTop: 22,
        borderTop: "1px solid rgba(250,251,252,0.14)",
        fontSize: 24,
        fontWeight: 500,
        lineHeight: 1.7,
        color: dimText,
      }}
    >
      <span style={{ fontWeight: 700, color: color.washi }}>ノート　</span>
      数字は先月の問い合わせ 3,400 件から。6 割は同じ質問。
    </div>
  </div>
);

// ---------------------------------------------------------------- 2つの Space（横に並べて流す）

const Spaces: React.FC = () => {
  // CameraMotionBlur がサブフレームで描き直すので、ここで自分のフレームを読む
  const frame = useCurrentFrame();
  const worked = workedAt(frame);
  const browser =
    frame < TO_BROWSER ? "hidden" : frame < TO_EDITOR ? "front" : "back";
  const x = -1920 * spaceAt(frame);
  // 元の Space に居る間は移動もスライドも描かない（重ね方の違いで影の画素が揺れ、FlowBreak の frame 0 とずれるため）
  const moved = x !== 0;
  return (
    <AbsoluteFill style={moved ? { translate: `${x}px 0px` } : undefined}>
      <WorkDesktop
        typed={TYPED_PRESENCE_END}
        browser={browser}
        statusTitle={" " + formatTime(worked)}
        clock={clockString(worked)}
      />
      {moved ? (
        <div
          style={{
            position: "absolute",
            left: 1920,
            top: 0,
            width: 1920,
            height: 1080,
            overflow: "hidden",
          }}
        >
          <FullscreenSlides />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// 手は乗せず、溶けたまま早回しで数え続ける（Presence の 9:00 → FlowBreak の 20:00）
const workedAt = (f: number) =>
  interpolate(f, [0, 149], [WORKED_PRESENCE_END, WORKED_FOLLOW_END], clamp);

// ---------------------------------------------------------------- 注釈（動画側の演出。アプリの UI ではない）

const PANEL_TL = panelPoint(0, 0);

// パネルの外側に間を空けて、細いリングが一度だけ広がって消える。
// パネルの右と上は画面端・メニューバーまで 24px しかないので、広がりは 14px で止める
const Ping: React.FC<{ at: number; frame: number }> = ({ at, frame }) => {
  const t = frame - at;
  if (t < 0 || t > 24) return null;
  const gap = interpolate(t, [0, 24], [4, 14], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const o = interpolate(t, [0, 3, 24], [0, 1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: PANEL_TL.x - gap,
        top: PANEL_TL.y - gap,
        width: PANEL_SIZE_WORLD + gap * 2,
        height: PANEL_SIZE_WORLD + gap * 2,
        borderRadius: 18 * SCREEN_SCALE + gap,
        border: `4px solid ${color.teal}`,
        boxSizing: "border-box",
        opacity: o,
      }}
    />
  );
};

const fadeIn = (frame: number, from: number) =>
  interpolate(frame, [from, from + LABEL_FADE], [0, 1], {
    ...clamp,
    easing: ease,
  });
const fadeOut = (frame: number, to: number) =>
  interpolate(frame, [to - LABEL_FADE, to], [1, 0], clamp);

// macOS のキーの見た目を借りた注釈（KeyCastr のような画面収録の定番）
const KeyCap: React.FC<{ label: string; pressed: number }> = ({
  label,
  pressed,
}) => (
  <div
    style={{
      minWidth: 76,
      height: 76,
      padding: "0 22px",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: color.washi,
      border: `2px solid ${color.line}`,
      boxShadow: `0 ${6 * (1 - pressed)}px 0 ${color.line}, 0 10px 30px rgba(26,35,48,0.14)`,
      translate: `0px ${6 * pressed}px`,
      fontFamily: font.sans,
      fontSize: 38,
      fontWeight: 700,
      color: color.sumi,
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </div>
);

// パネルの真下に添える1行（キーキャップ＋ラベル）。右端をパネルに揃える。
// 位置はカメラを通した画面座標で求める
const StepRow: React.FC<{
  step: (typeof STEPS)[number];
  frame: number;
  cam: Cam;
}> = ({ step, frame, cam }) => {
  const keyIn = fadeIn(frame, step.keyFrom);
  const keyO = keyIn * fadeOut(frame, step.keyTo);
  const labelIn = fadeIn(frame, step.from);
  const labelO = labelIn * fadeOut(frame, step.to);
  if (keyO <= 0 && labelO <= 0) return null;
  // 押した瞬間に沈み、6f で戻る
  const pressed = interpolate(
    frame,
    [step.press - 2, step.press, step.press + 6],
    [0, 1, 0],
    clamp,
  );
  const right = 1920 - ((PANEL_TL.x + PANEL_SIZE_WORLD) * cam.s + cam.tx);
  const top = (PANEL_TL.y + PANEL_SIZE_WORLD) * cam.s + cam.ty + 56;
  return (
    <div
      style={{
        position: "absolute",
        right,
        top,
        display: "flex",
        alignItems: "center",
        gap: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          opacity: keyO,
          translate: `0px ${(1 - keyIn) * -12}px`,
        }}
      >
        {step.keys.map((k) => (
          <KeyCap key={k} label={k} pressed={pressed} />
        ))}
      </div>
      <div
        style={{
          opacity: labelO,
          translate: `0px ${(1 - labelIn) * -12}px`,
          padding: "16px 30px",
          borderRadius: 14,
          backgroundColor: "rgba(250,251,252,0.9)",
          backdropFilter: "blur(16px)",
          boxShadow: "0 10px 40px rgba(26,35,48,0.12)",
          fontFamily: font.sans,
          fontSize: 44,
          fontWeight: 700,
          color: color.sumi,
          whiteSpace: "nowrap",
        }}
      >
        {step.text}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- シーン

export const Follow: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = lerpCam(
    CAM_NEAR,
    CAM_FOLLOW,
    interpolate(frame, PULL, [0, 1], { ...clamp, easing: camEase }),
  );
  const worked = workedAt(frame);

  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          {/* 速い横移動の間だけ、画面（パネル以外）にモーションブラーをかける */}
          {isSwiping(frame) ? (
            <CameraMotionBlur samples={10} shutterAngle={90}>
              <Spaces />
            </CameraMotionBlur>
          ) : (
            <Spaces />
          )}
          {/* パネルは Space と一緒に流れない。どの Space の、どのアプリの上にも同じ位置で出る */}
          <DesktopPanel
            mode="flow"
            phase="work"
            time={formatTime(worked)}
            progress={worked / FLOW_BASE}
            breakChip={chipString(worked)}
            hover={0}
            opacity={runningOpacity(0)}
          />
          {PINGS.map((at) => (
            <Ping key={at} at={at} frame={frame} />
          ))}
        </div>
      </Camera>
      {STEPS.map((step) => (
        <StepRow key={step.text} step={step} frame={frame} cam={cam} />
      ))}
      <Caption
        text="画面を切り替えても、ちゃんとそこにいる。"
        from={CAPTION[0]}
        to={CAPTION[1]}
        backdrop
      />
    </AbsoluteFill>
  );
};
