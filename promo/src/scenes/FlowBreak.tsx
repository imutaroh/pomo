import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "../components/Caption";
import { Cursor, DOC_VIEW_TOP, docLineTop, docTypedAt, SCREEN_SCALE } from "../components/Desktop";
import { clamp, color, ease, font, formatTime } from "../theme";
import {
  BREAK_CHIP,
  BREAK_TOTAL,
  breakRemaining,
  clockString,
  Camera,
  camEase,
  CAM_FOLLOW,
  CAM_WIDE,
  type Cam,
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
// 冒頭のモンタージュ（ZoneDoc）と同じ提案書「問い合わせ対応 改善のご提案」の、切られた「3. 期待効果」の続き。
// 溶けたまま 20:00 から数え続けるパネルの横で一気に書き上げる。その途中で
// 25:00 を越えるが、何も起きない（進捗バーが満ちて薄まるだけ）。その前後は普通の時計の速さで見せる。
// 期待効果の数字が出そろうのはその直後。手は止めずに「4. 進め方」まで書き、52:10、自分で手を止めて
// 休憩チップ「休憩 +10:26」を押すと作業が終わり、全画面の休憩が現れる。
// frame 0 = Follow の最終フレーム。終わり際（316–330）に和紙へ抜け、末尾 15f は和紙のまま Modes のフェードの下に隠れる

const SATURATE = 100; // ちょうど 25:00 になるフレーム
const PRESS = 232; // チップを押し込む
const BREAK_START = 236; // 離した瞬間に finishWork（ボタンは mouse up で発火）
// 主たる価値の一文なので長く。25:00 を越える瞬間に浮かび始め、越えた直後には読める（完全表示 112–172 の 60f）。
// 字幕 3 本は同じ位置に出るので重ねない。押すまで（〜250）と休憩が濃くなってから（250〜）に収めるため、ここが上限
const CAPTION_SATURATE: [number, number] = [94, 184];
const CAPTION_STOP: [number, number] = [184, 250]; // 完全表示 202–238 の 36f（手がパネルへ向かうところから押すまで）
const CAPTION_REWARD: [number, number] = [256, 326]; // 完全表示 274–314 の 40f。1/5 の札（248〜）を先に読ませてから出す。消え際は和紙の下
// 早回しの間、休憩チップが集中に合わせて伸びていくのを指すリング（文は付けない。字幕「25分で、切らない。」に割り込ませない）。
// 字幕 1 本目の後半から、パネルへ向かうポインタがチップに届く前まで（完全表示 140–184 の 44f）
const NOTE_CHIP: [number, number] = [130, 194];
// 休憩画面で 52:10 と 10:26 を結ぶ注釈。カメラが引いている途中から出し、字幕（完全表示 268〜）より先に読み終えられるようにする。
// 文は「今の残り」と読まれない矢印表記（大きなカウントダウンは 10:25 → 10:24 と進むので「＝」だと食い違って見える）
const NOTE_BREAK_FROM = 248; // 字幕「区切りは、止めたところ。」が消えきる 250 とほぼ同時。完全表示 258〜で、字幕（274〜）より 16f 先
const NOTE_FADE = 10;
const WASHI_OUT: [number, number] = [316, 330];
const OVERLAY_FADE = 18; // BreakOverlay.swift: alphaValue 0→1 を 0.6 秒
// 書いている本文とパネルが一緒に収まる構図へ寄る。1.34 倍で映る左端は世界の x 487 で、
// 用紙の本文（x 570〜）の左に余白が残る。25:00 を越える間もこの構図のまま、文字とパネルの両方を見せる
const CAM_DOC = camTopRight(1.34);
const CAM_PUSH: [number, number] = [0, 40];
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
// 書いている間は早回し。24:58 → 25:00 → 25:01 の前後（52〜136）は実時間 1 秒/30f で、
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

// ---------------------------------------------------------------- 提案書の肝（冒頭と同じ「いいところ」）

// 「3. 期待効果」の見出しの行がツールバーのすぐ下に来るまで用紙を送る（書き進めると文書アプリが自動で送るのと同じ）。
// 見出しの上の余白で切れるので、途中で切れた行が見えない。4. 進め方の最終行（〜y 609）まで字幕の帯（y 654〜）にかからない
const SCROLL_DOC = docLineTop(9) - DOC_VIEW_TOP;
const SCROLL_AT: [number, number] = [6, 40];
// 書く速さは [frame, typed] の折れ線。見出し → 本文 → 数字 3 つと速くなり、最後の数字は 25:00 を越えた直後に出そろう。
// 越える瞬間（SATURATE）も、そのあとも手は止まらない（止まって見えると「いいところが続いている」にならない）。
// 実時間の間（〜136）は見出し「4. 進め方」を人の速さで打ち、早回しに戻ったら箇条書きを一気に。止めるのはポインタが出る 180 から
const TYPED_KEYS: [number, number][] = [
  [0, TYPED_PRESENCE_END],
  [30, TYPED_PRESENCE_END],
  [44, docTypedAt(10)],
  [70, docTypedAt(11)],
  [SATURATE + 12, docTypedAt(12)],
  [136, docTypedAt(13)],
  [178, 1],
];

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

// ---------------------------------------------------------------- 注釈（動画側の演出。アプリの UI ではない）

const noteOpacity = (frame: number, from: number, to = Infinity) =>
  interpolate(frame, [from, from + NOTE_FADE], [0, 1], { ...clamp, easing: ease }) *
  (Number.isFinite(to) ? interpolate(frame, [to - NOTE_FADE, to], [1, 0], clamp) : 1);

// 休憩チップの中心（pt）。PanelView の並びで時間の下、パネルの左右中央。幅は still で測った値
// （「休憩 +m:ss」で約 102pt、桁が 1 つ増えると 8pt 広がる）
const CHIP_CENTER = panelPoint(98, 120.5);
const chipWidthPt = (chip: string) => 102 + (chip.length - 4) * 8;

// チップを細いリングで囲む。実行中のパネルは 30% に溶けているので、リングで目をチップへ運ぶ。
// 1/5 の説明は休憩画面の BreakNote 一回にまとめる。位置はカメラを通した画面座標
const ChipNote: React.FC<{ frame: number; cam: Cam; chip: string }> = ({ frame, cam, chip }) => {
  const o = noteOpacity(frame, NOTE_CHIP[0], NOTE_CHIP[1]);
  if (o <= 0) return null;
  const px = k * cam.s; // 1pt の画面上の大きさ
  const gap = 8;
  const w = chipWidthPt(chip) * px + gap * 2;
  const h = 23 * px + gap * 2;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <div
        style={{
          position: "absolute",
          left: CHIP_CENTER.x * cam.s + cam.tx - w / 2,
          top: CHIP_CENTER.y * cam.s + cam.ty - h / 2,
          width: w,
          height: h,
          borderRadius: h / 2,
          border: `4px solid ${color.teal}`,
          boxSizing: "border-box",
        }}
      />
    </div>
  );
};

// 休憩画面の「今回の集中 52:10」を細いリングで囲み、右に 1/5 の計算を添える。
// 行の位置は全景（等倍）の still で確かめた世界座標で、カメラが引いている途中から出すのでカメラを通して置く。
// 字幕「休憩は、あなたが頑張った分だけ。」が主役なので、札は暗い面に和紙の文字で一段控えめにする
const DETAIL_ROW = { x: 836, y: 554, w: 248, h: 52 };
const BreakNote: React.FC<{ frame: number; cam: Cam }> = ({ frame, cam }) => {
  const o = noteOpacity(frame, NOTE_BREAK_FROM);
  if (o <= 0) return null;
  const inP = interpolate(frame, [NOTE_BREAK_FROM, NOTE_BREAK_FROM + NOTE_FADE], [0, 1], clamp);
  const left = DETAIL_ROW.x * cam.s + cam.tx;
  const top = DETAIL_ROW.y * cam.s + cam.ty;
  const w = DETAIL_ROW.w * cam.s;
  const h = DETAIL_ROW.h * cam.s;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <div
        style={{
          position: "absolute",
          left,
          top,
          width: w,
          height: h,
          borderRadius: 14 * cam.s,
          border: `4px solid ${color.teal}`,
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: left + w + 28,
          top: top + h / 2,
          translate: `${(1 - inP) * -12}px -50%`,
          padding: "12px 26px",
          borderRadius: 12,
          backgroundColor: "rgba(250,251,252,0.08)",
          fontFamily: font.sans,
          fontSize: 36,
          fontWeight: 600,
          color: "rgba(250,251,252,0.8)",
          whiteSpace: "nowrap",
        }}
      >
        {formatTime(WORKED_FINAL)} の 1/5 → <span style={{ color: color.teal }}>{formatTime(BREAK_TOTAL)}</span> の休憩
      </div>
    </div>
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
  // タイプの間はポインタを隠したまま（macOS はタイプ中に隠す）。手を止めてマウスに持ち替えたところで現れる
  const pointerOpacity = interpolate(frame, [CURSOR_PATH[0][0] - 4, CURSOR_PATH[0][0] + 2], [0, 1], clamp);
  // アプリのチップは押しても縮まない（.plain）。ポインタが乗ると塗りが 22% → 40% に濃くなるだけ
  const chipHover = interpolate(frame, [PRESS - 6, PRESS - 2], [0, 1], clamp);
  // Follow の間は参考資料を読んでいたので、文書へ戻って 1 秒で「3. 期待効果」を書き始める
  const typed = workedAt(frame, TYPED_KEYS);
  const scroll = interpolate(frame, SCROLL_AT, [0, SCROLL_DOC], { ...clamp, easing: camEase });

  const camT = (range: [number, number]) => interpolate(frame, range, [0, 1], { ...clamp, easing: camEase });
  const cam =
    frame >= CAM_PULL[0]
      ? lerpCam(CAM_CLOSE, CAM_BREAK, camT(CAM_PULL))
      : frame >= CAM_CLOSE_AT[0]
        ? lerpCam(CAM_DOC, CAM_CLOSE, camT(CAM_CLOSE_AT))
        : lerpCam(CAM_FOLLOW, CAM_DOC, camT(CAM_PUSH));

  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <WorkDesktop
          typed={typed}
          scroll={scroll}
          // Follow で出したブラウザは、文書の後ろに回ったまま残る
          browser="back"
          statusIcon={onBreak ? "cup.and.saucer.fill" : "dial"}
          statusTitle={" " + formatTime(onBreak ? remaining : worked)}
          clock={clockString(onBreak ? WORKED_FINAL + local / 30 : worked)}
        >
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
      <ChipNote frame={frame} cam={cam} chip={chipString(worked)} />
      <BreakNote frame={frame} cam={cam} />
      <Caption text="25分で、切らない。" from={CAPTION_SATURATE[0]} to={CAPTION_SATURATE[1]} backdrop />
      {/* LP「区切りは、止めたところ。」（flow 節の見出し）。手を止めてパネルへ向かうところから、押すまで */}
      <Caption text="区切りは、止めたところ。" from={CAPTION_STOP[0]} to={CAPTION_STOP[1]} backdrop />
      {/* いむたろの言葉。休憩は決められた義務ではなく、集中した分に応じて決まる */}
      <Caption text="休憩は、あなたが頑張った分だけ。" from={CAPTION_REWARD[0]} to={CAPTION_REWARD[1]} tone="washi" />
      {/* 次の Modes は和紙の上でフェードインするので、こちらも和紙へ抜けておく（灰色の濁りと二重写しを避ける） */}
      <AbsoluteFill style={{ backgroundColor: color.washi, opacity: interpolate(frame, WASHI_OUT, [0, 1], clamp) }} />
    </AbsoluteFill>
  );
};
