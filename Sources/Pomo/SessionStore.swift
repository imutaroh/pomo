import Foundation
import SwiftUI

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

/// 母艦ウィンドウ全ページ共有のセッションデータ（JSONL 読み）。
/// 旧 DashboardModel。罪悪感ゼロの原則: ストリーク・%増減・評価語の材料は作らない。
@MainActor
final class SessionStore: ObservableObject {
    @Published var todayWork: [SessionLogger.ParsedEntry] = [] // 新しい順
    @Published var days: [DaySummary] = []                     // 古い→今日の7日
    @Published var todaySeconds = 0
    @Published var todayCount = 0
    @Published var todayBreakCount = 0
    @Published var yesterdaySeconds = 0
    @Published var weekAvgSeconds = 0
    @Published var heatWeeks: [[HeatDay]] = [] // [週][7日]、GitHub の草（直近26週）
    /// 直近14日の作業セッション（日別・新しい日が先頭、日の中も新しい順）
    @Published var recentByDay: [(date: Date, entries: [SessionLogger.ParsedEntry])] = []

    func reload() {
        let cal = Calendar.current
        let todayStart = cal.startOfDay(for: Date())
        let all = SessionLogger.shared.parsedEntries()
        let entries = all.filter { $0.kind == "work" }

        todayWork = entries.filter { $0.start >= todayStart }.sorted { $0.start > $1.start }
        todayCount = todayWork.filter(\.completed).count
        todaySeconds = todayWork.filter(\.completed).reduce(0) { $0 + $1.durationSec }
        todayBreakCount = all.filter { $0.kind == "break" && $0.completed && $0.start >= todayStart }.count

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

        buildRecent(entries: entries, cal: cal, todayStart: todayStart)
        buildHeatmap(byDay: byDay, cal: cal, todayStart: todayStart)
    }

    private func buildRecent(entries: [SessionLogger.ParsedEntry], cal: Calendar, todayStart: Date) {
        guard let cutoff = cal.date(byAdding: .day, value: -13, to: todayStart) else {
            recentByDay = []
            return
        }
        let recent = entries.filter { $0.start >= cutoff }
        let grouped = Dictionary(grouping: recent) { cal.startOfDay(for: $0.start) }
        recentByDay = grouped.keys.sorted(by: >).map { day in
            (date: day, entries: grouped[day]!.sorted { $0.start > $1.start })
        }
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
