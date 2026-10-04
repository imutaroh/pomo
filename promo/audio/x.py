"""X 投稿版（QuietPromoX）の音を、本編のスコアから区間を切り出してつないで作る。

入力:  ../public/score.wav があればそれ、無ければ out/score.wav（npm run audio の中間ファイル）
       out/x-segments.json（npm run x:segments が src/x/segments.ts から書き出す。区間を二重に持たない）
出力:  out/score-x.wav（16bit PCM の中間）と ../public/score-x.mp3

- 前の区間の to と次の区間の from が同じ所（本編で連続している所）は 1 区間にまとめてから切り出す。
  そこに等パワーのクロスフェードを掛けると、前後が同じ信号なので sin+cos で最大 +3dB 膨らむため
- 本当に切っている継ぎ目だけ、XFADE_MS の等パワーのクロスフェード。継ぎ目の前後に半分ずつ掛けるので、全体の長さは区間の合計のまま
  （絵とのずれが出ない）。本編の音は継ぎ目の外側にも続いているので、その分を借りて重ねる
- 末尾は本編の途中で切るので、最後の TAIL_MS で絞る
- 全体を -14 LUFS / True Peak -1.0 dBTP 以下へ。測り方とリミッターは mix.py と同じもの
  （本編はすでにマスタリング済みなので、ゲインはほぼ 0 dB 付近の小さな補正になる）

再生成: cd promo && npm run audio:x
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile

from mix import MP3_BITRATE, SPF, SR, TARGET_LUFS, TP_CEILING_DB, db, integrated_lufs, limit, true_peak_env

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "out")
SOURCES = [os.path.join(HERE, "..", "public", "score.wav"), os.path.join(OUT_DIR, "score.wav")]
SEGMENTS = os.path.join(OUT_DIR, "x-segments.json")
WAV_OUT = os.path.join(OUT_DIR, "score-x.wav")
MP3_OUT = os.path.join(HERE, "..", "public", "score-x.mp3")

XFADE_MS = 30
TAIL_MS = 400


def main() -> None:
    src_path = next((p for p in SOURCES if os.path.exists(p)), None)
    if src_path is None:
        sys.exit("score.wav が無い。先に npm run audio を実行する")
    sr, pcm = wavfile.read(src_path)
    assert sr == SR and pcm.ndim == 2 and pcm.dtype == np.int16, f"{src_path}: 48kHz・ステレオ・16bit ではない"
    src = pcm.astype(np.float64) / 32768.0

    with open(SEGMENTS, encoding="utf-8") as fh:
        segs = json.load(fh)["segments"]
    assert segs[-1]["to"] * SPF <= len(src), "区間が本編の音より長い"

    # 本編で連続している区間をまとめる（ここには継ぎ目を作らない）
    runs: list[dict] = []
    for s in segs:
        if runs and runs[-1]["to"] == s["from"]:
            runs[-1] = {"id": f"{runs[-1]['id']}+{s['id']}", "from": runs[-1]["from"], "to": s["to"]}
        else:
            runs.append(dict(s))

    half = int(XFADE_MS / 1000 * SR) // 2
    n = 2 * half
    t = (np.arange(n) + 0.5) / n
    fade_in = np.sin(t * np.pi / 2)[:, None]
    fade_out = np.cos(t * np.pi / 2)[:, None]

    parts: list[np.ndarray] = []
    for i, s in enumerate(runs):
        a, b = s["from"] * SPF, s["to"] * SPF
        # 継ぎ目に面する端は half サンプル外側まで借りる（頭は前の区間と、尻は次の区間と重ねる）
        lo = a - half if i > 0 else a
        hi = b + half if i < len(runs) - 1 else b
        assert lo >= 0 and hi <= len(src), f"{s['id']}: 継ぎ目のための余白が本編の外にはみ出す"
        x = src[lo:hi].copy()
        if i > 0:
            x[:n] *= fade_in
        if i < len(runs) - 1:
            x[-n:] *= fade_out
        parts.append(x)

    # 前の区間の尻 n サンプルと次の区間の頭 n サンプルを足し合わせる
    out = parts[0]
    for x in parts[1:]:
        out = np.concatenate([out[:-n], out[-n:] + x[:n], x[n:]])
    total = sum(s["to"] - s["from"] for s in segs) * SPF
    assert len(out) == total, (len(out), total)

    tail = int(TAIL_MS / 1000 * SR)
    out[-tail:] *= np.cos(np.linspace(0, np.pi / 2, tail))[:, None]

    # ラウドネスを合わせる（リミッターで少し下がるので数回寄せる）
    gain = 0.0
    for _ in range(5):
        y, gr = limit(out * 10 ** (gain / 20), TP_CEILING_DB)
        gain += TARGET_LUFS - integrated_lufs(y)
    y, gr = limit(out * 10 ** (gain / 20), TP_CEILING_DB)

    pcm_out = np.clip(np.round(y * 32767), -32768, 32767).astype(np.int16)
    wavfile.write(WAV_OUT, SR, pcm_out)
    s16 = pcm_out.astype(np.float64) / 32768.0
    print(f"素材: {os.path.relpath(src_path, os.getcwd())}（{integrated_lufs(src):.2f} LUFS）")
    spans = ", ".join("{id} {from}-{to}".format(**s) for s in runs)
    print(f"区間: {spans}（つなぎ目 {XFADE_MS}ms）")
    print(f"長さ {len(s16) / SR:.3f} 秒 / ゲイン {gain:+.2f} dB / リミッター最大 {gr:.2f} dB")
    print(f"integrated {integrated_lufs(s16):.2f} LUFS / true peak {db(true_peak_env(s16).max()):.2f} dBTP")

    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", WAV_OUT,
         "-c:a", "libmp3lame", "-b:a", MP3_BITRATE, "-ar", str(SR), "-ac", "2", MP3_OUT],
        check=True,
    )
    print(f"書き出し: {os.path.relpath(MP3_OUT, os.getcwd())}")


if __name__ == "__main__":
    sys.exit(main())
