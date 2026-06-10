import AppKit
import Combine
import Foundation

enum Phase: Equatable {
    case idle
    case work
    case breakTime
}

/// タイマーの心臓部。tick 積算ではなく Date 差分で計算する（§2-5）。
/// フローモード: 作業はカウントアップ、停止時に「作業時間 ÷ 比率」で休憩を自動算出。
/// クラシックモード: 固定カウントダウン。
@MainActor
final class TimerEngine: ObservableObject {
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isPaused = false
    /// 表示用の秒数（フロー作業中=経過、その他=残り）
    @Published private(set) var displaySeconds = 0
    /// 0...1。クラシック作業・休憩の進捗。フロー作業中は基準25分に対する進捗（満タンで止まる）
    @Published private(set) var progress: Double = 0
    /// フロー作業中に貯まっている休憩秒数（ライブ表示用 = 動機づけ）
    @Published private(set) var bankedBreakSeconds = 0
    /// 終了直後の合図（パネルの視覚変化トリガー）
    @Published private(set) var justFinished = false
    @Published private(set) var classicCompletedInSet = 0
    /// 進行中の作業セッションに付けるメモ（メニュー/API から設定、ログ記録時に保存）
    @Published var currentMemo: String?

    private let settings = Settings.shared
    private var ticker: Timer?

    // 進行中セッションの状態（Date ベース）
    private var phaseStart: Date?            // 現フェーズの開始時刻（ログ用）
    private var segmentStart: Date?          // 現在の連続計測区間の開始（pause で区切る）
    private var accumulated: TimeInterval = 0 // pause までに積んだ作業時間（フロー/クラシック共通）
    private var endDate: Date?               // カウントダウンの終了予定時刻
    private var countdownTotal: TimeInterval = 0
    private var lastTick = Date()

    var onPhaseChange: (() -> Void)?

    init() {
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.handleWake() }
        }
        startTicker()
        refresh() // 起動直後の待機表示（クラシックなら次の作業時間の予告）
    }

    // MARK: - 操作

    func startWork() {
        guard phase != .work else { return }
        phase = .work
        isPaused = false
        justFinished = false
        pendingBreakDuration = nil // 休憩せず次の作業へ進んだら破棄（罪悪感なし）
        currentMemo = nil
        phaseStart = Date()
        segmentStart = Date()
        accumulated = 0
        if settings.mode == .classic {
            countdownTotal = TimeInterval(settings.classicWorkMin * 60)
            endDate = Date().addingTimeInterval(countdownTotal)
        } else {
            endDate = nil
        }
        refresh()
        onPhaseChange?()
    }

    func togglePause() {
        switch phase {
        case .idle:
            startWork()
        case .work, .breakTime:
            if isPaused { resume() } else { pause() }
        }
    }

    private func pause() {
        guard !isPaused else { return }
        isPaused = true
        if let seg = segmentStart {
            accumulated += Date().timeIntervalSince(seg)
            segmentStart = nil
        }
        if let end = endDate {
            countdownTotal = end.timeIntervalSince(Date()) // 残りを保持
            endDate = nil
        }
        refresh()
    }

    private func resume() {
        guard isPaused else { return }
        isPaused = false
        segmentStart = Date()
        if phase == .breakTime || settings.mode == .classic {
            endDate = Date().addingTimeInterval(countdownRemaining())
        }
        refresh()
    }

    /// フローの核: 作業を止める → 休憩を自動算出して開始
    func finishWork() {
        guard phase == .work else { return }
        let worked = currentWorkedSeconds()
        logWork(completed: true, interrupted: false)
        playSound()
        signalFinished()
        classicCompletedInSet += 1

        let breakDuration: TimeInterval
        if settings.mode == .flow {
            breakDuration = max(60, worked / Double(settings.flowRatio))
        } else {
            let isLong = classicCompletedInSet % settings.classicSetCount == 0
            breakDuration = TimeInterval((isLong ? settings.classicLongBreakMin : settings.classicShortBreakMin) * 60)
        }

        if settings.autoStartBreak {
            startBreak(duration: breakDuration)
        } else {
            pendingBreakDuration = breakDuration
            goIdle()
        }
        onPhaseChange?()
    }

    /// autoStartBreak=OFF 時、算出済みでまだ開始していない休憩（パネル/メニューから開始できる）
    @Published private(set) var pendingBreakDuration: TimeInterval?

    func startBreak(duration: TimeInterval? = nil) {
        guard let dur = duration ?? pendingBreakDuration else { return }
        pendingBreakDuration = nil
        phase = .breakTime
        isPaused = false
        phaseStart = Date()
        segmentStart = Date()
        accumulated = 0
        countdownTotal = dur
        endDate = Date().addingTimeInterval(dur)
        refresh()
        onPhaseChange?()
    }

    /// 休憩をスキップ（罪悪感なし・M4）
    func skipBreak() {
        guard phase == .breakTime else { return }
        logBreak(completed: false)
        finishBreak(playChime: false)
    }

    /// +5分延長（M4）
    func extendFiveMinutes() {
        guard phase == .breakTime, let end = endDate else { return }
        endDate = end.addingTimeInterval(300)
        countdownTotal += 300
        refresh()
    }

    func reset() {
        if phase == .work { logWork(completed: false, interrupted: false) }
        if phase == .breakTime { logBreak(completed: false) }
        goIdle()
        onPhaseChange?()
    }

    // MARK: - 内部遷移

    private func finishBreak(playChime: Bool = true) {
        if playChime {
            logBreak(completed: true)
            playSound()
            signalFinished()
        }
        goIdle()
        if settings.autoStartWork { startWork() }
        onPhaseChange?()
    }

    private func goIdle() {
        phase = .idle
        isPaused = false
        phaseStart = nil
        segmentStart = nil
        accumulated = 0
        endDate = nil
        countdownTotal = 0
        bankedBreakSeconds = 0
        refresh()
    }

    // MARK: - tick / 計算

    private func startTicker() {
        let t = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        t.tolerance = 0.2
        RunLoop.main.add(t, forMode: .common)
        ticker = t
    }

    private func tick() {
        lastTick = Date()
        guard phase != .idle, !isPaused else { return }
        refresh()
        // カウントダウン終了判定
        if let end = endDate, Date() >= end {
            if phase == .breakTime {
                finishBreak()
            } else if phase == .work, settings.mode == .classic {
                finishWork()
            }
        }
    }

    private func refresh() {
        switch phase {
        case .idle:
            // クラシックの待機中 00:00 は壊れて見える → 次の作業時間を予告表示
            displaySeconds = settings.mode == .classic ? settings.classicWorkMin * 60 : 0
            progress = 0
        case .work:
            if settings.mode == .flow {
                let worked = currentWorkedSeconds()
                displaySeconds = Int(worked)
                bankedBreakSeconds = Int(max(60, worked / Double(settings.flowRatio)))
                progress = min(1.0, worked / (25 * 60)) // 基準25分に対する充足感の演出
            } else {
                let remaining = countdownRemaining()
                displaySeconds = Int(remaining.rounded(.up))
                let total = TimeInterval(settings.classicWorkMin * 60)
                progress = total > 0 ? 1 - remaining / total : 0
            }
        case .breakTime:
            let remaining = countdownRemaining()
            displaySeconds = Int(remaining.rounded(.up))
            progress = countdownTotal > 0 ? 1 - remaining / countdownTotal : 0
        }
    }

    private func currentWorkedSeconds() -> TimeInterval {
        var total = accumulated
        if let seg = segmentStart, !isPaused {
            total += Date().timeIntervalSince(seg)
        }
        return total
    }

    private func countdownRemaining() -> TimeInterval {
        if let end = endDate { return max(0, end.timeIntervalSince(Date())) }
        return max(0, countdownTotal) // paused: 凍結した残り
    }

    /// スリープ復帰: 5分以上のギャップを跨いだ作業セッションは「中断」として中立に記録（§9）
    private func handleWake() {
        let gap = Date().timeIntervalSince(lastTick)
        if phase == .work, gap > 5 * 60 {
            logWork(completed: false, interrupted: true)
            goIdle()
            onPhaseChange?()
        } else {
            refresh()
        }
    }

    // MARK: - ログ・音

    private func logWork(completed: Bool, interrupted: Bool) {
        guard let start = phaseStart else { return }
        let end = interrupted ? start.addingTimeInterval(currentWorkedSeconds()) : Date()
        SessionLogger.shared.log(start: start, end: end, kind: "work", mode: settings.mode,
                                 completed: completed, interrupted: interrupted, memo: currentMemo)
        currentMemo = nil
    }

    private func logBreak(completed: Bool) {
        guard let start = phaseStart else { return }
        SessionLogger.shared.log(start: start, end: Date(), kind: "break", mode: settings.mode,
                                 completed: completed, interrupted: false)
    }

    private func playSound() {
        guard settings.soundEnabled else { return }
        NSSound(named: "Glass")?.play()
    }

    /// 終了の合図は6秒で自動消灯する。点きっぱなしだと不透明度が 1.0 に固定され
    /// 3段階存在感制御（このアプリの肝）が死ぬため。ホバーでの消灯は冗長系として残す
    private var finishedClearTask: Task<Void, Never>?

    private func signalFinished() {
        justFinished = true
        finishedClearTask?.cancel()
        finishedClearTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled else { return }
            self?.justFinished = false
        }
    }

    func clearFinishedFlag() {
        finishedClearTask?.cancel()
        justFinished = false
    }

    /// モード/プリセット変更時に待機中の表示を更新（クラシックは次の作業時間を予告表示）
    func settingsChanged() {
        if phase == .idle { refresh() }
    }

    // MARK: - 表示ヘルパ

    var timeString: String {
        let s = displaySeconds
        if s >= 3600 {
            return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
        }
        return String(format: "%02d:%02d", s / 60, s % 60)
    }

    var bankedBreakString: String {
        let s = bankedBreakSeconds
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
