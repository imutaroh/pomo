"""後半（Quiet 側）の BGM 用の楽器と効果音。すべて numpy / scipy で合成し、外部音源は使わない。

各関数は (n, 2) のステレオ配列を返す。乱数は呼び出し側が渡す np.random.Generator だけを使い、
呼び出し順が同じなら必ず同じ波形になる。
"""

import numpy as np
from scipy import signal

SR = 48000


def midi_hz(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def pan(mono: np.ndarray, p: float) -> np.ndarray:
    """定パワーのパン。p は -1（左）〜 +1（右）。"""
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1)


def raised_cos(n: int) -> np.ndarray:
    if n <= 0:
        return np.zeros(0)
    return 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))


def lowpass(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, hz, "low", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def highpass(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, hz, "high", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, [lo, hi], "band", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


# ---------------------------------------------------------------- フェルトピアノ

def felt_piano(midi: float, vel: float, rng: np.random.Generator, dur: float = 5.0) -> np.ndarray:
    """フェルトを挟んだアップライト風。弦 2 本の少しのデチューン＋二段の減衰＋ハンマーの柔らかいノイズ。

    フェルトなので倍音は早く丸まり、アタックは 4ms ほど遅らせて角を取る。
    """
    f0 = midi_hz(midi)
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    inharm = 0.00025
    # 低い音ほど長く鳴る
    tau_slow = 3.2 * (220.0 / f0) ** 0.35
    for k in range(1, 13):
        fk = k * f0 * np.sqrt(1 + inharm * k * k)
        if fk > 8000:
            break
        amp = k ** -1.4 * np.exp(-(k - 1) * (0.75 - 0.3 * vel))
        amp /= 1 + (fk / 2200.0) ** 2
        ts = tau_slow / (1 + 0.45 * (k - 1))
        tf = 0.22 / np.sqrt(k)
        env = 0.55 * np.exp(-t / ts) + 0.45 * np.exp(-t / tf)
        for cents in (-1.3, 1.1):
            ph = rng.uniform(0, 2 * np.pi)
            out += 0.5 * amp * env * np.sin(2 * np.pi * fk * 2 ** (cents / 1200) * t + ph)
    att = int(0.004 * SR)
    out[:att] *= raised_cos(att)
    # 消音（ダンパー）: 最後の 0.4 秒で落とす
    rel = int(0.4 * SR)
    out[-rel:] *= raised_cos(rel)[::-1]
    # ハンマーのフェルトが弦に当たる柔らかいノイズ
    hn = int(0.03 * SR)
    th = np.arange(hn) / SR
    ham = rng.standard_normal(hn) * np.exp(-th / 0.006)
    ham = lowpass(ham, 900 + 1400 * vel)
    out[:hn] += 0.05 * vel * ham
    p = float(np.clip((midi - 62) / 30.0, -0.45, 0.45))
    return pan(out * vel, p)


# ---------------------------------------------------------------- パッド

def warm_pad(
    midis: list[float],
    n: int,
    attack: int,
    release: int,
    rng: np.random.Generator,
    bright: np.ndarray | float = 1.0,
    amp: np.ndarray | float = 1.0,
) -> np.ndarray:
    """デチューンした 3 声の加算パッド。n は鳴らす長さ（release を含む全長）。

    bright は倍音の開き（1 前後。大きいほど明るい）、amp は追加の音量曲線。どちらも長さ n の配列か定数。
    """
    t = np.arange(n) / SR
    bright = np.broadcast_to(np.asarray(bright, dtype=float), (n,))
    out = np.zeros((n, 2))
    for m in midis:
        f0 = midi_hz(m)
        for vi, (cents, p) in enumerate(((-6.0, -0.6), (0.0, 0.0), (5.0, 0.6))):
            # ゆっくり揺れるデチューン（コーラス）
            rate = rng.uniform(0.07, 0.16)
            drift = 1.5 * np.sin(2 * np.pi * rate * t + rng.uniform(0, 2 * np.pi))
            ratio = 2 ** ((cents + drift) / 1200)
            phase = 2 * np.pi * f0 * np.cumsum(ratio) / SR + rng.uniform(0, 2 * np.pi)
            mono = np.zeros(n)
            for k in range(1, 8):
                if k * f0 > 6000:
                    break
                ak = (1.0 / k) * np.exp(-(k - 1) / np.maximum(bright * 0.9, 0.05))
                mono += ak * np.sin(k * phase)
            lfo = 0.85 + 0.15 * np.sin(2 * np.pi * rng.uniform(0.08, 0.13) * t + rng.uniform(0, 2 * np.pi))
            out += pan(mono * lfo, p * 0.8)
    env = np.ones(n)
    env[:attack] = raised_cos(attack)
    if release > 0:
        env[-release:] = raised_cos(release)[::-1]
    return out * (env * np.asarray(amp))[:, None] / (3 * max(len(midis), 1))


def sub_bass(midi: float, n: int, attack: int, release: int) -> np.ndarray:
    t = np.arange(n) / SR
    f = midi_hz(midi)
    mono = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t)
    env = np.ones(n)
    env[:attack] = raised_cos(attack)
    env[-release:] = raised_cos(release)[::-1]
    return pan(mono * env, 0.0)


# ---------------------------------------------------------------- 効果音

def soft_click(rng: np.random.Generator, vel: float = 1.0) -> np.ndarray:
    """トラックパッドの柔らかいクリック。帯域を絞ったノイズの粒と短い木の鳴り。"""
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    noise = bandpass(rng.standard_normal(n), 1500, 5000) * np.exp(-t / 0.0025)
    body = np.sin(2 * np.pi * 1180 * t) * np.exp(-t / 0.008)
    x = 0.6 * noise + 0.5 * body
    x[:24] *= raised_cos(24)
    return pan(x * vel, 0.1)


def soft_key(rng: np.random.Generator, vel: float = 1.0, p: float = 0.0, pitch: float = 1.0) -> np.ndarray:
    """静かなキーボードの打鍵。低い「コト」と、離すときの小さな粒。"""
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    thock = np.sin(2 * np.pi * 210 * pitch * t) * np.exp(-t / 0.018)
    tick = lowpass(rng.standard_normal(n), 3200) * np.exp(-t / 0.004)
    x = 0.55 * thock + 0.45 * tick
    up = int(0.055 * SR)
    m = n - up
    x[up:] += 0.12 * lowpass(rng.standard_normal(m), 2500) * np.exp(-np.arange(m) / SR / 0.003)
    x[:24] *= raised_cos(24)
    return pan(x * vel, p)


def small_bell(midi: float, rng: np.random.Generator, vel: float = 1.0, dur: float = 2.6) -> np.ndarray:
    """小さなベル。非整数倍音を少しだけ混ぜた澄んだ音。"""
    f0 = midi_hz(midi)
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for ratio, a, tau in ((1.0, 1.0, 1.1), (2.0, 0.28, 0.6), (2.76, 0.12, 0.35), (5.4, 0.05, 0.15)):
        x += a * np.sin(2 * np.pi * f0 * ratio * t + rng.uniform(0, 2 * np.pi)) * np.exp(-t / tau)
    att = int(0.002 * SR)
    x[:att] *= raised_cos(att)
    x[-2400:] *= raised_cos(2400)[::-1]
    return pan(x * vel, 0.25)


def melt_fall(midi_from: float, midi_to: float, glide: float, rng: np.random.Generator, vel: float = 1.0) -> np.ndarray:
    """溶けるときの小さな下降音。正弦波がふっと降りて薄れる。"""
    n = int((glide + 1.2) * SR)
    t = np.arange(n) / SR
    k = np.clip(t / glide, 0, 1)
    k = k * k * (3 - 2 * k)
    midi = midi_from + (midi_to - midi_from) * k
    f = 440.0 * 2 ** ((midi - 69) / 12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.15 * np.sin(2 * ph)
    env = np.exp(-t / 0.45)
    att = int(0.006 * SR)
    env[:att] *= raised_cos(att)
    env[-2400:] *= raised_cos(2400)[::-1]
    return pan(x * env * vel, 0.3)


def whoosh(n_total: int, peak_at: int, rng: np.random.Generator, direction: int, vel: float = 1.0) -> np.ndarray:
    """3 本指スワイプの柔らかい風切り。帯域が動き、音像が画面の流れる向きへ動く。

    direction = -1 は画面が左へ流れる（行き）、+1 は右へ（戻り）。
    """
    n = n_total + int(0.35 * SR)
    t = np.arange(n)
    noise = rng.standard_normal(n)
    # 固定の 3 帯域を時間でクロスフェードして、帯域が 低→中→低 へ動くように聞かせる
    # （係数を途中で替える IIR は継ぎ目でクリックが出るので使わない）
    low = bandpass(noise, 250, 800)
    mid = bandpass(noise, 600, 1800)
    high = bandpass(noise, 1400, 3200)
    k = np.interp(t, [0, peak_at, n], [0.0, 1.0, 0.25])
    out = (
        low * np.clip(1 - 2 * k, 0, 1)
        + mid * (1 - np.abs(2 * k - 1))
        + 0.7 * high * np.clip(2 * k - 1, 0, 1)
    )
    env = np.where(
        t < peak_at,
        (t / max(peak_at, 1)) ** 1.6,
        np.exp(-(t - peak_at) / (0.12 * SR)),
    )
    # 指がトラックパッドに触れる瞬間の小さな息（これがスワイプの頭になり、風はそこから膨らむ）
    env = np.maximum(env, 0.45 * np.exp(-t / (0.04 * SR)))
    env[:48] *= raised_cos(48)
    env[-2400:] *= raised_cos(2400)[::-1]
    x = out * env * vel
    # 音像を流れる向きへ動かす
    pos = np.interp(t, [0, n], [-0.5 * direction, 0.6 * direction])
    a = (pos + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def shimmer(midis: list[float], n: int, attack: int, decay: float, rng: np.random.Generator, vel: float = 1.0) -> np.ndarray:
    """そっと広がる高い和音。左右で少しずらした正弦波が、遅い立ち上がりで開いていく。"""
    tail = int(decay * 4 * SR)
    N = n + tail
    t = np.arange(N) / SR
    out = np.zeros((N, 2))
    for i, m in enumerate(midis):
        f = midi_hz(m)
        for ch, cents in ((0, -4.0), (1, 4.0)):
            out[:, ch] += np.sin(2 * np.pi * f * 2 ** (cents / 1200) * t + rng.uniform(0, 2 * np.pi))
    env = np.exp(-np.maximum(t - attack / SR, 0) / decay)
    env[:attack] = raised_cos(attack) ** 0.7
    env[-4800:] *= raised_cos(4800)[::-1]
    return out * env[:, None] * vel / len(midis)


def pencil(n: int, rng: np.random.Generator, vel: float = 1.0, p: float = 0.0) -> np.ndarray:
    """鉛筆の柔らかい擦れ。帯域を絞ったノイズを紙の繊維のような粒で揺らす。"""
    N = n + int(0.08 * SR)
    t = np.arange(N) / SR
    x = bandpass(rng.standard_normal(N), 2200, 7000)
    grain = lowpass(np.abs(rng.standard_normal(N)), 60, order=1)
    grain = 0.55 + grain / (grain.max() + 1e-9)
    env = np.ones(N)
    a = int(0.006 * SR)
    env[:a] = raised_cos(a)
    env[n:] = np.exp(-(t[n:] - t[n]) / 0.02)
    # 芯が紙に触れる瞬間を少し強く、引き終わりに向けて軽くする（続けて引いても一本ずつ聞き分けられる）
    env[:n] *= np.linspace(1.0, 0.35, n)
    env[:n] *= 1 + 0.6 * np.exp(-t[:n] / 0.018)
    return pan(x * grain * env * vel, p)


def vanish(midi: float, n: int, rng: np.random.Generator, vel: float = 1.0, p: float = 0.0) -> np.ndarray:
    """言葉が消える瞬間。息のようなノイズと、ごく小さな高い音が一緒に薄れていく。"""
    N = n + int(0.9 * SR)
    t = np.arange(N) / SR
    air = lowpass(rng.standard_normal(N), 1800) * np.exp(-t / 0.12)
    f = midi_hz(midi)
    tone = np.sin(2 * np.pi * f * t * (1 - 0.01 * np.clip(t / 0.4, 0, 1))) * np.exp(-t / 0.35)
    x = 0.5 * air + 0.6 * tone
    a = int(0.008 * SR)
    x[:a] *= raised_cos(a)
    x[-2400:] *= raised_cos(2400)[::-1]
    return pan(x * vel, p)


def airy_swell(n: int, rng: np.random.Generator, vel: float = 1.0) -> np.ndarray:
    """washi へ抜けるときの、明るい空気が満ちる音。帯域ノイズが上へ開きながら膨らむ。"""
    N = n + int(0.6 * SR)
    t = np.arange(N)
    x = np.stack([highpass(rng.standard_normal(N), 2500), highpass(rng.standard_normal(N), 2500)], axis=1)
    x = lowpass(x, 9000)
    env = np.where(t < n, 0.25 + 0.75 * (t / n) ** 1.5, np.exp(-(t - n) / (0.18 * SR)))
    env[:240] *= raised_cos(240)
    env[-2400:] *= raised_cos(2400)[::-1]
    return x * env[:, None] * vel


# ---------------------------------------------------------------- リバーブ

def synth_ir(rng: np.random.Generator, length: float = 4.0, predelay: float = 0.02) -> np.ndarray:
    """合成インパルス応答。帯域ごとに残響時間を変え（高域ほど早く消える）、左右は無相関にする。"""
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    bands = ((None, 400, 3.2), (400, 3000, 2.6), (3000, None, 1.3))
    for ch in range(2):
        noise = rng.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi, rt in bands:
            if lo is None:
                b = lowpass(noise, hi, 4)
            elif hi is None:
                b = highpass(noise, lo, 4)
            else:
                b = bandpass(noise, lo, hi, 4)
            acc += b * np.exp(-6.9 * t / rt)
        # 立ち上がりを 60ms でなだらかにして、壁の多い部屋のような柔らかさにする
        acc *= 1 - np.exp(-t / 0.06)
        ir[:, ch] = acc
    pd = int(predelay * SR)
    ir = np.concatenate([np.zeros((pd, 2)), ir])[:n]
    # 初期反射
    for d, g in ((0.011, 0.35), (0.019, 0.25), (0.031, 0.2), (0.047, 0.14)):
        i = int(d * SR)
        ir[i, 0] += g
        ir[int(i * 1.13), 1] += g
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    return ir


def reverb(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    n = len(x)
    out = np.zeros_like(x)
    for ch in range(2):
        out[:, ch] = signal.fftconvolve(x[:, ch], ir[:, ch])[:n]
    return out
