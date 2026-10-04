"""X 版の上下の帯の色表（src/x/edges.gen.ts）を作る。

帯を映像の延長に見せるため、本編の各フレームの上端・下端の行の平均色を帯の地にする。
Remotion からは描いた絵の画素を読めないので、本編を小さく書き出した動画（npm run x:edges が作る）から測る。

入力:  audio/out/x-edges.mp4（本編 QuietPromo を --scale=0.125 で書き出したもの）
       audio/out/x-segments.json（npm run x:segments）
出力:  src/x/edges.gen.ts（区間ごとに、本編のフレーム順の上端・下端の色）

本編の絵を変えたら npm run x:edges で作り直す。
"""

from __future__ import annotations

import json
import os
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROMO = os.path.join(HERE, "..", "..")
VIDEO = os.path.join(PROMO, "audio", "out", "x-edges.mp4")
SEGMENTS = os.path.join(PROMO, "audio", "out", "x-segments.json")
OUT = os.path.join(HERE, "edges.gen.ts")

# 端から何行を平均するか（--scale=0.125 で 2 行 = 本編の 16px = X 版の 9px）。
# 1 行目だけだと縮小と圧縮のにじみを拾う
ROWS = 2


def main() -> None:
    w, h = (
        int(v)
        for v in subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", VIDEO],
            capture_output=True, text=True, check=True,
        ).stdout.strip().split(",")
    )
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", VIDEO, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True,
    ).stdout
    v = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3).astype(np.float64)
    top = np.round(v[:, :ROWS].mean(axis=(1, 2))).astype(int)
    bottom = np.round(v[:, -ROWS:].mean(axis=(1, 2))).astype(int)

    with open(SEGMENTS, encoding="utf-8") as fh:
        segs = json.load(fh)["segments"]
    assert segs[-1]["to"] <= len(v), f"本編の書き出しが短い（{len(v)}f）"

    hexes = lambda rows: "".join("%02x%02x%02x" % tuple(c) for c in rows)  # noqa: E731
    lines = [
        "// npm run x:edges が src/x/edges.py で生成する。手で編集しない。",
        "// 本編の各フレームの上端・下端の平均色（6 桁の hex を連結）。区間は segments.ts と同じ",
        "export const EDGES: { from: number; to: number; top: string; bottom: string }[] = [",
    ]
    for s in segs:
        a, b = s["from"], s["to"]
        lines.append(f'  {{ from: {a}, to: {b}, top: "{hexes(top[a:b])}", bottom: "{hexes(bottom[a:b])}" }},')
    lines.append("];")
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"{os.path.relpath(OUT, PROMO)}: {len(segs)} 区間 / 本編 {len(v)}f（{w}×{h}）から")


if __name__ == "__main__":
    main()
