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
        let s = Settings.shared
        let e = TimerEngine() // 起動直後 = idle

        s.mode = .classic; s.classicWorkMin = 40; e.settingsChanged()
        check(e.timeString == "40:00", "クラシック40分 → \(e.timeString)（期待 40:00）")

        s.classicWorkMin = 25; e.settingsChanged()
        check(e.timeString == "25:00", "時間を25分へ変更 → \(e.timeString)（期待 25:00）")

        s.mode = .simple; s.simpleTimerMinutes = 15; e.settingsChanged()
        check(e.timeString == "15:00", "タイマーモード15分 → \(e.timeString)（期待 15:00）")

        s.mode = .flow; e.settingsChanged()
        check(e.timeString == "00:00", "フロー待機 → \(e.timeString)（期待 00:00）")

        // 開始すると選んだ時間でカウントが始まる（変更が実タイマーに効く）
        s.mode = .classic; s.classicWorkMin = 50; e.settingsChanged(); e.startWork()
        check(e.phase == .work && e.timeString == "50:00", "開始 → \(e.phase) \(e.timeString)（期待 work 50:00）")
        e.reset()

        print(failures == 0 ? "ALL PASS ✅" : "\(failures) FAILED ❌")
        exit(failures == 0 ? 0 : 1)
    }
}
