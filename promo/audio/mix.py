"""紹介動画の BGM をつなぎ、配信向けにマスタリングして public/score.mp3 を書き出す。

入力（区切りはすべて cues.json の sections から読む）:
  out/zone.wav   zone の頭〜cut の終わり（Zone の音楽と Cut のアラーム）
  out/noise.wav  noise の区間（通知の洪水）
  out/quiet.wav  silence の頭〜終端（2 秒の無音と後半の音楽）
出力:  out/score.wav（16bit PCM の中間）と ../public/score.mp3

マスタリングの方針:
- 後半（desktop〜終端）を基準に、Noise を NOISE_OVER dB、Zone の音楽（zone の区間）を ZONE_OVER dB 大きくする。
  Noise と後半の差は 60 秒版（前半 -10.8 / 後半 -15.2 LUFS）と同じ。Zone は「気持ちよく乗れる」大きさとして
  後半より少し大きく、Noise よりは小さく置く。Cut のアラームの大きさは zone.py の中の釣り合い（Zone の最後の小節より一段上）で決まる
- 全体の integrated が TARGET_LUFS になるよう後半のゲインを解き、前半はそれに連動させる。
  ゲインは掛け算なので 0 のサンプルは 0 のまま残る（Cut の断ち切りと silence の無音が持ち上がらない）
- True Peak が TP_CEILING を超えるところだけ、先読みつきのリミッターで下げる。
  mp3 化で真のピークが少し増えるので、目標の -1.0 dBTP より余裕を見ている
- ラウドネスは ITU-R BS.1770-4（K 特性・400ms ブロック・絶対 -70 / 相対 -10 のゲート）を
  numpy で計算する。仕上がりは ffmpeg の ebur128 でも確認する

再生成: cd promo && npm run audio
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import lfilter, resample_poly

SR = 48000
SPF = 1600  # 1 フレームのサンプル数（30fps）

TARGET_LUFS = -14.0
NOISE_OVER = 4.4  # Noise を後半より何 dB 大きくするか
ZONE_OVER = 2.0  # Zone の音楽を後半より何 dB 大きくするか
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
    with open(os.path.join(HERE, "cues.json"), encoding="utf-8") as fh:
        cues = json.load(fh)
    sec = {x["id"]: (x["from"], x["to"]) for x in cues["sections"]}
    total = cues["duration"]
    parts = [("zone.wav", sec["zone"][0], sec["cut"][1]), ("noise.wav", *sec["noise"]), ("quiet.wav", sec["silence"][0], total)]
    assert parts[0][1] == 0 and parts[-1][2] == total
    assert all(parts[i][2] == parts[i + 1][1] for i in range(len(parts) - 1)), parts
    zone, noise, quiet = (read_wav(name, b - a) for name, a, b in parts)

    # 継ぎ目: Cut の終わり・Noise の終わり・silence の頭は 0 のはず（Noise の頭はカットで鳴り出すので 0 でなくてよい）。
    # 前の端が 0 なら、そのまま並べてもクリックは出ない
    for name, x in (("zone.wav 末尾", zone[-SPF:]), ("noise.wav 末尾", noise[-SPF:]), ("quiet.wav 頭", quiet[:SPF])):
        if np.abs(x).max() > 0:
            print(f"警告: {name} 1f が 0 ではない（最大 {np.abs(x).max():.6f}）")

    zone_music = zone[: (sec["zone"][1] - sec["zone"][0]) * SPF]
    lz, ln, lb = integrated_lufs(zone_music), integrated_lufs(noise), integrated_lufs(quiet)

    def render(gb: float) -> tuple[np.ndarray, float]:
        gz = lb + gb + ZONE_OVER - lz
        gn = lb + gb + NOISE_OVER - ln
        x = np.concatenate([zone * 10 ** (gz / 20), noise * 10 ** (gn / 20), quiet * 10 ** (gb / 20)])
        return limit(x, TP_CEILING_DB)

    # 後半のゲインを解く（ゲートとリミッターがあるので数回寄せる）
    gb = TARGET_LUFS - 2.0 - lb
    for _ in range(5):
        score, gr = render(gb)
        gb += TARGET_LUFS - integrated_lufs(score)
    score, gr = render(gb)
    assert len(score) == total * SPF

    pcm = np.clip(np.round(score * 32767), -32768, 32767).astype(np.int16)
    wav_path = os.path.join(OUT_DIR, "score.wav")
    wavfile.write(wav_path, SR, pcm)

    s = pcm.astype(np.float64) / 32768.0
    seg = lambda a, b: integrated_lufs(s[a * SPF : b * SPF])  # noqa: E731
    print(f"素材: zone の音楽 {lz:.1f} / noise {ln:.1f} / quiet {lb:.1f} LUFS")
    print(f"ゲイン: zone {lb + gb + ZONE_OVER - lz:+.2f} / noise {lb + gb + NOISE_OVER - ln:+.2f} / quiet {gb:+.2f} dB、リミッター最大 {gr:.2f} dB")
    print(f"integrated {integrated_lufs(s):.2f} LUFS / true peak {db(true_peak_env(s).max()):.2f} dBTP")
    print(
        f"区間: zone {seg(*sec['zone']):.1f} / cut {seg(*sec['cut']):.1f} / noise {seg(*sec['noise']):.1f} / "
        f"desktop〜終端 {seg(sec['desktop'][0], total):.1f} LUFS"
    )
    print(f"silence {sec['silence']} の最大値 {np.abs(pcm[sec['silence'][0] * SPF : sec['silence'][1] * SPF]).max()}（0 なら無音のまま）")

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
