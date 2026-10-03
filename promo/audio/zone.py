"""紹介動画の冒頭（Zone 0〜449f ＋ Cut 450〜569f）の音を合成して out/zone.wav に書き出す。

  python3 promo/audio/zone.py

- Zone: 「いま、いいところ」。4 つの仕事のモンタージュ（資料 → 表 → デザイン → メール）→ 4 分割。
  ローファイ寄りのビートと温かいエレピ。1 小節目はこもった音（フィルタが閉じている）で始まり、
  資料の箇条書きが一気に埋まっている最中の 2 小節目の頭でフィルタが開いてビートが入る。デザインへのカット（4 小節目の頭）で
  上に息のパッドとフレーズの変化が乗り、最後の小節（4 分割）はスネアのロールで「次の小節で一番いいところへ行く」ところまで
  上がる。そこで 00:00 が来る
- 拍はモンタージュのカットから逆算する（デザインへのカットが 4 小節目の頭、メールへのカットが 5 小節目の頭）。
  ほかのカット（表へ・4 分割へ）も拍に乗る（どちらも 4 拍目＝スネア）。乗っていなければ止める
- 効果音は各カットの山場に置く: 資料は見出しが並ぶ瞬間に澄んだ 2 音（A5→D6）、表は Enter・行が埋まる粒・棒が立つ高い粒、
  デザインはガイドに吸い付く小さなコト・揃った瞬間に 2 音（C#6→E6）、メールは送信で 2 音（E6→A6）。2 音は仕事が進むほど
  一段ずつ上がる。打鍵は映っている画面のぶんだけ鳴らし（4 分割では 4 画面の位置に振り分ける）、すべて cues.json のフレームちょうどに置く
- 汎用ポモドーロの残り 5 秒（赤くなる）から秒のチックがかすかに鳴り、00:03〜00:01 ではっきり聞こえる
- Cut: 00:00 で全部を断ち切る（残響ごと 2f の完全な無音）→ タイマーのアラーム（2 音の交互、8kHz 以上を削る）→
  白フラッシュの一撃 → 赤地のグリッチ（絵のグリッチ強度に沿わせる）→ 暗転で止める → 「いま、いいところだったのに。」の下で、
  断ち切られた音楽の残響だけがこもってかすかに戻り、Noise へのカットまでに消える
- セクションの境界は cues.json の sections から読む。48kHz・ステレオ・16bit。固定シード
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy.io import wavfile

import synth_zone_instruments as zi
from synth_noise_dsp import (
    SPF,
    SR,
    Bus,
    apply_reverb,
    glitch_chop,
    hp,
    kick,
    load_cues,
    lp,
    noise_burst,
    phase_of,
    reverb_ir,
    saw,
    soft_square,
    svf,
    t_axis,
)

SEED = 20261003
OUT = Path(__file__).resolve().parent / "out" / "zone.wav"
MASTER = 0.9
BASS_GAIN = 0.24
ALARM_GAIN = 0.3  # アラームは Zone の一番高いところ（最後の小節）より一段上の一撃に
GHOST_GAIN = 0.25
TICK_GAIN = 0.75  # 秒のチック。最後の小節のスネアのロールの中でも粒が聞こえる大きさ  # 暗転後に戻る残響。Zone より 18dB ほど下の「かすか」

# 小節ごとの和音（ニ長調の IV–iii–ii–V。後半の Quiet と同じ調にして、25:00 で冒頭のフレーズを引用できるようにする）
# (エレピの和音, ベースの根音, 5 度)
CHORDS = [
    ("Gmaj9", [59, 62, 66, 69], 43, 50),
    ("F#m9", [57, 61, 64, 68], 42, 49),
    ("Em9", [55, 59, 62, 66], 40, 47),
    ("A13", [55, 59, 61, 66], 33, 40),
    ("Gmaj9", [59, 62, 66, 69, 74], 43, 50),
    ("F#m9", [57, 61, 64, 68, 73], 42, 49),
]
# フレーズ（拍, ノート, 長さ[拍]）。F#・A・B の「短・短・長」で上がり、A・E で降りる。
# 後半の Quiet のモチーフ（A・B・C#・E の短・短・長）はこの形を受け継いでいる
HOOK = [(0.0, 78, 0.5), (0.5, 81, 0.5), (1.0, 83, 1.5), (2.5, 81, 0.5), (3.0, 76, 1.0)]
HOOK_ANSWER = [(0.0, 78, 0.5), (0.5, 81, 0.5), (1.0, 83, 1.5), (2.5, 85, 0.5), (3.0, 81, 1.0)]
# デザインへのカットから上に足す息のパッド（E5・A5・B5。G・F#m・Em・A のどれにも合う共通音）
AIR = [76, 81, 83]


def frames(cues: list[dict], scene: str, typ: str) -> list[int]:
    return [c["frame"] for c in cues if c["scene"] == scene and c["type"] == typ]


def one(cues: list[dict], scene: str, typ: str) -> int:
    fs = frames(cues, scene, typ)
    assert len(fs) == 1, (scene, typ, fs)
    return fs[0]


def f2s(frame: float) -> int:
    return int(round(frame * SPF))


# デザインへのカットが何小節目の頭か（0 始まり）。メールへのカットがその次の小節の頭
DESIGN_BAR = 3
# 最後の小節でスネアのロールに切り替わる拍（0 始まり）。それより前は普段の小節と同じキックとスネア
ROLL_FROM = 2.0
# ロールの強さ（最初, 00:00 直前）と、上がっていく帯域ノイズの大きさ。最後の 1 秒が Zone で一番大きくなるように
# （小節の頭の和音とキックが 00:00 の 2 秒以上前にあるので、ロールとノイズだけで上がりきる必要がある）
ROLL_VEL = (0.5, 2.2)
RISER_GAIN = 0.7


def grid(cues: list[dict]) -> tuple[float, float, float]:
    """(1 小節目の頭, 1 小節, 1 拍) のフレーム。モンタージュのカット（表・デザイン・メール・4 分割）から逆算する。

    quiet.py も 25:00 の引用の速さにこれを使う。"""
    cuts = frames(cues, "zone", "montage-cut")
    assert len(cuts) == 4, cuts
    _, design, mail, _ = cuts
    bar = mail - design
    beat = bar / 4
    bar0 = design - DESIGN_BAR * bar
    for c in cuts:
        x = (c - bar0) / beat
        assert abs(x - round(x)) * beat <= 0.5, ("カットが拍に乗っていない", c, x)
    return bar0, bar, beat


def main() -> None:
    data = load_cues()
    sec = {s["id"]: s for s in data["sections"]}
    cues = data["cues"]
    z0, cut_at = sec["zone"]["from"], sec["zone"]["to"]  # 00:00 = Cut の頭 = ここで断ち切る
    end = sec["cut"]["to"]
    assert z0 == 0 and sec["cut"]["from"] == cut_at
    N = f2s(end)
    rng = np.random.default_rng(SEED)

    # ---- 拍: モンタージュのカットから逆算
    bar0, bar, beat = grid(cues)
    bars = [bar0 + k * bar for k in range(len(CHORDS))]
    open_at, lift_at = bars[1], bars[DESIGN_BAR]  # フィルタが開いてビートが入る / パッドとフレーズの変化が乗る
    assert bars[-1] < cut_at < bars[-1] + bar, ("最後の小節の途中で 00:00 が来る想定", bars, cut_at)
    at = lambda b, x: bars[b] + x * beat  # noqa: E731  b 小節目の x 拍目のフレーム
    print(f"拍: {beat:.3f}f（{60 * 30 / beat:.1f} BPM）、小節の頭 {[round(b, 2) for b in bars]}")

    music = Bus(N)  # エレピ・ベース・フレーズ（1 小節目はフィルタで閉じる）
    drums = Bus(N)
    low = Bus(N)  # ベース（ビートと一緒に入るのでフィルタはかけない）
    sfx = Bus(N)  # 打鍵・山場の 2 音・チック（フィルタをかけない）
    send = Bus(N)
    kicks: list[float] = []

    # ---- エレピの和音: 小節頭と、2.5 拍目に軽く打ち直す。最初の和音は打鍵より前の 0f から
    for b, (_, voicing, _, _) in enumerate(CHORDS):
        start = 0.0 if b == 0 else bars[b]
        nxt = bars[b + 1] if b + 1 < len(bars) else cut_at + bar
        v = 0.42 + 0.06 * b
        for i, m in enumerate(voicing):
            dur = (nxt - start) / 30 + 0.4
            s = zi.rhodes(m, v * (1 - 0.05 * i), dur, rng)
            p = -0.35 + 0.7 * i / max(1, len(voicing) - 1)
            music.add(f2s(start + i * 0.35), s, pan=p, gain=0.34)
            send.add(f2s(start + i * 0.35), s, pan=p, gain=0.1)
        for i, m in enumerate(voicing[-3:]):
            s = zi.rhodes(m, v * 0.55, beat * 1.2 / 30, rng)
            music.add(f2s(at(b, 2.5) + i * 0.25), s, pan=0.25 - 0.25 * i, gain=0.3)

    # ---- ベース: 2 小節目（フィルタが開く）から
    for b in range(1, len(CHORDS)):
        _, _, root, fifth = CHORDS[b]
        for x, m, d, v in ((0, root, 1.6, 1.0), (2.5, root, 0.9, 0.8), (3.5, fifth, 0.4, 0.6)):
            low.add(f2s(at(b, x)), zi.bass(m, d * beat / 30, v), gain=BASS_GAIN)

    # ---- フレーズ: 3 小節目から。4 小節目は答えの形、5 小節目はオクターブ上を薄く重ね、6 小節目は 3 音目を伸ばしたまま断ち切られる
    for b, hook, dbl in ((2, HOOK, 0.0), (3, HOOK_ANSWER, 0.0), (4, HOOK, 0.35), (5, HOOK[:3], 0.35)):
        for x, m, d in hook:
            dur = (d * beat + (40 if b == 5 else 12)) / 30
            for mm, g in ((m, 1.0), (m + 12, dbl)):
                if g <= 0:
                    continue
                s = zi.rhodes(mm, 0.62, dur, rng, tone=1.3)
                music.add(f2s(at(b, x)), s, pan=0.18, gain=0.3 * g)
                send.add(f2s(at(b, x)), s, pan=-0.2, gain=0.14 * g)

    # ---- 息のパッド: デザインへのカット（4 小節目の頭）から
    n = f2s(cut_at + 30) - f2s(lift_at)
    music.add(f2s(lift_at), np.vstack([zi.air_pad(AIR, n, rng, 1.6), zi.air_pad(AIR, n, rng, 1.6)]), gain=0.09)

    # ---- ドラム: 2 小節目の頭（資料が一気に埋まっている最中）でフィルタが開くのと同時に入る
    for b in range(1, len(CHORDS)):
        last = b == len(CHORDS) - 1
        for x in (0.0, 1.75, 2.5):
            if last and x >= ROLL_FROM:
                break
            drums.add(f2s(at(b, x)), zi.kick(1.0 if x == 0 else 0.8), gain=0.6)
            kicks.append(at(b, x))
        for x in (1.0, 3.0):
            if last and x >= ROLL_FROM:
                break
            s = zi.snare(rng, 0.85)
            drums.add(f2s(at(b, x)), s, pan=0.05, gain=0.45)
            send.add(f2s(at(b, x)), s, gain=0.12)
        if not last:
            if b >= DESIGN_BAR:
                drums.add(f2s(at(b, 3.75)), zi.snare(rng, 0.18, tight=0.6), pan=0.1, gain=0.45)
        # ハイハット: 8 分（裏はスウィングで少し遅らせて弱く）。デザインへのカットからは 16 分のゴーストと、3.5 拍目の開いた音
        for k in range(8):
            x = k / 2 + (0.06 if k % 2 else 0.0)
            drums.add(f2s(at(b, x)), zi.hat(rng, 0.55 if k % 2 == 0 else 0.36), pan=0.3, gain=0.22)
            if b >= DESIGN_BAR:
                drums.add(f2s(at(b, x + 0.25 + 0.03)), zi.hat(rng, 0.14), pan=0.4, gain=0.22)
        if DESIGN_BAR <= b < len(CHORDS) - 1:
            drums.add(f2s(at(b, 3.5)), zi.hat(rng, 0.3, open_=True), pan=0.3, gain=0.22)

    # 最後の小節: 前半 2 拍は普段どおりのキックとスネア、3 拍目からスネアの 16 分のロールが強まっていく
    # （次の小節の頭で「来る」はずだった）。ロールの強まりは 00:00 までの残りで測るので、小節が長くても最後が一番大きい
    lb = len(CHORDS) - 1
    roll0 = at(lb, ROLL_FROM)
    assert cut_at - roll0 >= beat, ("ロールが短すぎる", roll0, cut_at)
    x = ROLL_FROM
    while at(lb, x) < cut_at:
        k = (at(lb, x) - roll0) / (cut_at - roll0)
        s = zi.snare(rng, ROLL_VEL[0] + (ROLL_VEL[1] - ROLL_VEL[0]) * k**1.3, tight=0.55)
        drums.add(f2s(at(lb, x)), s, pan=0.05, gain=0.45)
        send.add(f2s(at(lb, x)), s, gain=0.1 * k)
        x += 0.25
    # ロールの下でキックも詰まっていく（8 分 → 16 分）。和音を沈ませるダッキングには入れない（上がりきる途中で引かない）
    for x, v in ((2.0, 0.8), (2.5, 0.9), (3.0, 1.0), (3.25, 1.1)):
        if at(lb, x) < cut_at:
            drums.add(f2s(at(lb, x)), zi.kick(v), gain=0.6)
    # 上がっていく帯域ノイズ（ロールと同じく 3 拍目から）
    r0, r1 = f2s(roll0), f2s(cut_at)
    u = np.linspace(0, 1, r1 - r0)
    riser = svf(rng.standard_normal((2, r1 - r0)), 500 * (6000 / 500) ** u, q=1.5, mode="bp") * u**1.5
    drums.add(r0, riser, gain=RISER_GAIN)

    # シェイカー: 1 小節目から 16 分で薄く刻み、ビートが入ってからは一歩下がる
    f = 0.0
    while f < cut_at:
        b = 0 if f < bars[1] else 1
        k = int(round((f - bar0) / (beat / 4)))
        v = (0.5 if k % 2 == 0 else 0.3) * (1.0 if b == 0 else 0.55)
        drums.add(f2s(f), zi.shaker(rng, v), pan=-0.35, gain=0.18)
        f = bar0 + (k + 1) * beat / 4 if f >= bar0 else bar0

    # ---- フィルタ: 1 小節目はこもらせ（600Hz → 2.2kHz）、2 小節目の頭の 3f 前から一気に開く
    fr = np.arange(N) / SPF
    fc = np.interp(fr, [0, open_at - 3, open_at + 1, open_at + 2], [600, 2200, 14000, 20000])
    music.x = svf(music.x, fc, q=0.8)
    music.x = svf(music.x, fc, q=0.8)  # 2 段で 24dB/oct（閉じているのを分かりやすく）

    # キックで和音とパッドを少し沈ませる（ローファイのうねり）
    duck = np.ones(N)
    for kf in kicks:
        s0 = f2s(kf)
        m = min(N - s0, int(0.35 * SR))
        duck[s0 : s0 + m] = np.minimum(duck[s0 : s0 + m], 1 - 0.3 * np.exp(-t_axis(m) / 0.1))
    music.x *= duck

    # 針音（0f から 00:00 まで）
    vinyl = zi.crackle(f2s(cut_at), rng)
    music.add(0, vinyl, gain=0.05)

    # ---- 打鍵（絵の打鍵のフレームちょうど）。映っている画面のぶんだけ。速く打つところは密度に応じて一打ずつ小さくし、粒の帯として聞かせる。
    # 1 画面のカットでは中央寄り、4 分割では画面の位置（左上 資料・右上 表・左下 デザイン・右下 メール）に振り分ける
    split = frames(cues, "zone", "montage-cut")[-1]
    quad_pan = {"doc": -0.5, "sheet": 0.5, "design": -0.35, "mail": 0.35}
    keys = sorted((c["frame"], c["type"].split(":")[1]) for c in cues if c["scene"] == "zone" and c["type"].startswith("key:"))
    assert keys, "Zone の打鍵のキューが無い"
    karr = np.array([f for f, _ in keys])
    seen: dict[int, int] = {}
    for f, app in keys:
        j = seen.get(f, 0)
        seen[f] = j + 1
        dens = np.sum(np.abs(karr - f) <= 3)
        g = 0.36 / np.sqrt(max(1.0, dens / 2.5))
        p = quad_pan[app] + rng.uniform(-0.1, 0.1) if f >= split else rng.uniform(-0.3, 0.1)
        sfx.add(f2s(f + 0.45 * j), zi.key_thock(rng, rng.uniform(0.7, 1.1)), pan=p, gain=g)

    # 山場の澄んだ 2 音（2.5f 差）。仕事が進むほど一段ずつ上がる
    def glass2(f: float, notes: tuple[int, int], pan: float, gain: float) -> None:
        for i, m in enumerate(notes):
            s = zi.glass(m, 1.0, rng)
            sfx.add(f2s(f + 2.5 * i), s, pan=pan + 0.15 * i, gain=gain)
            send.add(f2s(f + 2.5 * i), s, pan=0.3, gain=0.1)

    # ① 資料: 見出しが 2 つ光って並ぶ（構成が見えた）。1 音ずつ、見出しの出るフレームに
    for f, m in zip(frames(cues, "zone", "doc-outline"), (81, 86)):
        s = zi.glass(m, 1.0, rng)
        sfx.add(f2s(f), s, pan=-0.1, gain=0.1)
        send.add(f2s(f), s, pan=0.3, gain=0.1)
    # ② 表: Enter（重い打鍵）→ 下へ引いて行が埋まる粒 → 合計 → 棒が立つたびに高い粒（Em9 の構成音で上がる）
    sfx.add(f2s(one(cues, "zone", "sheet-enter")), zi.key_thock(rng, 1.0, heavy=True), pan=-0.1, gain=0.5)
    for i, f in enumerate(frames(cues, "zone", "sheet-fill")):
        sfx.add(f2s(f), zi.key_thock(rng, 0.45 + 0.08 * i), pan=0.1, gain=0.3)
    sfx.add(f2s(one(cues, "zone", "sheet-total")), zi.key_thock(rng, 0.9, heavy=True), pan=0.05, gain=0.35)
    for i, (f, m) in enumerate(zip(frames(cues, "zone", "sheet-bar"), (86, 88, 90, 91, 95, 98))):
        s = zi.glass(m, 1.0, rng, dur=0.7)
        sfx.add(f2s(f), s, pan=-0.2 + 0.08 * i, gain=0.045)
        send.add(f2s(f), s, pan=0.3, gain=0.05)
    # ③ デザイン: ガイドに吸い付く小さなコト → 全部揃った瞬間に 2 音
    for f in frames(cues, "zone", "design-snap"):
        sfx.add(f2s(f), zi.key_thock(rng, 0.8), pan=0.1, gain=0.32)
    glass2(one(cues, "zone", "design-aligned"), (85, 88), 0.15, 0.13)
    # ④ メール: 送信を押す（重い打鍵）と同時に 2 音
    sent = one(cues, "zone", "mail-sent")
    sfx.add(f2s(sent), zi.key_thock(rng, 1.0, heavy=True), pan=-0.1, gain=0.5)
    glass2(sent, (88, 93), 0.15, 0.13)
    # 4 分割へのカット（4 拍目のスネア）に、開いたハイハットを一枚足して「4 人同時」を開く
    drums.add(f2s(split), zi.hat(rng, 0.45, open_=True), pan=-0.2, gain=0.22)
    drums.add(f2s(split), zi.hat(rng, 0.45, open_=True), pan=0.2, gain=0.22)

    # ---- 汎用ポモドーロの秒のチック: 赤くなる残り 5 秒からかすかに、00:03 からはっきり。タイマーのある右寄りに置く
    urgent = one(cues, "zone", "urgent")
    for f in frames(cues, "zone", "timer-sec"):
        if f < urgent:
            continue
        rem = (cut_at - f) / 30
        v = 0.2 if rem > 3 else {3: 0.6, 2: 0.78, 1: 1.0}[round(rem)]
        sfx.add(f2s(f), zi.clock_tick(rng, v), pan=0.35, gain=TICK_GAIN)
        # 00:03 からは、チックのたびに音楽がほんの少し（約 1.5dB）息を止める。秒が音楽に割り込んでくる
        if rem <= 3:
            s0 = f2s(f)
            m = min(N - s0, int(0.3 * SR))
            dip = 1 - 0.16 * np.exp(-t_axis(m) / 0.12)
            for bus in (music, low, drums):
                bus.x[:, s0 : s0 + m] *= dip

    # ---- 残響
    ir = reverb_ir(rng, rt60=1.5, length=2.2, predelay_ms=18)
    wet = apply_reverb(send.x, ir)
    zone = music.x + low.x + drums.x + sfx.x + 0.6 * wet
    zone = hp(zone, 30, order=2)
    zone = np.tanh(zone * 1.1) / 1.1

    # 断ち切られた音楽の残響（Cut の暗転のあとにだけ戻す）: 最後の 1 小節ぶんを長い残響に通し、00:00 以降の尾を取る
    ghost_send = (music.x + low.x + drums.x)[:, f2s(bars[lb]) : f2s(cut_at)]
    gir = reverb_ir(rng, rt60=4.5, length=4.0, predelay_ms=30)
    gl = np.zeros((2, ghost_send.shape[1] + gir.shape[1]))
    gl[:, : ghost_send.shape[1]] = ghost_send
    ghost = apply_reverb(gl, gir)[:, ghost_send.shape[1] :]

    # ---- ここで断ち切る: 00:00 から先は Zone の音を一切残さない（残響も）
    c0 = f2s(cut_at)
    fade = int(SR * 0.0015)
    zone[:, c0 - fade : c0] *= np.linspace(1, 0, fade)
    zone[:, c0:] = 0.0

    # ============================================================ Cut
    cut = Bus(N)
    zero = one(cues, "cut", "zero")
    flash = one(cues, "cut", "flash")
    alarm = one(cues, "cut", "alarm")
    settle = one(cues, "cut", "glitch-settle")
    calm = one(cues, "cut", "glitch-calm")
    up = one(cues, "cut", "glitch-up")
    black = one(cues, "cut", "blackout")
    copy_in = one(cues, "cut", "caption-in")
    tone_from = zero + 2  # 2f の完全な無音のあと、00:00 のタイマーが鳴り出す

    # アラーム「時間です。」: 2 音（C6 と G5）を 2f ごとに交互に鳴らすデジタルなアラーム。帯域制限した矩形波＋8kHz 以上を削る
    a0, a1 = f2s(tone_from), f2s(black)
    n = a1 - a0
    t = t_axis(n)
    step = 2 * SPF
    which = (np.arange(n) // step) % 2
    frq = np.where(which == 0, 1046.5, 784.0)
    gate = ((np.arange(n) % step) < int(step * 0.8)).astype(float)
    gate = lp(gate, 300, order=2)
    tone = soft_square(phase_of(frq), harmonics=4) * gate
    tone = lp(tone, 6500, order=6)
    # グリッチの強さ: 鳴り出しは素の音、赤地で大きく割れ、読める間は静まり、暗転の直前にもう一度割れる（絵のグリッチ値に沿わせる）
    fr_c = t * 30 + tone_from
    gs = np.interp(fr_c, [tone_from, alarm - 0.01, alarm, settle, calm, up, black], [0.0, 0.0, 0.85, 0.35, 0.12, 0.12, 1.0])
    tone = glitch_chop(tone, gs, rng, block=320)
    # 鳴り出し（00:00 の画面）はやや小さく、赤地で一段大きく
    lvl = np.interp(fr_c, [tone_from, flash, alarm], [0.6, 0.75, 1.0])
    hi_mask = lp((which == 0).astype(float), 400, order=2)
    cut.add(a0, tone * hi_mask * lvl, pan=-0.3, gain=ALARM_GAIN)
    cut.add(a0, tone * (1 - hi_mask) * lvl, pan=0.3, gain=ALARM_GAIN)
    # 赤地の圧: 低いうなり
    m0 = f2s(alarm)
    mn = a1 - m0
    rumble = lp(np.tanh(3 * saw(phase_of(np.full(mn, 46.0)), 12)), 600)
    rumble *= np.interp(np.arange(mn) / SPF + alarm, [alarm, settle, calm, up, black], [1.0, 0.6, 0.4, 0.4, 1.0])
    cut.add(m0, rumble, gain=0.2)

    # 白フラッシュ: 一撃（破裂と沈む低音）。破裂は 1kHz までに絞り、2f 後の「時間です。」の裂けの帯域を空けておく
    cut.add(f2s(flash), noise_burst(rng, 0.25, 0.04, 80, 1000), gain=0.55)
    cut.add(f2s(flash), kick(160, 38, 0.7, 0.22, drive=2.5), gain=0.8)
    # 赤地が割れて出る: 白の一撃（低い）に続く、高い帯域の裂け（二段で「ドン、バリッ」）
    s = noise_burst(rng, 0.14, 0.025, 2200, 7500)
    s = glitch_chop(s, np.full(s.shape[-1], 0.8), rng, block=240)
    cut.add(f2s(alarm), np.vstack([s, np.roll(s, 60)]), gain=1.4)
    # 暗転の直前の裂け
    s = noise_burst(rng, (black - up) / 30, 0.08, 100, 7000)
    s = glitch_chop(s * np.linspace(0.4, 1, s.shape[-1]), np.full(s.shape[-1], 0.9), rng, block=240)
    cut.add(f2s(up), np.vstack([s, np.roll(s, 90)]), gain=0.3)

    # 暗転で断ち切る（2ms で落とす）
    b0 = f2s(black)
    fade = int(SR * 0.002)
    g = np.ones(N)
    g[b0 - fade : b0] = np.linspace(1, 0, fade)
    g[b0:] = 0
    cutx = lp(cut.x, 7500, order=8) * g  # 8kHz 以上を削る
    cutx = np.tanh(cutx * 1.2) / 1.2

    # 暗転のあと: 断ち切られた音楽の残響だけが、こもってかすかに戻る。コピーが出きる頃に一番近く、Noise の手前で消える
    g0 = b0
    gn = min(ghost.shape[1], N - g0)
    gh = lp(ghost[:, :gn], 1400, order=4)
    fr_g = np.arange(gn) / SPF + black
    genv = np.interp(fr_g, [black, black + 2, copy_in + 10, end - 6, end - 2], [0.0, 0.6, 1.0, 0.0, 0.0])
    ghost_out = np.zeros((2, N))
    ghost_out[:, g0 : g0 + gn] = gh * genv * GHOST_GAIN

    mix = (zone + cutx + ghost_out) * MASTER
    # 断ち切りの 2f は完全な 0、最後の 2f も 0（Noise へのカットの前）
    mix[:, f2s(zero) : f2s(tone_from)] = 0.0
    mix[:, f2s(end - 2) :] = 0.0
    mix[:, : int(SR * 0.003)] *= np.linspace(0, 1, int(SR * 0.003))

    peak_db = 20 * np.log10(np.max(np.abs(mix)) + 1e-12)
    print(f"samples={N} frames={N / SPF:.0f} peak={peak_db:.2f}dBFS")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(np.round(mix.T * 32767), -32767, 32767).astype(np.int16)
    wavfile.write(OUT, SR, pcm)


if __name__ == "__main__":
    main()
