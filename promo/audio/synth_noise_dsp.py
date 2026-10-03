"""noise.py 専用の合成部品（前半 0〜450f）。

外部の音源・サンプルは使わず、すべて numpy の数式から作る。
乱数は呼び出し側が渡す np.random.Generator だけを使う（固定シードで再現可能にするため）。
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48000
FPS = 30
SPF = SR // FPS  # 1f = 1600 サンプル

HERE = Path(__file__).resolve().parent


def load_cues() -> dict:
    with open(HERE / "cues.json", encoding="utf-8") as fh:
        data = json.load(fh)
    assert data["sampleRate"] == SR and data["samplesPerFrame"] == SPF
    return data


def f2s(frame: float) -> int:
    """本編フレーム → サンプル位置"""
    return int(round(frame * SPF))


def t_axis(n: int) -> np.ndarray:
    return np.arange(n) / SR


# ---------------------------------------------------------------- ミックス


class Bus:
    """ステレオのバス。add() で任意位置に貼り付ける（はみ出しは切る）"""

    def __init__(self, n: int):
        self.n = n
        self.x = np.zeros((2, n))

    def add(self, start: int, sig: np.ndarray, pan: float = 0.0, gain: float = 1.0) -> None:
        if sig.ndim == 1:
            # 等パワーパン（-1=左, +1=右）
            a = (pan + 1) * np.pi / 4
            sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
        s0 = max(0, start)
        s1 = min(self.n, start + sig.shape[1])
        if s1 <= s0:
            return
        self.x[:, s0:s1] += gain * sig[:, s0 - start : s1 - start]


# ---------------------------------------------------------------- 包絡・フィルタ


def ramp_in(n: int, ms: float) -> np.ndarray:
    """立ち上がりの半コサイン（クリック防止）"""
    k = max(1, int(SR * ms / 1000))
    e = np.ones(n)
    k = min(k, n)
    e[:k] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, k))
    return e


def ramp_out(n: int, ms: float) -> np.ndarray:
    return ramp_in(n, ms)[::-1]


def exp_decay(n: int, tau: float) -> np.ndarray:
    return np.exp(-t_axis(n) / tau)


def lp(x: np.ndarray, fc: float, order: int = 4) -> np.ndarray:
    sos = signal.butter(order, fc, "lowpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def hp(x: np.ndarray, fc: float, order: int = 4) -> np.ndarray:
    sos = signal.butter(order, fc, "highpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def bp(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def phase_of(freq: np.ndarray) -> np.ndarray:
    """時間変化する周波数列 → 位相（積分）"""
    return 2 * np.pi * np.cumsum(freq) / SR


def soft_square(phase: np.ndarray, harmonics: int = 9) -> np.ndarray:
    """帯域制限した矩形波（奇数倍音を有限個だけ足す。耳に刺さる高次を作らない）"""
    out = np.zeros_like(phase)
    for k in range(1, harmonics * 2, 2):
        out += np.sin(k * phase) / k
    return out * 4 / np.pi


def saw(phase: np.ndarray, harmonics: int = 24) -> np.ndarray:
    out = np.zeros_like(phase)
    for k in range(1, harmonics + 1):
        out += np.sin(k * phase) / k
    return out * 2 / np.pi


# ---------------------------------------------------------------- 楽器


def key_click(rng: np.random.Generator, heavy: bool = False) -> np.ndarray:
    """乾いた打鍵音: 短いノイズバースト＋プラスチックの共鳴＋底打ちの低い当たり"""
    dur = 0.09 if heavy else 0.05
    n = int(SR * dur)
    t = t_axis(n)
    j = 1 + rng.uniform(-0.08, 0.08)  # キーごとに音程を揺らす
    burst = bp(rng.standard_normal(n), 1800 * j, 5200 * j) * exp_decay(n, 0.0025 if not heavy else 0.004)
    body = (
        0.5 * np.sin(2 * np.pi * 2350 * j * t) * exp_decay(n, 0.007)
        + 0.35 * np.sin(2 * np.pi * 3700 * j * t) * exp_decay(n, 0.004)
    )
    low_f = (95 if heavy else 170) * j
    thock = np.sin(2 * np.pi * low_f * t) * exp_decay(n, 0.03 if heavy else 0.012)
    sig = 0.9 * burst + 0.35 * body + (1.1 if heavy else 0.45) * thock
    if heavy:
        # Enter は二段（押し込み→底打ち）にして重さを出す
        late = np.zeros(n)
        d = int(SR * 0.012)
        late[d:] = 0.6 * bp(rng.standard_normal(n - d), 900, 3000) * exp_decay(n - d, 0.006)
        sig = sig + late
    return sig * ramp_in(n, 0.3) * ramp_out(n, 4)


def tick(rng: np.random.Generator, length_s: float) -> np.ndarray:
    """秒針のチック。間隔が詰まるほど短くする（にじんで団子にならないように）"""
    n = max(64, int(SR * length_s))
    t = t_axis(n)
    tau = min(0.012, length_s * 0.35)
    click = bp(rng.standard_normal(n), 2400, 4200) * exp_decay(n, tau * 0.4)
    tone = np.sin(2 * np.pi * 1850 * t) * exp_decay(n, tau)
    return (0.7 * click + 0.5 * tone) * ramp_in(n, 0.2) * ramp_out(n, min(2.0, length_s * 300))


BELL_RATIOS = np.array([1.0, 2.01, 2.76, 4.07, 5.43])
BELL_AMPS = np.array([1.0, 0.32, 0.28, 0.1, 0.06])


def bell(freq: float, dur: float, tau: float, rng: np.random.Generator, bright: float = 1.0) -> np.ndarray:
    """柔らかいベル（非整数倍音の加算）。マレットの当たりは丸めて、実在の通知音の和音進行は持たない"""
    n = int(SR * dur)
    t = t_axis(n)
    out = np.zeros(n)
    for r, a in zip(BELL_RATIOS, BELL_AMPS):
        f = freq * r * (1 + rng.uniform(-0.002, 0.002))
        if f > 7500:
            continue
        # 高い倍音ほど早く消える
        out += a * (bright if r > 1.5 else 1.0) * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)) * exp_decay(n, tau / r**0.7)
    mallet = lp(rng.standard_normal(n), 3500) * exp_decay(n, 0.0025) * 0.5
    return (out + mallet) * ramp_in(n, 2.5) * ramp_out(n, 20)


def kick(f_start: float, f_end: float, dur: float, tau: float, drive: float = 1.5) -> np.ndarray:
    n = int(SR * dur)
    t = t_axis(n)
    f = f_end + (f_start - f_end) * np.exp(-t / 0.028)
    body = np.sin(phase_of(f)) * exp_decay(n, tau)
    click = np.sin(2 * np.pi * 1100 * t) * exp_decay(n, 0.0015) * 0.3
    sig = np.tanh(drive * (body + click)) / np.tanh(drive)
    return sig * ramp_in(n, 0.4) * ramp_out(n, 8)


def hat(rng: np.random.Generator, tau: float = 0.02) -> np.ndarray:
    n = int(SR * max(0.06, tau * 5))
    # 8kHz を超える成分を出しすぎないよう、上を 7.5kHz で抑えたノイズ
    sig = bp(rng.standard_normal(n), 4200, 7500, order=3) * exp_decay(n, tau)
    return sig * ramp_in(n, 0.2) * ramp_out(n, 3)


def noise_burst(rng: np.random.Generator, dur: float, tau: float, lo: float = 60, hi: float = 7000) -> np.ndarray:
    n = int(SR * dur)
    return bp(rng.standard_normal(n), lo, hi) * exp_decay(n, tau) * ramp_in(n, 0.5) * ramp_out(n, 5)


def reverb_ir(rng: np.random.Generator, rt60: float, length: float, predelay_ms: float = 12) -> np.ndarray:
    """減衰ノイズの IR（残響の質感だけ欲しいので部屋の初期反射は作らない）。

    広がりは 220Hz より上だけで作り、下は左右共通にする。低域まで無相関にすると、
    キックの残響が偶然逆相関になった区間でモノラル再生（スマホ）の音量が数 dB 落ちるため。
    """
    n = int(SR * length)
    t = t_axis(n)
    env = np.exp(-6.91 * t / rt60)
    pre = int(SR * predelay_ms / 1000)
    ir = np.zeros((2, n))
    # 乱数の消費順は左右 1 本ずつのまま（後に続く音の乱数をずらさない）
    raw = [rng.standard_normal(n) for _ in range(2)]
    common_low = lp(raw[0], 220)
    for ch in range(2):
        x = (common_low + hp(raw[ch], 220)) * env
        # 高域ほど早く減衰させる（2 帯域の雑な近似）
        hi = hp(x, 3000) * np.exp(-6.91 * t / (rt60 * 0.45))
        x = lp(x, 3000) + hi
        ir[ch, pre:] = x[: n - pre]
    ir /= np.sqrt(np.sum(ir**2, axis=1, keepdims=True))
    return ir * ramp_in(n, 1)


def apply_reverb(dry: np.ndarray, ir: np.ndarray) -> np.ndarray:
    """dry（2ch）を各 ch の IR で畳み込み、元の長さに切る"""
    n = dry.shape[1]
    out = np.zeros_like(dry)
    mono = dry.mean(axis=0)
    for ch in range(2):
        out[ch] = signal.fftconvolve(0.5 * dry[ch] + 0.5 * mono, ir[ch])[:n]
    return out


def glitch_chop(x: np.ndarray, strength: np.ndarray, rng: np.random.Generator, block: int = 400) -> np.ndarray:
    """スタッター（直前のブロックの反復）とサンプルホールドの荒らし。strength は 0〜1 のサンプル列"""
    y = x.copy()
    n = x.shape[-1]
    prev = None
    for s0 in range(0, n, block):
        s1 = min(n, s0 + block)
        g = float(strength[s0:s1].mean())
        seg = y[..., s0:s1]
        r = rng.random()
        if prev is not None and r < 0.55 * g and prev.shape[-1] == seg.shape[-1]:
            seg = prev.copy()  # 反復
        elif r < 0.85 * g:
            hold = int(2 + g * 14)
            idx = (np.arange(s1 - s0) // hold) * hold
            seg = seg[..., idx]  # サンプルレートを落とす
            q = 2 ** (8 - int(5 * g))
            seg = np.round(seg * q) / q  # ビット深度を落とす
        y[..., s0:s1] = seg
        prev = seg
    # ブロック境界のプチを丸める（高域に出る段差だけ削る）
    return lp(y, 7000, order=2)


def svf(x: np.ndarray, fc: np.ndarray, q: float = 0.7, mode: str = "lp") -> np.ndarray:
    """カットオフが時間変化するフィルタ（TPT 型ステートバリアブル。掃引しても発散しない）。
    x は 1ch または 2ch、fc はサンプルごとの周波数列"""
    x2 = np.atleast_2d(x)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1 / q
    a1 = 1 / (1 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    out = np.zeros_like(x2)
    for ch in range(x2.shape[0]):
        ic1 = ic2 = 0.0
        xs = x2[ch].tolist()
        o = [0.0] * len(xs)
        A1, A2, A3 = a1.tolist(), a2.tolist(), a3.tolist()
        for i, v in enumerate(xs):
            v3 = v - ic2
            v1 = A1[i] * ic1 + A2[i] * v3
            v2 = ic2 + A2[i] * ic1 + A3[i] * v3
            ic1 = 2 * v1 - ic1
            ic2 = 2 * v2 - ic2
            o[i] = v2 if mode == "lp" else v1 * k  # lp / 正規化バンドパス
        out[ch] = o
    return out if x.ndim == 2 else out[0]
