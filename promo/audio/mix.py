"""紹介動画の BGM をつなぎ、配信向けにマスタリングして public/score.mp3 を書き出す。

入力:  out/noise.wav（本編 0〜449f）と out/quiet.wav（本編 450〜1799f）
出力:  out/score.wav（16bit PCM の中間）と ../public/score.mp3

マスタリングの方針:
- 前半と後半に別々の固定ゲインをかけ、前半が後半より FRONT_OVER_BACK_DB だけ大きく
  なるようにしてから、全体の integrated が TARGET_LUFS になるよう一緒に動かす。
  ゲインは掛け算なので 0 のサンプルは 0 のまま残る（15〜17 秒の無音が持ち上がらない）
- True Peak が TP_CEILING を超えるところだけ、先読みつきのリミッターで下げる。
  mp3 化で真のピークが少し増えるので、目標の -1.0 dBTP より余裕を見ている
- ラウドネスは ITU-R BS.1770-4（K 特性・400ms ブロック・絶対 -70 / 相対 -10 のゲート）を
  numpy で計算する。仕上がりは ffmpeg の ebur128 でも確認する

再生成: cd promo && npm run audio
"""

from __future__ import annotations

import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import lfilter, resample_poly

SR = 48000
SPF = 1600  # 1 フレームのサンプル数（30fps）
SEAM_FRAME = 450
TOTAL_FRAMES = 1800

TARGET_LUFS = -14.0
FRONT_OVER_BACK_DB = 4.0  # 前半（騒音）は後半（静けさ）よりこれだけ大きく聞かせる
TP_CEILING_DB = -1.5  # リミッターの天井（dBTP）。mp3 化後に -1.0 を割らないための余裕
MP3_BITRATE = "256k"

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "out")
PUBLIC_MP3 = os.path.join(HERE, "..", "public", "score.mp3")


def read_wav(name: str, frames: int) -> np.ndarray:
    sr, x = wavfile.read(os.path.join(OUT_DIR, name))
    assert sr == SR, f"{name}: サンプリングレートが {sr}"
    assert x.ndim == 2 and x.shape[1] == 2, f"{name}: ステレオではない"
    assert x.shape[0] == frames * SPF, f"{name}: 長さが {x.shape[0]}（期待 {frames * SPF}）"
    assert x.dtype == np.int16, f"{name}: 16bit PCM ではない"
    return x.astype(np.float64) / 32768.0


# --- BS.1770 ------------------------------------------------------------------

# 48kHz 用の K 特性（BS.1770-4 の係数そのまま）
_K1_B = [1.53512485958697, -2.69169618940638, 1.19839281085285]
_K1_A = [1.0, -1.69065929318241, 0.73248077421585]
_K2_B = [1.0, -2.0, 1.0]
_K2_A = [1.0, -1.99004745483398, 0.99007225036621]


def _block_powers(x: np.ndarray) -> np.ndarray:
    y = lfilter(_K2_B, _K2_A, lfilter(_K1_B, _K1_A, x, axis=0), axis=0)
    sq = (y**2).sum(axis=1)  # L/R の重みはどちらも 1
    block, step = int(0.4 * SR), int(0.1 * SR)
    csum = np.concatenate([[0.0], np.cumsum(sq)])
    starts = np.arange(0, len(sq) - block + 1, step)
    return (csum[starts + block] - csum[starts]) / block


def integrated_lufs(x: np.ndarray) -> float:
    z = _block_powers(x)
    lk = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    z = z[lk > -70.0]
    if len(z) == 0:
        return -np.inf
    rel = -0.691 + 10 * np.log10(z.mean()) - 10.0
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return float(-0.691 + 10 * np.log10(z.mean()))


def true_peak_env(x: np.ndarray) -> np.ndarray:
    """4 倍オーバーサンプリングで、各サンプル付近の真のピーク（L/R の大きい方）を返す。"""
    up = resample_poly(x, 4, 1, axis=0)
    env = np.abs(up).max(axis=1)
    return env[: len(x) * 4].reshape(len(x), 4).max(axis=1)


def db(v: float) -> float:
    return 20 * np.log10(max(v, 1e-12))


# --- 処理 ---------------------------------------------------------------------


def limit(x: np.ndarray, ceiling_db: float) -> tuple[np.ndarray, float]:
    """天井を超える箇所の前後だけ滑らかにゲインを下げる。超えなければ素通し。"""
    ceiling = 10 ** (ceiling_db / 20)
    env = true_peak_env(x)
    need = np.minimum(1.0, ceiling / np.maximum(env, 1e-12))
    if need.min() >= 1.0:
        return x, 0.0
    look = int(0.003 * SR)  # 3ms で下げ始める
    # 窓 2L の最小値を幅 L で平均すると、ピーク位置では必ず need 以下に収まる
    g = minimum_filter1d(need, size=2 * look + 1, mode="nearest")
    g = uniform_filter1d(g, size=look, mode="nearest")
    # 戻りは 80ms の片側指数でゆっくり（逆方向にかけて先読み分と対称にしない）
    rel = np.exp(-1.0 / (0.08 * SR))
    out = g.copy()
    for i in range(1, len(out)):  # 6 万点超でも数秒。依存ライブラリを増やさないため素直に回す
        out[i] = min(g[i], out[i - 1] * rel + (1 - rel) * g[i])
    return x * out[:, None], db(out.min())


def main() -> None:
    noise = read_wav("noise.wav", SEAM_FRAME)
    quiet = read_wav("quiet.wav", TOTAL_FRAMES - SEAM_FRAME)

    # 継ぎ目: どちらの端も 0 なら、そのまま並べてもクリックは出ない
    tail, head = np.abs(noise[-SPF:]).max(), np.abs(quiet[:SPF]).max()
    if tail > 0 or head > 0:
        print(f"警告: 継ぎ目が 0 ではない（noise 末尾 1f の最大 {tail:.6f} / quiet 頭 1f の最大 {head:.6f}）")

    lf0, lb0 = integrated_lufs(noise), integrated_lufs(quiet)
    # 前半の差を FRONT_OVER_BACK_DB に揃える（後半だけ持ち上げる）
    gb_rel = (lf0 - lb0) - FRONT_OVER_BACK_DB

    def build(gf_db: float) -> np.ndarray:
        return np.concatenate([noise * 10 ** (gf_db / 20), quiet * 10 ** ((gf_db + gb_rel) / 20)])

    # 全体を一緒に動かして integrated を目標へ（ゲートがあるので 2 回寄せる）
    gf = 0.0
    for _ in range(3):
        gf += TARGET_LUFS - integrated_lufs(build(gf))
    score = build(gf)
    score, gr = limit(score, TP_CEILING_DB)
    # リミッターで下がった分は小さいはずだが、念のためもう一度だけ寄せる
    if gr < 0:
        score *= 10 ** ((TARGET_LUFS - integrated_lufs(score)) / 20)
        score, gr2 = limit(score, TP_CEILING_DB)
        gr = min(gr, gr2)

    assert len(score) == TOTAL_FRAMES * SPF
    pcm = np.clip(np.round(score * 32767), -32768, 32767).astype(np.int16)
    wav_path = os.path.join(OUT_DIR, "score.wav")
    wavfile.write(wav_path, SR, pcm)

    s = pcm.astype(np.float64) / 32768.0
    sec = lambda a, b: integrated_lufs(s[int(a * SR) : int(b * SR)])  # noqa: E731
    print(f"素材: noise {lf0:.1f} LUFS / quiet {lb0:.1f} LUFS")
    print(f"ゲイン: 前半 {gf:+.2f} dB / 後半 {gf + gb_rel:+.2f} dB / リミッター最大 {gr:.2f} dB")
    print(f"integrated {integrated_lufs(s):.2f} LUFS / true peak {db(true_peak_env(s).max()):.2f} dBTP")
    print(f"区間: 0-15s {sec(0, 15):.1f} / 17-60s {sec(17, 60):.1f} LUFS")
    print(f"15-17s の最大値 {np.abs(pcm[15 * SR : 17 * SR]).max()}（0 なら無音のまま）")

    # mp3: 48kHz・ステレオ・CBR。ffmpeg は LAME ヘッダにエンコーダ遅延を書くので、
    # ヘッダを読むデコーダ（ffmpeg / Chromium / Remotion）では頭がずれない
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav_path,
         "-c:a", "libmp3lame", "-b:a", MP3_BITRATE, "-ar", str(SR), "-ac", "2", PUBLIC_MP3],
        check=True,
    )
    print(f"書き出し: {os.path.relpath(PUBLIC_MP3, os.getcwd())}")


if __name__ == "__main__":
    sys.exit(main())
