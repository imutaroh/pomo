import Foundation

/// ヘッドレス自己テスト（GUI 不要の E2E 検証用）。
/// このマシンは完全な Xcode が無く `swift test`(XCTest) が使えないため、実物の Settings＋TimerEngine を
/// アプリ起動経路で直接動かして検証する。`POMO_SELFTEST=1 .build/debug/Pomo` で実行し、結果を出力して exit。
/// 通常起動（env 未設定）では一切作動しない。
enum SelfTest {
    @MainActor
    static func runIfRequested() {
        guard ProcessInfo.processInfo.environment["POMO_SELFTEST"] == "1" else { return }

        var failures = 0
        func check(_ ok: Bool, _ msg: String) {
            print((ok ? "✅ PASS" : "❌ FAIL") + " — " + msg)
            if !ok { failures += 1 }
        }

        // ダッシュボードの timerSetup が叩くのと同じ経路: settings 変更 → engine.settingsChanged()
        // 注意: Settings.shared は実 UserDefaults なので、触った値は必ず元に戻す
        // （以前は書きっぱなしで、テスト実行のたびにユーザーの設定が classic/50分 に化けていた）
        let s = Settings.shared
        let savedMode = s.mode
        let savedClassicWorkMin = s.classicWorkMin
        let savedSimpleTimerMinutes = s.simpleTimerMinutes
        defer {
            s.mode = savedMode
            s.classicWorkMin = savedClassicWorkMin
            s.simpleTimerMinutes = savedSimpleTimerMinutes
        }
        let e = TimerEngine() // 起動直後 = idle

        s.mode = .classic; s.classicWorkMin = 40; e.settingsChanged()
        check(e.timeString == "40:00", "クラシック40分 → \(e.timeString)（期待 40:00）")

        s.classicWorkMin = 25; e.settingsChanged()
        check(e.timeString == "25:00", "時間を25分へ変更 → \(e.timeString)（期待 25:00）")

        s.mode = .simple; s.simpleTimerMinutes = 15; e.settingsChanged()
        check(e.timeString == "15:00", "タイマーモード15分 → \(e.timeString)（期待 15:00）")

        s.mode = .flow; e.settingsChanged()
        check(e.timeString == "00:00", "フロー待機 → \(e.timeString)（期待 00:00）")

        // 開始すると選んだ時間でカウントが始まる（変更が実タイマーに効く）。
        // simple モードで検証する: classic だと reset() が実 sessions.jsonl に
        // completed:false のジャンク行を追記してしまう（simple は無記録）
        s.mode = .simple; s.simpleTimerMinutes = 50; e.settingsChanged(); e.startWork()
        check(e.phase == .work && e.timeString == "50:00", "開始 → \(e.phase) \(e.timeString)（期待 work 50:00）")
        e.reset()

        // 一時停止まわりの回帰チェック（Issue #26: 一時停止中の+5分が無反応だったバグ）。
        // 休憩状態のまま exit する（skipBreak/reset は実 sessions.jsonl に記録してしまうため呼ばない）
        e.startBreak(duration: 300)
        check(e.phase == .breakTime, "休憩開始 → \(e.phase)（期待 breakTime）")
        e.togglePause()
        check(e.isPaused, "休憩を一時停止 → isPaused \(e.isPaused)（期待 true）")
        e.extendFiveMinutes()
        check(e.timeString == "10:00", "一時停止中に+5分 → \(e.timeString)（期待 10:00）")
        e.togglePause()
        check(!e.isPaused, "再開 → isPaused \(e.isPaused)（期待 false）")

        print(failures == 0 ? "ALL PASS ✅" : "\(failures) FAILED ❌")
        exit(failures == 0 ? 0 : 1)
    }
}
