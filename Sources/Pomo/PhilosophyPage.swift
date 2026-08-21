import SwiftUI

/// 「願い」ページ。作り手の声で語る物語（フック→問題→転回）→ 約束 → 着地、の構成（Issue #34 改）。
/// 物語のパートだけ明朝体 — フィールドノート（sans+mono）の中で、このページだけ
/// 「人が語っている」声色を作る意図的なコントラスト（見出し「願い」も明朝に含める）。
/// 約束は白カードで囲わず、mono の通し番号＋ヘアラインの索引スタイル
/// （420 幅では罫線5段のカードが単調な塊に見えるため。2026-08-20 ブラッシュアップ）。
/// 命令形は使わない — 感動させたくても、ユーザーに指図した瞬間このページの願いと矛盾する。
struct PhilosophyPage: View {
    /// ダッシュボードへ戻る（母艦はサイドバーを持たないので、戻り道はページ側が抱える）
    let back: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    sectionEyebrow("PHILOSOPHY")
                    Spacer()
                    BackToTimerLink(action: back)
                }
                Text("願い")
                    .font(.system(size: 22, weight: .semibold, design: .serif))
                    .foregroundStyle(Tokens.sumi)
            }
            .staggeredAppear(0)

            // ---- 物語（明朝・ゆったりした行間で「読ませる」） ----

            storyText("このアプリは、がんばりすぎるひとのために作られました。", size: 17, weight: .semibold)
                .padding(.top, 2)
                .staggeredAppear(1)

            VStack(alignment: .leading, spacing: 22) {
                storyText("「25分たったので、集中を切ってください」——\nタイマーにそう言われて、戸惑ったことはありませんか。せっかく乗ってきたところなのに。ポモドーロは素晴らしい発明ですが、いちばん大切なものを守ってくれないことがあります。あなたの、流れです。")
                storyText("それでも、タイマーなしで働くと、もっと悪いことが起きます。気づけば3時間。目は乾き、肩は固まり、それでも「キリのいいところまで」と続けてしまう。がんばるひとほど、休むのが下手なのです。")
                storyText("だから Fika は、順番を逆にしました。作業は、好きなだけ。止めたそのとき、働いた時間に応じた休憩が「貯まって」います。休憩は義務ではなく、報酬。ストリークも、点数も、説教もありません。道具が人を責めるのは、間違っていると思うからです。")
            }
            .staggeredAppear(2)

            // ---- 約束（物語の帰結。番号付きの静かな索引） ----

            VStack(alignment: .leading, spacing: 16) {
                Divider().overlay(Tokens.line)
                sectionEyebrow("PROMISES")
                VStack(alignment: .leading, spacing: 15) {
                    promiseRow(1, "罪悪感を生まない", "中断も延長も評価せず、履歴にも残しません。")
                    promiseRow(2, "看守ではなく、秘書", "何も強制しません。逃げ道はいつも開いています。")
                    promiseRow(3, "記録を求めない", "アカウントも送信もなし。設定以外は保存しません。")
                    promiseRow(4, "集中を奪わない", "パネルはフォーカスを取らず、静かにそこにいるだけ。")
                    promiseRow(5, "休憩は報酬", "受け取るタイミングを決めるのは、いつもあなたです。")
                }
            }
            .padding(.top, 4)
            .staggeredAppear(3)

            // ---- 着地 ----

            VStack(alignment: .leading, spacing: 16) {
                Divider().overlay(Tokens.line)
                storyText("集中して、ちゃんと休む。\nそれを静かに支えるだけの道具として、Fika はここにいます。", size: 15, weight: .medium)
                HStack(spacing: 12) {
                    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
                    Text("Fika v\(version)")
                    Text("local-first flow timer")
                }
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .tracking(0.5)
                .foregroundStyle(Tokens.sumiTertiary)
            }
            .padding(.top, 4)
            .staggeredAppear(4)
        }
        // 母艦が 420 幅なので、この時点で物語は読める行長（1行 ~25字）に収まっている
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 部品

    private func storyText(_ text: String, size: CGFloat = 14.5, weight: Font.Weight = .regular) -> some View {
        Text(text)
            .font(.system(size: size, weight: weight, design: .serif))
            .foregroundStyle(Tokens.sumi.opacity(0.85))
            .lineSpacing(8)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func promiseRow(_ index: Int, _ title: String, _ body: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            // mono の番号 = 機械が読む情報の記法（フィールドノートの索引らしさ）。色はアクセントを文字だけに
            Text(String(format: "%02d", index))
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .tracking(0.5)
                .foregroundStyle(Tokens.kohakuText)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .pomoFont(13, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
                Text(body)
                    .pomoFont(12)
                    .foregroundStyle(Tokens.sumiSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
