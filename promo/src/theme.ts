import { Easing } from "remotion";
import { loadFont as loadMincho } from "@remotion/google-fonts/ZenOldMincho";
import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSansJP";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

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
  mincho: loadMincho("normal", {
    weights: ["700"],
    subsets: ["japanese", "latin"],
    ignoreTooManyRequestsWarning: true,
  }).fontFamily,
  sans: loadSans("normal", {
    weights: ["500", "700"],
    subsets: ["japanese", "latin"],
    // 日本語は Google Fonts 側で百数十個のチャンクに分かれているため、リクエスト数の警告は避けられない
    ignoreTooManyRequestsWarning: true,
  }).fontFamily,
  mono: loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily,
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
