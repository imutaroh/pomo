import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { clamp, color, ease, font } from "../theme";

// 45–51秒: 「ないもの」を一本ずつ線で消し、Noise 後半と同じ「一枚ずつ消える」で地に溶かす。
// 項目は PhilosophyPage.swift の文言（ストリークも、点数も／履歴にも残しません／アカウントも送信もなし）から取る。
// 消え切ったあとに、会議中の約束（BreakOverlay.swift の deferOverlayInCall）を一行だけ置いて静かに終える

const ITEMS = ["ストリーク", "点数", "履歴", "アカウント", "送信"];

// 15f のフェード中に Modes のパネル列と二重写しにならないよう、語はフェード明けから出す
const APPEAR_START = 12;
// 全語が出揃って（12 + 4×2 + 14 = 34f）から線を引き始める
const STRIKE_START = 36;
const STRIKE_GAP = 8;
const STRIKE_LEN = 8;
const VANISH_START = 80;
const VANISH_GAP = 5;
const VANISH_LEN = 12; // Noise のウィンドウ（ERASE_FADE）と同じ 12f で、ぼけながら沈んで抜ける
// 消え切った（80 + 4×5 + 12 = 112f）あとに出し、次のフェードまで約 2 秒静止させる
const NOTE_AT = 112;

const Item: React.FC<{ label: string; i: number; frame: number }> = ({ label, i, frame }) => {
  const appear = interpolate(frame, [APPEAR_START + i * 2, APPEAR_START + i * 2 + 14], [0, 1], {
    ...clamp,
    easing: ease,
  });
  const strike = interpolate(
    frame,
    [STRIKE_START + i * STRIKE_GAP, STRIKE_START + i * STRIKE_GAP + STRIKE_LEN],
    [0, 1],
    { ...clamp, easing: ease },
  );
  const vanishAt = VANISH_START + i * VANISH_GAP;
  const gone = interpolate(frame, [vanishAt, vanishAt + VANISH_LEN], [1, 0], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });

  return (
    <div
      style={{
        position: "relative",
        opacity: appear * gone,
        scale: String(interpolate(gone, [0, 1], [0.97, 1])),
        translate: `0px ${(1 - gone) * 18}px`,
        filter: gone < 1 ? `blur(${(1 - gone) * 3}px)` : undefined,
        // 線が引かれたら文字だけ薄くする（線は濃いまま）
        color: `rgba(26,35,48,${interpolate(strike, [0, 1], [1, 0.4])})`,
      }}
    >
      {label}
      <div
        style={{
          position: "absolute",
          left: -10,
          top: "54%",
          height: 6,
          borderRadius: 3,
          width: `calc(${strike * 100}% + ${strike * 20}px)`,
          backgroundColor: color.teal,
        }}
      />
    </div>
  );
};

export const Promises: React.FC = () => {
  const frame = useCurrentFrame();
  const noteIn = interpolate(frame, [NOTE_AT, NOTE_AT + 18], [0, 1], { ...clamp, easing: ease });

  return (
    <AbsoluteFill style={{ backgroundColor: color.washi, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          gap: 72,
          fontFamily: font.mincho,
          fontWeight: 700,
          fontSize: 72,
          letterSpacing: "0.06em",
        }}
      >
        {ITEMS.map((label, i) => (
          <Item key={label} label={label} i={i} frame={frame} />
        ))}
      </div>

      {noteIn > 0 ? (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div
            style={{
              fontFamily: font.mincho,
              fontWeight: 700,
              fontSize: 60,
              letterSpacing: "0.06em",
              lineHeight: 1.6,
              textAlign: "center",
              whiteSpace: "pre-line",
              color: color.sumi,
              opacity: noteIn,
              translate: `0px ${interpolate(noteIn, [0, 1], [14, 0])}px`,
            }}
          >
            {"通話・会議中は、\n休憩画面で割り込まない。"}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
