import SwiftUI

/// 直近14日のセッションを日別に一覧。メモ付き JSONL がこのアプリの差別化資産 — 見返す場所
struct SessionsPage: View {
    @ObservedObject var store: SessionStore

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "M月d日（E）"
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 6) {
                Text("セッション")
                    .pomoFont(28, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
                Text("直近14日の記録。中断も延長も、ぜんぶただの事実。")
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumiSecondary)
            }
            .staggeredAppear(0)

            if store.recentByDay.isEmpty {
                Text("まだ記録はありません。タイマーを回すと、ここに積み上がっていきます。")
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumiSecondary)
                    .padding(.vertical, 8)
                    .pomoCard()
                    .staggeredAppear(1)
            } else {
                ForEach(Array(store.recentByDay.enumerated()), id: \.element.date) { index, day in
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            sectionLabel(Self.dayLabel(day.date))
                            Text("\(day.entries.filter(\.completed).count) セッション · \(hmString(day.entries.filter(\.completed).reduce(0) { $0 + $1.durationSec }))")
                                .font(.system(size: 11, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(Tokens.sumiTertiary)
                        }
                        SessionListCard(entries: day.entries)
                    }
                    .staggeredAppear(min(index + 1, 6)) // 遅延の上限は 240ms（下の方まで待たせない）
                }
            }
        }
    }

    private static func dayLabel(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "今日" }
        if cal.isDateInYesterday(date) { return "昨日" }
        return dayFormat.string(from: date)
    }
}
