import Foundation

enum TimerMode: String, Codable, CaseIterable {
    case flow      // 作業カウントアップ → 停止で休憩を比率算出（主役）
    case classic   // 固定カウントダウン（従）
    case simple    // 単純タイマー: 任意分数のカウントダウンのみ。記録なし
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
    @Published var classicWorkMin: Int {
        didSet { d.set(classicWorkMin, forKey: "classicWorkMin") }
    }
    @Published var classicShortBreakMin: Int {
        didSet { d.set(classicShortBreakMin, forKey: "classicShortBreakMin") }
    }
    @Published var classicLongBreakMin: Int {
        didSet { d.set(classicLongBreakMin, forKey: "classicLongBreakMin") }
    }
    @Published var classicSetCount: Int {
        didSet { d.set(classicSetCount, forKey: "classicSetCount") }
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
    /// 休憩のはじめに「何してた？」を聞く（interstitial journaling。スキップ自由）
    @Published var askMemoOnBreak: Bool {
        didSet { d.set(askMemoOnBreak, forKey: "askMemoOnBreak") }
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
    /// 単純タイマーの計測時間（分）。範囲: 5〜120
    @Published var simpleTimerMinutes: Int {
        didSet { d.set(simpleTimerMinutes, forKey: "simpleTimerMinutes") }
    }
    /// フローの上限リマインド（分）。0 = なし。届いても止めない（看守ではなく秘書）—
    /// 合図（音・グロー・通知）だけ出す。設定時はリング/バーの分母がこの値になる
    @Published var flowMaxMinutes: Int {
        didSet { d.set(flowMaxMinutes, forKey: "flowMaxMinutes") }
    }
    /// はじまりの合図（opt-in・デフォルトOFF）。1日1回だけ「今日をはじめますか」を通知する。
    /// その日すでに作業していれば鳴らない。ストリークにしない・記録しない（ルーティンの入口、看守にしない）
    @Published var dayStartEnabled: Bool {
        didSet { d.set(dayStartEnabled, forKey: "dayStartEnabled") }
    }
    /// はじまりの合図の時刻（0時からの分）。デフォルト 9:30 = 570
    @Published var dayStartMinutes: Int {
        didSet { d.set(dayStartMinutes, forKey: "dayStartMinutes") }
    }

    private init() {
        let d = UserDefaults.standard
        // 読み込み値は UI と同じ範囲にクランプする（壊れた plist・移行ミスの異常値をそのまま通さない）。
        // 未設定（0）も範囲外としてデフォルトに倒れる
        func clamped(_ key: String, _ range: ClosedRange<Int>, default def: Int) -> Int {
            let v = d.integer(forKey: key)
            return range.contains(v) ? v : def
        }
        mode = TimerMode(rawValue: d.string(forKey: "mode") ?? "") ?? .flow
        flowRatio = clamped("flowRatio", 3...6, default: 5)
        classicWorkMin = clamped("classicWorkMin", 5...120, default: 25)
        classicShortBreakMin = clamped("classicShortBreakMin", 1...30, default: 5)
        classicLongBreakMin = clamped("classicLongBreakMin", 5...60, default: 15)
        classicSetCount = clamped("classicSetCount", 2...8, default: 4)
        let fo = d.double(forKey: "focusOpacity")
        focusOpacity = (0.15...1.0).contains(fo) ? fo : 0.3
        autoStartBreak = d.object(forKey: "autoStartBreak") as? Bool ?? true
        autoStartWork = d.object(forKey: "autoStartWork") as? Bool ?? false
        soundEnabled = d.object(forKey: "soundEnabled") as? Bool ?? true
        breakFullscreen = d.object(forKey: "breakFullscreen") as? Bool ?? true
        deferOverlayInCall = d.object(forKey: "deferOverlayInCall") as? Bool ?? true
        askMemoOnBreak = d.object(forKey: "askMemoOnBreak") as? Bool ?? true
        workSound = d.string(forKey: "workSound") ?? "Glass"
        breakSound = d.string(forKey: "breakSound") ?? "Tink"
        let vol = d.object(forKey: "soundVolume") as? Double ?? 0.7
        soundVolume = (0.1...1.0).contains(vol) ? vol : 0.7
        simpleTimerMinutes = clamped("simpleTimerMinutes", 5...120, default: 10)
        let fm = d.integer(forKey: "flowMaxMinutes")
        flowMaxMinutes = (30...180).contains(fm) ? fm : 0 // 0 = なし（デフォルト）
        dayStartEnabled = d.object(forKey: "dayStartEnabled") as? Bool ?? false
        let dsm = d.integer(forKey: "dayStartMinutes")
        dayStartMinutes = (0...(24 * 60 - 1)).contains(dsm) && dsm != 0 ? dsm : 570 // 9:30
    }
}
