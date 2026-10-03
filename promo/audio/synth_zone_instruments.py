"""zone.py（冒頭の Zone と Cut）用の楽器。ローファイ寄りのビートと、温かいエレピ。

外部の音源・サンプルは使わず、すべて numpy / scipy の数式で作る。乱数は呼び出し側の Generator だけを使う。
返り値はモノラル（1 次元）。定位は呼び出し側の Bus.add(pan=...) で決める。
rhodes() は後半（quiet.py）の 25:00 到達で冒頭のフレーズを引用するときにも使う（同じ音色で呼応させるため）。
"""

from __future__ import annotations

import numpy as np
from scipy import signal

SR = 48000


def midi_hz(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def _t(n: int) -> np.ndarray:
    return np.arange(n) / SR


def _fade(n: int, a_ms: float, r_ms: float) -> np.ndarray:
    e = np.ones(n)
    a = min(n, max(1, int(SR * a_ms / 1000)))
    r = min(n, max(1, int(SR * r_ms / 1000)))
    e[:a] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    e[n - r :] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r))
    return e


def _lp(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, hz, "low", fs=SR, output="sos"), x, axis=-1)


def _hp(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, hz, "high", fs=SR, output="sos"), x, axis=-1)


def _bp(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=-1)


# ---------------------------------------------------------------- エレピ


def rhodes(midi: float, vel: float, dur: float, rng: np.random.Generator, wow: float = 1.0, tone: float = 1.0) -> np.ndarray:
    """FM のエレピ（1:1 の変調でベルのような芯、打った瞬間だけ明るく、すぐ丸くなる）。

    wow はテープの揺れ（ピッチのゆっくりした揺れ）の深さ。tone は変調の深さ（明るさ）の倍率。
    高い倍音（ティーン）は 7kHz を超えるなら鳴らさない（耳に刺さる帯域を作らない）。
    """
    f = midi_hz(midi)
    n = int(dur * SR)
    t = _t(n)
    # テープの揺れ: 0.55Hz で ±4 cents 程度
    drift = 1 + wow * 0.0023 * np.sin(2 * np.pi * 0.55 * t + rng.uniform(0, 2 * np.pi))
    ph = 2 * np.pi * f * np.cumsum(drift) / SR + rng.uniform(0, 2 * np.pi)
    index = tone * ((0.5 + 1.4 * vel) * np.exp(-t / 0.2) + 0.22)
    body = np.sin(ph + index * np.sin(ph))
    # 低い音ほど長く鳴る
    tau = 1.5 * (262.0 / f) ** 0.35
    env = 0.62 * np.exp(-t / tau) + 0.38 * np.exp(-t / 0.3)
    x = body * env
    if f * 14 < 7000:
        x += 0.10 * vel * np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.01)
    # 2 倍音を少し（エレピの「鼻にかかった」鳴り）
    x += 0.12 * np.sin(2 * ph) * np.exp(-t / 0.5)
    x = _lp(x, 5200)
    return x * vel * _fade(n, 2.5, 70)


# ---------------------------------------------------------------- ベースとパッド


def bass(midi: float, dur: float, vel: float = 1.0) -> np.ndarray:
    """丸いベース。正弦に 2・3 倍音を足して軽く歪ませる（スマホでも音程が分かるように）。"""
    f = midi_hz(midi)
    n = int(dur * SR)
    t = _t(n)
    ph = 2 * np.pi * f * t
    x = np.sin(ph) + 0.28 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph)
    x = np.tanh(1.4 * x) / np.tanh(1.4)
    env = 0.75 + 0.25 * np.exp(-t / 0.15)
    return _lp(x * env, 900) * vel * _fade(n, 6, 60)


def air_pad(midis: list[float], n: int, rng: np.random.Generator, attack_s: float = 1.2) -> np.ndarray:
    """息の多い高いパッド（ok の 2 回目から上に足す層）。正弦の束にゆっくりした揺れと帯域ノイズを少し。"""
    t = _t(n)
    x = np.zeros(n)
    for m in midis:
        f = midi_hz(m)
        for cents in (-5.0, 4.0):
            r = 2 ** ((cents + 1.5 * np.sin(2 * np.pi * rng.uniform(0.08, 0.15) * t)) / 1200)
            x += np.sin(2 * np.pi * f * np.cumsum(r) / SR + rng.uniform(0, 2 * np.pi))
    x /= 2 * len(midis)
    breath = _bp(rng.standard_normal(n), 1200, 4000) * 0.04
    env = np.minimum(1, t / attack_s) ** 1.5
    return (x + breath) * env * _fade(n, 5, 300)


# ---------------------------------------------------------------- 打楽器


def kick(vel: float = 1.0) -> np.ndarray:
    """丸いキック。立ち上がりの音程の落ちを短くして、ふくらみで聞かせる。"""
    n = int(0.42 * SR)
    t = _t(n)
    f = 50 + 75 * np.exp(-t / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2)
    click = np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.0015) * 0.15
    x = np.tanh(1.3 * (body + click)) / np.tanh(1.3)
    return _lp(x, 3000) * vel * _fade(n, 0.5, 40)


def snare(rng: np.random.Generator, vel: float = 1.0, tight: float = 1.0) -> np.ndarray:
    """ローファイのスネア。胴の鳴り（185Hz）と、上を丸めたノイズ。tight < 1 で短く（ロール用）。"""
    n = int(0.3 * SR)
    t = _t(n)
    nz = _bp(rng.standard_normal(n), 900, 6500) * np.exp(-t / (0.085 * tight))
    body = (np.sin(2 * np.pi * 185 * t) + 0.5 * np.sin(2 * np.pi * 330 * t)) * np.exp(-t / (0.045 * tight))
    x = 0.75 * nz + 0.55 * body
    return _lp(x, 7000) * vel * _fade(n, 0.6, 30)


def hat(rng: np.random.Generator, vel: float = 1.0, open_: bool = False) -> np.ndarray:
    """閉じた（開いた）ハイハット。上は 9kHz で丸める。"""
    n = int((0.35 if open_ else 0.07) * SR)
    t = _t(n)
    x = _bp(rng.standard_normal(n), 5500, 9000, order=3) * np.exp(-t / (0.11 if open_ else 0.014))
    return x * vel * _fade(n, 0.3, 10)


def shaker(rng: np.random.Generator, vel: float = 1.0) -> np.ndarray:
    n = int(0.09 * SR)
    t = _t(n)
    x = _bp(rng.standard_normal(n), 3000, 8000) * (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.025)
    return x * vel * _fade(n, 0.5, 8)


def crackle(n: int, rng: np.random.Generator, rate: float = 7.0) -> np.ndarray:
    """レコードの針音: まばらなプチと、ごく小さなヒス。2ch（左右で別のプチ）。"""
    out = np.zeros((2, n))
    for ch in range(2):
        k = rng.poisson(rate * n / SR)
        pos = rng.integers(0, n, k)
        amp = rng.uniform(0.2, 1.0, k) ** 2 * rng.choice([-1, 1], k)
        imp = np.zeros(n)
        imp[pos] = amp
        out[ch] = _bp(imp, 900, 6000) * 0.6 + _lp(rng.standard_normal(n), 3500) * 0.012
    return out


# ---------------------------------------------------------------- 効果音


def key_thock(rng: np.random.Generator, vel: float = 1.0, heavy: bool = False) -> np.ndarray:
    """静かなメカニカルキー。低い「コト」と短い粒。heavy は Enter（二段で重く）。"""
    n = int((0.11 if heavy else 0.06) * SR)
    t = _t(n)
    j = 1 + rng.uniform(-0.07, 0.07)
    thock = np.sin(2 * np.pi * (150 if heavy else 240) * j * t) * np.exp(-t / (0.022 if heavy else 0.01))
    tick = _bp(rng.standard_normal(n), 1500 * j, 4500 * j) * np.exp(-t / 0.0022)
    x = 0.8 * thock + 0.5 * tick
    if heavy:
        d = int(0.014 * SR)
        x[d:] += 0.5 * _bp(rng.standard_normal(n - d), 700, 2600) * np.exp(-_t(n - d) / 0.005)
    return x * vel * _fade(n, 0.3, 6)


def glass(midi: float, vel: float, rng: np.random.Generator, dur: float = 2.2) -> np.ndarray:
    """テストが通る瞬間の澄んだ音。正弦の芯に少しだけ非整数倍音（ガラスを軽く弾いたような）。"""
    f = midi_hz(midi)
    n = int(dur * SR)
    t = _t(n)
    x = np.zeros(n)
    for ratio, a, tau in ((1.0, 1.0, 0.9), (2.0, 0.22, 0.4), (3.01, 0.08, 0.18)):
        if f * ratio < 7500:
            x += a * np.sin(2 * np.pi * f * ratio * t + rng.uniform(0, 2 * np.pi)) * np.exp(-t / tau)
    return x * vel * _fade(n, 1.5, 200)


def clock_tick(rng: np.random.Generator, vel: float = 1.0) -> np.ndarray:
    """キッチンタイマーの秒のチック。乾いた木と小さな金属の鳴り（2.6kHz）。残響は付けない。"""
    n = int(0.08 * SR)
    t = _t(n)
    click = _bp(rng.standard_normal(n), 2000, 6000) * np.exp(-t / 0.0012)
    ring = np.sin(2 * np.pi * 2650 * t) * np.exp(-t / 0.012) + 0.4 * np.sin(2 * np.pi * 4100 * t) * np.exp(-t / 0.006)
    wood = np.sin(2 * np.pi * 880 * t) * np.exp(-t / 0.006)
    return (0.8 * click + 0.45 * ring + 0.35 * wood) * vel * _fade(n, 0.2, 8)
