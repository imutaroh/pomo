import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { clamp, color, ease, font } from "../theme";
import { TIMER_SCREEN } from "./ZoneChrome";
import { ZoneMontage } from "./ZoneMontage";
import { GenericTimer, TIMER } from "./ZoneScreen";

// 0–15秒: いろんな仕事の「いいところ」のモンタージュ（ZoneMontage）。
// 0–4秒 資料（見出しが並んだ瞬間から箇条書きが一気に埋まる）→ 4–7.3秒 表（数式を入れて下へ引くと列が埋まり、グラフが立つ）→
// 7.3–10秒 デザイン（要素がガイドに吸い付いて揃う）→ 10–12秒 メール（返信を打ち切って送信し、次の一通へ）→
// 12–15秒 4 分割で 4 人が同時に乗っている。
// どの画面の隅にも同じ汎用ポモドーロがあり、00:15 から実時間で減る。残り 5 秒（メールのカット）から赤く脈打ち、
// 4 分割の 00:03 → 00:01 で終わる（Cut が 00:00 から）

// 冒頭の問いかけ（いむたろの言葉）。X の自動再生は音なしで最初の数秒が勝負なので、見る人自身の話として問う。
// モンタージュは動かしたまま暗く沈め、隅のポモドーロだけを沈めずに浮かせて、1 行目に合わせて白い輪で一度だけ指す
const HOOK_LINE1 = 6;
const HOOK_LINE2 = 24;
// 2 行が揃って読める時間を約 2.6 秒（f40〜f118）とる。32 字の問いかけを読み切れる長さ
const HOOK_OUT: [number, number] = [118, 132];
const HOOK_PING = 14;

// デザインのカットの間に一度だけ（上の帯に。窓の題名と道具の列に掛け、揃っていくスライドとタイマーは隠さない）
const COPY_FROM = 226;
const COPY_TO = 297;

export const Zone: React.FC = () => {
  const frame = useCurrentFrame();
  const inP = interpolate(frame, [COPY_FROM, COPY_FROM + 15], [0, 1], { ...clamp, easing: ease });
  const outP = interpolate(frame, [COPY_TO - 12, COPY_TO], [1, 0], clamp);
  const copy = inP * outP;

  const hookOut = interpolate(frame, HOOK_OUT, [1, 0], clamp);
  const scrim = interpolate(frame, [0, 6], [0.62, 0.74], clamp) * hookOut;
  const line = (from: number) => interpolate(frame, [from, from + 16], [0, 1], { ...clamp, easing: ease });
  const ping = interpolate(frame, [HOOK_PING, HOOK_PING + 26], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: color.night }}>
      <ZoneMontage frame={frame} />

      {/* 冒頭の問いかけ */}
      {scrim > 0 ? (
        <>
          <AbsoluteFill style={{ backgroundColor: "#0B0D12", opacity: scrim }} />
          {/* 隅のポモドーロだけは沈めない（同じフレームの同じタイマーを暗幕の上に重ね描き） */}
          <div style={{ opacity: hookOut }}>
            <GenericTimer frame={frame} left={TIMER_SCREEN.left} top={TIMER_SCREEN.top} />
          </div>
          {ping > 0 && ping < 1 ? (
            <div
              style={{
                position: "absolute",
                left: TIMER_SCREEN.left - 18 - ping * 28,
                top: TIMER_SCREEN.top - 18 - ping * 28,
                width: TIMER.w + 36 + ping * 56,
                height: TIMER.h + 36 + ping * 56,
                borderRadius: 28 + ping * 20,
                border: "3px solid rgba(250,251,252,0.9)",
                opacity: (1 - ping) * hookOut,
              }}
            />
          ) : null}
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "column",
              gap: 26,
              opacity: hookOut,
              fontFamily: font.mincho,
              fontWeight: 700,
              fontSize: 72,
              letterSpacing: "0.06em",
              color: color.washi,
              textShadow: "0 4px 30px rgba(0,0,0,0.6)",
            }}
          >
            {[
              { text: "あなたが使っているポモドーロタイマー、", from: HOOK_LINE1 },
              { text: "実は集中を止めているかも。", from: HOOK_LINE2 },
            ].map((l) => (
              <div key={l.text} style={{ opacity: line(l.from), translate: `0px ${interpolate(line(l.from), [0, 1], [14, 0])}px` }}>
                {l.text}
              </div>
            ))}
          </AbsoluteFill>
        </>
      ) : null}

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
