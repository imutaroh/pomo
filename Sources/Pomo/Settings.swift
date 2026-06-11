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

    private init() {
        let d = UserDefaults.standard
        mode = TimerMode(rawValue: d.string(forKey: "mode") ?? "") ?? .flow
        let ratio = d.integer(forKey: "flowRatio")
        flowRatio = ratio == 0 ? 5 : ratio
        let w = d.integer(forKey: "classicWorkMin")
        classicWorkMin = w == 0 ? 25 : w
        let sb = d.integer(forKey: "classicShortBreakMin")
        classicShortBreakMin = sb == 0 ? 5 : sb
        let lb = d.integer(forKey: "classicLongBreakMin")
        classicLongBreakMin = lb == 0 ? 15 : lb
        let sc = d.integer(forKey: "classicSetCount")
        classicSetCount = sc == 0 ? 4 : sc
        let fo = d.double(forKey: "focusOpacity")
        focusOpacity = fo == 0 ? 0.3 : fo
        autoStartBreak = d.object(forKey: "autoStartBreak") as? Bool ?? true
        autoStartWork = d.object(forKey: "autoStartWork") as? Bool ?? false
        soundEnabled = d.object(forKey: "soundEnabled") as? Bool ?? true
        breakFullscreen = d.object(forKey: "breakFullscreen") as? Bool ?? true
        deferOverlayInCall = d.object(forKey: "deferOverlayInCall") as? Bool ?? true
        askMemoOnBreak = d.object(forKey: "askMemoOnBreak") as? Bool ?? true
        workSound = d.string(forKey: "workSound") ?? "Glass"
        breakSound = d.string(forKey: "breakSound") ?? "Tink"
        soundVolume = d.object(forKey: "soundVolume") as? Double ?? 0.7
        let stm = d.integer(forKey: "simpleTimerMinutes")
        // 範囲外（0含む）は 10 分に倒す
        simpleTimerMinutes = (5...120).contains(stm) ? stm : 10
    }
}
