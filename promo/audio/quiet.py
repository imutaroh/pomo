"""紹介動画の後半（本編 450〜1800f）の BGM と効果音を合成して out/quiet.wav に書き出す。

  python3 promo/audio/quiet.py

- t=0 が本編 450f。長さはちょうど 1350f（= 2,160,000 サンプル、48kHz ステレオ、16bit PCM）
- 450〜509f は完全なデジタル無音。510f の desktop から、ニ長調（リディア寄り）の静かな環境音楽
- 拍はシーンの長さから逆算する（各シーンを整数拍に割る）ので、コードはシーン境界ちょうどで変わる
- 効果音のフレームは cues.json から読む。ここに数値を書かない
- 外部の音源・サンプルは使わない。乱数は固定シード
"""

import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile

import synth_quiet_instruments as ins

HERE = Path(__file__).resolve().parent
CUES = json.loads((HERE / "cues.json").read_text())
SR = CUES["sampleRate"]
SPF = CUES["samplesPerFrame"]
assert SR == ins.SR

SECTIONS = {s["id"]: (s["from"], s["to"]) for s in CUES["sections"]}
START = SECTIONS["silence"][0]  # 本編 450f = このファイルの t=0
END = CUES["duration"]
N = (END - START) * SPF
SEED = 71


def cues(scene: str, kind: str) -> list[int]:
    return [c["frame"] for c in CUES["cues"] if c["scene"] == scene and c["type"] == kind]


def cue(scene: str, kind: str, i: int = 0) -> int:
    return cues(scene, kind)[i]


def smp(frame: float) -> int:
    """本編フレーム → このファイルのサンプル位置。"""
    return int(round((frame - START) * SPF))


# ------------------------------------------------------------------ 和声と拍

# 鳴らすセクションと、それを何拍に割るか（およそ 68〜72 BPM。words は語りに合わせて 60 まで緩める）
BEATS = {
    "desktop": 6,
    "presence": 7,
    "follow": 6,
    "flowBreak": 8,
    "modes": 6,
    "promises": 7,
    "words": 4,
    "install": 5,
}

# 和音: パッドの音・ベース・ピアノの和音の積み（MIDI ノート番号）
CHORDS = {
    "Dmaj9": dict(pad=[50, 57, 61, 64, 66], bass=38, piano=[38, 45, 54, 61, 64]),
    "E/D": dict(pad=[50, 56, 59, 64, 68], bass=38, piano=[38, 52, 56, 59, 64]),
    "Bm9": dict(pad=[47, 50, 54, 57, 61], bass=47, piano=[47, 54, 59, 61, 66]),
    "F#m11": dict(pad=[54, 57, 61, 64, 71], bass=42, piano=[42, 54, 61, 64, 69]),
    # 休憩の和音。F#m11 と共通の C# を抜き、高い D を足して「和音が変わった」と 250Hz より上でも聞こえるようにする
    "Dopen": dict(pad=[50, 57, 62, 66, 69, 74, 76], bass=38, piano=[38, 50], top=[74, 78, 81]),
    "Aadd9": dict(pad=[52, 57, 61, 64, 71], bass=45, piano=[45, 52, 59, 61, 64]),
    "Asus": dict(pad=[52, 57, 62, 64, 71], bass=45, piano=[45, 57, 62, 64, 71]),
    "Dadd9": dict(pad=[50, 57, 62, 64, 66, 69], bass=38, piano=[38, 45, 54, 57, 64, 66, 74]),
}

# 全体を通すモチーフ（A・B・C#・E の上行）。desktop で提示し、modes のパネル 4 枚で 1 オクターブ上に繰り返し、
# ロゴで最後の音を D に替えて解決する（modes は E で問いかけたまま終わる）
MOTIF = (69, 71, 73, 76)
MOTIF_RHYTHM = (0.0, 0.5, 1.0, 2.0)  # 短・短・長（拍）

# セクションごとの和音と、拍に置く最小限の旋律 (拍, ノート, 強さ)。拍は小数も可
SCORE = {
    "desktop": dict(chord="Dmaj9", melody=[(2 + r, n, v) for r, n, v in zip(MOTIF_RHYTHM, MOTIF, (0.28, 0.24, 0.27, 0.26))]),
    "presence": dict(chord="E/D", melody=[(5, 71, 0.26)]),
    "follow": dict(chord="Bm9", melody=[(4, 69, 0.24)]),
    "flowBreak": dict(chord="F#m11", melody=[]),
    "modes": dict(chord="Aadd9", melody=[]),
    "promises": dict(chord="E/D", melody=[(5, 76, 0.22)]),
    "words": dict(chord="Bm9", melody=[]),
    "install": dict(chord="Asus", melody=[]),
}


def beat_frames(sec: str) -> list[float]:
    a, b = SECTIONS[sec]
    n = BEATS[sec]
    return [a + (b - a) * i / n for i in range(n)]


def beat_at(sec: str, beat: float) -> float:
    a, b = SECTIONS[sec]
    return a + (b - a) * beat / BEATS[sec]


def pad_segments() -> list[tuple[float, float, str]]:
    """パッドの和音区間 (開始f, 終了f, 和音)。シーン境界と、シーン内の出来事での切り替え。"""
    segs = []
    for sec in BEATS:
        a, b = SECTIONS[sec]
        segs.append([a, b, SCORE[sec]["chord"]])
    # 休憩開始でパッドが開く／words の 2 行目で和音が動く／ロゴで解決する
    split = [
        ("flowBreak", cue("flowBreak", "break-start"), "Dopen"),
        ("words", cues("words", "line-in")[1], "E/D"),
        ("install", cue("install", "logo-in"), "Dadd9"),
    ]
    for sec, at, ch in split:
        for s in segs:
            if s[0] <= at < s[1] and s[0] == SECTIONS[sec][0]:
                segs.append([at, s[1], ch])
                s[1] = at
                break
    segs.sort()
    return [tuple(s) for s in segs]


# ------------------------------------------------------------------ 組み立て

class Mix:
    def __init__(self):
        self.bus = {k: np.zeros((N, 2)) for k in ("piano", "pad", "bass", "sfx", "air")}
        self.events: list[dict] = []

    def add(self, bus: str, sig: np.ndarray, frame: float, label: str = "", gain: float = 1.0, cue_frame=None):
        s = smp(frame)
        if s >= N:
            return
        e = min(N, s + len(sig))
        self.bus[bus][s:e] += sig[: e - s] * gain
        if label:
            self.events.append(dict(label=label, bus=bus, cue=frame if cue_frame is None else cue_frame,
                                    start=s, sig=sig[: e - s] * gain))


def next_change(frame: float) -> float:
    """frame より後で、次にパッドの和音が切り替わるフレーム（なければ終端）。"""
    return min([a for a, _, _ in pad_segments() if a > frame] + [END + 60])


def piano_chord(m: Mix, rng, notes, frame, vel, label="", roll=0.028):
    """下から少しずらして置く（ロール）。最初の音がちょうど frame に来る。

    次の和音に変わるところでダンパーを下ろす（低音の長い余韻が次の和音を濁さないように）。
    """
    dur = min(6.0, (next_change(frame) - frame) / 30 + 0.35)
    for i, note in enumerate(sorted(notes)):
        # 低い音は倍音が多く鳴りが大きいので、和音の土台として控えめにする
        v = vel * (1.0 - 0.06 * i) * (0.65 if note < 48 else 1.0)
        m.add("piano", ins.felt_piano(note, v, rng, dur=dur), frame + i * roll * 30,
              label=label if i == 0 else "", cue_frame=frame)


def build():
    rng = np.random.default_rng(SEED)
    m = Mix()

    # ---- パッドとベース
    segs = pad_segments()
    first = segs[0][0]
    break_at = cue("flowBreak", "break-start")
    washi_at = cue("flowBreak", "washi-start")
    for i, (a, b, ch) in enumerate(segs):
        c = CHORDS[ch]
        # 次の区間が 1 秒に満たないときは、余韻で次の和音を塗りつぶさないように短く切る
        nxt = segs[i + 1] if i + 1 < len(segs) else None
        short_next = nxt is not None and (nxt[1] - nxt[0]) < 30
        rel = int((0.25 if short_next else 1.2) * SR)
        n = smp(b) - smp(a) + rel
        attack = int((1.6 if a == first else 0.15 if (b - a) < 30 else 0.5) * SR)
        bright = 1.0
        amp = 1.0
        if ch == "Dopen":
            # 休憩画面が濃くなりきる（overlay-full）までの間にパッドを一息で開く。
            # washi への減衰（washi-start）より十分前に開ききるよう 48f にする
            t = np.arange(n) / SPF
            k = np.clip(t / 48.0, 0, 1)
            breath = 0.5 - 0.5 * np.cos(np.pi * k)
            bright = 1.0 + 1.1 * breath
            amp = 0.95 + 0.45 * breath
            # washi へ抜ける間に薄くしていく
            w = np.clip((t - (washi_at - a)) / (b - washi_at), 0, 1)
            amp = amp * (1 - 0.6 * w)
            attack = int(0.35 * SR)
        if ch == "Dadd9":
            attack = int(0.25 * SR)
        m.add("pad", ins.warm_pad(c["pad"], n, attack, rel, rng, bright=bright, amp=amp), a)
        m.add("bass", ins.sub_bass(c["bass"], n, attack, rel), a)

    # ---- 各シーンの頭の和音と旋律（拍に乗せる）
    for sec, sc in SCORE.items():
        bf = beat_frames(sec)
        ch = CHORDS[sc["chord"]]
        if sec == "install":
            # install の頭は低い A だけを置いて宙づりにし、ロゴの解決を待つ
            piano_chord(m, rng, ch["piano"][:2], bf[0], 0.34, label="install suspend")
        elif sec == "desktop":
            piano_chord(m, rng, ch["piano"], bf[0], 0.34, label="chord desktop")
        elif sec == "words":
            pass  # words は 2 行のコピーに和音を置く（下）
        else:
            piano_chord(m, rng, ch["piano"], bf[0], 0.36, label=f"chord {sec}")
        for beat, note, vel in sc["melody"]:
            m.add("piano", ins.felt_piano(note, vel, rng), beat_at(sec, beat), label=f"melody {sec} b{beat}")

    # 以下で足す音は別の乱数列を使う（上の音の乱数をずらさない）
    rng2 = np.random.default_rng(SEED + 2)

    # ---- 脈: 再生クリックから休憩開始まで、タイマーが数えている間だけ柔らかく刻む。
    # 周期は click〜break-start をちょうど 16 拍に割った長さ（約 71BPM）にして、
    # 休憩開始は「来るはずの 17 拍目」になる。脈が止まることで休憩＝解放を聞かせる
    p0, p1 = cue("presence", "click"), break_at
    steps = 16
    period = (p1 - p0) / steps
    # パッドが厚い 150〜500Hz を避け、1 オクターブ上の和音構成音で刻む
    pulse_notes = {"presence": (76, 71), "follow": (69, 66), "flowBreak": (73, 66)}
    for k in range(steps):
        f = p0 + k * period
        sec = next(s for s, (a, b) in SECTIONS.items() if a <= f < b and s in pulse_notes)
        note = pulse_notes[sec][k % 2]
        # 入りは 2 拍かけて立ち上げ、休憩へ向けて少しずつ前に出す
        vel = (0.24 if k % 2 == 0 else 0.17) * min(1.0, (k + 1) / 3) * (0.85 + 0.3 * k / steps)
        sig = ins.lowpass(ins.felt_piano(note, vel, rng2, dur=0.7), 2400)
        m.add("piano", sig, f, label="pulse" if k == 0 else "")

    # ---- Presence: 再生クリック／溶けるときの小さな下降
    for f in cues("presence", "click"):
        m.add("sfx", ins.soft_click(rng, 1.0), f, label="click play", gain=0.30)
    for i, f in enumerate(cues("presence", "hover-out")):
        m.add("sfx", ins.melt_fall(80, 76, 14 / 30, rng), f, label="melt fall", gain=0.10 if i == 0 else 0.07)

    # ---- Follow: ⌘Tab のキー／Ping のベル／3 本指スワイプ
    for f in cues("follow", "key-press") + cues("follow", "app-switch"):
        m.add("sfx", ins.soft_key(rng, 1.0, p=-0.2, pitch=0.9), f, label="cmd-tab key", gain=0.30)
    for f in cues("follow", "ping"):
        m.add("sfx", ins.small_bell(90, rng), f, label="ping bell", gain=0.075)
    lands = cues("follow", "swipe-land")
    mids = cues("follow", "swipe-mid")
    for i, f in enumerate(cues("follow", "swipe-start")):
        land = next(x for x in lands if x > f)
        mid = next((x for x in mids if f < x < land), (f + land) / 2)
        sig = ins.whoosh(smp(land) - smp(f), smp(mid) - smp(f), rng, direction=-1 if i == 0 else 1)
        m.add("sfx", sig, f, label="swipe whoosh", gain=0.22)

    # ---- FlowBreak: 25:00 到達でそっと広がる／チップ押下／休憩でパッドが開く（上）／washi へ抜ける
    reach = cues("flowBreak", "reach")[0]
    m.add("sfx", ins.shimmer([85, 88, 93], int(0.5 * SR), int(0.22 * SR), 1.1, rng), reach,
          label="reach 25:00 shimmer", gain=0.16)
    for f in cues("flowBreak", "press"):
        m.add("sfx", ins.soft_click(rng, 0.9), f, label="chip press", gain=0.28)
    piano_chord(m, rng, CHORDS["Dopen"]["piano"], break_at, 0.30, label="break open", roll=0.06)
    # 上声（D5・F#5・A5）を遅いロールで置き、F#m11 に無い高い D で和音の変化を聞かせる
    top_dur = (next_change(break_at) - break_at) / 30 + 0.35
    for i, note in enumerate(CHORDS["Dopen"]["top"]):
        m.add("piano", ins.felt_piano(note, 0.30 - 0.03 * i, rng2, dur=top_dur), break_at + 2 + i * 4,
              label="break open top" if i == 0 else "", cue_frame=break_at)
    washi_end = cue("flowBreak", "washi-end")
    m.add("air", ins.airy_swell(smp(washi_end) - smp(washi_at), rng), washi_at, label="washi swell", gain=0.04)

    # ---- Modes: パネル 4 枚に単音 4 つ（上っていく）
    for f, note in zip(cues("modes", "card-in"), (n + 12 for n in MOTIF)):
        m.add("piano", ins.felt_piano(note, 0.30, rng), f, label="mode card")

    # ---- Promises: 線を引く鉛筆の擦れ／言葉が消える
    starts, ends = cues("promises", "strike-start"), cues("promises", "strike-end")
    pans = (-0.35, -0.15, 0.0, 0.15, 0.35)
    for i, (a, b) in enumerate(zip(starts, ends)):
        m.add("sfx", ins.pencil(smp(b) - smp(a), rng, p=pans[i]), a, label="strike pencil", gain=0.05)
    vs, gone = cues("promises", "word-vanish-start"), cues("promises", "word-gone")
    for i, (a, note) in enumerate(zip(vs, (88, 83, 80, 76, 71))):
        b = next(x for x in gone if x > a)
        m.add("sfx", ins.vanish(note, smp(b) - smp(a), rng, p=pans[i]), a, label="word vanish", gain=0.06)

    # ---- Words: 2 行に和音、「静けさ」が染まる瞬間に澄んだ高い音
    l1, l2 = cues("words", "line-in")
    piano_chord(m, rng, CHORDS["Bm9"]["piano"], l1, 0.42, label="words line1", roll=0.04)
    piano_chord(m, rng, CHORDS["E/D"]["piano"], l2, 0.38, label="words line2", roll=0.04)
    m.add("sfx", ins.small_bell(95, rng, dur=3.2), cue("words", "tint-start"), label="tint bell", gain=0.06)

    # ---- Install: ロゴで解決／curl の打鍵／最後まで余韻
    logo = cue("install", "logo-in")
    piano_chord(m, rng, CHORDS["Dadd9"]["piano"], logo, 0.36, label="logo resolve", roll=0.035)
    # モチーフの解決: desktop と同じ短・短・長で、最後の E を D に替える
    beat = (SECTIONS["install"][1] - SECTIONS["install"][0]) / BEATS["install"]
    for i, (r, note) in enumerate(zip(MOTIF_RHYTHM, MOTIF[:3] + (74,))):
        m.add("piano", ins.felt_piano(note + 12, 0.24 if i < 3 else 0.27, rng2, dur=3.0),
              logo + 18 + r * beat, label="logo motif" if i == 0 else "", cue_frame=logo)
    keys = cues("install", "key")
    seen: dict[int, int] = {}
    for f in keys:
        j = seen.get(f, 0)
        seen[f] = j + 1
        # 同じフレームに 2 字あるときは、2 字目を半フレーム後ろに置く
        v = 0.75 + 0.25 * rng.random()
        m.add("sfx", ins.soft_key(rng, v, p=0.15 + 0.2 * rng.random(), pitch=1.05 + 0.1 * rng.random()),
              f + 0.5 * j, label="curl key", gain=0.14, cue_frame=f)

    return m


GAIN = dict(piano=0.5, pad=0.32, bass=0.05, sfx=1.0, air=1.0)
SEND = dict(piano=0.35, pad=0.55, bass=0.0, sfx=0.30, air=0.5)


def mixdown(m: Mix) -> np.ndarray:
    ir = ins.synth_ir(np.random.default_rng(SEED + 1))
    dry = np.zeros((N, 2))
    send = np.zeros((N, 2))
    for k, x in m.bus.items():
        dry += x * GAIN[k]
        send += x * GAIN[k] * SEND[k]
    out = dry + 0.55 * ins.reverb(send, ir)
    out = ins.highpass(out, 28)
    # 450〜509f は完全なデジタル無音
    out[: smp(SECTIONS["desktop"][0])] = 0.0
    # 最後の 1 秒でフェードして、最終サンプルを 0 にする
    fade = 30 * SPF
    out[-fade:] *= (np.cos(np.linspace(0, np.pi / 2, fade)) ** 2)[:, None]
    out[-1] = 0.0
    return out


def main():
    m = build()
    out = mixdown(m)
    pcm = np.round(np.clip(out, -1, 1) * 32767).astype(np.int16)
    dst = HERE / "out" / "quiet.wav"
    dst.parent.mkdir(exist_ok=True)
    wavfile.write(dst, SR, pcm)
    peak = np.max(np.abs(out))
    print(f"wrote {dst} samples={len(pcm)} peak={20 * np.log10(peak):.2f} dBFS")


if __name__ == "__main__":
    main()
