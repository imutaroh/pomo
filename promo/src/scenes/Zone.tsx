import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { clamp, color, ease, font } from "../theme";
import { ZoneScreen } from "./ZoneScreen";

// 0–15秒: 夜、Go のコードが噛み合っていく。最初から寄った構図で、打っている行と赤い FAIL を大きく見せる。
// 0–2.2秒 書きかけの行を打つ → 3秒 go test が ok → 4–7.5秒 次の関数を一気に書く → 8.4秒 もう一度 ok →
// 9秒から main を書き始め、15秒まで手を止めない。エディタに浮かぶよくあるポモドーロタイマーは 00:15 から実時間で減っていて、
// 10秒で少し引くと画に入り、残り 5 秒で赤く脈打つ。残り 1.5 秒でタイマーへ寄り、打ち続けているまま 00:01 で終わる（Cut が 00:00 から）

const COPY_FROM = 140;
const COPY_TO = 232;

export const Zone: React.FC = () => {
  const frame = useCurrentFrame();
  const inP = interpolate(frame, [COPY_FROM, COPY_FROM + 15], [0, 1], { ...clamp, easing: ease });
  const outP = interpolate(frame, [COPY_TO - 12, COPY_TO], [1, 0], clamp);
  const copy = inP * outP;

  return (
    <AbsoluteFill style={{ backgroundColor: color.night }}>
      <ZoneScreen frame={frame} />

      {/* 乗っている最中に、小さく一言。上の帯はコード（読ませない）に掛けて、下のターミナルの ok は隠さない */}
      {copy > 0 ? (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 70 }}>
          <div
            style={{
              opacity: copy,
              translate: `0px ${interpolate(inP, [0, 1], [12, 0])}px`,
              padding: "18px 56px",
              borderRadius: 16,
              backgroundColor: "#0B0D12",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
              fontFamily: font.mincho,
              fontWeight: 700,
              fontSize: 64,
              letterSpacing: "0.08em",
              color: color.washi,
            }}
          >
            いま、いいところ。
          </div>
        </AbsoluteFill>
      ) : null}

    </AbsoluteFill>
  );
};
