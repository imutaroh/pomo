import SwiftUI

/// 「願い」ページ。このアプリが守る約束を淡々と並べる（Issue #34）。
/// ユーザーへの助言・標語は書かない — 説教はこのアプリが最も嫌う「圧」なので、
/// 「何をしないか」をアプリ自身の約束として述べるだけにする。
struct PhilosophyPage: View {
    private struct Promise: Identifiable {
        let id: String   // タイトルがそのまま識別子
        let body: String
        init(_ title: String, _ body: String) {
            self.id = title
            self.body = body
        }
        var title: String { id }
    }

    private static let promises: [Promise] = [
        Promise("罪悪感を生まない",
                "ストリークも、先週比も、評価の言葉もありません。中断や延長は失敗ではなく、ただの事実として記録されます。"),
        Promise("看守ではなく、秘書",
                "何も強制しません。全画面の休憩にも「小さく」と「スキップ」の逃げ道が常にあります。通話・会議中は割り込みません。"),
        Promise("あなたのデータは、あなたのもの",
                "アカウントも、テレメトリも、外部送信もありません。記録は手元のファイル（JSONL）に1行ずつ積まれ、いつでも持ち出せます。"),
        Promise("集中を奪わない",
                "フローティングパネルはフォーカスを取りません。作業している間、Pomo は静かにそこにいるだけです。"),
        Promise("休憩は義務ではなく、報酬",
                "フローで働いた時間の分だけ、休憩が貯まります。受け取るタイミングを決めるのは、いつもあなたです。"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                sectionEyebrow("PHILOSOPHY")
                Text("願い")
                    .pomoFont(24, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
                Text("Pomo がつくられたときの約束。機能よりも先に、これらを守ります。")
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumiSecondary)
            }
            .staggeredAppear(0)

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(Self.promises.enumerated()), id: \.element.id) { index, p in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(p.title)
                            .pomoFont(15, weight: .semibold)
                            .foregroundStyle(Tokens.sumi)
                        Text(p.body)
                            .pomoFont(13)
                            .foregroundStyle(Tokens.sumiSecondary)
                            .lineSpacing(3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 18)
                    .accessibilityElement(children: .combine)
                    if index != Self.promises.count - 1 {
                        Divider().overlay(Tokens.line)
                    }
                }
            }
            .pomoCard()
            .staggeredAppear(1)

            // 静かなフッター（mono = 機械が読む情報）
            HStack(spacing: 12) {
                let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
                Text("Pomo v\(version)")
                Text("local-first pomodoro")
            }
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .tracking(0.5)
            .foregroundStyle(Tokens.sumiTertiary)
            .staggeredAppear(2)
        }
    }
}
