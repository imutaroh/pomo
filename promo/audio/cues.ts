// キューシートの生成。音を合わせるべき「絵の出来事」を本編の絶対フレームで audio/cues.json に書き出す。
//
// 実行（promo/ で）:
//   npx esbuild audio/cues.ts --bundle --platform=node --format=esm --jsx=automatic \
//     --outfile=../.claude/tmp/cues.mjs --log-level=warning && node ../.claude/tmp/cues.mjs
//
// 定数は各シーンのソースから正規表現で読み取り、見つけた行番号をそのまま source に書く。
// 値を写し書きしないので、シーン側の数字が変わっても再実行すればキューが追従する
// （行の形が変わって読めなくなったら、黙って古い値を使わずに例外で止まる）。
// 数式で決まるもの（打鍵の乱数・ポップアップの間隔・ホバーの出入り・easing の到達点）は
// シーンと同じ式を remotion の random / Easing / DesktopShared の関数で計算し直している。

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Easing, interpolate } from "remotion";
import { DOC_LINES, docTypedAt } from "../src/components/Desktop";
import { BREAK_CHIP, CURSOR_EDITOR, hoverEventsFor, panelPoint, PLAY_BUTTON, TYPED_DESKTOP, TYPED_PRESENCE_END, TYPED_PRESENCE_MID } from "../src/scenes/DesktopShared";
import { keyTimes } from "../src/scenes/ZoneChrome";
import { DESIGN_ALIGNED } from "../src/scenes/ZoneDesign";
import { DOC_OUTLINE } from "../src/scenes/ZoneDoc";
import { MAIL_SENT } from "../src/scenes/ZoneMail";
import { CUTS } from "../src/scenes/ZoneMontage";
import { timerRemaining, URGENT_FROM, ZONE_LENGTH } from "../src/scenes/ZoneScreen";
import { SHEET_ENTER } from "../src/scenes/ZoneSheet";
import { DURATION, FPS, SCENE_DEFS, SceneId, sceneFrom, sceneLength } from "../src/timeline";

const PROMO = process.cwd();
const SRC = join(PROMO, "src");
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ---------------------------------------------------------------- ソースの読み取り

const cache = new Map<string, string[]>();
const linesOf = (file: string) => {
  if (!cache.has(file)) cache.set(file, readFileSync(join(SRC, file), "utf8").split("\n"));
  return cache.get(file)!;
};

type Grab = { nums: number[]; raw: string[]; ref: string };

/** file の中で re に最初に一致する行を探し、キャプチャを数値（読めなければ文字列）で返す */
const grab = (file: string, re: RegExp, label: string): Grab => {
  const ls = linesOf(file);
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(re);
    if (m) {
      const raw = m.slice(1);
      return { raw, nums: raw.map(Number), ref: `src/${file}:${i + 1} ${label}` };
    }
  }
  throw new Error(`見つからない: ${file} ${re}（シーンのソースの形が変わった。cues.ts の正規表現を直す）`);
};
/** file の中で re に一致する行をすべて、出てくる順に返す */
const grabAll = (file: string, re: RegExp, label: string, count: number): Grab[] => {
  const out: Grab[] = [];
  linesOf(file).forEach((l, i) => {
    const m = l.match(re);
    if (m) out.push({ raw: m.slice(1), nums: m.slice(1).map(Number), ref: `src/${file}:${i + 1} ${label}` });
  });
  if (out.length !== count) throw new Error(`${file} ${re} が ${out.length} 行（${count} 行のはず。シーンのソースの形が変わった）`);
  return out;
};
/** `const NAME = 44;` の値 */
const num = (file: string, name: string) => {
  const g = grab(file, new RegExp(`^\\s*const ${name}\\s*=\\s*(-?[\\d.]+)\\s*;`), name);
  return { v: g.nums[0], ref: g.ref };
};
/** `const NAME: [number, number] = [a, b];` の値 */
const pair = (file: string, name: string) => {
  const g = grab(file, new RegExp(`^\\s*const ${name}\\s*:\\s*\\[number, number\\]\\s*=\\s*\\[(-?[\\d.]+),\\s*(-?[\\d.]+)\\]`), name);
  return { v: [g.nums[0], g.nums[1]] as [number, number], ref: g.ref };
};
/** `const NAME = "...";` の文字列 */
const str = (file: string, name: string) => {
  const g = grab(file, new RegExp(`^\\s*const ${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s*;`), name);
  return { v: JSON.parse(g.raw[0]) as string, ref: g.ref };
};
const assertNum = (n: number, what: string) => {
  if (!Number.isFinite(n)) throw new Error(`数値でない: ${what}`);
  return n;
};

// ---------------------------------------------------------------- キュー

type Cue = { frame: number; type: string; scene: SceneId; note: string; source: string };
const cues: Cue[] = [];
const add = (scene: SceneId, local: number, type: string, note: string, source: string) => {
  const frame = sceneFrom(scene) + local;
  if (!Number.isInteger(frame)) throw new Error(`整数でないフレーム: ${scene} ${type} ${frame}`);
  if (frame < 0 || frame >= DURATION) return; // 尺の外（末尾の重なり）は捨てる
  cues.push({ frame, type, scene, note, source });
};

/** f(frame) が初めて pred を満たす整数フレーム（[from, to] の範囲で） */
const firstFrame = (from: number, to: number, pred: (f: number) => boolean) => {
  for (let f = from; f <= to; f++) if (pred(f)) return f;
  throw new Error(`到達しない: ${from}..${to}`);
};

// 共有の Caption: from で 18f かけて浮かび、to の 12f 前から消える
const CAP_IN = grab("components/Caption.tsx", /interpolate\(frame, \[from, from \+ (\d+)\]/, "Caption の入り").nums[0];
const CAP_OUT = grab("components/Caption.tsx", /interpolate\(frame, \[to - (\d+), to\]/, "Caption の消え").nums[0];
const captionCues = (scene: SceneId, text: string, range: { v: [number, number]; ref: string }) => {
  const [from, to] = range.v;
  add(scene, from, "caption-in", `コピー「${text}」が浮かび始める（${CAP_IN}f で読める濃さ）`, range.ref);
  add(scene, from + CAP_IN, "caption-full", `コピー「${text}」が出きる`, range.ref);
  add(scene, to - CAP_OUT, "caption-out-start", `コピー「${text}」が消え始める`, range.ref);
  add(scene, to, "caption-out-end", `コピー「${text}」が消えきる`, range.ref);
};

// シーンへのフェード（TransitionSeries の fade。前のシーンの末尾と重なる）
const fadeInCues = (scene: SceneId) => {
  const def = SCENE_DEFS.find((d) => d.id === scene)!;
  const ref = grab("timeline.ts", new RegExp(`id: "${scene}"`), `SCENE_DEFS ${scene}`).ref;
  if (def.transitionIn.kind === "none") {
    add(scene, 0, "cut", `${scene} へハードカット`, ref);
    return;
  }
  const n = def.transitionIn.frames;
  add(scene, 0, "fade-in-start", `${scene} が ${n}f の${def.transitionIn.kind}で入り始める（前のシーンと重なる）`, ref);
  add(scene, n, "fade-in-end", `${scene} のフェードが明ける`, ref);
};

// ================================================================= Zone（0–450）
// 4 つの仕事のモンタージュ（資料 → 表 → デザイン → メール）→ 4 分割。各画面の打鍵は画面ごとの type（key:doc など）で出す。
// 画面に映っている間（そのカットと 4 分割）の打鍵だけを数える
{
  const M = "scenes/ZoneMontage.tsx";
  const Z = "scenes/Zone.tsx";
  if (ZONE_LENGTH !== sceneLength("zone")) throw new Error(`ZONE_LENGTH ${ZONE_LENGTH} と timeline の zone ${sceneLength("zone")} が違う`);
  const cutsRef = grab(M, /^export const CUTS = \{/, "CUTS").ref;
  const order = ["doc", "sheet", "design", "mail", "split"] as const;
  for (const k of order) if (!Number.isInteger(CUTS[k])) throw new Error(`CUTS.${k} が読めない`);
  if (CUTS.doc !== 0) throw new Error(`CUTS.doc が 0 でない: ${CUTS.doc}`);
  const label = { doc: "資料", sheet: "表", design: "デザイン", mail: "メール", split: "4 分割" } as const;
  for (const k of order.slice(1)) add("zone", CUTS[k], "montage-cut", `カットが「${label[k]}」に切り替わる`, cutsRef);

  // 各画面が映っている区間（そのカット ∪ 4 分割）
  type App = "doc" | "sheet" | "design" | "mail";
  const until: Record<App, number> = { doc: CUTS.sheet, sheet: CUTS.design, design: CUTS.mail, mail: CUTS.split };
  const visible = (app: App, f: number) => (f >= CUTS[app] && f < until[app]) || (f >= CUTS.split && f < ZONE_LENGTH);
  const keyCues = (app: App, keys: number[], what: string, ref: string) => {
    keys.forEach((t, i) => {
      // 描画は keys[n] <= t で字が出るので、音は ceil したフレームに置く
      const f = CUTS[app] + Math.ceil(t);
      if (f < 0 || !visible(app, f)) return;
      add("zone", f, `key:${app}`, `${label[app]}の打鍵 ${i + 1}/${keys.length}（${what}）${f >= CUTS.split ? "・4 分割" : ""}`, ref);
    });
  };

  // `const NAME = typed("…", START, g0, g1, "seed");` を読み、START の式（数・定数・前の行の最後の打鍵 + n）を評価して keyTimes で時刻列を作る
  const typedLines = (file: string, consts: Record<string, number>) => {
    const env = new Map<string, number[]>();
    const out: { name: string; text: string; keys: number[]; ref: string }[] = [];
    linesOf(file).forEach((l, i) => {
      const m = l.match(/^const (\w+) = typed\("([^"]*)", (.+), ([\d.]+), ([\d.]+), "([^"]+)"\);/);
      if (!m) return;
      let expr = m[3].replace(/(\w+)\.keys!\[\1\.keys!\.length - 1\]/g, (_, n: string) => {
        const k = env.get(n);
        if (!k) throw new Error(`${file}:${i + 1} ${n} が先に読めていない`);
        return String(k[k.length - 1]);
      });
      expr = expr.replace(/[A-Z_][A-Z0-9_]*/g, (n) => {
        if (!(n in consts)) throw new Error(`${file}:${i + 1} 定数 ${n} を知らない（cues.ts に足す）`);
        return String(consts[n]);
      });
      if (!/^[\d.\s+\-]+$/.test(expr)) throw new Error(`${file}:${i + 1} 開始の式が読めない: ${m[3]}`);
      const start = assertNum(Function(`return (${expr});`)() as number, `${file}:${i + 1}`);
      const keys = keyTimes(m[2].length, start, Number(m[4]), Number(m[5]), m[6]);
      env.set(m[1], keys);
      out.push({ name: m[1], text: m[2], keys, ref: `src/${file}:${i + 1} ${m[1]}` });
    });
    if (!out.length) throw new Error(`${file} の typed(...) の行が読めない`);
    return out;
  };

  // ---- ① 資料: 見出しが並ぶ（構成が見えた）→ 箇条書きが一気に埋まる
  {
    const F = "scenes/ZoneDoc.tsx";
    const outlineRef = grab(F, /^export const DOC_OUTLINE = (\d+);/, "DOC_OUTLINE").ref;
    add("zone", CUTS.doc + DOC_OUTLINE, "doc-outline", "資料の見出し「2. 提案」が光って並ぶ（構成が見えた）", outlineRef);
    const h2 = grab(F, /text: "3\. 期待効果", appear: DOC_OUTLINE \+ (\d+)/, "「3. 期待効果」の appear");
    add("zone", CUTS.doc + DOC_OUTLINE + h2.nums[0], "doc-outline", "見出し「3. 期待効果」が光って並ぶ", h2.ref);
    const lines = typedLines(F, {});
    for (const l of lines) keyCues("doc", l.keys, `${l.name}「${l.text}」`, l.ref);
    // 一気に埋まる区間: 見出しのあとの最初の行の頭から、間が開くまで
    const rush = lines.filter((l) => l.keys[0] > DOC_OUTLINE && l.keys[0] < until.doc - CUTS.doc);
    const fast = rush.filter((l) => {
      const g = (l.keys[l.keys.length - 1] - l.keys[0]) / Math.max(1, l.keys.length - 1);
      return g < 1.2;
    });
    if (!fast.length) throw new Error("資料の一気に埋まる行が見つからない");
    add("zone", CUTS.doc + Math.ceil(fast[0].keys[0]), "doc-rush", `箇条書きが一気に埋まり始める（${fast[0].name}）`, fast[0].ref);
    const last = fast[fast.length - 1];
    add("zone", CUTS.doc + Math.ceil(last.keys[last.keys.length - 1]), "doc-rush-end", `一気に埋まる行が打ち終わる（${last.name}）`, last.ref);
  }

  // ---- ② 表: 数式を入れて Enter → 下へ引くと列が埋まる → 合計 → グラフが立つ
  {
    const F = "scenes/ZoneSheet.tsx";
    const FORMULA = str(F, "FORMULA");
    const fk = grab(F, /^const F_KEYS = keyTimes\(FORMULA\.length, ([\d.]+), ([\d.]+), ([\d.]+), "(\w+)"\);/, "F_KEYS");
    keyCues("sheet", keyTimes(FORMULA.v.length, fk.nums[0], fk.nums[1], fk.nums[2], fk.raw[3]), `数式「${FORMULA.v}」`, fk.ref);
    const enterRef = grab(F, /^export const SHEET_ENTER = (\d+);/, "SHEET_ENTER").ref;
    add("zone", CUTS.sheet + SHEET_ENTER, "sheet-enter", "Enter。D2 が値になる", enterRef);
    const FILL_FROM = num(F, "FILL_FROM");
    const FILL_STEP = num(F, "FILL_STEP");
    const rowsN = (grab(F, /^const MONTHS = \[(.+)\];/, "MONTHS").raw[0].match(/"/g) ?? []).length / 2;
    if (rowsN !== 6) throw new Error(`MONTHS の数が想定と違う: ${rowsN}`);
    for (let i = 1; i < rowsN; i++) {
      add("zone", CUTS.sheet + Math.ceil(FILL_FROM.v + FILL_STEP.v * i), "sheet-fill", `下へ引いて ${i + 1} 行目が埋まる`, FILL_STEP.ref);
    }
    const tot = grab(F, /^const TOTAL_AT = FILL_FROM \+ FILL_STEP \* (\d+) \+ (\d+);/, "TOTAL_AT");
    add("zone", CUTS.sheet + Math.ceil(FILL_FROM.v + FILL_STEP.v * tot.nums[0] + tot.nums[1]), "sheet-total", "合計のセルが出る", tot.ref);
    const BARS_FROM = num(F, "BARS_FROM");
    const br = grab(F, /\[BARS_FROM \+ i \* (\d+), BARS_FROM \+ i \* \d+ \+ (\d+)\]/, "棒の立ち上がり");
    for (let i = 0; i < rowsN; i++) {
      add("zone", CUTS.sheet + BARS_FROM.v + i * br.nums[0], "sheet-bar", `グラフの棒 ${i + 1}/${rowsN} が立ち上がり始める（${br.nums[1]}f）`, br.ref);
    }
    const eh = grab(F, /^const E_HEAD = keyTimes\((\d+), ([\d.]+), ([\d.]+), ([\d.]+), "(\w+)"\);/, "E_HEAD");
    keyCues("sheet", keyTimes(eh.nums[0], eh.nums[1], eh.nums[2], eh.nums[3], eh.raw[4]), "前年比の見出し", eh.ref);
    const YOY = JSON.parse(`[${grab(F, /^const YOY = \[(.+)\];/, "YOY").raw[0]}]`) as string[];
    const ec = grab(F, /^const E_CELLS = YOY\.map\(\(v, i\) => keyTimes\(v\.length, (\d+) \+ i \* (\d+), ([\d.]+), ([\d.]+), `(\w+)\$\{i\}`\)\);/, "E_CELLS");
    YOY.forEach((v, i) =>
      keyCues("sheet", keyTimes(v.length, ec.nums[0] + i * ec.nums[1], ec.nums[2], ec.nums[3], `${ec.raw[4]}${i}`), `前年比「${v}」`, ec.ref),
    );
  }

  // ---- ③ デザイン: 掴んで寄せるとガイドに吸い付く → 全部揃う
  {
    const F = "scenes/ZoneDesign.tsx";
    const ls = linesOf(F);
    ls.forEach((l, i) => {
      const m = l.match(/id: "(\w+)".*drag: \[(\d+), (\d+)\]/);
      if (m) add("zone", CUTS.design + Number(m[3]), "design-snap", `「${m[1]}」がガイドに吸い付く`, `src/${F}:${i + 1} ELS`);
    });
    const al = grab(F, /^export const DESIGN_ALIGNED = (\d+);/, "DESIGN_ALIGNED").ref;
    add("zone", CUTS.design + DESIGN_ALIGNED, "design-aligned", "左端と上端がぴたりと揃い、ガイドが全部光る", al);
    const NOTE = str(F, "NOTE");
    const nk = grab(F, /^const NOTE_KEYS = \[(\d+), (\d+), \.\.\.keyTimes\(NOTE\.length - 2, (\d+), ([\d.]+), ([\d.]+), "(\w+)"\)\];/, "NOTE_KEYS");
    const keys = [nk.nums[0], nk.nums[1], ...keyTimes(NOTE.v.length - 2, nk.nums[2], nk.nums[3], nk.nums[4], nk.raw[5])];
    keyCues("design", keys, `書き足す一行「${NOTE.v}」`, nk.ref);
  }

  // ---- ④ メール: 返信を打ち切って送信 → ✓ → 次の一通
  {
    const F = "scenes/ZoneMail.tsx";
    const sentRef = grab(F, /^export const MAIL_SENT = (\d+);/, "MAIL_SENT").ref;
    const next = grab(F, /^const NEXT = MAIL_SENT \+ (\d+);/, "NEXT");
    for (const l of typedLines(F, { NEXT: MAIL_SENT + next.nums[0] })) keyCues("mail", l.keys, `${l.name}「${l.text}」`, l.ref);
    add("zone", CUTS.mail + MAIL_SENT, "mail-sent", "「送信」を押す（ボタンが沈み「✓ 送信しました」に変わる）", sentRef);
    const ck = grab(F, /const check = interpolate\(t, \[MAIL_SENT \+ (\d+), MAIL_SENT \+ (\d+)\]/, "check");
    add("zone", CUTS.mail + MAIL_SENT + ck.nums[0], "mail-check", "受信箱の一通に ✓ が付く", ck.ref);
    add("zone", CUTS.mail + MAIL_SENT + next.nums[0], "mail-next", "次の一通の返信に移る", next.ref);
  }

  const COPY_FROM = num(Z, "COPY_FROM");
  const COPY_TO = num(Z, "COPY_TO");
  add("zone", COPY_FROM.v, "caption-in", "コピー「いま、いいところ。」が浮かび始める（15f）", COPY_FROM.ref);
  add("zone", COPY_TO.v, "caption-out-end", "コピー「いま、いいところ。」が消えきる", COPY_TO.ref);
  // 汎用ポモドーロの残り秒が変わるフレーム（00:15 → 00:01）。00:00 は Cut の頭
  const remRef = grab("scenes/ZoneScreen.tsx", /^export const timerRemaining\b/, "timerRemaining").ref;
  for (let f = 1; f < ZONE_LENGTH; f++) {
    if (timerRemaining(f) !== timerRemaining(f - 1)) {
      add("zone", f, "timer-sec", `汎用ポモドーロが 00:${String(timerRemaining(f)).padStart(2, "0")} になる${f >= URGENT_FROM ? "（赤く脈打つ）" : ""}`, remRef);
    }
  }
  add("zone", URGENT_FROM, "urgent", "残り 5 秒。タイマーが赤くなり、秒ごとに脈打ち始める", grab("scenes/ZoneScreen.tsx", /^export const URGENT_FROM\b/, "URGENT_FROM").ref);
  add("zone", ZONE_LENGTH - 1, "scene-end", "Zone の最終フレーム（4 分割・00:01、打鍵は止まっていない）", grab("scenes/ZoneScreen.tsx", /^export const ZONE_LENGTH\b/, "ZONE_LENGTH").ref);
}

// ================================================================= Cut（450–570）
{
  const F = "scenes/Cut.tsx";
  const ZERO_TO = num(F, "ZERO_TO");
  const ALARM = grab(F, /^const ALARM = ZERO_TO \+ (\d+);/, "ALARM");
  const alarmAt = ZERO_TO.v + ALARM.nums[0];
  const ALARM_OUT = num(F, "ALARM_OUT");
  const COPY_FROM = num(F, "COPY_FROM");
  const COPY = str(F, "COPY");
  add("cut", 0, "zero", "00:00。タイマーが赤く染まり画面が揺れる（ここで音楽を断ち切る）", grab("timeline.ts", /id: "cut"/, "SCENE_DEFS cut").ref);
  add("cut", ZERO_TO.v, "flash", `白フラッシュ（${alarmAt - ZERO_TO.v}f）`, ZERO_TO.ref);
  add("cut", alarmAt, "alarm", "赤地に「時間です。」がグリッチで割れて出る（1.22→1 のパンチ、グリッチ 110）", ALARM.ref);
  const g = grab(F, /\[ALARM, ALARM \+ (\d+), ALARM \+ (\d+), ALARM_OUT - (\d+), ALARM_OUT\], \[(\d+), (\d+), (\d+), (\d+), (\d+)\]/, "glitch");
  const [s1, s2, up] = g.nums;
  add("cut", alarmAt + s1, "glitch-settle", `グリッチが ${g.nums[4]} まで落ちる`, g.ref);
  add("cut", alarmAt + s2, "glitch-calm", `グリッチが ${g.nums[5]} で静まる（読める）`, g.ref);
  add("cut", ALARM_OUT.v - up, "glitch-up", `暗転の直前にグリッチが ${g.nums[7]} へ割れる`, g.ref);
  add("cut", ALARM_OUT.v, "blackout", "暗転（赤が消えて暗い地だけ）", ALARM_OUT.ref);
  const ci = grab(F, /interpolate\(frame, \[COPY_FROM, COPY_FROM \+ (\d+)\]/, "copy in");
  add("cut", COPY_FROM.v, "caption-in", `明朝「${COPY.v}」が浮かび始める`, COPY_FROM.ref);
  add("cut", COPY_FROM.v + ci.nums[0], "caption-full", "明朝のコピーが出きる（Noise へカットまで静止）", ci.ref);
  add("cut", sceneLength("cut") - 1, "scene-end", "Cut の最終フレーム", grab("timeline.ts", /id: "noise"/, "SCENE_DEFS noise").ref);
}

// ================================================================= Noise（570–870）
{
  const F = "scenes/Noise.tsx";
  fadeInCues("noise");
  const gap0 = grab(F, /^\s*let gap = (\d+);/, "APPEAR の初期間隔").nums[0];
  const until = grab(F, /^\s*while \(t < (\d+)\)/, "APPEAR の上限").nums[0];
  const decay = grab(F, /gap = Math\.max\((\d+), gap \* ([\d.]+)\)/, "APPEAR の詰まり方").nums;
  const appearRef = grab(F, /^const APPEAR/, "APPEAR").ref;
  const APPEAR: number[] = [];
  for (let t = 0, gap = gap0; t < until; ) {
    APPEAR.push(Math.round(t));
    t += gap;
    gap = Math.max(decay[0], gap * decay[1]);
  }
  const READ = num(F, "READ");
  const ENTER_FRAMES = num(F, "ENTER_FRAMES");
  const FREEZE = num(F, "FREEZE");
  const CAPTION = num(F, "CAPTION");
  const ERASE_START = num(F, "ERASE_START");
  const ERASE_END = num(F, "ERASE_END");
  const ERASE_FADE = num(F, "ERASE_FADE");
  const TO_WHITE = pair(F, "TO_WHITE");
  const CAPTION_OUT = pair(F, "CAPTION_OUT");

  // ポップアップの中身（LEAD → FILLER の順で使う）
  const popupList = (name: string) => {
    const ls = linesOf(F);
    const start = ls.findIndex((l) => l.startsWith(`const ${name}: Popup[]`));
    const out: string[] = [];
    for (let i = start + 1; i < ls.length && !ls[i].startsWith("];"); i++) {
      const m = ls[i].match(/title: "([^"]*)", body: "([^"]*)"/);
      if (m) out.push(`${m[1]}${m[2] ? `「${m[2].replace(/\\n/g, " ")}」` : "（棒グラフ）"}`);
    }
    if (!out.length) throw new Error(`${name} が読めない`);
    return out;
  };
  const LEAD = popupList("LEAD");
  const FILLER = popupList("FILLER");

  APPEAR.forEach((at, i) => {
    const what = i < LEAD.length ? LEAD[i] : FILLER[i % FILLER.length];
    add(
      "noise",
      at,
      "popup",
      `通知 ${i + 1}/${APPEAR.length} が飛び込む: ${what}（${ENTER_FRAMES.v}f で着地、カメラが拍で揺れる・HUD ×${String(i + 1).padStart(2, "0")}${i < READ.v ? "・読ませる大きさ" : ""}）`,
      appearRef,
    );
  });
  add("noise", FREEZE.v, "freeze", "積み上げが止まる。白の一閃（1f だけ washi 35%）、揺れも止まる", FREEZE.ref);
  add("noise", CAPTION.v, "caption-bar-in", "黒帯のコピー「集中にとって、ぜんぶノイズだった。」が割り込む（8f で横に開く、9f の色収差と横ずれ、赤い縁）", CAPTION.ref);
  add("noise", CAPTION.v + 8, "caption-bar-full", "黒帯が開ききって静止", grab(F, /interpolate\(local, \[0, (\d+)\], \[100, 0\]/, "CaptionBar wipe").ref);
  const hud = grab(F, /const hudOpacity = interpolate\(frame, \[ERASE_START - (\d+), ERASE_START \+ (\d+)\]/, "hudOpacity");
  add("noise", ERASE_START.v - hud.nums[0], "hud-out-start", "上の HUD（INTERRUPTIONS・REC・SCORE）が消え始める", hud.ref);

  // 消えるのは後から来たものから（Easing.in(quad) で終盤ほど間が空く）
  const n = APPEAR.length;
  const eraseRef = grab(F, /const eraseAt = ERASE_START/, "eraseAt").ref;
  const erases = APPEAR.map((_, i) => {
    const order = (n - 1 - i) / (n - 1);
    return { i, eraseAt: ERASE_START.v + Easing.in(Easing.quad)(order) * (ERASE_END.v - ERASE_START.v) };
  }).sort((a, b) => a.eraseAt - b.eraseAt);
  erases.forEach(({ i, eraseAt }, k) => {
    // gone は eraseAt で 1、eraseAt + ERASE_FADE で 0。絵が変わり始めるのは eraseAt を超えた最初の整数フレーム
    const startF = Math.floor(eraseAt) + 1;
    const goneF = Math.ceil(eraseAt + ERASE_FADE.v);
    add("noise", startF, "popup-erase-start", `${k + 1} 番目に消える通知（${i + 1} 枚目）が沈みながらぼけ始める（eraseAt=${eraseAt.toFixed(2)}）`, eraseRef);
    add("noise", goneF, "popup-gone", `${i + 1} 枚目の通知が消えきる（${k + 1}/${n}）`, ERASE_FADE.ref);
  });
  const lightStart = firstFrame(TO_WHITE.v[0], TO_WHITE.v[1], (f) => f > TO_WHITE.v[0]);
  add("noise", lightStart, "white-start", "中央から washi の円が広がり始める（Easing.inOut(cubic)。最初の数フレームは半径数 px で見えない）", TO_WHITE.ref);
  // inOut(cubic) の出だしは数 px しかないので、目に見える大きさ（半径 40px）になるフレームも出す
  const radiusRef = grab(F, /\$\{light \* (\d+)\}px/, "白の円の半径");
  const radius = (f: number) =>
    interpolate(f, TO_WHITE.v, [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) * radiusRef.nums[0];
  const visible = firstFrame(TO_WHITE.v[0], TO_WHITE.v[1], (f) => radius(f) >= 40);
  add("noise", visible, "white-visible", `白の円が目に見える大きさになる（半径 ${radius(visible).toFixed(0)}px）`, radiusRef.ref);
  add("noise", Math.round((TO_WHITE.v[0] + TO_WHITE.v[1]) / 2), "white-mid", "白の円が半径の半分。ここで最も速く広がる", TO_WHITE.ref);
  add("noise", TO_WHITE.v[1], "white-full", "白が画面を満たしきる（黒帯のコピーだけが残る）", TO_WHITE.ref);
  add("noise", CAPTION_OUT.v[0], "wipe-start", "黒帯のコピーを左から右へ拭き取り始める", CAPTION_OUT.ref);
  add("noise", CAPTION_OUT.v[1], "wipe-end", "拭き取りが終わり、washi 一色になる", CAPTION_OUT.ref);
  add("noise", sceneLength("noise") - 1, "scene-end", "Noise の最終フレーム（washi 一色の静止）。騒がしい側の絵はここまで、次のフレームから Silence", grab("timeline.ts", /id: "silence"/, "SCENE_DEFS silence").ref);
}

// ================================================================= Silence（870–930）
add("silence", 0, "silence-start", "白・無音の 2 秒の始まり（Noise から絵は変わらない washi 一色）", grab("scenes/Silence.tsx", /export const Silence/, "Silence").ref);

// ================================================================= Desktop（930–1080）
// 文書（提案書）のタイプ（DOC_LINES の文字数 × typed の割合）。増える区間を「打鍵の帯」として出す。
// 文字数は Desktop.tsx の DOC_CHARS と同じ数え方（kpi はセルの文字の合計、改行も 1 字）
const DOC_CHARS = DOC_LINES.reduce((n, l) => n + (l.kind === "kpi" ? l.cells.reduce((m, [a, b]) => m + a.length + b.length, 0) : l.text.length) + 1, 0);
// docTypedAt と数え方が揃っているか（最後の行の頭 + その行の長さ + 1 = 全体）
{
  const lastLine = DOC_LINES[DOC_LINES.length - 1];
  const lastLen = lastLine.kind === "kpi" ? 0 : lastLine.text.length;
  if (Math.round(docTypedAt(DOC_LINES.length - 1) * DOC_CHARS) + lastLen + 1 !== DOC_CHARS) throw new Error("DOC_CHARS の数え方が Desktop.tsx と違う");
}
// 字が増えない間が TYPING_GAP フレーム以下なら同じ帯とみなす（等速の早回しは 1 字/数 f で途切れ途切れになるため）
const TYPING_GAP = 6;
const typingSpans = (scene: SceneId, typedAt: (f: number) => number, last: number, ref: string) => {
  const shown = (f: number) => Math.floor(typedAt(f) * DOC_CHARS);
  const grows: number[] = [];
  for (let f = 1; f <= last; f++) if (shown(f) > shown(f - 1)) grows.push(f);
  let i = 0;
  while (i < grows.length) {
    let j = i;
    while (j + 1 < grows.length && grows[j + 1] - grows[j] <= TYPING_GAP) j++;
    const a = grows[i];
    const b = grows[j];
    const chars = shown(b) - shown(a - 1);
    const len = b - a + 1;
    add(scene, a, "editor-typing-start", `文書（提案書）がタイプされ始める（${len}f で ${chars} 字、約 ${(chars / len).toFixed(2)} 字/f。字が増えるのは ${j - i + 1} フレーム）`, ref);
    add(scene, b, "editor-typing-end", "エディタのタイプが止まる（最後に字が増えるフレーム）", ref);
    i = j + 1;
  }
};
{
  const F = "scenes/DesktopScene.tsx";
  fadeInCues("desktop");
  const PANEL_IN = pair(F, "PANEL_IN");
  const PUSH = pair(F, "PUSH");
  const CAPTION = pair(F, "CAPTION");
  const tg = grab(F, /const typed = interpolate\(frame, \[(\d+), (\d+)\], TYPED_DESKTOP, clamp\)/, "typed");
  typingSpans("desktop", (f) => interpolate(f, [tg.nums[0], tg.nums[1]], TYPED_DESKTOP, clamp), sceneLength("desktop") - 1, tg.ref);
  add("desktop", PANEL_IN.v[0], "panel-in-start", "右上にパネル（待機 00:00）が静かに現れ始める（下から 10px、ease）", PANEL_IN.ref);
  add("desktop", PANEL_IN.v[1], "panel-in-end", "パネルが出きる", PANEL_IN.ref);
  add("desktop", PUSH.v[0], "camera-start", "カメラがパネルへゆっくり寄り始める（camEase）", PUSH.ref);
  add("desktop", PUSH.v[1], "camera-end", "カメラが寄りきって止まる（CAM_NEAR）", PUSH.ref);
  captionCues("desktop", "作業画面を、一切邪魔しない。", CAPTION);
}

// ================================================================= Presence（1080–1260）
{
  const F = "scenes/Presence.tsx";
  fadeInCues("presence");
  const PLAY = num(F, "PLAY");
  const REST = panelPoint(176, 126);
  grab(F, /const REST = panelPoint\(176, 126\)/, "REST"); // 写した値がソースと同じか確かめる
  const pathRef = grab(F, /^const CURSOR_PATH/, "CURSOR_PATH").ref;
  // シーンと同じ通過点（[frame, x, y]）。数値は CURSOR_PATH の行と突き合わせる
  const path: [number, number, number][] = [
    [8, CURSOR_EDITOR.x, CURSOR_EDITOR.y],
    [32, PLAY_BUTTON.x, PLAY_BUTTON.y],
    [44, PLAY_BUTTON.x, PLAY_BUTTON.y],
    [64, CURSOR_EDITOR.x - 40, CURSOR_EDITOR.y + 20],
    [86, CURSOR_EDITOR.x - 40, CURSOR_EDITOR.y + 20],
    [108, REST.x, REST.y],
    [138, REST.x, REST.y],
    [160, CURSOR_EDITOR.x, CURSOR_EDITOR.y],
  ];
  const srcFrames = linesOf(F)
    .slice(Number(pathRef.split(":")[1].split(" ")[0]), Number(pathRef.split(":")[1].split(" ")[0]) + 9)
    .map((l) => l.match(/^\s*\[(\d+),/)?.[1])
    .filter(Boolean)
    .map(Number);
  if (srcFrames.join() !== path.map((p) => p[0]).join()) throw new Error(`Presence の CURSOR_PATH が変わった: ${srcFrames}`);
  const HOVER = hoverEventsFor(path);
  const hoverRef = grab(F, /^const HOVER = hoverEventsFor/, "HOVER").ref;
  const FADE = num("scenes/DesktopShared.tsx", "FADE");
  const po = grab(F, /interpolate\(frame, \[(\d+), (\d+)\], \[0, 1\], clamp\) \*$/, "pointerOpacity");
  add("presence", po.nums[0], "cursor-in", "ポインタが現れてエディタからパネルへ動き出す", po.ref);
  add("presence", HOVER[0][0], "hover-in", "ポインタがパネルの縁を越える（待機のパネルなので見た目はほぼ変わらない）", hoverRef);
  add("presence", path[1][0], "cursor-arrive", "ポインタが再生ボタンに着く", pathRef);
  add("presence", PLAY.v, "click", "再生クリック。00:00 から数え始め、ボタン列と休憩チップが出る。段階表が「操作」に光る", PLAY.ref);
  add("presence", HOVER[1][0], "hover-out", "ポインタがパネルを離れる → 段階表「溶け込む」", hoverRef);
  add("presence", HOVER[1][0], "melt-start", `パネルが 100%→30% に溶け始める（0.45 秒 easeOut = ${FADE.v}f）`, FADE.ref);
  add("presence", HOVER[1][0] + FADE.v, "melt-end", "30% に溶けきる。ここから早回しで数える", FADE.ref);
  add("presence", HOVER[2][0], "hover-in", "もう一度手を乗せる → 100% に戻る（ホバー復帰）。段階表「操作」", hoverRef);
  add("presence", HOVER[2][0] + FADE.v, "hover-full", "100% に戻りきる（実時間で数える）", FADE.ref);
  add("presence", path[5][0], "cursor-arrive", "ポインタが休憩チップ右の余白で止まる", pathRef);
  add("presence", HOVER[3][0], "hover-out", "手を離す → また 30% に溶ける。段階表「溶け込む」", hoverRef);
  add("presence", HOVER[3][0] + FADE.v, "melt-end", "30% に溶けきる", FADE.ref);
  const rin = pair(F, "RAIL_IN");
  const rout = pair(F, "RAIL_OUT");
  add("presence", rin.v[0], "rail-in", "右下に「存在感の3段階」の表が出始める", rin.ref);
  add("presence", rout.v[0], "rail-out-start", "段階表が消え始める", rout.ref);
  add("presence", rout.v[1], "rail-out-end", "段階表が消えきる", rout.ref);
  const tp = grab(F, /const typed = interpolate\(frame, \[(\d+), (\d+), (\d+), (\d+), (\d+)\], \[TYPED_DESKTOP\[1\], TYPED_DESKTOP\[1\], TYPED_PRESENCE_MID, TYPED_PRESENCE_MID, TYPED_PRESENCE_END\], clamp\)/, "typed");
  typingSpans(
    "presence",
    (f) => interpolate(f, tp.nums, [TYPED_DESKTOP[1], TYPED_DESKTOP[1], TYPED_PRESENCE_MID, TYPED_PRESENCE_MID, TYPED_PRESENCE_END], clamp),
    sceneLength("presence") - 1,
    tp.ref,
  );
  captionCues("presence", "うるさくない。でも、忘れさせない。", pair(F, "CAPTION"));
}

// ================================================================= Follow（1260–1410）
{
  const F = "scenes/Follow.tsx";
  fadeInCues("follow");
  const PULL = pair(F, "PULL");
  const TO_BROWSER = num(F, "TO_BROWSER");
  const SWIPE_OUT = pair(F, "SWIPE_OUT");
  const SWIPE_BACK = pair(F, "SWIPE_BACK");
  const TO_EDITOR = num(F, "TO_EDITOR");
  // STEPS の 2 つ（⌘Tab と 3 本指スワイプ）を出てくる順に読む
  const [k1, k2] = grabAll(F, /^\s*keyFrom: (\d+),/, "STEPS[].keyFrom", 2);
  const [k1to, k2to] = grabAll(F, /^\s*keyTo: (\d+),/, "STEPS[].keyTo", 2);
  const [l1to, l2to] = grabAll(F, /^\s*to: (\d+),/, "STEPS[].to", 2);
  const l2from = grab(F, /from: SWIPE_OUT\[1\] - (\d+),/, "STEPS[1].from");
  const [t1, t2] = grabAll(F, /^\s*text: "([^"]+)",/, "STEPS[].text", 2).map((g) => g.raw[0]);
  const ping2 = grab(F, /const PINGS = \[TO_BROWSER, SWIPE_OUT\[1\] - (\d+)\]/, "PINGS");
  add("follow", PULL.v[0], "camera-start", "カメラが少し引き始める", PULL.ref);
  add("follow", PULL.v[1], "camera-end", "引ききる（CAM_FOLLOW）", PULL.ref);
  add("follow", k1.nums[0], "keycap-in", "キーキャップ「⌘」「tab」が出る", k1.ref);
  add("follow", TO_BROWSER.v - 2, "key-down", "⌘Tab のキーキャップが沈み始める（2f 前から）", grab(F, /\[step\.press - (\d+), step\.press, step\.press \+ (\d+)\]/, "pressed").ref);
  add("follow", TO_BROWSER.v, "key-press", `⌘Tab 押下。隠していたブラウザが前面に出る（一瞬で切り替わる）。ラベル「${t1}」が出始める`, TO_BROWSER.ref);
  add("follow", TO_BROWSER.v, "ping", "パネルのまわりにティールのリングが一度広がる（24f）", ping2.ref);
  add("follow", k1to.nums[0], "keycap-out", "⌘Tab のキーキャップが消えきる", k1to.ref);
  add("follow", l1to.nums[0], "label-out", `ラベル「${t1}」が消えきる`, l1to.ref);
  add("follow", k2.nums[0], "keycap-in", "キーキャップ「3本指スワイプ」が出る", k2.ref);
  const swipeEase = Easing.bezier(0.35, 0, 0.15, 1);
  grab(F, /const swipeEase = Easing\.bezier\(0\.35, 0, 0\.15, 1\)/, "swipeEase");
  const out = (f: number) => interpolate(f, SWIPE_OUT.v, [0, 1], { ...clamp, easing: swipeEase });
  const back = (f: number) => interpolate(f, SWIPE_BACK.v, [0, 1], { ...clamp, easing: swipeEase });
  add("follow", SWIPE_OUT.v[0], "swipe-start", "3本指スワイプ（行き）。キーキャップが沈み、画面が左へ流れ始める（パネルは留まる、モーションブラー）", SWIPE_OUT.ref);
  const outHalf = firstFrame(SWIPE_OUT.v[0], SWIPE_OUT.v[1], (f) => out(f) >= 0.5);
  add("follow", outHalf, "swipe-mid", `行きのスワイプが半分を越える（最速の付近、進み ${(out(outHalf) * 100).toFixed(0)}%）`, SWIPE_OUT.ref);
  const outLand = firstFrame(SWIPE_OUT.v[0], SWIPE_OUT.v[1], (f) => out(f) >= 0.98);
  add("follow", outLand, "swipe-land", `フルスクリーンのスライドの Space に吸い付く（進み ${(out(outLand) * 100).toFixed(1)}%）`, SWIPE_OUT.ref);
  add("follow", SWIPE_OUT.v[1] - ping2.nums[0], "ping", "Space が着いた瞬間にパネルのリングが広がる", ping2.ref);
  add("follow", SWIPE_OUT.v[1] - l2from.nums[0], "label-in", `ラベル「${t2}」が出始める`, l2from.ref);
  add("follow", k2to.nums[0], "keycap-out", "3本指スワイプのキーキャップが消えきる", k2to.ref);
  add("follow", SWIPE_BACK.v[0], "swipe-start", "3本指スワイプ（戻り）。画面が右へ流れ始める（キーキャップは出さない）", SWIPE_BACK.ref);
  const backLand = firstFrame(SWIPE_BACK.v[0], SWIPE_BACK.v[1], (f) => back(f) >= 0.98);
  add("follow", backLand, "swipe-land", "元の Space（ブラウザが前面のデスクトップ）に戻り着く", SWIPE_BACK.ref);
  add("follow", l2to.nums[0], "label-out", `ラベル「${t2}」が消えきる`, l2to.ref);
  add("follow", TO_EDITOR.v, "app-switch", "⌘Tab でエディタへ戻る（ブラウザが後ろに回る。注釈なし・一瞬）", TO_EDITOR.ref);
  captionCues("follow", "画面を切り替えても、ちゃんとそこにいる。", pair(F, "CAPTION"));
}

// ================================================================= FlowBreak（1410–1740）
{
  const F = "scenes/FlowBreak.tsx";
  fadeInCues("flowBreak");
  const SATURATE = num(F, "SATURATE");
  const PRESS = num(F, "PRESS");
  const BREAK_START = num(F, "BREAK_START");
  const OVERLAY_FADE = num(F, "OVERLAY_FADE");
  const WASHI_OUT = pair(F, "WASHI_OUT");
  const CAM_PUSH = pair(F, "CAM_PUSH");
  const HOVER_SPOT = panelPoint(176, 126);
  grab(F, /const HOVER_SPOT = panelPoint\(176, 126\)/, "HOVER_SPOT");
  const pathRef = grab(F, /^const CURSOR_PATH/, "CURSOR_PATH").ref;
  // シーンと同じ通過点。先頭 4 つのフレームはソースの行と突き合わせる
  const P = [184, 204, 212, 224];
  for (const f of P) grab(F, new RegExp(`^\\s*\\[${f}, `), `CURSOR_PATH ${f}`);
  const path: [number, number, number][] = [
    [P[0], CURSOR_EDITOR.x, CURSOR_EDITOR.y],
    [P[1], HOVER_SPOT.x, HOVER_SPOT.y],
    [P[2], HOVER_SPOT.x, HOVER_SPOT.y],
    [P[3], BREAK_CHIP.x, BREAK_CHIP.y],
    [BREAK_START.v + 6, BREAK_CHIP.x, BREAK_CHIP.y],
    [BREAK_START.v + 46, BREAK_CHIP.x - 150, BREAK_CHIP.y + 160],
  ];
  const HOVER_IN = hoverEventsFor(path)[0][0];
  const FADE = num("scenes/DesktopShared.tsx", "FADE");
  // 書く速さは TYPED_KEYS の折れ線（workedAt = 線形の interpolate）。frame は数か「SATURATE + n」、値は docTypedAt(i)・TYPED_PRESENCE_END・数
  const tkRef = grab(F, /^const TYPED_KEYS: \[number, number\]\[\] = \[/, "TYPED_KEYS").ref;
  if (!/workedAt\(frame, TYPED_KEYS\)/.test(linesOf(F).join("\n"))) throw new Error("FlowBreak の typed が workedAt(frame, TYPED_KEYS) でなくなった");
  const TK: [number, number][] = [];
  {
    const ls = linesOf(F);
    const start = ls.findIndex((l) => l.startsWith("const TYPED_KEYS"));
    for (let i = start + 1; i < ls.length && !ls[i].startsWith("];"); i++) {
      const m = ls[i].match(/^\s*\[(SATURATE \+ )?(\d+), (docTypedAt\((\d+)\)|TYPED_PRESENCE_END|[\d.]+)\],/);
      if (!m) throw new Error(`src/${F}:${i + 1} TYPED_KEYS の行が読めない: ${ls[i]}`);
      const at = (m[1] ? SATURATE.v : 0) + Number(m[2]);
      const v = m[4] !== undefined ? docTypedAt(Number(m[4])) : m[3] === "TYPED_PRESENCE_END" ? TYPED_PRESENCE_END : Number(m[3]);
      TK.push([at, v]);
    }
    if (TK.length < 3) throw new Error("TYPED_KEYS が読めない");
  }
  const typedFB = (f: number) => interpolate(f, TK.map((k) => k[0]), TK.map((k) => k[1]), clamp);
  typingSpans("flowBreak", typedFB, sceneLength("flowBreak") - 1, tkRef);
  add("flowBreak", CAM_PUSH.v[0], "camera-start", "書いている本文とパネルが収まる構図へ寄り始める", CAM_PUSH.ref);
  // 提案書の肝: 「3. 期待効果」の数字（kpi の行）。セルの値が出そろうフレームを、エディタと同じ floor(typed × 文字数) で求める
  const kpiIdx = DOC_LINES.findIndex((l) => l.kind === "kpi");
  const kpi = DOC_LINES[kpiIdx];
  if (kpi.kind !== "kpi") throw new Error("DOC_LINES に kpi の行が無い");
  const shownFB = (f: number) => Math.floor(typedFB(f) * DOC_CHARS);
  let at = Math.round(docTypedAt(kpiIdx) * DOC_CHARS);
  kpi.cells.forEach(([name, value], i) => {
    at += name.length + value.length;
    const f = firstFrame(0, sceneLength("flowBreak") - 1, (x) => shownFB(x) >= at);
    const last = i === kpi.cells.length - 1;
    add("flowBreak", f, last ? "written" : "kpi-cell", last ? `提案書の肝が書き上がる（期待効果の数字の最後「${name} ${value}」が出そろう）` : `期待効果の数字「${name} ${value}」が出る`, tkRef);
  });
  add("flowBreak", SATURATE.v, "reach", "25:00 に到達。進捗バーが満ちて薄まる（止まらない。冒頭なら止められていたところ）", SATURATE.ref);
  captionCues("flowBreak", "25分で、切らない。", pair(F, "CAPTION_SATURATE"));
  captionCues("flowBreak", "区切りは、止めたところ。", pair(F, "CAPTION_STOP"));
  const po = grab(F, /const pointerOpacity = interpolate\(frame, \[CURSOR_PATH\[0\]\[0\] - (\d+), CURSOR_PATH\[0\]\[0\] \+ (\d+)\]/, "pointerOpacity");
  add("flowBreak", P[0] - po.nums[0], "cursor-in", "手を止めてマウスへ。ポインタが現れてパネルへ向かう", po.ref);
  add("flowBreak", HOVER_IN, "hover-in", `手を乗せる → 30%→100%（${FADE.v}f）`, grab(F, /^const HOVER_IN = /, "HOVER_IN").ref);
  add("flowBreak", P[1], "cursor-arrive", "ポインタがパネル右の余白で止まる", pathRef);
  add("flowBreak", P[2], "cursor-move", "ポインタが休憩チップへ動き出す", pathRef);
  add("flowBreak", P[3], "reach", "52:10 に到達し、ポインタが休憩チップに着く", grab(F, /\[224, WORKED_FINAL\]/, "WORKED_KEYS 52:10").ref);
  const camPull = grab(F, /const CAM_PULL: \[number, number\] = \[PRESS - (\d+), BREAK_START \+ (\d+)\]/, "CAM_PULL");
  add("flowBreak", PRESS.v - camPull.nums[0], "camera-start", "押す少し前からカメラが全景へ引き始める", camPull.ref);
  const ch = grab(F, /const chipHover = interpolate\(frame, \[PRESS - (\d+), PRESS - (\d+)\]/, "chipHover");
  add("flowBreak", PRESS.v - ch.nums[0], "chip-hover", "チップの塗りが 22%→40% に濃くなる（ホバー）", ch.ref);
  add("flowBreak", PRESS.v, "press", "チップを押し込む（mouse down）", PRESS.ref);
  add("flowBreak", BREAK_START.v, "break-start", "離した瞬間に作業終了 → 休憩開始。全画面の休憩が現れ始める", BREAK_START.ref);
  add("flowBreak", BREAK_START.v + OVERLAY_FADE.v, "overlay-full", "休憩画面が濃くなりきる（0.6 秒）", OVERLAY_FADE.ref);
  add("flowBreak", BREAK_START.v + camPull.nums[1], "camera-end", "カメラが等倍の全景に引ききる", camPull.ref);
  const capR = pair(F, "CAPTION_REWARD");
  captionCues("flowBreak", "休憩は、義務ではなく報酬。", capR);
  for (let s = 1; BREAK_START.v + s * FPS < WASHI_OUT.v[0]; s++) {
    add("flowBreak", BREAK_START.v + s * FPS, "tick", `休憩の残りが 1 秒減る（${s} 秒経過）`, grab("scenes/DesktopShared.tsx", /export const breakRemaining/, "breakRemaining").ref);
  }
  add("flowBreak", WASHI_OUT.v[0], "washi-start", "休憩画面ごと washi へ抜け始める", WASHI_OUT.ref);
  add("flowBreak", WASHI_OUT.v[1], "washi-end", "washi 一色（ここから Modes のフェードの下に隠れる）", WASHI_OUT.ref);
}

// ================================================================= Modes（1740–1890）
{
  const F = "scenes/Modes.tsx";
  fadeInCues("modes");
  const HEAD_IN = num(F, "HEAD_IN");
  const MAIN_IN = num(F, "MAIN_IN");
  const SUB_LABEL_IN = num(F, "SUB_LABEL_IN");
  const SUB_IN = num(F, "SUB_IN");
  const SUB_STAGGER = num(F, "SUB_STAGGER");
  const RISE = num(F, "RISE");
  add("modes", HEAD_IN.v, "heading-in", "見出し「区切りは、自分で決める。」が浮かび始める", HEAD_IN.ref);
  add("modes", HEAD_IN.v + RISE.v, "heading-full", "見出しが出きる", RISE.ref);
  // パネル 4 枚: 主役のフロー（既定）と、脇の 3 つ（SUBS の順）
  const subs = linesOf(F)
    .map((l) => l.match(/^\s*name: "([^"]+)",/)?.[1])
    .filter((x): x is string => Boolean(x));
  if (subs.length !== 3) throw new Error(`Modes の SUBS が読めない: ${subs}`);
  add("modes", MAIN_IN.v, "card-in", "1 枚目のパネル「フロー（既定）」が大きく出始める", MAIN_IN.ref);
  add("modes", MAIN_IN.v + RISE.v, "card-settle", "「フロー」が着地", RISE.ref);
  add("modes", SUB_LABEL_IN.v, "label-in", "「区切りたい日は、ほかも選べる。」が出始める", SUB_LABEL_IN.ref);
  subs.forEach((name, i) => {
    add("modes", SUB_IN.v + i * SUB_STAGGER.v, "card-in", `${i + 2} 枚目のパネル「${name}」が右から出始める`, SUB_STAGGER.ref);
    add("modes", SUB_IN.v + i * SUB_STAGGER.v + RISE.v, "card-settle", `「${name}」が着地`, RISE.ref);
  });
  const secRef = grab(F, /const sec = Math\.floor\(frame \/ FPS\)/, "sec").ref;
  for (let f = FPS; f < sceneLength("modes"); f += FPS) {
    add("modes", f, "tick", "4枚の数字がそろって 1 秒進む（実時間）", secRef);
  }
}

// ================================================================= Promises（1890–2070）
{
  const F = "scenes/Promises.tsx";
  fadeInCues("promises");
  const items = grab(F, /^const ITEMS = \[(.+)\];/, "ITEMS");
  const ITEMS = JSON.parse(`[${items.raw[0]}]`) as string[];
  const APPEAR_START = num(F, "APPEAR_START");
  const ap = grab(F, /\[APPEAR_START \+ i \* (\d+), APPEAR_START \+ i \* \d+ \+ (\d+)\]/, "Item appear");
  const STRIKE_START = num(F, "STRIKE_START");
  const STRIKE_GAP = num(F, "STRIKE_GAP");
  const STRIKE_LEN = num(F, "STRIKE_LEN");
  const VANISH_START = num(F, "VANISH_START");
  const VANISH_GAP = num(F, "VANISH_GAP");
  const VANISH_LEN = num(F, "VANISH_LEN");
  const NOTE_AT = num(F, "NOTE_AT");
  const easeQuiet = Easing.bezier(0.16, 1, 0.3, 1); // theme.ts の ease
  ITEMS.forEach((w, i) => {
    const a = APPEAR_START.v + i * ap.nums[0];
    add("promises", a, "word-in", `「${w}」が出始める（${ap.nums[1]}f）`, ap.ref);
  });
  ITEMS.forEach((w, i) => {
    const s = STRIKE_START.v + i * STRIKE_GAP.v;
    // ease は出だしが速いので、線の大半は最初の数フレームで引かれる
    const half = firstFrame(s, s + STRIKE_LEN.v, (f) => easeQuiet((f - s) / STRIKE_LEN.v) >= 0.5);
    add("promises", s, "strike-start", `「${w}」に線を引き始める（ティールの線・文字が薄くなる。半分に届くのは +${half - s}f）`, STRIKE_GAP.ref);
    add("promises", s + STRIKE_LEN.v, "strike-end", `「${w}」の線が引ききる`, STRIKE_LEN.ref);
  });
  ITEMS.forEach((w, i) => {
    const v = VANISH_START.v + i * VANISH_GAP.v;
    add("promises", v, "word-vanish-start", `「${w}」がぼけながら沈んで消え始める`, VANISH_GAP.ref);
    add("promises", v + VANISH_LEN.v, "word-gone", `「${w}」が消えきる`, VANISH_LEN.ref);
  });
  const ni = grab(F, /interpolate\(frame, \[NOTE_AT, NOTE_AT \+ (\d+)\]/, "noteIn");
  add("promises", NOTE_AT.v, "note-in", "「今回の時間だけ。」が浮かび始める（SUB_AT で「記録を持たないから、送るものもない。」が続く）", NOTE_AT.ref);
  add("promises", NOTE_AT.v + ni.nums[0], "note-full", "「今回の時間だけ。」が出きる", ni.ref);
}

// ================================================================= Words（2070–2220）
{
  const F = "scenes/Words.tsx";
  fadeInCues("words");
  const LINE1 = num(F, "LINE1");
  const LINE2 = num(F, "LINE2");
  const op = grab(F, /opacity: interpolate\(frame, \[from, from \+ (\d+)\]/, "Line opacity");
  const tint = grab(F, /const tint = interpolate\(frame, \[LINE2 \+ (\d+), LINE2 \+ (\d+)\]/, "tint");
  add("words", LINE1.v, "line-in", "1 行目「集中を止めるものを、ひとつずつ外していきました。」が浮かび始める", LINE1.ref);
  add("words", LINE1.v + op.nums[0], "line-full", "1 行目が出きる", op.ref);
  add("words", LINE2.v, "line-in", "2 行目「最後に残った静けさが、この道具の名前です。」が浮かび始める", LINE2.ref);
  add("words", LINE2.v + op.nums[0], "line-full", "2 行目が出きる", op.ref);
  add("words", LINE2.v + tint.nums[0], "tint-start", "「静けさ」が墨からティールに染まり始める", tint.ref);
  add("words", LINE2.v + tint.nums[1], "tint-end", "「静けさ」が染まりきる。ここから静止", tint.ref);
}

// ================================================================= Install（2220–2370）
{
  const F = "scenes/Install.tsx";
  fadeInCues("install");
  // キューの種類名（url-in / underline-* / sub-*）は quiet.py が参照するので据え置き、中身を新しい画面に対応させる:
  // url = 「近日公開」、underline = その下のティールの線、sub = 「開発の様子は X で @imutaroh」
  const SOON = str(F, "SOON");
  const HANDLE = str(F, "HANDLE");
  const LOGO_IN = num(F, "LOGO_IN");
  const SOON_IN = num(F, "SOON_IN");
  const FOLLOW_IN = num(F, "FOLLOW_IN");
  const logo = grab(F, /\.\.\.rise\(frame, LOGO_IN, (\d+)\)/, "rise(LOGO_IN)");
  const soon = grab(F, /\.\.\.rise\(frame, SOON_IN, (\d+)\)/, "rise(SOON_IN)");
  const follow = grab(F, /\.\.\.rise\(frame, FOLLOW_IN, (\d+)\)/, "rise(FOLLOW_IN)");
  const line = grab(F, /interpolate\(frame, \[SOON_IN \+ (\d+), SOON_IN \+ (\d+)\]/, "近日公開の下線");
  add("install", LOGO_IN.v, "logo-in", "アイコンと「Quiet」のロゴが浮かび始める", LOGO_IN.ref);
  add("install", LOGO_IN.v + logo.nums[0], "logo-full", "ロゴが出きる", logo.ref);
  add("install", SOON_IN.v, "url-in", `「${SOON.v}」が浮かび始める`, SOON_IN.ref);
  add("install", SOON_IN.v + soon.nums[0], "url-full", `「${SOON.v}」が出きる`, soon.ref);
  add("install", SOON_IN.v + line.nums[0], "underline-start", "その下にティールの線が伸び始める", line.ref);
  add("install", SOON_IN.v + line.nums[1], "underline-end", "下線が伸びきる", line.ref);
  add("install", FOLLOW_IN.v, "sub-in", `「開発の様子は X で ${HANDLE.v}」が浮かび始める`, FOLLOW_IN.ref);
  add("install", FOLLOW_IN.v + follow.nums[0], "sub-full", "案内が出きる。以降は全要素が静止", follow.ref);
  add("install", sceneLength("install") - 1, "final", "最終フレーム（サムネになる止め絵）", grab("timeline.ts", /export const DURATION/, "DURATION").ref);
}

// ---------------------------------------------------------------- 書き出し

cues.forEach((c) => assertNum(c.frame, c.note));
// 同じフレームでは書いた順を保つ（打鍵の順番など）
const sorted = cues.map((c, i) => ({ c, i })).sort((a, b) => a.c.frame - b.c.frame || a.i - b.i).map((x) => x.c);
const sections = SCENE_DEFS.map((d) => ({ id: d.id, from: d.from, to: d.from + sceneLength(d.id) }));
const out = {
  fps: FPS,
  duration: DURATION,
  sampleRate: 48000,
  samplesPerFrame: 48000 / FPS,
  conventions:
    "frame は本編（QuietPromo）の絶対フレーム。サンプル位置 = frame × 1600。sections の to は含まない（次の from）。フェードで入るシーンは from から transition の長さだけ前のシーンと重なる。cues は frame 昇順、同フレームは出来事の順。source は生成時に正規表現で見つけた行。",
  sections,
  cues: sorted,
};
writeFileSync(join(PROMO, "audio", "cues.json"), JSON.stringify(out, null, 2) + "\n");

const bySection = sections.map((s) => `${s.id}=${sorted.filter((c) => c.scene === s.id).length}`).join(" ");
console.log(`cues: ${sorted.length}（${bySection}）`);
