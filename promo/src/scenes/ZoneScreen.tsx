import { Easing, interpolate, random } from "remotion";
import { GO_CODE } from "../components/Desktop";
import { clamp, color, font, formatTime } from "../theme";

// 全カット共通の汎用ポモドーロ（GenericTimer）と、コードを書いている画面（ZoneScreen）。
// ZoneScreen は「エンジニア向けすぎる」との判断でモンタージュから外した（4 カット目はメール = ZoneMail）。差し戻せるよう残してある。
// 画面の描画はフレーム番号（この画面の時間軸）だけで決まる関数にしてある。モンタージュはこの時間軸をずらして借りる。
// 後半の Desktop と同じ Go のプロジェクト（GO_CODE）を、ダークテーマで書いている。
// timerRemaining / URGENT_FROM は Zone の時間軸そのもの（00:15 → 00:00）で、全カット・4 分割・Cut が共有する。

export const ZONE_LENGTH = 450;

// ---------------------------------------------------------------- 色（ノイズ側のダーク。Quiet のティールは使わない）

const TEXT_PRIMARY = "#F2F2F7";
const TEXT_DIM = "rgba(235,235,245,0.6)";
const OK_GREEN = "#30D158";
const DESK = "#0B0D12";
const CHROME = "#1C2836";

const syntax = {
  k: "#BF5AF2",
  t: color.warn,
  s: OK_GREEN,
  c: "rgba(235,235,245,0.38)",
  f: TEXT_PRIMARY,
  p: "rgba(235,235,245,0.8)",
};
type Kind = keyof typeof syntax;
type Tok = [string, Kind];

// ---------------------------------------------------------------- コード

// GO_CODE の 17 行目（Content-Type を付ける行）が欠けた状態から始まり、それを打つとテストが通る。
// 続けて handleReset を書き足し、もう一度 ok が出たら main を書き始める（＝手が止まらないまま 00:00 を迎える）。
// start はパッケージ変数として別ファイルにある想定（GO_CODE と同じ）
const CONTENT_TYPE_LINE = 16;
const RESET_FUNC: Tok[][] = [
  [],
  [["// handleReset は、計測を最初からやり直す", "c"]],
  [["func", "k"], [" handleReset", "f"], ["(w ", "p"], ["http.ResponseWriter", "t"], [", r *", "p"], ["http.Request", "t"], [") {", "p"]],
  [["\tstart = time.Now()", "p"]],
  [["\tw.WriteHeader(http.StatusNoContent)", "p"]],
  [["}", "p"]],
];
const MAIN_FUNC: Tok[][] = [
  [],
  [["func", "k"], [" main", "f"], ["() {", "p"]],
  [["\taddr := ", "p"], ['":8080"', "s"]],
  [["\thttp.HandleFunc(", "p"], ['"/session"', "s"], [", handleSession)", "p"]],
  [["\thttp.HandleFunc(", "p"], ['"/reset"', "s"], [", handleReset)", "p"]],
  [["\tif", "k"], [" err := http.ListenAndServe(addr, ", "p"], ["nil", "k"], ["); err != ", "p"], ["nil", "k"], [" {", "p"]],
  [["\t\tpanic(err)", "p"]],
  [["\t}", "p"]],
  [["}", "p"]],
];
const RESET_FROM = GO_CODE.length;
const MAIN_FROM = RESET_FROM + RESET_FUNC.length;
const LINES: Tok[][] = [...GO_CODE, ...RESET_FUNC, ...MAIN_FUNC];
const lineText = (i: number) => LINES[i].map((t) => t[0]).join("");

// 打鍵の時刻列。gap0 → gap1 へ間隔が詰まっていく（＝加速）。間隔は乱数で揺らす
const keyTimes = (count: number, start: number, gap0: number, gap1: number, seed: string) => {
  const out: number[] = [];
  let t = start;
  for (let i = 0; i < count; i++) {
    out.push(t);
    const g = gap0 + (gap1 - gap0) * (i / Math.max(1, count - 1));
    t += g * (0.6 + random(`${seed}-${i}`) * 0.8);
  }
  return out;
};

// 区間 A: 17 行目（先頭のタブは Enter の自動インデント）。冒頭のつかみなので速めに打ち切り、3 秒で最初の ok を出す
export const A_START = 8;
const A_TEXT = lineText(CONTENT_TYPE_LINE).replace(/^\t+/, "");
export const A_KEYS = keyTimes(A_TEXT.length, A_START, 1.6, 0.8, "a");

// 改行ごとに次の行が現れ、行頭のタブは改行と同時に入る
type SeqKey = { line: number; col: number };
const seqOf = (from: number, count: number): SeqKey[] => {
  const out: SeqKey[] = [];
  for (let line = from; line < from + count; line++) {
    const text = lineText(line);
    const indent = text.match(/^\t*/)![0].length;
    out.push({ line, col: indent }); // 改行（＋自動インデント）
    for (let c = indent; c < text.length; c++) out.push({ line, col: c + 1 });
  }
  return out;
};

// 区間 B: 空行から handleReset の閉じ括弧まで
export const B_START = 120;
const B_SEQ = seqOf(RESET_FROM, RESET_FUNC.length);
export const B_KEYS = keyTimes(B_SEQ.length, B_START, 0.9, 0.42, "b");

// 区間 M: 2 回目の ok のあと、そのまま main を書く。00:00 は if 文の途中で来る
export const M_START = 268;
const M_SEQ = seqOf(MAIN_FROM, MAIN_FUNC.length);
export const M_KEYS = keyTimes(M_SEQ.length, M_START, 1.3, 1.1, "m");

const typedA = (frame: number) => A_KEYS.filter((t) => t <= frame).length;

// 各行がいま何文字見えているか（-1 = まだ存在しない）
const shownChars = (frame: number): number[] => {
  const shown = LINES.map((_, i) => (i < GO_CODE.length ? lineText(i).length : -1));
  // 17 行目は打ち始める少し前に改行して空ける
  if (frame < A_START - 6) shown[CONTENT_TYPE_LINE] = -1;
  else shown[CONTENT_TYPE_LINE] = 1 + typedA(frame);
  const apply = (seq: SeqKey[], keys: number[]) =>
    seq.forEach((k, n) => {
      if (keys[n] <= frame) shown[k.line] = k.col;
    });
  apply(B_SEQ, B_KEYS);
  apply(M_SEQ, M_KEYS);
  return shown;
};

// ---------------------------------------------------------------- ターミナル

type TermLine = { at: number; text: string; kind?: "prompt" | "fail" | "ok" | "dim" };
const FAIL_OUTPUT: TermLine[] = [
  { at: -1, text: "go test ./...", kind: "prompt" },
  { at: -1, text: "--- FAIL: TestHandleSession (0.00s)", kind: "fail" },
  { at: -1, text: '    main_test.go:18: Content-Type = "text/plain; charset=utf-8", want "application/json"', kind: "dim" },
  { at: -1, text: "FAIL", kind: "fail" },
  { at: -1, text: "FAIL\tsession\t0.214s", kind: "fail" },
  { at: -1, text: "FAIL", kind: "fail" },
];
// ↑ で前のコマンドを呼び戻して Enter。打ち直さないので一瞬で出る
export const RUN1 = 74;
export const RUN2 = 236;
export const RUN_OK = 16; // Enter から ok が出るまで
const run = (at: number, secs: string): TermLine[] => [
  { at, text: "go test ./...", kind: "prompt" },
  { at: at + RUN_OK, text: `ok  \tsession\t${secs}`, kind: "ok" },
];
const LOG: TermLine[] = [...FAIL_OUTPUT, ...run(RUN1, "0.198s"), ...run(RUN2, "0.205s")];

const TERM_FONT = 22;
const TERM_LINE = 34;
// カメラが寄っている間はターミナルの上 2〜3 行しか画面に入らない。行を多く出すと古い FAIL が上に残り、
// 最新の ok が画面の下に切れる（山場に赤い FAIL が映る）ので、最新の 4 行だけを出す
const TERM_ROWS = 4;

// ターミナルにフォーカスがある間（↑Enter の直前から ok を見届けるまで）。それ以外はエディタで打っている
const termFocused = (frame: number) =>
  (frame >= RUN1 - 6 && frame < RUN1 + RUN_OK + 10) || (frame >= RUN2 - 6 && frame < M_START - 4);

const Terminal: React.FC<{ frame: number }> = ({ frame }) => {
  const visible = LOG.filter((l) => l.at <= frame);
  // 最後の行が出力なら、その下に次のプロンプトが出ている
  const last = visible[visible.length - 1];
  const ready = last.kind !== "prompt" || frame >= last.at + RUN_OK;
  const lines: TermLine[] = [...visible];
  if (ready && last.kind !== "prompt") lines.push({ at: frame, text: "", kind: "prompt" });
  const rows = lines.slice(-TERM_ROWS);
  const caretOn = termFocused(frame) && Math.floor(frame / 15) % 2 === 0;
  return (
    <div style={{ fontFamily: font.mono, fontSize: TERM_FONT, lineHeight: `${TERM_LINE}px`, whiteSpace: "pre", tabSize: 8 }}>
      {rows.map((l, i) => {
        const isCurrent = i === rows.length - 1 && l.kind === "prompt" && ready;
        if (l.kind === "prompt") {
          return (
            <div key={i}>
              <span style={{ color: TEXT_DIM }}>session % </span>
              <span style={{ color: TEXT_PRIMARY }}>{l.text}</span>
              {isCurrent && caretOn ? (
                <span style={{ display: "inline-block", width: TERM_FONT * 0.6, height: TERM_FONT * 1.1, verticalAlign: "text-bottom", backgroundColor: TEXT_PRIMARY }} />
              ) : null}
            </div>
          );
        }
        if (l.kind === "ok") {
          // ok が出た瞬間だけ緑が少し光る
          const glow = interpolate(frame - l.at, [0, 4, 24], [0, 1, 0.25], clamp);
          return (
            <div key={i} style={{ color: TEXT_PRIMARY, backgroundColor: `rgba(48,209,88,${0.2 * glow})`, margin: "0 -12px", padding: "0 12px" }}>
              <span style={{ color: OK_GREEN, fontWeight: 700, textShadow: `0 0 ${18 * glow}px rgba(48,209,88,${0.9 * glow})` }}>ok</span>
              {l.text.slice(2)}
            </div>
          );
        }
        return (
          <div key={i} style={{ color: l.kind === "fail" ? color.alarm : TEXT_DIM, fontWeight: l.kind === "fail" ? 700 : 500 }}>
            {l.text}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- エディタ（ダーク）

export const EDITOR = { x: 40, y: 58, w: 1440, h: 1004 };
const TITLE_H = 40;
const TABS_H = 40;
const STATUS_H = 30;
const TERM_H = 300;
const CODE_FONT = 21;
const CODE_LINE = 34;
const GUTTER = 78;
const CODE_TOP = TITLE_H + TABS_H + 14;
const CODE_ROWS = 17;

// 打っている場所が画面に収まるように、区間 B の前に 5 行、区間 M の前にさらに 11 行ぶん下へスクロールする
export const SCROLL_M = 21;
const scrollAt = (frame: number) =>
  interpolate(frame, [B_START - 30, B_START - 6, M_START - 20, M_START - 2], [5, 10, 10, SCROLL_M], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });

// 書きかけの行の下に出る、赤い波線（gopls の構文エラー）
const Squiggle: React.FC<{ left: number; width: number }> = ({ left, width }) => (
  <svg width={width} height={6} style={{ position: "absolute", left, bottom: 2 }} viewBox={`0 0 ${width} 6`}>
    <path
      d={`M0 3 ${new Array(Math.ceil(width / 6)).fill(0).map((_, i) => `q 1.5 ${i % 2 ? 3 : -3} 3 0 t 3 0`).join(" ")}`}
      fill="none"
      stroke={color.alarm}
      strokeWidth={1.4}
    />
  </svg>
);

const Editor: React.FC<{ frame: number }> = ({ frame }) => {
  const shown = shownChars(frame);
  const scroll = scrollAt(frame);

  // いま打っている行（最後に打鍵した行）とキャレット
  const aKeys = typedA(frame);
  const bDone = B_KEYS.filter((t) => t <= frame).length;
  const mDone = M_KEYS.filter((t) => t <= frame).length;
  const caretLine =
    mDone > 0
      ? M_SEQ[mDone - 1].line
      : bDone > 0
        ? B_SEQ[bDone - 1].line
        : frame >= A_START - 6
          ? CONTENT_TYPE_LINE
          : CONTENT_TYPE_LINE - 1;
  const lastKey = mDone > 0 ? M_KEYS[mDone - 1] : bDone > 0 ? B_KEYS[bDone - 1] : aKeys > 0 ? A_KEYS[aKeys - 1] : -99;
  const typing = frame - lastKey < 6;
  // ターミナルで ok を見ている間は、エディタのキャレットは消える
  const caretOn = !termFocused(frame) && (typing || Math.floor(frame / 15) % 2 === 0);
  const charW = CODE_FONT * 0.6;

  // 書きかけの行と、閉じていない関数ブロックはエラーとして数える
  const aOpen = shown[CONTENT_TYPE_LINE] > 0 && shown[CONTENT_TYPE_LINE] < lineText(CONTENT_TYPE_LINE).length;
  // func の行が出てから、閉じ括弧を打つまで
  const blockOpen = (funcLine: number, endLine: number) => shown[funcLine] >= 0 && shown[endLine] < 1;
  const bOpen = blockOpen(RESET_FROM + 2, MAIN_FROM - 1);
  const mOpen = blockOpen(MAIN_FROM + 1, LINES.length - 1);
  const problems = (aOpen ? 1 : 0) + (bOpen ? 1 : 0) + (mOpen ? 1 : 0);
  const squiggleLine = aOpen ? CONTENT_TYPE_LINE : bOpen || mOpen ? caretLine : -1;

  // 行番号は「存在する行」だけで振り直す
  const rows: { i: number; n: number }[] = [];
  LINES.forEach((_, i) => {
    if (shown[i] >= 0) rows.push({ i, n: rows.length + 1 });
  });

  return (
    <div
      style={{
        position: "absolute",
        left: EDITOR.x,
        top: EDITOR.y,
        width: EDITOR.w,
        height: EDITOR.h,
        borderRadius: 15,
        overflow: "hidden",
        backgroundColor: color.night,
        boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      {/* タイトルバー */}
      <div style={{ height: TITLE_H, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", backgroundColor: CHROME }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span key={c} style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: c }} />
        ))}
        <span style={{ flex: 1, textAlign: "center", marginRight: 80, fontFamily: font.sans, fontWeight: 500, fontSize: 17, color: TEXT_DIM }}>
          main.go
        </span>
      </div>
      {/* タブ */}
      <div style={{ height: TABS_H, display: "flex", fontFamily: font.sans, fontSize: 16, fontWeight: 500, backgroundColor: DESK }}>
        {[
          ["main.go", true],
          ["main_test.go", false],
        ].map(([name, active]) => (
          <div
            key={String(name)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 22px",
              color: active ? TEXT_PRIMARY : TEXT_DIM,
              backgroundColor: active ? color.night : "transparent",
              borderTop: active ? `2px solid ${TEXT_DIM}` : "2px solid transparent",
            }}
          >
            {name}
          </div>
        ))}
      </div>
      {/* 本文 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: CODE_TOP,
          height: CODE_ROWS * CODE_LINE,
          overflow: "hidden",
          fontFamily: font.mono,
          fontSize: CODE_FONT,
          lineHeight: `${CODE_LINE}px`,
        }}
      >
        <div style={{ translate: `0px ${-scroll * CODE_LINE}px` }}>
          {rows.map(({ i, n }) => {
            let budget = shown[i];
            const parts: React.ReactNode[] = [];
            for (const [text, kind] of LINES[i]) {
              if (budget <= 0) break;
              const s = text.slice(0, budget);
              budget -= s.length;
              parts.push(
                <span key={parts.length} style={{ color: syntax[kind] }}>
                  {s.replace(/\t/g, "    ")}
                </span>,
              );
            }
            const col = lineText(i).slice(0, shown[i]).replace(/\t/g, "    ").length;
            const indent = (lineText(i).match(/^\t*/)![0].length) * 4;
            const active = i === caretLine;
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  height: CODE_LINE,
                  display: "flex",
                  whiteSpace: "pre",
                  backgroundColor: active ? "rgba(235,235,245,0.05)" : undefined,
                }}
              >
                <span style={{ width: GUTTER, flexShrink: 0, textAlign: "right", paddingRight: 26, color: active ? TEXT_DIM : "rgba(235,235,245,0.25)" }}>
                  {n}
                </span>
                {parts}
                {active && caretOn ? <span style={{ width: 2.5, backgroundColor: TEXT_PRIMARY }} /> : null}
                {i === squiggleLine && col > indent ? (
                  <Squiggle left={GUTTER + indent * charW} width={Math.max(18, (col - indent) * charW)} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {/* 統合ターミナル */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: STATUS_H,
          height: TERM_H,
          padding: "14px 28px",
          backgroundColor: DESK,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Terminal frame={frame} />
      </div>
      {/* 下端の細い帯（特定のエディタの表記に似せないため、エラーの印だけ） */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: STATUS_H,
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "0 18px",
          fontFamily: font.sans,
          fontSize: 15,
          fontWeight: 500,
          color: TEXT_DIM,
          backgroundColor: CHROME,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: problems > 0 ? color.alarm : OK_GREEN }} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- よくあるポモドーロタイマー（汎用・赤）

// エディタの右上に浮かぶ、どこにでもありそうな 25 分のタイマー。Quiet ではない。
// 画面の隅ではなくエディタに重ねて置くのは、最後に寄ったとき、下に打ち続けているコードが一緒に映るようにするため
export const TIMER = { x: 1020, y: 100, w: 352, h: 132 };

// 動画の 15 秒 = タイマーの残り 15 秒（Zone の終わりで 00:00）
export const timerRemaining = (frame: number) => Math.max(0, Math.ceil((ZONE_LENGTH - frame) / 30));
// 残り 5 秒（f300）から赤くなり、秒が変わるたびに脈打つ
export const URGENT_FROM = ZONE_LENGTH - 5 * 30;

// アイコンはトマト（ポモドーロの記号）。輪＋中心の点は Quiet のダイヤルと同じ形になるので使わない
const Tomato: React.FC<{ body: string }> = ({ body }) => (
  <svg width={84} height={84} viewBox="0 0 84 84" style={{ flexShrink: 0 }}>
    <ellipse cx={42} cy={48} rx={33} ry={29} fill={body} />
    <ellipse cx={30} cy={38} rx={8} ry={5} fill="rgba(255,255,255,0.28)" transform="rotate(-30 30 38)" />
    <path d="M42 22 L33 14 L40 21 L30 23 L41 25 L36 33 L43 26 L50 32 L46 24 L55 22 L45 21 L50 13 Z" fill={OK_GREEN} />
    <rect x={40.5} y={8} width={3} height={14} rx={1.5} fill={OK_GREEN} />
  </svg>
);

// 置き場所は呼び出し側が決める（left/top/scale）。Zone のモンタージュでは全カットの同じ隅に、4 分割では各画面の隅に置く
export const GenericTimer: React.FC<{ frame: number; left: number; top: number; scale?: number }> = ({ frame, left, top, scale = 1 }) => {
  const remaining = timerRemaining(frame);
  const urgent = frame >= URGENT_FROM;
  const tick = (ZONE_LENGTH - frame) % 30;
  const pulse = urgent ? interpolate(30 - tick, [0, 3, 14], [1.06, 1.06, 1], clamp) : 1;
  const done = remaining === 0;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transformOrigin: "100% 0",
        width: TIMER.w,
        height: TIMER.h,
        borderRadius: 22,
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "0 26px",
        scale: String(pulse * scale),
        backgroundColor: done ? color.alarm : "rgba(28,28,30,0.9)",
        boxShadow: urgent
          ? `0 0 0 1px rgba(255,59,48,0.7), 0 0 ${40 * pulse}px rgba(255,59,48,0.45), 0 18px 40px rgba(0,0,0,0.5)`
          : "0 0 0 0.5px rgba(255,255,255,0.3), 0 18px 40px rgba(0,0,0,0.5)",
      }}
    >
      <Tomato body={done ? "#fff" : color.alarm} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: font.sans, fontWeight: 700, fontSize: 18, letterSpacing: "0.12em", color: done ? "#fff" : TEXT_DIM }}>FOCUS</span>
        <span
          style={{
            fontFamily: font.mono,
            fontWeight: 700,
            fontSize: 64,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: done ? "#fff" : urgent ? color.alarm : TEXT_PRIMARY,
          }}
        >
          {formatTime(remaining)}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- メニューバー（ダーク・Quiet の項目なし）

const MENU_H = 36;
const MenuBar: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      right: 0,
      height: MENU_H,
      display: "flex",
      alignItems: "center",
      gap: 30,
      padding: "0 22px",
      fontFamily: font.sans,
      fontSize: 19,
      fontWeight: 500,
      color: "rgba(235,235,245,0.85)",
      backgroundColor: "rgba(20,31,43,0.75)",
      boxShadow: "0 0.5px 0 rgba(255,255,255,0.08)",
    }}
  >
    <span style={{ fontWeight: 700, color: TEXT_PRIMARY }}>エディタ</span>
    {["ファイル", "編集", "表示"].map((m) => (
      <span key={m}>{m}</span>
    ))}
    <div style={{ flex: 1 }} />
    {/* 夜であることだけを伝える。日付を出すと後半の Desktop（同じ main.go を書いている）と日の前後が矛盾する */}
    <span style={{ fontVariantNumeric: "tabular-nums" }}>23:48</span>
  </div>
);

// ---------------------------------------------------------------- カメラ

// 残り 1.5 秒（00:02 の途中）から、タイマーへ寄る
export const PUSH_FROM = ZONE_LENGTH - 45;

// 画面 = (世界 - 注視点) × s + 画面中央。壁紙の外が映らないように平行移動を詰める
type Cam = { fx: number; fy: number; s: number };
const CAM_KEYS: [number, Cam][] = [
  // 冒頭から寄った状態: 打っている 17 行目と、下の赤い FAIL が最初から大きく見える（タイマーは画面の外）
  [0, { fx: 660, fy: 700, s: 1.3 }],
  [RUN1, { fx: 640, fy: 720, s: 1.38 }],
  [B_START, { fx: 640, fy: 700, s: 1.42 }],
  [RUN2, { fx: 640, fy: 720, s: 1.48 }],
  // 2 回目の ok のあと、main を書きながら少し引く。タイマー（右上）と打っているコード（左下）が同じ画に入り、
  // 残り 5 秒でタイマーが赤く脈打つのを、手を止めずに打ち続ける横で見せる
  [300, { fx: 800, fy: 430, s: 1.25 }],
  [PUSH_FROM, { fx: 810, fy: 420, s: 1.28 }],
  // 残り 1.5 秒: タイマーへ寄る。打っている行は下に残したまま
  [ZONE_LENGTH, { fx: 860, fy: 330, s: 1.65 }],
];

const camAt = (frame: number) => {
  const pick = (key: keyof Cam) => {
    // 区間ごとに ease-in-out でつなぐ
    let i = 0;
    while (i < CAM_KEYS.length - 2 && frame > CAM_KEYS[i + 1][0]) i++;
    const [f0, a] = CAM_KEYS[i];
    const [f1, b] = CAM_KEYS[i + 1];
    return interpolate(frame, [f0, f1], [a[key], b[key]], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  };
  const s = pick("s");
  const tx = Math.min(0, Math.max(1920 * (1 - s), 960 - pick("fx") * s));
  const ty = Math.min(0, Math.max(1080 * (1 - s), 540 - pick("fy") * s));
  return { s, tx, ty };
};

// ---------------------------------------------------------------- 画面

// showTimer: モンタージュではタイマーを画面側（全カット共通の隅）に描くので、ここでは出さない
export const ZoneScreen: React.FC<{ frame: number; showTimer?: boolean }> = ({ frame, showTimer = true }) => {
  const cam = camAt(frame);
  // タイマーへ寄ると、コードは少しだけピントの外へ（拡大後の画面で 2px 程度。打っているのが分かる程度に留める）
  const defocus = interpolate(frame, [PUSH_FROM + 10, ZONE_LENGTH], [0, 1.2], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", backgroundColor: DESK }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          transformOrigin: "0 0",
          transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`,
        }}
      >
        {/* 夜の壁紙 */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: [
              "radial-gradient(ellipse 900px 700px at 300px 200px, rgba(10,132,255,0.16), transparent 70%)",
              "radial-gradient(ellipse 1000px 800px at 1600px 900px, rgba(191,90,242,0.12), transparent 70%)",
              color.night,
            ].join(", "),
          }}
        />
        <div style={{ position: "absolute", inset: 0, filter: defocus > 0 ? `blur(${defocus}px)` : undefined }}>
          <Editor frame={frame} />
        </div>
        {showTimer ? <GenericTimer frame={frame} left={TIMER.x} top={TIMER.y} /> : null}
        <MenuBar />
      </div>
    </div>
  );
};
