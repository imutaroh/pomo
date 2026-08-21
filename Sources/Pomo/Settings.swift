import Foundation

enum TimerMode: String, Codable, CaseIterable {
    case flow       // 作業カウントアップ → 停止で休憩を比率算出
    case pomodoro   // 固定カウントダウン → 固定休憩
    case timer      // 任意分数のカウントダウンのみ
    case clock      // 現在時刻の表示のみ
}

@MainActor
final class Settings: ObservableObject {
    static let shared = Settings()

    private let d = UserDefaults.standard

    @Published var mode: TimerMode {
        didSet { d.set(mode.rawValue, forKey: "mode") }
    }
    /// フローモードの休憩比率（作業時間 ÷ この値 = 休憩時間）。デフォルト 5 → 45分作業で9分休憩
    @Published var flowRatio: Int {
        didSet { d.set(flowRatio, forKey: "flowRatio") }
    }
    @Published var pomodoroWorkMinutes: Int {
        didSet { d.set(pomodoroWorkMinutes, forKey: "pomodoroWorkMinutes") }
    }
    @Published var pomodoroBreakMinutes: Int {
        didSet { d.set(pomodoroBreakMinutes, forKey: "pomodoroBreakMinutes") }
    }
    /// 集中時（タイマー実行中・非ホバー）のパネル不透明度。Flow の苦情対策で下限を持つ
    @Published var focusOpacity: Double {
        didSet { d.set(focusOpacity, forKey: "focusOpacity") }
    }
    /// 休憩の自動開始（デフォルト ON）/ 次の作業の自動開始（デフォルト OFF）— 非対称トグル（M3）
    @Published var autoStartBreak: Bool {
        didSet { d.set(autoStartBreak, forKey: "autoStartBreak") }
    }
    @Published var autoStartWork: Bool {
        didSet { d.set(autoStartWork, forKey: "autoStartWork") }
    }
    @Published var soundEnabled: Bool {
        didSet { d.set(soundEnabled, forKey: "soundEnabled") }
    }
    /// 休憩を全画面オーバーレイで表示する（休憩モード）
    @Published var breakFullscreen: Bool {
        didSet { d.set(breakFullscreen, forKey: "breakFullscreen") }
    }
    /// 通話・会議中（マイク使用中）は全画面オーバーレイを出さない（即アンインストール級クレームの予防）
    @Published var deferOverlayInCall: Bool {
        didSet { d.set(deferOverlayInCall, forKey: "deferOverlayInCall") }
    }
    @Published var workSound: String {
        didSet { d.set(workSound, forKey: "workSound") }
    }
    @Published var breakSound: String {
        didSet { d.set(breakSound, forKey: "breakSound") }
    }
    @Published var soundVolume: Double {
        didSet { d.set(soundVolume, forKey: "soundVolume") }
    }
    /// タイマーモードの計測時間（分）。範囲: 5〜120
    @Published var timerMinutes: Int {
        didSet { d.set(timerMinutes, forKey: "timerMinutes") }
    }
    /// フローの上限リマインド（分）。0 = なし。届いても止めない（看守ではなく秘書）—
    /// 合図（音・グロー・通知）だけ出す。設定時はリング/バーの分母がこの値になる
    @Published var flowMaxMinutes: Int {
        didSet { d.set(flowMaxMinutes, forKey: "flowMaxMinutes") }
    }

    private init() {
        let d = UserDefaults.standard
        // 読み込み値は UI と同じ範囲にクランプする（壊れた plist・移行ミスの異常値をそのまま通さない）。
        // 未設定（0）も範囲外としてデフォルトに倒れる
        func clamped(_ key: String, _ range: ClosedRange<Int>, default def: Int) -> Int {
            let v = d.integer(forKey: key)
            return range.contains(v) ? v : def
        }
        // v0.9.3 以前の rawValue を新しいモード名へ移行する。既存の時間設定も下で引き継ぐ。
        switch d.string(forKey: "mode") {
        case "classic": mode = .pomodoro
        case "simple": mode = .timer
        case let raw?: mode = TimerMode(rawValue: raw) ?? .flow
        case nil: mode = .flow
        }
        flowRatio = clamped("flowRatio", 3...6, default: 5)
        pomodoroWorkMinutes = clampedMigrating("pomodoroWorkMinutes", legacy: "classicWorkMin", 5...120, default: 25)
        pomodoroBreakMinutes = clampedMigrating("pomodoroBreakMinutes", legacy: "classicShortBreakMin", 1...30, default: 5)
        let fo = d.double(forKey: "focusOpacity")
        focusOpacity = (0.15...1.0).contains(fo) ? fo : 0.3
        autoStartBreak = d.object(forKey: "autoStartBreak") as? Bool ?? true
        autoStartWork = d.object(forKey: "autoStartWork") as? Bool ?? false
        soundEnabled = d.object(forKey: "soundEnabled") as? Bool ?? true
        breakFullscreen = d.object(forKey: "breakFullscreen") as? Bool ?? true
        deferOverlayInCall = d.object(forKey: "deferOverlayInCall") as? Bool ?? true
        workSound = d.string(forKey: "workSound") ?? "Glass"
        breakSound = d.string(forKey: "breakSound") ?? "Tink"
        let vol = d.object(forKey: "soundVolume") as? Double ?? 0.7
        soundVolume = (0.1...1.0).contains(vol) ? vol : 0.7
        timerMinutes = clampedMigrating("timerMinutes", legacy: "simpleTimerMinutes", 5...120, default: 10)
        let fm = d.integer(forKey: "flowMaxMinutes")
        flowMaxMinutes = (30...180).contains(fm) ? fm : 0 // 0 = なし（デフォルト）

        func clampedMigrating(_ key: String, legacy: String, _ range: ClosedRange<Int>, default def: Int) -> Int {
            let source = d.object(forKey: key) == nil ? legacy : key
            return clamped(source, range, default: def)
        }
    }
}
