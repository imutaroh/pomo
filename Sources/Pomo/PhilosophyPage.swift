import SwiftUI

/// 「願い」ページ。作り手の声で語る物語（フック→問題→転回）→ 約束 → 着地、の構成（Issue #34 改）。
/// 物語のパートだけ明朝体 — フィールドノート（sans+mono）の中で、このページだけ
/// 「人が語っている」声色を作る意図的なコントラスト。
/// 命令形は使わない — 感動させたくても、ユーザーに指図した瞬間このページの願いと矛盾する。
struct PhilosophyPage: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 8) {
                sectionEyebrow("PHILOSOPHY")
                Text("願い")
                    .pomoFont(24, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
            }
            .staggeredAppear(0)

            // ---- 物語（明朝・ゆったりした行間で「読ませる」） ----

            storyText("このアプリは、がんばりすぎるひとのために作られました。", size: 17, weight: .semibold)
                .staggeredAppear(1)

            VStack(alignment: .leading, spacing: 20) {
                storyText("「25分たったので、集中を切ってください」——\nタイマーにそう言われて、戸惑ったことはありませんか。せっかく乗ってきたところなのに。ポモドーロは素晴らしい発明ですが、いちばん大切なものを守ってくれないことがあります。あなたの、流れです。")
                storyText("それでも、タイマーなしで働くと、もっと悪いことが起きます。気づけば3時間。目は乾き、肩は固まり、それでも「キリのいいところまで」と続けてしまう。がんばるひとほど、休むのが下手なのです。")
                storyText("だから Pomo は、順番を逆にしました。作業は、好きなだけ。止めたそのとき、働いた時間に応じた休憩が「貯まって」います。休憩は義務ではなく、報酬。ストリークも、点数も、説教もありません。道具が人を責めるのは、間違っていると思うからです。")
            }
            .staggeredAppear(2)

            // ---- 約束（物語の帰結として、静かな罫線リスト） ----

            VStack(alignment: .leading, spacing: 0) {
                sectionEyebrow("PROMISES")
                    .padding(.bottom, 6)
                promiseRow("罪悪感を生まない", "中断も延長も、ただの事実として記録します。")
                promiseRow("看守ではなく、秘書", "何も強制しません。逃げ道はいつも開いています。")
                promiseRow("データはあなたのもの", "アカウントも送信もなし。記録は手元の1ファイルに。")
                promiseRow("集中を奪わない", "パネルはフォーカスを取らず、静かにそこにいるだけ。")
                promiseRow("休憩は報酬", "受け取るタイミングを決めるのは、いつもあなたです。", last: true)
            }
            .pomoCard()
            .staggeredAppear(3)

            // ---- 着地 ----

            VStack(alignment: .leading, spacing: 16) {
                storyText("集中して、ちゃんと休む。\nそれを静かに支えるだけの道具として、Pomo はここにいます。", size: 15, weight: .medium)
                HStack(spacing: 12) {
                    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
                    Text("Pomo v\(version)")
                    Text("local-first pomodoro")
                }
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .tracking(0.5)
                .foregroundStyle(Tokens.sumiTertiary)
            }
            .staggeredAppear(4)
        }
        .frame(maxWidth: 560, alignment: .leading) // 物語は読める行長に絞る（1行 ~35字）
    }

    // MARK: - 部品

    private func storyText(_ text: String, size: CGFloat = 14.5, weight: Font.Weight = .regular) -> some View {
        Text(text)
            .font(.system(size: size, weight: weight, design: .serif))
            .foregroundStyle(Tokens.sumi.opacity(0.85))
            .lineSpacing(7)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func promiseRow(_ title: String, _ body: String, last: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(title)
                    .pomoFont(13.5, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
                    .frame(width: 150, alignment: .leading)
                Text(body)
                    .pomoFont(12.5)
                    .foregroundStyle(Tokens.sumiSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 12)
            .accessibilityElement(children: .combine)
            if !last {
                Divider().overlay(Tokens.line)
            }
        }
    }
}
