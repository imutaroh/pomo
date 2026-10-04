import { cancelRender, continueRender, delayRender, Easing, staticFile } from "remotion";

// フォントは public/fonts/ に同梱した TTF（SIL OFL 1.1、ライセンスは同じフォルダ）から読む。
// Google Fonts から読むと日本語が百数十のチャンクに分かれ、並列の書き出しで取得が詰まってタイムアウトしたため
const loadLocalFont = (family: string, file: string, weight: string) => {
  // audio/cues.ts が Node からこのファイルを読み込むので、ブラウザ以外では何もしない
  if (typeof FontFace === "undefined" || typeof document === "undefined") return;
  const handle = delayRender(`Loading font ${file}`, { timeoutInMilliseconds: 120000 });
  const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format("truetype")`, { weight });
  face
    .load()
    .then(() => {
      document.fonts.add(face);
      continueRender(handle);
    })
    .catch((err) => cancelRender(err));
};

const MINCHO = "Zen Old Mincho";
const SANS = "IBM Plex Sans JP";
const MONO = "IBM Plex Mono";
loadLocalFont(MINCHO, "ZenOldMincho-Bold.ttf", "700");
loadLocalFont(SANS, "IBMPlexSansJP-Medium.ttf", "500");
loadLocalFont(SANS, "IBMPlexSansJP-Bold.ttf", "700");
loadLocalFont(MONO, "IBMPlexMono-Medium.ttf", "500");
loadLocalFont(MONO, "IBMPlexMono-Bold.ttf", "700");

// 色はアプリ（Sources/Pomo/DesignTokens.swift）と LP（docs/index.html）のトークンをそのまま使う
export const color = {
  sumi: "#1A2330",
  teal: "#0087A8",
  tealDeep: "#00708C",
  tealText: "#005F77",
  washi: "#FAFBFC",
  usugumo: "#F0F3F6",
  line: "#E3E8ED",
  night: "#141F2B",
  // ノイズ側だけの色。Quiet のトークンには存在しない「うるさい色」
  alarm: "#FF3B30",
  warn: "#FFD60A",
};

export const font = {
  mincho: `"${MINCHO}"`,
  sans: `"${SANS}"`,
  mono: `"${MONO}"`,
};

// 静かな側の出入りに使う減速カーブ（v1 から共通）
export const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

// 秒数 → "52:10" / "1:02:03"
export const formatTime = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
