import AppKit
import Combine
import Foundation

enum Phase: Equatable {
    case idle
    case work
    case breakTime
}

/// Date 差分で計測するタイマーの心臓部。
/// 計測結果はメモリ上の「今回」だけを扱い、ファイルやデータベースへ保存しない。
@MainActor
final class TimerEngine: ObservableObject {
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isPaused = false
    @Published private(set) var activeMode: TimerMode
    @Published private(set) var displaySeconds = 0
    @Published private(set) var workElapsedSeconds = 0
    /// 直前に終えた作業時間。次の作業開始またはリセットで消える。
    @Published private(set) var lastWorkSeconds: Int?
    @Published private(set) var progress: Double = 0
    @Published private(set) var bankedBreakSeconds = 0
    @Published private(set) var justFinished = false
    @Published private(set) var isApproachingEnd = false
    /// 5分超のスリープを跨いだため、眠った時点で自動的に一時停止した（#65）。再開・待機で消える
    @Published private(set) var pausedBySleep = false
    @Published private(set) var pendingBreakDuration: TimeInterval?

    private let settings = Settings.shared
    private var ticker: Timer?
    private var segmentStart: Date?
    private var accumulated: TimeInterval = 0
    private var endDate: Date?
    private var countdownTotal: TimeInterval = 0
    private var pausedRemaining: TimeInterval?
    private var workCountdownTotal: TimeInterval = 0
    private var lastTick = Date()
    private var flowLimitSignaled = false
    private var finishedClearTask: Task<Void, Never>?

    var onPhaseChange: (() -> Void)?

    init() {
        activeMode = Settings.shared.mode
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.handleWake() }
        }
        startTicker()
        refresh()
    }

    // MARK: - 操作

    func startWork() {
        guard phase == .idle, settings.mode != .clock else { return }
        activeMode = settings.mode
        phase = .work
        isPaused = false
        pausedBySleep = false
        justFinished = false
        flowLimitSignaled = false
        pendingBreakDuration = nil
        lastWorkSeconds = nil
        let now = Date() // 開始時刻と終了予定時刻は同じ瞬間から測る
        segmentStart = now
        accumulated = 0
        workElapsedSeconds = 0

        switch activeMode {
        case .flow:
            endDate = nil
            countdownTotal = 0
            workCountdownTotal = 0
        case .pomodoro:
            workCountdownTotal = TimeInterval(settings.pomodoroWorkMinutes * 60)
            countdownTotal = workCountdownTotal
            endDate = now.addingTimeInterval(countdownTotal)
        case .timer:
            workCountdownTotal = TimeInterval(settings.timerMinutes * 60)
            countdownTotal = workCountdownTotal
            endDate = now.addingTimeInterval(countdownTotal)
        case .clock:
            return
        }
        refresh()
        onPhaseChange?()
    }

    func togglePause() {
        switch phase {
        case .idle:
            startWork() // 時計モードでは何もしない
        case .work, .breakTime:
            isPaused ? resume() : pause()
        }
    }

    /// `moment` は「止めたことにする時刻」。通常は今だが、スリープ復帰時は眠った時点に遡る
    private func pause(at moment: Date = Date()) {
        guard !isPaused else { return }
        isPaused = true
        // 区間の開始より前には遡らない（復帰直後に再開→即スリープのような順序でも負にしない）
        let moment = max(moment, segmentStart ?? moment)
        if let segmentStart {
            accumulated += max(0, moment.timeIntervalSince(segmentStart))
            self.segmentStart = nil
        }
        if let endDate {
            pausedRemaining = max(0, endDate.timeIntervalSince(moment))
            self.endDate = nil
        }
        refresh()
    }

    private func resume() {
        guard isPaused else { return }
        isPaused = false
        pausedBySleep = false
        segmentStart = Date()
        if phase == .breakTime || activeMode != .flow {
            endDate = Date().addingTimeInterval(countdownRemaining())
        }
        pausedRemaining = nil
        refresh()
    }

    /// フロー/ポモドーロの作業を終え、今回の作業時間だけを休憩中に引き継ぐ。
    /// タイマーは終了通知だけで待機へ戻り、休憩や作業時間には結び付けない。
    func finishWork() {
        guard phase == .work else { return }

        if activeMode == .timer {
            playSound(named: settings.workSound)
            signalFinished()
            if Bundle.main.bundleIdentifier != nil {
                NotificationManager.shared.notifyTimerEnded()
            }
            goIdle(clearLastWork: true)
            onPhaseChange?()
            return
        }

        let worked = currentWorkedSeconds()
        lastWorkSeconds = Int(worked.rounded())
        workElapsedSeconds = Int(worked)
        playSound(named: settings.workSound)
        signalFinished()

        let breakDuration: TimeInterval
        if activeMode == .flow {
            breakDuration = max(60, worked / Double(settings.flowRatio))
        } else {
            breakDuration = TimeInterval(settings.pomodoroBreakMinutes * 60)
        }

        if settings.autoStartBreak {
            startBreak(duration: breakDuration)
            if Bundle.main.bundleIdentifier != nil {
                NotificationManager.shared.notifyWorkEndedBreakStarted(breakSeconds: Int(breakDuration))
            }
        } else {
            pendingBreakDuration = breakDuration
            goIdle(clearLastWork: false)
            if Bundle.main.bundleIdentifier != nil {
                NotificationManager.shared.notifyWorkEndedBreakPending(breakSeconds: Int(breakDuration))
            }
        }
        onPhaseChange?()
    }

    func startBreak(duration: TimeInterval? = nil) {
        guard let duration = duration ?? pendingBreakDuration else { return }
        pendingBreakDuration = nil
        phase = .breakTime
        isPaused = false
        segmentStart = Date()
        accumulated = 0
        countdownTotal = duration
        endDate = Date().addingTimeInterval(duration)
        pausedRemaining = nil
        refresh()
        onPhaseChange?()
    }

    func skipBreak() {
        guard phase == .breakTime else { return }
        finishBreak(playChime: false)
    }

    func extendFiveMinutes() {
        guard phase == .breakTime else { return }
        if let endDate {
            self.endDate = endDate.addingTimeInterval(300)
        } else if let pausedRemaining {
            self.pausedRemaining = pausedRemaining + 300
        } else {
            return
        }
        countdownTotal += 300
        refresh()
    }

    func reset() {
        pendingBreakDuration = nil
        goIdle(clearLastWork: true)
        onPhaseChange?()
    }

    // MARK: - 内部遷移

    private func finishBreak(playChime: Bool = true) {
        if playChime {
            playSound(named: settings.breakSound)
            signalFinished()
            if Bundle.main.bundleIdentifier != nil {
                NotificationManager.shared.notifyBreakEnded(autoWork: settings.autoStartWork)
            }
        }
        goIdle(clearLastWork: false)
        if settings.autoStartWork { startWork() }
        onPhaseChange?()
    }

    private func goIdle(clearLastWork: Bool) {
        phase = .idle
        isPaused = false
        pausedBySleep = false
        segmentStart = nil
        accumulated = 0
        endDate = nil
        countdownTotal = 0
        pausedRemaining = nil
        workCountdownTotal = 0
        workElapsedSeconds = 0
        bankedBreakSeconds = 0
        isApproachingEnd = false
        if clearLastWork { lastWorkSeconds = nil }
        refresh()
    }

    // MARK: - tick / 計算

    private func startTicker() {
        let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        timer.tolerance = 0.2
        RunLoop.main.add(timer, forMode: .common)
        ticker = timer
    }

    private func tick() {
        lastTick = Date()
        if phase == .idle {
            if settings.mode == .clock { refresh() }
            return
        }
        guard !isPaused else { return }
        refresh()

        if let endDate, Date() >= endDate {
            if phase == .breakTime {
                finishBreak()
            } else if phase == .work, activeMode == .pomodoro || activeMode == .timer {
                finishWork()
            }
        }

        if phase == .work, activeMode == .flow, !flowLimitSignaled,
           settings.flowMaxMinutes > 0,
           currentWorkedSeconds() >= TimeInterval(settings.flowMaxMinutes * 60) {
            flowLimitSignaled = true
            playSound(named: settings.workSound)
            signalFinished()
            if Bundle.main.bundleIdentifier != nil {
                NotificationManager.shared.notifyFlowLimit(minutes: settings.flowMaxMinutes)
            }
        }
    }

    private func refresh() {
        switch phase {
        case .idle:
            activeMode = settings.mode
            switch settings.mode {
            case .flow: displaySeconds = 0
            case .pomodoro: displaySeconds = settings.pomodoroWorkMinutes * 60
            case .timer: displaySeconds = settings.timerMinutes * 60
            case .clock:
                let parts = Calendar.current.dateComponents([.hour, .minute, .second], from: Date())
                displaySeconds = (parts.hour ?? 0) * 3600 + (parts.minute ?? 0) * 60 + (parts.second ?? 0)
            }
            progress = 0
            isApproachingEnd = false
        case .work:
            let worked = currentWorkedSeconds()
            workElapsedSeconds = Int(worked)
            if activeMode == .flow {
                displaySeconds = workElapsedSeconds
                bankedBreakSeconds = Int(max(60, worked / Double(settings.flowRatio)))
                if settings.flowMaxMinutes > 0 {
                    let limit = TimeInterval(settings.flowMaxMinutes * 60)
                    progress = min(1, worked / limit)
                    isApproachingEnd = !isPaused && worked >= limit - 60 && worked < limit
                } else {
                    progress = min(1, worked / (25 * 60))
                    isApproachingEnd = false
                }
            } else {
                let remaining = countdownRemaining()
                displaySeconds = Int(remaining.rounded(.up))
                progress = workCountdownTotal > 0 ? 1 - remaining / workCountdownTotal : 0
                isApproachingEnd = !isPaused && remaining > 0 && remaining <= 60
            }
        case .breakTime:
            let remaining = countdownRemaining()
            displaySeconds = Int(remaining.rounded(.up))
            progress = countdownTotal > 0 ? 1 - remaining / countdownTotal : 0
            isApproachingEnd = false
        }
    }

    private func currentWorkedSeconds() -> TimeInterval {
        var total = accumulated
        if let segmentStart, !isPaused { total += Date().timeIntervalSince(segmentStart) }
        return total
    }

    private func countdownRemaining() -> TimeInterval {
        if let endDate { return max(0, endDate.timeIntervalSince(Date())) }
        if let pausedRemaining { return max(0, pausedRemaining) }
        return max(0, countdownTotal)
    }

    /// スリープ復帰。5分超眠っていたら、作業を捨てずに「眠った時点で一時停止した」扱いにする（#65）。
    /// 眠っていた時間は集中にも休憩の貯金にも数えない。再開するか休憩を受け取るかはユーザーが選ぶ。
    /// `now` は自己テスト用（通常は現在時刻）。
    func handleWake(now: Date = Date()) {
        let gap = now.timeIntervalSince(lastTick)
        if phase == .work, !isPaused, gap > 5 * 60 {
            pause(at: min(lastTick, now))
            pausedBySleep = true
            onPhaseChange?()
        } else {
            refresh()
        }
    }

    // MARK: - 音と表示

    private func playSound(named name: String) {
        guard settings.soundEnabled, let sound = NSSound(named: name) else { return }
        sound.volume = Float(settings.soundVolume)
        sound.play()
    }

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

    func settingsChanged() {
        if phase == .idle { refresh() }
    }

    var timeString: String {
        let seconds = displaySeconds
        if phase == .idle, settings.mode == .clock {
            return String(format: "%02d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
        }
        return Self.durationString(seconds)
    }

    var workElapsedString: String { Self.durationString(workElapsedSeconds) }
    var lastWorkString: String? { lastWorkSeconds.map(Self.durationString) }

    var bankedBreakString: String {
        String(format: "%d:%02d", bankedBreakSeconds / 60, bankedBreakSeconds % 60)
    }

    var pendingBreakLabel: String? {
        guard let pendingBreakDuration else { return nil }
        let seconds = Int(pendingBreakDuration)
        let minutes = seconds / 60
        let rest = seconds % 60
        if minutes > 0 { return rest > 0 ? "\(minutes)分\(rest)秒" : "\(minutes)分" }
        return "\(seconds)秒"
    }

    private static func durationString(_ seconds: Int) -> String {
        if seconds >= 3600 {
            return String(format: "%d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
        }
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
