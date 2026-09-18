import Foundation

/// GUI 不要の自己テスト。`POMO_SELFTEST=1 .build/debug/Pomo` で実行する。
enum SelfTest {
    @MainActor
    static func runIfRequested() {
        guard ProcessInfo.processInfo.environment["POMO_SELFTEST"] == "1" else { return }

        var failures = 0
        func check(_ ok: Bool, _ message: String) {
            print((ok ? "✅ PASS" : "❌ FAIL") + " — " + message)
            if !ok { failures += 1 }
        }

        let settings = Settings.shared
        let savedMode = settings.mode
        let savedPomodoroMinutes = settings.pomodoroWorkMinutes
        let savedTimerMinutes = settings.timerMinutes
        let savedAutoStartBreak = settings.autoStartBreak
        defer {
            settings.mode = savedMode
            settings.pomodoroWorkMinutes = savedPomodoroMinutes
            settings.timerMinutes = savedTimerMinutes
            settings.autoStartBreak = savedAutoStartBreak
        }

        let engine = TimerEngine()

        settings.mode = .pomodoro
        settings.pomodoroWorkMinutes = 40
        engine.settingsChanged()
        check(engine.timeString == "40:00", "ポモドーロ40分の待機表示")

        settings.mode = .timer
        settings.timerMinutes = 15
        engine.settingsChanged()
        check(engine.timeString == "15:00", "タイマー15分の待機表示")
        engine.startWork()
        check(engine.phase == .work && engine.activeMode == .timer, "タイマーを開始できる")
        engine.reset()

        settings.mode = .flow
        engine.settingsChanged()
        check(engine.timeString == "00:00", "フローは0から始まる")
        engine.startWork()
        check(engine.phase == .work && engine.activeMode == .flow, "フローを開始できる")
        engine.tick(now: Date().addingTimeInterval(30))
        check(engine.phase == .work && !engine.isPaused && engine.sleepExcludedSeconds == 0, "1分未満の空白はスリープ扱いにしない")
        engine.tick(now: Date().addingTimeInterval(10 * 60 + 30))
        check(engine.phase == .work && !engine.isPaused, "スリープを跨いでも止めずに続ける")
        check(engine.sleepExcludedSeconds >= 10 * 60 && engine.sleepExcludedLabel != nil, "スリープしていた時間を集中から除いて見せる")
        engine.togglePause()
        engine.tick(now: Date().addingTimeInterval(20 * 60))
        engine.togglePause()
        let excludedBefore = engine.sleepExcludedSeconds
        engine.tick()
        check(engine.sleepExcludedSeconds == excludedBefore, "手動の一時停止中の空白はスリープに数えない")
        engine.reset()
        check(engine.sleepExcludedSeconds == 0 && engine.sleepExcludedLabel == nil, "リセットで除外時間を消す")

        settings.mode = .pomodoro
        settings.pomodoroWorkMinutes = 40
        engine.settingsChanged()
        engine.startWork()
        engine.tick(now: Date().addingTimeInterval(10 * 60))
        check(engine.phase == .work && !engine.isPaused && engine.sleepExcludedSeconds >= 10 * 60, "ポモドーロもスリープ分だけ終了予定を後ろへずらして続ける")
        engine.reset()

        settings.mode = .clock
        engine.settingsChanged()
        let clockParts = engine.timeString.split(separator: ":")
        check(clockParts.count == 3, "時計はHH:MM:SSで表示する")
        engine.startWork()
        check(engine.phase == .idle, "時計モードには開始操作がない")

        settings.mode = .pomodoro
        settings.autoStartBreak = true
        engine.settingsChanged()
        engine.startWork()
        engine.finishWork()
        check(engine.phase == .breakTime, "ポモドーロ終了後に休憩へ進む")
        check(engine.lastWorkString != nil, "休憩中に今回の集中時間を保持する")
        engine.skipBreak()
        engine.startWork()
        check(engine.lastWorkString == nil, "次の作業開始で直前の集中時間を消す")
        engine.reset()
        check(engine.lastWorkString == nil, "リセットで今回の集中時間を消す")

        engine.startBreak(duration: 300)
        engine.togglePause()
        engine.extendFiveMinutes()
        check(engine.timeString == "10:00", "一時停止中も休憩を5分延長できる")
        engine.reset()

        print(failures == 0 ? "ALL PASS ✅" : "\(failures) FAILED ❌")
        exit(failures == 0 ? 0 : 1)
    }
}
