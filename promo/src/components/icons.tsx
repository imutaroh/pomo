// SF Symbols は Remotion（Chromium）では描けないので、アプリで使っている記号を同じ形の SVG で描く。
// すべて 24×24 の viewBox。色は currentColor、太さは SF Symbols の semibold に寄せている。

export type IconName =
  | "play.fill"
  | "pause.fill"
  | "arrow.counterclockwise"
  | "cup.and.saucer.fill"
  | "goforward.plus"
  | "forward.end.fill"
  | "minus"
  | "plus"
  | "macwindow"
  | "dial";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const paths: Record<IconName, React.ReactNode> = {
  "play.fill": <path d="M7 4.6v14.8c0 .9 1 1.4 1.7.9l11.2-7.4c.6-.4.6-1.4 0-1.8L8.7 3.7C8 3.2 7 3.7 7 4.6z" fill="currentColor" />,
  "pause.fill": (
    <>
      <rect x="5.5" y="4" width="4.6" height="16" rx="1.2" fill="currentColor" />
      <rect x="13.9" y="4" width="4.6" height="16" rx="1.2" fill="currentColor" />
    </>
  ),
  "arrow.counterclockwise": (
    <>
      <path d="M5.2 12a7 7 0 1 0 2.1-5" {...stroke} />
      <path d="M7.6 2.8 7.3 7l4.2.4" {...stroke} />
    </>
  ),
  "cup.and.saucer.fill": (
    <>
      <path d="M4.5 7.5h11.3v5.2a5 5 0 0 1-5 5H9.5a5 5 0 0 1-5-5z" fill="currentColor" />
      <path d="M15.6 9h1.6a2.4 2.4 0 0 1 0 4.8h-1.9" {...stroke} strokeWidth={2} />
      <rect x="2.5" y="19" width="16" height="2" rx="1" fill="currentColor" />
    </>
  ),
  "goforward.plus": (
    <>
      <path d="M18.8 12A7 7 0 1 1 16.7 7" {...stroke} />
      <path d="M16.4 2.8 16.7 7l-4.2.4" {...stroke} />
      <path d="M12 9.2v5.6M9.2 12h5.6" {...stroke} strokeWidth={2} />
    </>
  ),
  "forward.end.fill": (
    <>
      <path d="M4.5 5.2v13.6c0 .8.9 1.3 1.6.8l9.6-6.8c.6-.4.6-1.2 0-1.6L6.1 4.4c-.7-.5-1.6 0-1.6.8z" fill="currentColor" />
      <rect x="16.8" y="4.5" width="2.8" height="15" rx="1" fill="currentColor" />
    </>
  ),
  minus: <path d="M5 12h14" {...stroke} />,
  plus: <path d="M12 5v14M5 12h14" {...stroke} />,
  macwindow: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3" {...stroke} strokeWidth={2} />
      <path d="M3 9h18" {...stroke} strokeWidth={2} />
    </>
  ),
  // メニューバーのブランドマーク（MenuBarController.dialIcon）: 270°の弧＋中心点。左上の90°が欠ける
  dial: (
    <>
      <path d="M12 3.7A8.3 8.3 0 1 1 3.7 12" {...stroke} strokeWidth={2.9} />
      <circle cx="12" cy="12" r="2.3" fill="currentColor" />
    </>
  ),
};

export const Icon: React.FC<{ name: IconName; size: number; color?: string; style?: React.CSSProperties }> = ({
  name,
  size,
  color,
  style,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ color, display: "block", ...style }}>
    {paths[name]}
  </svg>
);
