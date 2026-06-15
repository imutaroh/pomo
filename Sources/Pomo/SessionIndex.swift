import Foundation
import GRDB

/// メモ全文検索のための SQLite 派生インデックス（GRDB）。
///
/// 設計（docs/BACKLOG.md・MARKET.md の決定どおり）:
/// - **JSONL（sessions.jsonl）が一次ストア**。この DB は「壊れても JSONL から全再構築できる使い捨て索引」。
/// - 規模が小さい（年 ~1.4MB）ので、JSONL が更新されたら **全再構築**する（増分同期の複雑さを避ける）。
/// - 日本語メモは FTS5 の trigram トークナイザで検索。**3文字未満は trigram で 0 件**になる制約があるため
///   その場合は LIKE にフォールバックする。
/// - FTS5 が使えない環境（将来の変化）では DB を使わず JSONL 走査に丸ごとフォールバックする（縮退運転）。
@MainActor
final class SessionIndex {
    static let shared = SessionIndex()

    private var dbQueue: DatabaseQueue?
    private var ftsAvailable = false
    private var lastSyncedModification: Date?

    private let dbURL: URL
    private let jsonlURL: URL

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Pomo", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        dbURL = dir.appendingPathComponent("sessions.db")
        jsonlURL = dir.appendingPathComponent("sessions.jsonl")
        setUp()
    }

    private func setUp() {
        do {
            let q = try DatabaseQueue(path: dbURL.path)
            // FTS5 が使えるか試す（macOS のシステム SQLite は FTS5 有効）。使えなければ throw → フォールバック。
            // memo だけを索引し、表示用の他カラムは UNINDEXED で同居させる。
            try q.write { db in
                try db.execute(sql: """
                    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
                        start UNINDEXED, finish UNINDEXED, durationSec UNINDEXED,
                        completed UNINDEXED, interrupted UNINDEXED, mode UNINDEXED,
                        memo,
                        tokenize='trigram'
                    )
                    """)
            }
            dbQueue = q
            ftsAvailable = true
        } catch {
            dbQueue = nil
            ftsAvailable = false
            NSLog("Pomo SessionIndex: FTS5 利用不可。JSONL 走査にフォールバックします: \(error)")
        }
    }

    /// JSONL の更新時刻が変わっていれば索引を作り直す（全再構築。小規模なので十分速い）。
    private func ensureSynced() {
        guard let dbQueue, ftsAvailable else { return }
        let mod = (try? FileManager.default.attributesOfItem(atPath: jsonlURL.path)[.modificationDate]) as? Date
        if let mod, mod == lastSyncedModification { return }

        // 検索対象はメモ付きの作業セッションのみ（メモがこのアプリの差別化資産）
        let entries = SessionLogger.shared.parsedEntries()
            .filter { $0.kind == "work" && !($0.memo ?? "").isEmpty }
        let iso = ISO8601DateFormatter()
        do {
            try dbQueue.write { db in
                try db.execute(sql: "DELETE FROM sessions_fts")
                for e in entries {
                    try db.execute(
                        sql: """
                            INSERT INTO sessions_fts
                                (start, finish, durationSec, completed, interrupted, mode, memo)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                        arguments: [
                            iso.string(from: e.start), iso.string(from: e.end), e.durationSec,
                            e.completed ? 1 : 0, e.interrupted ? 1 : 0, e.mode, e.memo ?? "",
                        ]
                    )
                }
            }
            lastSyncedModification = mod
        } catch {
            NSLog("Pomo SessionIndex: 同期に失敗: \(error)")
        }
    }

    /// メモ検索。新しい順に返す。3文字以上は FTS5 MATCH、未満や FTS 不可時は LIKE / 走査。
    func search(_ rawQuery: String) -> [SessionLogger.ParsedEntry] {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }

        guard let dbQueue, ftsAvailable else { return fallbackScan(query) }
        ensureSynced()

        let iso = ISO8601DateFormatter()
        do {
            let rows: [Row] = try dbQueue.read { db in
                if query.count >= 3 {
                    // trigram MATCH。特殊文字対策で二重引用符で囲む（" は "" にエスケープ）
                    let pattern = "\"" + query.replacingOccurrences(of: "\"", with: "\"\"") + "\""
                    return try Row.fetchAll(db, sql: """
                        SELECT start, finish, durationSec, completed, interrupted, mode, memo
                        FROM sessions_fts WHERE memo MATCH ? ORDER BY start DESC
                        """, arguments: [pattern])
                } else {
                    // 2文字以下: trigram は 0 件になるので LIKE
                    return try Row.fetchAll(db, sql: """
                        SELECT start, finish, durationSec, completed, interrupted, mode, memo
                        FROM sessions_fts WHERE memo LIKE ? ORDER BY start DESC
                        """, arguments: ["%\(query)%"])
                }
            }
            return rows.compactMap { row -> SessionLogger.ParsedEntry? in
                let startStr: String = row["start"]
                let finishStr: String = row["finish"]
                guard let s = iso.date(from: startStr), let f = iso.date(from: finishStr) else { return nil }
                let completed: Int = row["completed"]
                let interrupted: Int = row["interrupted"]
                return SessionLogger.ParsedEntry(
                    start: s, end: f, kind: "work", mode: row["mode"],
                    durationSec: row["durationSec"],
                    completed: completed != 0, interrupted: interrupted != 0, memo: row["memo"]
                )
            }
        } catch {
            NSLog("Pomo SessionIndex: 検索に失敗。走査にフォールバック: \(error)")
            return fallbackScan(query)
        }
    }

    /// DB/FTS が使えない時の保険: JSONL を直接走査して memo を部分一致。
    private func fallbackScan(_ query: String) -> [SessionLogger.ParsedEntry] {
        SessionLogger.shared.parsedEntries()
            .filter { $0.kind == "work" && ($0.memo?.localizedCaseInsensitiveContains(query) ?? false) }
            .sorted { $0.start > $1.start }
    }
}
