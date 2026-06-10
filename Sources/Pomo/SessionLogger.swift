import Foundation

/// 1行1セッションの JSONL 追記（M8）。~/Library/Application Support/Pomo/sessions.jsonl
@MainActor
final class SessionLogger {
    static let shared = SessionLogger()

    private let url: URL
    private let iso = ISO8601DateFormatter()

    private(set) var todayWorkCount = 0
    private(set) var todayWorkSeconds = 0

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Pomo", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        url = dir.appendingPathComponent("sessions.jsonl")
        loadToday()
    }

    struct Entry: Codable {
        let start: String
        let end: String
        let kind: String        // work | break
        let mode: String        // flow | classic
        let durationSec: Int
        let completed: Bool     // 最後まで実行されたか（フローの作業は停止＝完了扱い。罪悪感を持たせない）
        let interrupted: Bool   // 5分以上のスリープ跨ぎ等による中立的な中断記録
        let memo: String?       // このセッションで何をしたか（任意）
    }

    func log(start: Date, end: Date, kind: String, mode: TimerMode, completed: Bool, interrupted: Bool, memo: String? = nil) {
        let e = Entry(
            start: iso.string(from: start),
            end: iso.string(from: end),
            kind: kind,
            mode: mode.rawValue,
            durationSec: Int(end.timeIntervalSince(start)),
            completed: completed,
            interrupted: interrupted,
            memo: memo
        )
        guard let data = try? JSONEncoder().encode(e), let line = String(data: data, encoding: .utf8) else { return }
        appendLine(line)
        if kind == "work", completed, Calendar.current.isDateInToday(start) {
            todayWorkCount += 1
            todayWorkSeconds += e.durationSec
        }
    }

    private func appendLine(_ line: String) {
        let payload = (line + "\n").data(using: .utf8)!
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: payload)
        } else {
            try? payload.write(to: url)
        }
    }

    /// 過去7日（今日含む）の作業集計。メニュー表示・API 用に都度スキャン（ファイルは小さい）
    func weekStats() -> (count: Int, seconds: Int) {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return (0, 0) }
        let cutoff = Calendar.current.startOfDay(for: Date()).addingTimeInterval(-6 * 86400)
        let decoder = JSONDecoder()
        var count = 0, seconds = 0
        for line in text.split(separator: "\n") {
            guard let data = line.data(using: .utf8),
                  let e = try? decoder.decode(Entry.self, from: data),
                  e.kind == "work", e.completed,
                  let date = iso.date(from: e.start), date >= cutoff else { continue }
            count += 1
            seconds += e.durationSec
        }
        return (count, seconds)
    }

    /// 生ログ（JSONL テキスト）。API の /sessions 用
    func rawLog() -> String {
        (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    /// 日付をパース済みのセッション（ダッシュボード用）
    struct ParsedEntry: Identifiable {
        let id = UUID()
        let start: Date
        let end: Date
        let kind: String
        let mode: String
        let durationSec: Int
        let completed: Bool
        let interrupted: Bool
        let memo: String?
    }

    func parsedEntries() -> [ParsedEntry] {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return [] }
        let decoder = JSONDecoder()
        return text.split(separator: "\n").compactMap { line in
            guard let data = line.data(using: .utf8),
                  let e = try? decoder.decode(Entry.self, from: data),
                  let start = iso.date(from: e.start),
                  let end = iso.date(from: e.end) else { return nil }
            return ParsedEntry(start: start, end: end, kind: e.kind, mode: e.mode,
                               durationSec: e.durationSec, completed: e.completed,
                               interrupted: e.interrupted, memo: e.memo)
        }
    }

    private func loadToday() {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return }
        let decoder = JSONDecoder()
        for line in text.split(separator: "\n") {
            guard let data = line.data(using: .utf8),
                  let e = try? decoder.decode(Entry.self, from: data),
                  e.kind == "work", e.completed,
                  let date = iso.date(from: e.start),
                  Calendar.current.isDateInToday(date) else { continue }
            todayWorkCount += 1
            todayWorkSeconds += e.durationSec
        }
    }
}
