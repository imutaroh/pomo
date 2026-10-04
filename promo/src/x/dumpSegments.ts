// segments.ts を JSON に書き出す（audio/x.py と src/x/edges.py が読む。数値を二重に持たないため）。
// 実行: npm run x:segments（promo/ で）
import { writeFileSync } from "node:fs";
import { SEGMENTS, X_DURATION } from "./segments";

const out = "audio/out/x-segments.json";
writeFileSync(out, JSON.stringify({ fps: 30, duration: X_DURATION, segments: SEGMENTS.map(({ id, from, to }) => ({ id, from, to })) }, null, 2) + "\n");
console.log(`${out}: ${SEGMENTS.length} 区間 / ${X_DURATION}f（${(X_DURATION / 30).toFixed(2)} 秒）`);
