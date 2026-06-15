import SwiftUI

/// 統計ページ。旧「きろく」の中身（中立比較・草ヒートマップ・7日チャート）。
/// 罪悪感ゼロの原則: ストリーク・%増減・評価語を出さず、裸の事実だけを並べる。
struct StatsPage: View {
    @ObservedObject var store: SessionStore

    /// 全セルが 0秒 なら初回ユーザーとみなす
    private var isEmpty: Bool {
        store.heatWeeks.flatMap({ $0 }).allSatisfy({ $0.seconds == 0 })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            header.staggeredAppear(0)
            if isEmpty {
                emptyState.staggeredAppear(1)
            } else {
                heatmapSection.staggeredAppear(1)
                chartSection.staggeredAppear(2)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("統計")
                .pomoFont(28, weight: .semibold)
                .foregroundStyle(Tokens.sumi)
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text(hmString(store.todaySeconds))
                    .font(.system(size: 42, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Tokens.sumi)
                Text("\(store.todayCount) セッション")
                    .pomoFont(15, weight: .medium)
                    .foregroundStyle(Tokens.sumi.opacity(0.5))
            }
            // 中立比較: 裸の事実のみ（%・矢印・評価語なし）
            Text("昨日 \(hmString(store.yesterdaySeconds)) · 直近7日平均 \(hmString(store.weekAvgSeconds))/日")
                .pomoFont(12)
                .foregroundStyle(Tokens.sumiSecondary)
        }
    }

    private var emptyState: some View {
        Text("タイマーを回すと、ここに記録が積み上がっていきます。")
            .pomoFont(13)
            .foregroundStyle(Tokens.sumiSecondary)
            .pomoCard()
    }

    // GitHub の草。罪悪感装置（連続日数カウンター・空白の強調）は意図的に持たない
    private var heatmapSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("つみあげ（直近26週）")
            VStack(alignment: .leading, spacing: 4) {
                // monthLabels と cell HStack を一緒にスクロールして縦の位置を同期する
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 4) {
                        monthLabels
                        HStack(alignment: .top, spacing: 3) {
                            ForEach(store.heatWeeks.indices, id: \.self) { w in
                                VStack(spacing: 3) {
                                    ForEach(store.heatWeeks[w]) { day in
                                        RoundedRectangle(cornerRadius: 3)
                                            .fill(Self.heatColor(day))
                                            .frame(width: 13, height: 13)
                                            .help(Self.heatTooltip(day))
                                    }
                                }
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                }
                heatLegend
            }
            .pomoCard()
        }
    }

    private var monthLabels: some View {
        HStack(spacing: 3) {
            ForEach(store.heatWeeks.indices, id: \.self) { w in
                Text(Self.monthLabel(weeks: store.heatWeeks, index: w))
                    .pomoFont(9)
                    .foregroundStyle(Tokens.sumiTertiary)
                    .lineLimit(1)
                    .frame(width: 13, alignment: .leading)
            }
        }
        .frame(height: 12)
        .clipped()
    }

    private var heatLegend: some View {
        HStack(spacing: 3) {
            Spacer()
            Text("少")
                .pomoFont(9)
                .foregroundStyle(Tokens.sumiTertiary)
            ForEach([0, 15, 60, 120, 200], id: \.self) { minutes in
                RoundedRectangle(cornerRadius: 3)
                    .fill(Self.heatColor(HeatDay(date: .distantPast, seconds: minutes * 60, inRange: true)))
                    .frame(width: 13, height: 13)
            }
            Text("多")
                .pomoFont(9)
                .foregroundStyle(Tokens.sumiTertiary)
        }
        .padding(.top, 6)
    }

    private static func monthLabel(weeks: [[HeatDay]], index: Int) -> String {
        guard let first = weeks[index].first?.date else { return "" }
        let month = Calendar.current.component(.month, from: first)
        if index == 0 { return "\(month)月" }
        guard let prev = weeks[index - 1].first?.date else { return "" }
        let prevMonth = Calendar.current.component(.month, from: prev)
        return month != prevMonth ? "\(month)月" : ""
    }

    /// しきい値は固定（自分比の相対値だと「最近さぼってる」演出になるため、解釈可能な絶対値で）
    private static func heatColor(_ d: HeatDay) -> Color {
        guard d.inRange else { return .clear }
        switch d.seconds / 60 {
        case 0: return Tokens.sumi.opacity(0.06)
        case ..<30: return Tokens.kohaku.opacity(0.3)
        case ..<90: return Tokens.kohaku.opacity(0.55)
        case ..<180: return Tokens.kohaku.opacity(0.85)
        default: return Tokens.kohakuDeep
        }
    }

    private static let heatDate: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "M月d日"
        return f
    }()

    private static func heatTooltip(_ d: HeatDay) -> String {
        guard d.inRange else { return "" }
        let date = heatDate.string(from: d.date)
        return d.seconds > 0 ? "\(date) · \(hmString(d.seconds))" : "\(date) · 記録なし"
    }

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("直近7日")
            WeekChart(days: store.days).pomoCard()
        }
    }
}
