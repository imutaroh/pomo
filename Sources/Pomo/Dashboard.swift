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
            w.setContentSize(NSSize(width: 520, height: 620))
            w.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            w.isReleasedWhenClosed = false
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

@MainActor
final class DashboardModel: ObservableObject {
    @Published var todayWork: [SessionLogger.ParsedEntry] = [] // 新しい順
    @Published var days: [DaySummary] = []                     // 古い→今日の7日
    @Published var todaySeconds = 0
    @Published var todayCount = 0
    @Published var yesterdaySeconds = 0
    @Published var weekAvgSeconds = 0

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
    }
}

struct DashboardView: View {
    @StateObject private var model = DashboardModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                chartSection
                timelineSection
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minWidth: 480, minHeight: 480)
        .onAppear { model.reload() }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            model.reload() // ウィンドウを開き直すたびに最新化
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("今日")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(Self.hm(model.todaySeconds))
                    .font(.system(size: 36, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                Text("\(model.todayCount) セッション")
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            // 中立比較: 裸の事実のみ（%・矢印・評価語なし）
            Text("昨日 \(Self.hm(model.yesterdaySeconds)) · 直近7日平均 \(Self.hm(model.weekAvgSeconds))/日")
                .font(.system(size: 12, design: .rounded))
                .foregroundStyle(.secondary)
        }
    }

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("直近7日")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
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
                    AxisGridLine()
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

    private var timelineSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("今日のセッション")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
            if model.todayWork.isEmpty {
                Text("まだ今日の記録はありません。タイマーを回すと、ここに積み上がっていきます。")
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 12)
            } else {
                VStack(spacing: 0) {
                    ForEach(model.todayWork) { e in
                        SessionRow(entry: e)
                        if e.id != model.todayWork.last?.id {
                            Divider()
                        }
                    }
                }
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.04)))
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
                .foregroundStyle(.primary)
            if let memo = entry.memo, !memo.isEmpty {
                Text(memo)
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.primary.opacity(0.75))
                    .lineLimit(2)
            }
            Spacer()
            if entry.interrupted {
                // 中断は失敗ではなく事実。色は付けない
                Text("中断")
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.primary.opacity(0.06)))
            }
            Text("\(entry.durationSec / 60)分")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
