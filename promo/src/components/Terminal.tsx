import { color, font } from "../theme";

// macOS のターミナル風ウィンドウ。typed 文字ぶんだけコマンドを表示し、キャレットを点滅させる。
// 文字送りの計算（何フレームで何文字）は呼び出し側が決める。

export const Terminal: React.FC<{
  command: string;
  /** 表示する文字数（command.length 以上で全文） */
  typed: number;
  frame: number;
  /** コマンドの後に出す出力行 */
  output?: string[];
  width?: number;
  fontSize?: number;
  title?: string;
}> = ({ command, typed, frame, output = [], width = 1500, fontSize = 30, title = "zsh" }) => {
  const shown = command.slice(0, Math.max(0, Math.floor(typed)));
  const done = typed >= command.length;
  const caretOn = Math.floor(frame / 15) % 2 === 0 || !done;

  return (
    <div
      style={{
        width,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: color.night,
        boxShadow: "0 40px 100px rgba(20,31,43,0.35), 0 0 0 1px rgba(255,255,255,0.06)",
        fontFamily: font.mono,
      }}
    >
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px",
          backgroundColor: "#1C2836",
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span key={c} style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: c }} />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            marginRight: 72,
            fontFamily: font.sans,
            fontSize: 16,
            fontWeight: 500,
            color: "rgba(250,251,252,0.5)",
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: "30px 34px 36px", fontSize, lineHeight: 1.6, color: color.washi, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        <span style={{ color: color.teal }}>~ % </span>
        {shown}
        {caretOn ? (
          <span
            style={{
              display: "inline-block",
              width: fontSize * 0.58,
              height: fontSize * 1.1,
              verticalAlign: "text-bottom",
              backgroundColor: "rgba(250,251,252,0.85)",
            }}
          />
        ) : null}
        {output.map((line, i) => (
          <div key={i} style={{ color: "rgba(250,251,252,0.6)" }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};
