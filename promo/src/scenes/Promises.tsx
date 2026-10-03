import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { clamp, color, ease, font } from "../theme";

// 63–69秒（180f）: 二つ目の価値「記録に追われない」。「ないもの」を一本ずつ線で消し、
// Noise 後半と同じ「一枚ずつ消える」で地に溶かす。
// 項目は PhilosophyPage.swift の文言（ストリークも、点数も／履歴にも残しません／アカウントも送信もなし）から取る。
// 消え切ったあとに、LP の言葉で残るもの（723「今回の時間だけ。」）と送らない理由（892）を置いて終える

const ITEMS = ["ストリーク", "点数", "履歴", "アカウント", "送信"];

// 15f のフェード中に Modes のパネル列と二重写しにならないよう、語はフェード明けから出す
const APPEAR_START = 12;
// 全語が出揃って（12 + 4×2 + 14 = 34f）から線を引き始め、最後の線は 36 + 4×7 + 8 = 72f で引き終わる
const STRIKE_START = 36;
const STRIKE_GAP = 7;
const STRIKE_LEN = 8;
const VANISH_START = 82;
const VANISH_GAP = 5;
const VANISH_LEN = 12; // Noise のウィンドウ（ERASE_FADE）と同じ 12f で、ぼけながら沈んで抜ける
// 消え切った（82 + 4×5 + 12 = 114f）あとに出す。2行目は f138 で出きり、
// 次のフェードが始まる f180 まで 42f（1.4 秒）は二行とも静止して読める
const NOTE_AT = 112;
const SUB_AT = NOTE_AT + 8;

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
  const subIn = interpolate(frame, [SUB_AT, SUB_AT + 18], [0, 1], { ...clamp, easing: ease });

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
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 30 }}>
          <div
            style={{
              fontFamily: font.mincho,
              fontWeight: 700,
              fontSize: 84,
              letterSpacing: "0.08em",
              color: color.sumi,
              opacity: noteIn,
              translate: `0px ${interpolate(noteIn, [0, 1], [14, 0])}px`,
            }}
          >
            今回の時間だけ。
          </div>
          <div
            style={{
              fontFamily: font.mincho,
              fontWeight: 700,
              fontSize: 48,
              letterSpacing: "0.06em",
              color: "rgba(26,35,48,0.66)",
              opacity: subIn,
              translate: `0px ${interpolate(subIn, [0, 1], [10, 0])}px`,
            }}
          >
            記録を持たないから、送るものもない。
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
