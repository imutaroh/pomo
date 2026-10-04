import { Easing, interpolate } from "remotion";
import { clamp, font } from "../theme";
import { AppWindow, Caret, keyTimes, Pointer, typedCount, Z } from "./ZoneChrome";

// モンタージュ ④ メール。返信の最後の一文を打ち切って「送信」を押すと、受信箱の一通に ✓ が付き、
// 手を止めずに次の一通の返信を書き始める。t はこのカットの頭からのフレーム（4 分割でも続く）。
// このカットは t=0〜60、4 分割では t=60〜150 で映る

// 送信を押す瞬間（カットの頭から 1 秒強。打ち切る助走を映してから押す）
export const MAIL_SENT = 34;
// 次の返信に移る（宛先と件名が入れ替わる）
const NEXT = MAIL_SENT + 12;

const LIST_W = 560;
const PANE_X = 620; // 返信欄の左端（窓の本文座標）
const BODY_Y = 214;
const LINE_H = 64;
const BODY_FONT = 40;
const BUTTON = { x: PANE_X, y: 740, w: 250, h: 84 };

type Row = { text: string; keys?: number[] };
const typed = (text: string, start: number, gap0: number, gap1: number, seed: string): Row => ({
  text,
  keys: keyTimes(text.length, start, gap0, gap1, seed),
});

// 1 通目: 4 行目を打ち終え、5 行目を一気に打ってから送る
const R1_L4 = typed("ご要望の3点は、すべて含めました。", -14, 1.4, 1.1, "m4");
const R1_L5 = typed("納期は11月14日でお受けできます。", R1_L4.keys![R1_L4.keys!.length - 1] + 3, 1, 0.75, "m5");
const REPLY1: Row[] = [{ text: "田中さま" }, { text: "いつもお世話になっております。" }, { text: "お見積もりをお送りします。" }, R1_L4, R1_L5];

// 2 通目: 4 分割の間、打ち続ける
const R2_L1 = typed("みなさま", NEXT + 6, 2.4, 2.2, "n1");
const R2_L2 = typed("定例は木曜の10時に移します。", R2_L1.keys![R2_L1.keys!.length - 1] + 6, 2.2, 1.9, "n2");
const R2_L3 = typed("議題は、見積もりの進み具合です。", R2_L2.keys![R2_L2.keys!.length - 1] + 5, 2, 1.8, "n3");
const REPLY2: Row[] = [R2_L1, R2_L2, R2_L3];

const INBOX = [
  { from: "田中さん", subject: "お見積もりの件", time: "16:42", tint: Z.blue },
  { from: "営業チーム", subject: "来週の定例について", time: "16:20", tint: "#BF5AF2" },
  { from: "山本さん", subject: "資料ありがとうございます", time: "15:58", tint: "#FF9F0A" },
  { from: "総務", subject: "年末のお知らせ", time: "15:31", tint: Z.ok },
];

const Body: React.FC<{ rows: Row[]; t: number }> = ({ rows, t }) => {
  let caretLine = -1;
  let lastKey = -99;
  rows.forEach((r, i) => {
    if (!r.keys) return;
    const n = typedCount(r.keys, t);
    if (n > 0 && r.keys[n - 1] >= lastKey) {
      lastKey = r.keys[n - 1];
      caretLine = i;
    }
  });
  const caretOn = t - lastKey < 6 || Math.floor(t / 15) % 2 === 0;
  return (
    <>
      {rows.map((r, i) => {
        const n = r.keys ? typedCount(r.keys, t) : r.text.length;
        if (n === 0 && i !== caretLine) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: PANE_X,
              top: BODY_Y + i * LINE_H,
              height: LINE_H,
              display: "flex",
              alignItems: "center",
              whiteSpace: "pre",
              fontFamily: font.sans,
              fontWeight: 500,
              fontSize: BODY_FONT,
              color: "rgba(235,235,245,0.9)",
            }}
          >
            {r.text.slice(0, n)}
            {i === caretLine ? <Caret h={BODY_FONT * 1.15} on={caretOn} /> : null}
          </div>
        );
      })}
    </>
  );
};

// 宛先と件名（返信欄の上）
const Header: React.FC<{ to: string; subject: string }> = ({ to, subject }) => (
  <>
    {[
      ["宛先", to],
      ["件名", subject],
    ].map(([k, v], i) => (
      <div
        key={k}
        style={{
          position: "absolute",
          left: PANE_X,
          top: 34 + i * 62,
          display: "flex",
          gap: 24,
          whiteSpace: "pre",
          fontFamily: font.sans,
          fontSize: 30,
          lineHeight: "50px",
        }}
      >
        <span style={{ color: Z.dim, fontWeight: 500 }}>{k}</span>
        <span style={{ color: Z.text, fontWeight: 700 }}>{v}</span>
      </div>
    ))}
    <div style={{ position: "absolute", left: PANE_X, right: 60, top: 172, height: 1, backgroundColor: Z.hair }} />
  </>
);

export const MailApp: React.FC<{ t: number }> = ({ t }) => {
  // 送信: 押した瞬間にボタンが緑に光り、返信欄が上へ抜ける。次の返信が下から入る
  const press = interpolate(t, [MAIL_SENT - 2, MAIL_SENT, MAIL_SENT + 3], [1, 0.94, 1], clamp);
  const sentGlow = interpolate(t, [MAIL_SENT, MAIL_SENT + 3, MAIL_SENT + 30], [0, 1, 0], clamp);
  const out = interpolate(t, [MAIL_SENT + 4, NEXT], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const inP = interpolate(t, [NEXT, NEXT + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const first = t < NEXT;
  const selected = first ? 0 : 1;
  // 送った一通に ✓ が付く
  const check = interpolate(t, [MAIL_SENT + 2, MAIL_SENT + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });

  // カーソル: 打ち終えたら送信ボタンへ。送ったあとは次の返信欄の脇で待つ
  const toButton = interpolate(t, [MAIL_SENT - 10, MAIL_SENT - 2], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  // 押したらすぐ右へ逃がす（「送信しました」の文字に重ねない）
  const away = interpolate(t, [MAIL_SENT + 2, MAIL_SENT + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const cursor: [number, number] = [
    1180 + (BUTTON.x + 150 - 1180) * toButton + 520 * away,
    640 + (BUTTON.y + 40 - 640) * toButton - 60 * away,
  ];

  return (
    <AppWindow
      app="メール"
      menus={["ファイル", "編集", "表示", "メッセージ"]}
      title="受信 — メール"
      tools={[{ w: 34, on: true }, { w: 34 }, { w: 34 }, { w: 0 }, { w: 120 }, { w: 0 }, { w: 64 }]}
    >
      {/* 受信箱 */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: LIST_W, backgroundColor: Z.desk, borderRight: `1px solid ${Z.hair}` }}>
        {INBOX.map((m, i) => {
          const on = i === selected;
          const done = i === 0 && t >= MAIL_SENT + 2;
          return (
            <div
              key={m.from}
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                top: 20 + i * 150,
                height: 136,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                gap: 22,
                padding: "0 22px",
                backgroundColor: on ? "rgba(10,132,255,0.22)" : "transparent",
                opacity: done ? 0.55 + 0.45 * (1 - check) : 1,
              }}
            >
              <span style={{ width: 56, height: 56, borderRadius: "50%", flexShrink: 0, backgroundColor: m.tint, opacity: 0.85 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", fontFamily: font.sans }}>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 30, color: Z.text }}>{m.from}</span>
                  <span style={{ fontWeight: 500, fontSize: 22, color: Z.dim }}>{m.time}</span>
                </div>
                <span style={{ fontFamily: font.sans, fontWeight: 500, fontSize: 26, color: Z.dim, whiteSpace: "nowrap" }}>{m.subject}</span>
              </div>
              {done ? (
                <svg width={44} height={44} viewBox="0 0 44 44" style={{ flexShrink: 0, scale: String(check) }}>
                  <circle cx={22} cy={22} r={21} fill={Z.ok} />
                  <path d="M12 23 L19 30 L32 15" fill="none" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 返信欄 */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" }}>
        {first ? (
          <div style={{ position: "absolute", inset: 0, opacity: 1 - out, translate: `0px ${-60 * out}px` }}>
            <Header to="田中さん" subject="Re: お見積もりの件" />
            <Body rows={REPLY1} t={t} />
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, opacity: inP, translate: `0px ${40 * (1 - inP)}px` }}>
            <Header to="営業チーム" subject="Re: 来週の定例について" />
            <Body rows={REPLY2} t={t} />
          </div>
        )}
        {/* 送信ボタン。押した瞬間に緑になり「送信しました」 */}
        <div
          style={{
            position: "absolute",
            left: BUTTON.x,
            top: BUTTON.y,
            width: BUTTON.w + (t >= MAIL_SENT && t < NEXT + 14 ? 90 : 0),
            height: BUTTON.h,
            borderRadius: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            scale: String(press),
            backgroundColor: t >= MAIL_SENT && t < NEXT + 14 ? Z.ok : Z.blue,
            boxShadow: sentGlow > 0 ? `0 0 ${50 * sentGlow}px rgba(48,209,88,${0.8 * sentGlow})` : undefined,
            fontFamily: font.sans,
            fontWeight: 700,
            fontSize: 34,
            color: "#fff",
          }}
        >
          {t >= MAIL_SENT && t < NEXT + 14 ? "✓ 送信しました" : "送信"}
        </div>
      </div>
      <Pointer x={cursor[0]} y={cursor[1]} size={38} />
    </AppWindow>
  );
};
