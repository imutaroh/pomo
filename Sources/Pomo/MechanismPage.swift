import SwiftUI

/// 「仕組み」ページ。フロータイマーという手法そのものと、Fika がそれをどう実装しているかを説明する。
/// 「願い」が作り手の声（明朝）で語るのに対し、こちらは説明なので本文は sans のまま。
/// 唯一の例外が結び（名前の由来）で、そこだけ声色を明朝に切り替える。
struct MechanismPage: View {
    /// ダッシュボードへ戻る（母艦はサイドバーを持たないので、戻り道はページ側が抱える）
    let back: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    sectionEyebrow("MECHANISM")
                    Spacer()
                    BackToTimerLink(action: back)
                }
                Text("フロータイマーとは")
                    .pomoFont(18, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
            }
            .staggeredAppear(0)

            Text("Fika の中心にあるのは、フロータイマー——決められた時間で区切るのではなく、集中が続くかぎり測りつづけるタイマーです。")
                .pomoFont(14)
                .foregroundStyle(Tokens.sumi.opacity(0.85))
                .lineSpacing(6)
                .fixedSize(horizontal: false, vertical: true)
                .staggeredAppear(1)

            bodyText("これは新しい発明ではありません。海外では Flowtime Technique や Third Time と呼ばれ、ポモドーロの「25分で強制的に切る」ことへの答えとして確立されてきた手法です。作業はカウントアップで測り、止めたくなったときに止める。休憩の長さは、直前に働いた時間から決まります。")
                .staggeredAppear(2)

            VStack(alignment: .leading, spacing: 0) {
                NumberedRow(number: "01", title: "測る",
                            detail: "パネルが作業時間を静かに数えます。手を止めるまで、区切りは来ません。")
                NumberedRow(number: "02", title: "止める",
                            detail: "集中が切れたら、自分で止めます。そのとき、働いた時間に応じた休憩が貯まっています。割合は設定で変えられます。")
                NumberedRow(number: "03", title: "休む",
                            detail: "貯まった休憩が画面いっぱいに広がります。会議中は遠慮します。キーボードは奪いません。")
                NumberedRow(number: "04", title: "残らない",
                            detail: "何も記録されません。今回どれだけやったかを見て、次に進むだけです。", last: true)
            }
            .pomoCard()
            .staggeredAppear(3)

            VStack(alignment: .leading, spacing: 16) {
                Divider().overlay(Tokens.line)
                bodyText("時間割で休憩を割り込ませるアプリとも、集中の統計を積み上げるフロータイマーとも、Fika は少し違います。休憩はスケジュールではなく報酬として届き、記録は増えるのではなく消えていきます。")
            }
            .staggeredAppear(4)

            // 名前の由来だけは説明ではなく「声」なので、願いのページと同じ明朝に切り替える
            Text("スウェーデンには、仕事の手を止めてコーヒーを飲む時間に名前があります——fika（フィーカ）。義務ではなく、文化としての休憩。このアプリが目指すものに、いちばん近い言葉でした。")
                .font(.system(size: 14.5, weight: .regular, design: .serif))
                .foregroundStyle(Tokens.sumi.opacity(0.85))
                .lineSpacing(7)
                .fixedSize(horizontal: false, vertical: true)
                .staggeredAppear(5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func bodyText(_ text: String) -> some View {
        Text(text)
            .pomoFont(13)
            .foregroundStyle(Tokens.sumiSecondary)
            .lineSpacing(5)
            .fixedSize(horizontal: false, vertical: true)
    }
}
