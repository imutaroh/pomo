"""紹介動画の Noise（積み上がる記録の通知。cues.json の sections の noise）の音を合成して out/noise.wav に書き出す。

  python3 promo/audio/noise.py

- 音源・サンプルは一切使わず、synth_noise_dsp.py の数式だけで作る
- タイミングはすべて cues.json から読む（絵の定数をここに写さない）
- 48kHz・ステレオ・長さちょうど Noise の長さ（t=0 が Noise の頭）。正規化はせず、固定のゲインで鳴らす
- 冒頭の Zone と Cut は zone.py が受け持つ
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

import numpy as np
from scipy.io import wavfile

from synth_noise_dsp import (
    SPF,
    SR,
    Bus,
    apply_reverb,
    bell,
    bp,
    exp_decay,
    f2s,
    glitch_chop,
    hat,
    hp,
    kick,
    load_cues,
    lp,
    noise_burst,
    phase_of,
    ramp_in,
    ramp_out,
    reverb_ir,
    svf,
    saw,
    soft_square,
    t_axis,
    tick,
)

SEED = 20261002
OUT = Path(__file__).resolve().parent / "out" / "noise.wav"
MASTER = 0.85  # 固定ゲイン（正規化はしない。ピークが -3dBFS 前後に収まるよう耳ではなく数値で決めた）


def cue_frames(cues: list[dict], typ: str) -> list[int]:
    return [c["frame"] for c in cues if c["type"] == typ]


def one(cues: list[dict], typ: str) -> int:
    fs = cue_frames(cues, typ)
    assert len(fs) == 1, (typ, fs)
    return fs[0]


def main() -> None:
    data = load_cues()
    sec = {s["id"]: s for s in data["sections"]}
    # このファイルの t=0 は Noise の頭。キューのフレームも Noise の頭からの相対に直して使う
    base, end_frame = sec["noise"]["from"], sec["noise"]["to"]
    # 同じ type は他のシーンにも出るので、Noise のキューだけを見る
    cues = [dict(c, frame=c["frame"] - base) for c in data["cues"] if c["scene"] == "noise"]
    N = f2s(end_frame - base)
    rng = np.random.default_rng(SEED)

    dry = Bus(N)  # 素の音
    pre_send = Bus(N)  # 積み上げ停止で断ち切る残響の送り
    post_send = Bus(N)  # 停止後（残響だけを残す側）の送り

    # ============================================================ Noise: 積み上げ
    pops = cue_frames(cues, "popup")
    freeze = one(cues, "freeze")
    cut = freeze - 2  # 断ち切ってから 2f の無音 → 白の一閃（freeze）でインパクト
    n_pop = len(pops)
    # 拍の周期（f）。次の通知までの間隔。最後は直前の間隔を引き継ぐ
    gaps = [pops[i + 1] - pops[i] for i in range(n_pop - 1)] + [pops[-1] - pops[-2]]

    # 通知チャイム: 最初は五音音階の上に乗るが、重なるほど音階から外れ、微分音でずれていく
    scale = [0, 2, 4, 7, 9]
    for i, f in enumerate(pops):
        d = i / (n_pop - 1)
        octave = rng.integers(0, 2)
        if rng.random() < 0.15 + 0.85 * d:
            semi = rng.integers(0, 12)  # 音階外へ
        else:
            semi = scale[rng.integers(0, len(scale))]
        cents = rng.normal(0, 8 + 70 * d)
        freq = 523.25 * 2 ** ((semi + 12 * octave) / 12 + cents / 1200)
        freq = min(freq, 1250)
        tau = 0.5 - 0.3 * d
        b = bell(freq, 1.4 - 0.6 * d, tau, rng, bright=1 + 0.5 * d)
        g = 0.32 if i < 5 else 0.26
        pan = rng.uniform(-0.85, 0.85) * (0.5 + 0.5 * d)
        dry.add(f2s(f), b, pan=pan, gain=g)
        pre_send.add(f2s(f), b, pan=pan, gain=g * 0.6)
        # バナーが着地する「カッ」という小さな当たり（チャイムの頭を立てて拍を聴かせる）
        dry.add(f2s(f), noise_burst(rng, 0.02, 0.0018, 1500, 6500), pan=pan, gain=0.22 + 0.1 * d)
        # 密になってからは半拍遅れの「二度鳴り」を足して、ずれた重なりで濁らせる
        if d > 0.5 and rng.random() < d:
            b2 = bell(freq * 2 ** (rng.normal(0, 0.6) / 12), 0.6, 0.15, rng)
            dry.add(f2s(f + 1.4), b2, pan=-pan, gain=g * 0.45)

    # パルス: 通知と同じ拍。密になるほどキックの音程が上がり、ハイハットが倍・4 倍に増える
    for i, f in enumerate(pops):
        d = i / (n_pop - 1)
        gap = gaps[i]
        # 3f 間隔まで詰まったら、裏の拍は短く軽いゴーストにする（機関銃にしない）
        ghost = gap < 5 and i % 2 == 1
        k = kick(110 + 120 * d, 42 + 26 * d, 0.2 if ghost else 0.45, (0.05 if ghost else 0.16 - 0.08 * d), drive=1.5 + 2 * d)
        dry.add(f2s(f), k, gain=(0.24 + 0.6 * d) * (0.45 if ghost else 1))
        # サブ: キックの下で拍ごとに膨らむ
        n = int(SR * gap / 30)
        sub = np.sin(2 * np.pi * (40 + 18 * d) * t_axis(n)) * exp_decay(n, 0.12) * ramp_in(n, 3) * ramp_out(n, 10)
        dry.add(f2s(f), sub, gain=0.05 + 0.25 * d)
        # 3f 間隔まで詰まったら裏拍は抜く（通知そのものの拍を濁らせない）
        subdiv = 2 if 4 <= gap < 9 else 1
        for k_ in range(subdiv):
            hf = f + k_ * gap / subdiv
            if d < 0.08 and k_ == 0:
                continue  # 最初の数拍はベルだけを聴かせる
            dry.add(f2s(hf), hat(rng, 0.012 + 0.02 * rng.random()), pan=rng.uniform(-0.5, 0.5), gain=0.04 + 0.14 * d)

    # ライザー: 帯域が開いていくノイズ＋上ずるのこぎり波の束。停止の手前で断ち切る
    r0, r1 = f2s(pops[0]), f2s(cut)
    n = r1 - r0
    u = np.linspace(0, 1, n)
    nz = rng.standard_normal((2, n))
    center = 300 * (7000 / 300) ** (u**1.5)
    riser_n = svf(nz, center, q=1.2, mode="bp")
    riser_n *= u**2.5
    riser_s = np.zeros(n)
    for det in (-0.25, 0.0, 0.3):
        fr = 55 * 2 ** (u**1.8 * 2 + det / 12)
        riser_s += saw(phase_of(fr) + rng.uniform(0, 6.28), harmonics=20)
    riser_s = lp(riser_s, 1500, order=2) * u**2.2
    riser = riser_n * 0.7 + np.vstack([riser_s, np.roll(riser_s, 120)]) * 0.12
    dry.add(r0, riser * ramp_in(n, 50), gain=1.0)

    # ============================================================ 断ち切り
    # cut 以降を 2ms で落とす（pre_send の残響も一緒に）
    g = np.ones(N)
    c0 = f2s(cut)
    fade = int(SR * 0.002)
    g[c0 - fade : c0] = np.linspace(1, 0, fade)
    g[c0:] = 0
    dry.x *= g
    pre_ir = reverb_ir(rng, rt60=1.2, length=1.6)
    pre_wet = apply_reverb(pre_send.x * g, pre_ir) * g
    # 停止後の音はここから足す（dry にゲートはかからない）

    # 白の一閃（freeze）: 沈む低音と白いノイズの破裂
    dry.add(f2s(freeze), kick(180, 32, 1.2, 0.35, drive=2.2), gain=1.0)
    dry.add(f2s(freeze), noise_burst(rng, 0.4, 0.06, 100, 7500), gain=0.6)
    post_send.add(f2s(freeze), noise_burst(rng, 0.4, 0.08, 300, 6000), gain=0.45)

    # 黒帯のコピーが割り込む: 低い一撃＋文字の割れ（9f）に合わせた短いグリッチ
    cap = one(cues, "caption-bar-in")
    cap_full = one(cues, "caption-bar-full")
    dry.add(f2s(cap), kick(90, 36, 1.4, 0.45, drive=3.0), gain=0.75)
    n = f2s(cap_full) - f2s(cap) + SPF
    gt = t_axis(n)
    gl = rng.standard_normal(n) * 0.5 + soft_square(phase_of(np.full(n, 220.0)), 6) * 0.6
    gl = bp(gl, 150, 6000)
    strength = np.clip(1 - gt * 30 / 9, 0, 1)  # 割れは 9f で収まる
    gl = glitch_chop(gl * strength, strength, rng, block=480) * ramp_out(n, 10)
    dry.add(f2s(cap), np.vstack([gl, np.roll(gl, 200)]), gain=0.28)
    post_send.add(f2s(cap), kick(90, 36, 0.8, 0.3), gain=0.3)

    # ドローン（静止中）: 低い 5 度のうなり。白が広がるあいだに消える
    white0 = one(cues, "white-start")
    white_full = one(cues, "white-full")
    d0, d1 = f2s(cap), f2s(white_full)
    n = d1 - d0
    u = t_axis(n)
    drone = np.zeros((2, n))
    for ch, det in ((0, -0.15), (1, 0.18)):
        x = (
            np.sin(2 * np.pi * (55 + det) * u)
            + 0.5 * np.sin(2 * np.pi * (82.4 - det) * u)
            + 0.25 * np.sin(2 * np.pi * (110.3 + det * 2) * u)
        )
        drone[ch] = lp(np.tanh(1.6 * x), 500, order=2)
    denv = np.interp(u * 30 + cap, [cap, cap + 6, white0, white_full], [0, 1, 0.8, 0]) ** 1.5
    # 左右で 0.3Hz ずれた 55Hz は数秒ごとに逆相になり、モノラル再生で丸ごと消える。
    # 混ぜても今度はステレオでも 3 秒周期で消えるので、500Hz 未満のドローンは片側の 1 本を左右共通で鳴らす
    drone = np.repeat(drone[:1], 2, axis=0)
    dry.add(d0, drone * denv, gain=0.2)

    # 耳鳴り: 細い高音（小さく）。8kHz より下に置く
    hud = one(cues, "hud-out-start")
    tinn = np.sin(2 * np.pi * 5600 * u + 0.4 * np.sin(2 * np.pi * 0.7 * u))
    tenv = np.interp(u * 30 + cap, [cap, hud, white0, white_full], [0, 1, 0.6, 0])
    dry.add(d0, np.vstack([tinn, np.roll(tinn, 7)]) * tenv, gain=0.012)

    # 消えていく通知: 逆再生のチャイムが膨らんで、消えきる瞬間に柔らかいティック。重なった数ぶん少しだけ大きく
    gone = Counter(cue_frames(cues, "popup-gone"))
    gone_frames = sorted(gone)
    for j, f in enumerate(gone_frames):
        cnt = gone[f]
        k = (f - gone_frames[0]) / (gone_frames[-1] - gone_frames[0])
        pan = rng.uniform(-0.7, 0.7)
        level = (0.06 + 0.03 * np.sqrt(cnt)) * (1 - 0.5 * k)
        # 逆再生の膨らみは直前の消失からの間（最大 0.32 秒）に収める。
        # 消失が毎フレーム続く序盤は膨らみが重なって拍を埋めるので、2f 以上空いたときだけ鳴らす
        span = (f - gone_frames[j - 1]) / 30 if j > 0 else 0.32
        if span >= 2 / 30:
            freq = 523.25 * 2 ** (rng.choice([0, 2, 4, 7, 9, 12]) / 12)
            ln = int(SR * min(0.32, span - 0.01))
            rb = bell(freq, 0.5, 0.18, rng)[::-1][-ln:] * ramp_in(ln, ln / SR * 1000 * 0.6)
            # 膨らみはティックの 6ms 手前で切り上げ、ティックの立ち上がりを立てる
            dry.add(f2s(f) - ln - 300, rb, pan=pan, gain=level * 0.7)
            post_send.add(f2s(f) - ln - 300, rb, pan=pan, gain=level * 1.5)
        tk = tick(rng, 0.05)
        dry.add(f2s(f), tk, pan=pan, gain=level * 3.2)
        post_send.add(f2s(f), tk, pan=pan, gain=level * 1.2)

    post_ir = reverb_ir(rng, rt60=1.8, length=2.4, predelay_ms=20)
    post_wet = apply_reverb(post_send.x, post_ir)

    # ============================================================ ミックス
    mix = dry.x + 0.5 * pre_wet + 0.7 * post_wet
    mix = hp(mix, 25, order=2)
    mix = lp(mix, 9000, order=4)  # 8kHz 超を出しすぎない
    mix = np.tanh(mix * 1.2) / 1.2  # 大きい一撃だけ丸める
    mix *= MASTER

    # 終端: 白が満ちきったら残響を落とし、Noise の最終サンプルで 0 にする
    wipe_end = one(cues, "wipe-end")
    tail = np.ones(N)
    t0, t1 = f2s(white_full), f2s(wipe_end + 8)
    tail[t0:t1] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, t1 - t0))
    tail[t1:] = 0
    mix *= tail
    # 断ち切りの 2f はマスターのフィルタの尾も含めて完全な無音にする
    mix *= g + (np.arange(N) >= f2s(freeze))
    # 頭も念のため数 ms で立ち上げる
    mix[:, : int(SR * 0.003)] *= np.linspace(0, 1, int(SR * 0.003))

    assert mix.shape == (2, N)
    peak_db = 20 * np.log10(np.max(np.abs(mix)) + 1e-12)
    print(f"samples={N} frames={N / SPF:.0f} peak={peak_db:.2f}dBFS last={mix[:, -1]}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # 16bit PCM（どのツールでも読める形）。無音区間がちょうど 0 になるようディザはかけない
    pcm = np.clip(np.round(mix.T * 32767), -32767, 32767).astype(np.int16)
    wavfile.write(OUT, SR, pcm)


if __name__ == "__main__":
    main()
