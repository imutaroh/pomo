import AppKit
import Charts
import SwiftUI

/// 管理画面「きろく」。罪悪感ゼロの原則: ストリーク・%増減・評価語を出さず、裸の事実だけを並べる。
/// 通常ウィンドウ（フォーカスを取ってよい・パネルとは別物）。
@MainActor
final class DashboardWindowController {
    private var window: NSWindow?

    func show() {
        if window == nil {
            let host = NSHostingController(rootView: DashboardView())
            let w = NSWindow(contentViewController: host)
            w.title = "きろく — Pomo"
            w.setContentSize(NSSize(width: 560, height: 680))
            w.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            w.isReleasedWhenClosed = false
            // 白ベース方針: ダークモードでも常にライト・和紙背景
            w.appearance = NSAppearance(named: .aqua)
            w.backgroundColor = NSColor(red: 0.98, green: 0.976, blue: 0.969, alpha: 1)
            w.titlebarAppearsTransparent = true
            w.center()
            window = w
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}

struct DaySummary: Identifiable {
    let date: Date
    let workSeconds: Int
    let sessions: Int
    var id: Date { date }
}

struct HeatDay: Identifiable {
    let date: Date
    let seconds: Int
    let inRange: Bool // 未来の日（最終週の末尾）は描かない
    var id: Date { date }
}

@MainActor
final class DashboardModel: ObservableObject {
    @Published var todayWork: [SessionLogger.ParsedEntry] = [] // 新しい順
    @Published var days: [DaySummary] = []                     // 古い→今日の7日
    @Published var todaySeconds = 0
    @Published var todayCount = 0
    @Published var yesterdaySeconds = 0
    @Published var weekAvgSeconds = 0
    @Published var heatWeeks: [[HeatDay]] = [] // [週][7日]、GitHub の草（直近26週）

    func reload() {
        let cal = Calendar.current
        let todayStart = cal.startOfDay(for: Date())
        let entries = SessionLogger.shared.parsedEntries().filter { $0.kind == "work" }

        todayWork = entries.filter { $0.start >= todayStart }.sorted { $0.start > $1.start }
        todayCount = todayWork.filter(\.completed).count
        todaySeconds = todayWork.filter(\.completed).reduce(0) { $0 + $1.durationSec }

        var byDay: [Date: (sec: Int, count: Int)] = [:]
        for e in entries where e.completed {
            let day = cal.startOfDay(for: e.start)
            let cur = byDay[day] ?? (0, 0)
            byDay[day] = (cur.sec + e.durationSec, cur.count + 1)
        }
        // 直近7日（記録ゼロの日も 0 として並べる — 空白を欠落に見せない）
        days = (0..<7).reversed().compactMap { offset in
            guard let day = cal.date(byAdding: .day, value: -offset, to: todayStart) else { return nil }
            let v = byDay[day] ?? (0, 0)
            return DaySummary(date: day, workSeconds: v.sec, sessions: v.count)
        }
        yesterdaySeconds = cal.date(byAdding: .day, value: -1, to: todayStart).map { byDay[$0]?.sec ?? 0 } ?? 0
        let total = days.reduce(0) { $0 + $1.workSeconds }
        weekAvgSeconds = total / 7

        buildHeatmap(byDay: byDay, cal: cal, todayStart: todayStart)
    }

    private func buildHeatmap(byDay: [Date: (sec: Int, count: Int)], cal: Calendar, todayStart: Date) {
        let weeksCount = 26
        guard let anchor = cal.date(byAdding: .weekOfYear, value: -(weeksCount - 1), to: todayStart),
              var weekStart = cal.dateInterval(of: .weekOfYear, for: anchor)?.start else {
            heatWeeks = []
            return
        }
        var weeks: [[HeatDay]] = []
        for _ in 0..<weeksCount {
            var column: [HeatDay] = []
            for offset in 0..<7 {
                guard let day = cal.date(byAdding: .day, value: offset, to: weekStart) else { continue }
                column.append(HeatDay(date: day, seconds: byDay[day]?.sec ?? 0, inRange: day <= todayStart))
            }
            weeks.append(column)
            guard let next = cal.date(byAdding: .weekOfYear, value: 1, to: weekStart) else { break }
            weekStart = next
        }
        heatWeeks = weeks
    }
}

struct DashboardView: View {
    @StateObject private var model = DashboardModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                header
                heatmapSection
                chartSection
                timelineSection
            }
            .padding(32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Tokens.washi)
        .frame(minWidth: 520, minHeight: 520)
        .onAppear { model.reload() }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            model.reload() // ウィンドウを開き直すたびに最新化
        }
    }

    /// 白カード（Apple Health 風）: 純白 + 極薄の縁 + 大きめの余白
    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Tokens.sumi.opacity(0.06), lineWidth: 1))
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(Tokens.sumi.opacity(0.45))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("今日")
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text(Self.hm(model.todaySeconds))
                    .font(.system(size: 42, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Tokens.sumi)
                Text("\(model.todayCount) セッション")
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(Tokens.sumi.opacity(0.5))
            }
            // 中立比較: 裸の事実のみ（%・矢印・評価語なし）
            Text("昨日 \(Self.hm(model.yesterdaySeconds)) · 直近7日平均 \(Self.hm(model.weekAvgSeconds))/日")
                .font(.system(size: 12, design: .rounded))
                .foregroundStyle(Tokens.sumi.opacity(0.45))
        }
    }

    // GitHub の草。罪悪感装置（連続日数カウンター・空白の強調）は意図的に持たない
    private var heatmapSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("つみあげ（直近26週）")
            card {
                VStack(alignment: .leading, spacing: 4) {
                    monthLabels
                    HStack(alignment: .top, spacing: 3) {
                        ForEach(model.heatWeeks.indices, id: \.self) { w in
                            VStack(spacing: 3) {
                                ForEach(model.heatWeeks[w]) { day in
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(Self.heatColor(day))
                                        .frame(width: 13, height: 13)
                                        .help(Self.heatTooltip(day))
                                }
                            }
                        }
                    }
                    heatLegend
                }
            }
        }
    }

    private var monthLabels: some View {
        HStack(spacing: 3) {
            ForEach(model.heatWeeks.indices, id: \.self) { w in
                Text(Self.monthLabel(weeks: model.heatWeeks, index: w))
                    .font(.system(size: 9, design: .rounded))
                    .foregroundStyle(Tokens.sumi.opacity(0.4))
                    .fixedSize()
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
                .font(.system(size: 9, design: .rounded))
                .foregroundStyle(Tokens.sumi.opacity(0.4))
            ForEach([0, 15, 60, 120, 200], id: \.self) { minutes in
                RoundedRectangle(cornerRadius: 3)
                    .fill(Self.heatColor(HeatDay(date: .distantPast, seconds: minutes * 60, inRange: true)))
                    .frame(width: 13, height: 13)
            }
            Text("多")
                .font(.system(size: 9, design: .rounded))
                .foregroundStyle(Tokens.sumi.opacity(0.4))
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
        return d.seconds > 0 ? "\(date) · \(hm(d.seconds))" : "\(date) · 記録なし"
    }

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("直近7日")
            card {
                Chart(model.days) { day in
                    BarMark(
                        x: .value("日", day.date, unit: .day),
                        y: .value("分", Double(day.workSeconds) / 60.0)
                    )
                    .foregroundStyle(Tokens.kohaku)
                    .cornerRadius(4)
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
                .frame(height: 150)
            }
        }
    }

    private var timelineSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("今日のセッション")
            if model.todayWork.isEmpty {
                card {
                    Text("まだ今日の記録はありません。タイマーを回すと、ここに積み上がっていきます。")
                        .font(.system(size: 13, design: .rounded))
                        .foregroundStyle(Tokens.sumi.opacity(0.45))
                        .padding(.vertical, 8)
                }
            } else {
                VStack(spacing: 0) {
                    ForEach(model.todayWork) { e in
                        SessionRow(entry: e)
                        if e.id != model.todayWork.last?.id {
                            Divider().overlay(Tokens.sumi.opacity(0.05))
                        }
                    }
                }
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.white))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Tokens.sumi.opacity(0.06), lineWidth: 1))
            }
        }
    }

    static func hm(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        return h > 0 ? "\(h)時間\(m)分" : "\(m)分"
    }
}

struct SessionRow: View {
    let entry: SessionLogger.ParsedEntry

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
            if let memo = entry.memo, !memo.isEmpty {
                Text(memo)
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(Tokens.sumi.opacity(0.7))
                    .lineLimit(2)
            }
            Spacer()
            if entry.interrupted {
                // 中断は失敗ではなく事実。色は付けない
                Text("中断")
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(Tokens.sumi.opacity(0.45))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Tokens.sumi.opacity(0.05)))
            }
            Text("\(entry.durationSec / 60)分")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Tokens.sumi.opacity(0.5))
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }
}
