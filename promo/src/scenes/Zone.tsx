import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { clamp, color, ease, font } from "../theme";
import { ZoneMontage } from "./ZoneMontage";

// 0–15秒: いろんな仕事の「いいところ」のモンタージュ（ZoneMontage）。
// 0–4秒 資料（見出しが並んだ瞬間から箇条書きが一気に埋まる）→ 4–7.3秒 表（数式を入れて下へ引くと列が埋まり、グラフが立つ）→
// 7.3–10秒 デザイン（要素がガイドに吸い付いて揃う）→ 10–12秒 メール（返信を打ち切って送信し、次の一通へ）→
// 12–15秒 4 分割で 4 人が同時に乗っている。
// どの画面の隅にも同じ汎用ポモドーロがあり、00:15 から実時間で減る。残り 5 秒（メールのカット）から赤く脈打ち、
// 4 分割の 00:03 → 00:01 で終わる（Cut が 00:00 から）

// デザインのカットの間に一度だけ（上の帯に。窓の題名と道具の列に掛け、揃っていくスライドとタイマーは隠さない）
const COPY_FROM = 226;
const COPY_TO = 297;

export const Zone: React.FC = () => {
  const frame = useCurrentFrame();
  const inP = interpolate(frame, [COPY_FROM, COPY_FROM + 15], [0, 1], { ...clamp, easing: ease });
  const outP = interpolate(frame, [COPY_TO - 12, COPY_TO], [1, 0], clamp);
  const copy = inP * outP;

  return (
    <AbsoluteFill style={{ backgroundColor: color.night }}>
      <ZoneMontage frame={frame} />

      {/* 乗っている最中に、小さく一言 */}
      {copy > 0 ? (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 110 }}>
          <div
            style={{
              opacity: copy,
              translate: `0px ${interpolate(inP, [0, 1], [12, 0])}px`,
              padding: "18px 56px",
              borderRadius: 16,
              backgroundColor: "#0B0D12",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 20px 50px rgba(0,0,0,0.5)",
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
