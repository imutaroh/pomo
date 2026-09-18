import AppKit
import Combine
import Foundation
import os

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
    /// この作業中に Fika が動いていなかった（スリープしていた）合計秒数。集中には数えていない（#69）。
    /// 次の作業開始・待機で消える
    @Published private(set) var sleepExcludedSeconds = 0
    @Published private(set) var pendingBreakDuration: TimeInterval?

    /// tick の間隔がこれを超えたら「Fika が動いていなかった」＝スリープとみなし、その時間を集中から除く。
    /// 通常の tick は 0.5 秒。App Nap で間引かれても数十秒には届かないので、1 分で線を引く（#69）
    static let sleepGapThreshold: TimeInterval = 60

    /// 状態遷移の記録。「勝手に止まった／休憩になった」の再発時に
    /// `log show --predicate 'subsystem == "com.imutaakihiro.pomo"' --last 1h` で引き金を辿るため（#69）。
    /// 計測結果は書かない（ローカル完結・履歴なしの原則はそのまま）
    private static let log = Logger(subsystem: "com.imutaakihiro.pomo", category: "timer")

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
        // 復帰の瞬間に表示を追いつかせる。スリープ分の除外は tick の間隔で検出するので、ここでは tick を呼ぶだけ
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        startTicker()
        refresh()
    }

    // MARK: - 操作
    //
    // 操作系の `file` / `line` は呼び出し元で自動的に埋まる（#fileID / #line は呼び出し側で評価される）。
    // 呼ぶ側は何も渡さなくてよい。ログに「どのボタン・メニュー・通知が引き金か」を残すためだけの引数

    func startWork(file: StaticString = #fileID, line: UInt = #line) {
        guard phase == .idle, settings.mode != .clock else { return }
        Self.log.info("startWork mode=\(self.settings.mode.rawValue, privacy: .public) from \(file, privacy: .public):\(line)")
        activeMode = settings.mode
        phase = .work
        isPaused = false
        justFinished = false
        flowLimitSignaled = false
        pendingBreakDuration = nil
        lastWorkSeconds = nil
        sleepExcludedSeconds = 0
        let now = Date() // 開始時刻と終了予定時刻は同じ瞬間から測る
        lastTick = now
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

    func togglePause(file: StaticString = #fileID, line: UInt = #line) {
        switch phase {
        case .idle:
            startWork(file: file, line: line) // 時計モードでは何もしない
        case .work, .breakTime:
            Self.log.info("\(self.isPaused ? "resume" : "pause", privacy: .public) from \(file, privacy: .public):\(line)")
            isPaused ? resume() : pause()
        }
    }

    private func pause() {
        guard !isPaused else { return }
        isPaused = true
        let now = Date()
        if let segmentStart {
            accumulated += max(0, now.timeIntervalSince(segmentStart))
            self.segmentStart = nil
        }
        if let endDate {
            pausedRemaining = max(0, endDate.timeIntervalSince(now))
            self.endDate = nil
        }
        refresh()
    }

    private func resume() {
        guard isPaused else { return }
        isPaused = false
        let now = Date()
        lastTick = now // 停止中の空白をスリープと誤認しない
        segmentStart = now
        if phase == .breakTime || activeMode != .flow {
            endDate = now.addingTimeInterval(countdownRemaining())
        }
        pausedRemaining = nil
        refresh()
    }

    /// フロー/ポモドーロの作業を終え、今回の作業時間だけを休憩中に引き継ぐ。
    /// タイマーは終了通知だけで待機へ戻り、休憩や作業時間には結び付けない。
    func finishWork(file: StaticString = #fileID, line: UInt = #line) {
        guard phase == .work else { return }
        Self.log.info("finishWork mode=\(self.activeMode.rawValue, privacy: .public) worked=\(Int(self.currentWorkedSeconds()))s from \(file, privacy: .public):\(line)")

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

    func startBreak(duration: TimeInterval? = nil, file: StaticString = #fileID, line: UInt = #line) {
        guard let duration = duration ?? pendingBreakDuration else { return }
        Self.log.info("startBreak \(Int(duration))s from \(file, privacy: .public):\(line)")
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

    func skipBreak(file: StaticString = #fileID, line: UInt = #line) {
        guard phase == .breakTime else { return }
        Self.log.info("skipBreak from \(file, privacy: .public):\(line)")
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

    func reset(file: StaticString = #fileID, line: UInt = #line) {
        Self.log.info("reset phase=\(String(describing: self.phase), privacy: .public) from \(file, privacy: .public):\(line)")
        pendingBreakDuration = nil
        goIdle(clearLastWork: true)
        onPhaseChange?()
    }

    // MARK: - 内部遷移

    private func finishBreak(playChime: Bool = true) {
        Self.log.info("finishBreak autoStartWork=\(self.settings.autoStartWork)")
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
        sleepExcludedSeconds = 0
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

    /// `now` は自己テスト用（通常は現在時刻）
    func tick(now: Date = Date()) {
        let gap = now.timeIntervalSince(lastTick)
        lastTick = now
        if phase == .idle {
            if settings.mode == .clock { refresh() }
            return
        }
        guard !isPaused else { return }

        // 前回の tick からの空白がしきい値を超えていたら、その間 Fika は動いていなかった（スリープ）。
        // 止めて待つのではなく、空白ぶんだけ開始時刻と終了予定を後ろへずらして続ける（#69）。
        // 眠っていた時間は集中にも休憩の貯金にも数えない。休憩中の空白は休息なのでそのまま数える
        if phase == .work, gap > Self.sleepGapThreshold {
            Self.log.info("sleep gap \(Int(gap))s excluded from work")
            segmentStart = segmentStart?.addingTimeInterval(gap)
            endDate = endDate?.addingTimeInterval(gap)
            sleepExcludedSeconds += Int(gap)
        }
        refresh()

        if let endDate, now >= endDate {
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
        if let segmentStart, !isPaused { total += max(0, Date().timeIntervalSince(segmentStart)) }
        return total
    }

    private func countdownRemaining() -> TimeInterval {
        if let endDate { return max(0, endDate.timeIntervalSince(Date())) }
        if let pausedRemaining { return max(0, pausedRemaining) }
        return max(0, countdownTotal)
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
        return Self.minutesLabel(Int(pendingBreakDuration))
    }

    /// 作業中にスリープで除いた時間の説明。除外がなければ nil（見せるものがない）
    var sleepExcludedLabel: String? {
        guard phase == .work, sleepExcludedSeconds > 0 else { return nil }
        return "スリープ \(Self.minutesLabel(sleepExcludedSeconds))は数えていません"
    }

    private static func minutesLabel(_ seconds: Int) -> String {
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
