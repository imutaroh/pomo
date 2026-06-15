import Charts
import SwiftUI

// 母艦ウィンドウの4ページで共用する部品（白カード・見出し・時間表記・週チャート）

extension View {
    /// 白カード（Apple Health 風）: 純白 + 細い縁 + 二層の柔らかい影で生成り背景から浮かせる
    func pomoCard() -> some View {
        padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: Tokens.radiusCard)
                    .fill(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: Tokens.radiusCard)
                            .strokeBorder(Tokens.sumi.opacity(0.05), lineWidth: 1)
                    )
            )
            .compositingGroup()
            // 接地の締まった影 + 大きく拡散する環境光の影（浮遊感）
            .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
            .shadow(color: Tokens.sumi.opacity(0.07), radius: 22, y: 9)
    }

    /// ページ表示時に上から順に静かにフェードインする（index ごとに 40ms 遅延、跳ねない）
    func staggeredAppear(_ index: Int) -> some View {
        modifier(StaggeredAppear(index: index))
    }
}

struct StaggeredAppear: ViewModifier {
    let index: Int
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 6)
            .onAppear {
                withAnimation(.easeOut(duration: 0.45).delay(Double(index) * 0.04)) {
                    shown = true
                }
            }
    }
}

func sectionLabel(_ text: String) -> some View {
    Text(text)
        .pomoFont(12, weight: .medium)
        .foregroundStyle(Tokens.sumiSecondary)
}

/// 秒数 → 「Xh Ym」（1時間未満は「Ym」）。コンパクト表記で統一（MM:SS のタイマーと誤読しないよう h/m を明記）
func hmString(_ seconds: Int) -> String {
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    return h > 0 ? "\(h)h \(m)m" : "\(m)m"
}

/// 直近7日の棒グラフ。ダッシュボード「今週の推移」と統計ページで共用。
/// 表示時にバーが下から伸びる（ease-out、跳ねない）
struct WeekChart: View {
    let days: [DaySummary]
    @State private var grown = false

    var body: some View {
        Chart(days) { day in
            BarMark(
                x: .value("日", day.date, unit: .day),
                y: .value("分", grown ? Double(day.workSeconds) / 60.0 : 0)
            )
            .foregroundStyle(Tokens.kohaku)
            .cornerRadius(Tokens.radiusChip)
        }
        // 伸びるアニメーション中に軸スケールが暴れないよう、分母は実データで固定
        .chartYScale(domain: 0...max(30, days.map { Double($0.workSeconds) / 60.0 }.max() ?? 30))
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) { grown = true }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day)) { _ in
                AxisValueLabel(format: .dateTime.weekday(.abbreviated), centered: true)
            }
        }
        .chartYAxis {
            AxisMarks { value in
                AxisGridLine().foregroundStyle(Tokens.sumi.opacity(0.06))
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text("\(Int(v))分")
                    }
                }
            }
        }
        .frame(minHeight: 150, maxHeight: 200)
    }
}

struct SessionRow: View {
    let entry: SessionLogger.ParsedEntry
    @State private var hovered = false

    private static let time: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(Self.time.string(from: entry.start)) – \(Self.time.string(from: entry.end))")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Tokens.sumi)
                .layoutPriority(1)
            if let memo = entry.memo, !memo.isEmpty {
                Text(memo)
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumi.opacity(0.7))
                    .lineLimit(2)
                    .layoutPriority(0)
            }
            Spacer()
            if entry.interrupted {
                // 中断は失敗ではなく事実。色は付けない
                Text("中断")
                    .pomoFont(11)
                    .foregroundStyle(Tokens.sumiSecondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Tokens.sumi.opacity(0.05)))
            }
            Text("\(entry.durationSec / 60)分")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Tokens.sumi.opacity(0.5))
                .layoutPriority(1)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 13)
        .background(Tokens.sumi.opacity(hovered ? 0.03 : 0))
        .animation(.easeOut(duration: 0.15), value: hovered)
        .onHover { hovered = $0 }
    }
}

/// SessionRow をリスト状に積む白カード（区切り線付き）
struct SessionListCard: View {
    let entries: [SessionLogger.ParsedEntry]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(entries) { e in
                SessionRow(entry: e)
                if e.id != entries.last?.id {
                    Divider().overlay(Tokens.sumi.opacity(0.05))
                }
            }
        }
        .background(RoundedRectangle(cornerRadius: Tokens.radiusCard).fill(Color.white))
        .clipShape(RoundedRectangle(cornerRadius: Tokens.radiusCard))
        .overlay(
            RoundedRectangle(cornerRadius: Tokens.radiusCard)
                .strokeBorder(Tokens.sumi.opacity(0.05), lineWidth: 1)
        )
        .compositingGroup()
        .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
        .shadow(color: Tokens.sumi.opacity(0.07), radius: 22, y: 9)
    }
}
