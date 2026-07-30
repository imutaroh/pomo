import Foundation

/// はじまりの合図（Issue #37）: 設定時刻を過ぎたら「今日をはじめますか」を1日1回だけ通知する。
/// 看守にしない設計: opt-in（デフォルトOFF）・その日すでに作業していれば鳴らない・
/// 実行中も鳴らない・無視しても何も起きない・記録もしない。
/// 時刻ベースの implementation intention（習慣科学では行動アンカーより弱い形）なので、
/// 本筋は「ログイン起動でパネルがそこにいる」こと。これはその補助輪。
@MainActor
final class DayStartCue {
    private let engine: TimerEngine
    private let settings = Settings.shared
    private var timer: Timer?
    private let lastSignalKey = "lastDayStartSignal" // "yyyy-MM-dd"（冪等性: 1日1回）

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    init(engine: TimerEngine) {
        self.engine = engine
        // 30秒粒度で十分（分単位の合図なので）。スリープ復帰後の遅延発火もこの周期が拾う
        let t = Timer(timeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.check() }
        }
        t.tolerance = 5
        RunLoop.main.add(t, forMode: .common)
        timer = t
        check() // 起動直後にも判定（遅い時間に起動した日はその場で1回だけ）
    }

    private func check() {
        guard settings.dayStartEnabled, engine.phase == .idle else { return }
        guard SessionLogger.shared.todayWorkCount == 0 else { return } // すでに始めた日は鳴らさない
        let now = Date()
        let cal = Calendar.current
        let minutesNow = cal.component(.hour, from: now) * 60 + cal.component(.minute, from: now)
        guard minutesNow >= settings.dayStartMinutes else { return }
        let today = Self.dayFormat.string(from: now)
        guard UserDefaults.standard.string(forKey: lastSignalKey) != today else { return }
        UserDefaults.standard.set(today, forKey: lastSignalKey)
        NotificationManager.shared.notifyDayStart()
    }
}
