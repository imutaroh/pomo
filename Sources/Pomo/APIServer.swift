import Foundation
import Network

/// localhost 限定の HTTP API。Claude Code・スクリプト・CLI からタイマーを操作・参照できる。
/// 認証なし＝同一マシンの全プロセスから操作可能というトレードオフを受け入れている
/// （個人用途。他人に配布する時はトークン認証を足すこと）。
@MainActor
final class APIServer {
    static let port: UInt16 = 51766
    private var listener: NWListener?
    private let engine: TimerEngine

    init(engine: TimerEngine) {
        self.engine = engine
        start()
    }

    private func start() {
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            // ループバック束縛: 外部ネットワークには一切露出しない
            params.requiredLocalEndpoint = NWEndpoint.hostPort(
                host: .ipv4(.loopback), port: NWEndpoint.Port(integerLiteral: Self.port)
            )
            let l = try NWListener(using: params)
            l.newConnectionHandler = { [weak self] conn in
                conn.start(queue: .main)
                self?.receive(conn, buffer: Data())
            }
            l.start(queue: .main)
            listener = l
        } catch {
            NSLog("Pomo API: port \(Self.port) で起動できませんでした: \(error)")
        }
    }

    nonisolated private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self else { conn.cancel(); return }
            var buf = buffer
            if let data { buf.append(data) }
            if error != nil { conn.cancel(); return }
            if Self.requestComplete(buf) || isComplete {
                Task { @MainActor in
                    let resp = self.handle(buf)
                    conn.send(content: resp, completion: .contentProcessed { _ in conn.cancel() })
                }
            } else if buf.count < 65536 && !isComplete {
                self.receive(conn, buffer: buf)
            } else {
                conn.cancel()
            }
        }
    }

    /// ヘッダ終端があり、Content-Length 分のボディが揃っていれば完了
    nonisolated private static func requestComplete(_ data: Data) -> Bool {
        guard let text = String(data: data, encoding: .utf8),
              let headerEnd = text.range(of: "\r\n\r\n") else { return false }
        let header = text[..<headerEnd.lowerBound].lowercased()
        guard let clRange = header.range(of: "content-length:") else { return true } // ボディなし
        let after = header[clRange.upperBound...]
        let len = Int(after.prefix(while: { $0 == " " || $0.isNumber }).trimmingCharacters(in: .whitespaces)) ?? 0
        let bodyBytes = data.count - text.distance(from: text.startIndex, to: headerEnd.upperBound)
        return bodyBytes >= len
    }

    // MARK: - ルーティング

    private func handle(_ raw: Data) -> Data {
        guard let text = String(data: raw, encoding: .utf8) else {
            return Self.resp(400, ["error": "bad encoding"])
        }
        let sections = text.components(separatedBy: "\r\n\r\n")
        let head = sections.first ?? ""
        let body = sections.dropFirst().joined(separator: "\r\n\r\n")
        let reqLine = head.components(separatedBy: "\r\n").first ?? ""
        let parts = reqLine.split(separator: " ")
        guard parts.count >= 2 else { return Self.resp(400, ["error": "bad request"]) }
        let method = String(parts[0])
        let path = String(parts[1].split(separator: "?").first ?? parts[1])

        switch (method, path) {
        case ("GET", "/status"):
            return Self.resp(200, statusDict())
        case ("POST", "/start"):
            engine.startWork()
            return Self.resp(200, statusDict())
        case ("POST", "/pause"):
            engine.togglePause()
            return Self.resp(200, statusDict())
        case ("POST", "/finish"):
            // フローの核: 作業を終えて休憩を自動算出
            engine.finishWork()
            return Self.resp(200, statusDict())
        case ("POST", "/break/skip"):
            engine.skipBreak()
            return Self.resp(200, statusDict())
        case ("POST", "/break/extend"):
            engine.extendFiveMinutes()
            return Self.resp(200, statusDict())
        case ("POST", "/reset"):
            engine.reset()
            return Self.resp(200, statusDict())
        case ("POST", "/memo"):
            guard let d = body.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
                  let memoText = obj["text"] as? String else {
                return Self.resp(400, ["error": #"expected JSON body {"text": "..."}"#])
            }
            engine.currentMemo = memoText
            return Self.resp(200, statusDict())
        case ("GET", "/sessions"):
            return Self.respRaw(200, SessionLogger.shared.rawLog(), contentType: "application/x-ndjson")
        case ("GET", "/stats"):
            let logger = SessionLogger.shared
            let week = logger.weekStats()
            return Self.resp(200, [
                "today_sessions": logger.todayWorkCount,
                "today_work_seconds": logger.todayWorkSeconds,
                "week_sessions": week.count,
                "week_work_seconds": week.seconds,
            ])
        default:
            return Self.resp(404, ["error": "not found", "endpoints": [
                "GET /status", "GET /stats", "GET /sessions",
                "POST /start", "POST /pause", "POST /finish",
                "POST /break/skip", "POST /break/extend", "POST /reset", "POST /memo",
            ]])
        }
    }

    private func statusDict() -> [String: Any] {
        let phaseName: String
        switch engine.phase {
        case .idle: phaseName = "idle"
        case .work: phaseName = "work"
        case .breakTime: phaseName = "break"
        }
        var d: [String: Any] = [
            "phase": phaseName,
            "paused": engine.isPaused,
            "mode": Settings.shared.mode.rawValue,
            "seconds": engine.displaySeconds, // work(flow)=経過, それ以外=残り
            "display": engine.timeString,
            "today_sessions": SessionLogger.shared.todayWorkCount,
            "today_work_seconds": SessionLogger.shared.todayWorkSeconds,
        ]
        if engine.phase == .work, Settings.shared.mode == .flow {
            d["banked_break_seconds"] = engine.bankedBreakSeconds
        }
        if let memo = engine.currentMemo { d["memo"] = memo }
        if let pending = engine.pendingBreakDuration { d["pending_break_seconds"] = Int(pending) }
        return d
    }

    // MARK: - HTTP レスポンス

    nonisolated private static func resp(_ code: Int, _ obj: [String: Any]) -> Data {
        let body = (try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])) ?? Data("{}".utf8)
        return respData(code, body, contentType: "application/json")
    }

    nonisolated private static func respRaw(_ code: Int, _ text: String, contentType: String) -> Data {
        respData(code, Data(text.utf8), contentType: contentType)
    }

    nonisolated private static func respData(_ code: Int, _ body: Data, contentType: String) -> Data {
        let status = code == 200 ? "200 OK" : code == 400 ? "400 Bad Request" : "404 Not Found"
        var head = "HTTP/1.1 \(status)\r\n"
        head += "Content-Type: \(contentType); charset=utf-8\r\n"
        head += "Content-Length: \(body.count)\r\n"
        head += "Connection: close\r\n\r\n"
        var data = Data(head.utf8)
        data.append(body)
        return data
    }
}
