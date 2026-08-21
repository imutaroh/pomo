import AppKit
import ServiceManagement
import SwiftUI

/// 設定ページ。Settings は ObservableObject + 全項目 @Published なので双方向バインド直結。
/// メニューバー側の詳細設定はここに一本化した（メニューは「操作の場」、母艦は「タイマーと設定の場」）。
struct SettingsPage: View {
    @ObservedObject var engine: TimerEngine
    @ObservedObject private var settings = Settings.shared
    @State private var loginEnabled = SMAppService.mainApp.status == .enabled || LoginLaunch.agentInstalled
    @State private var loginNote: String?
    /// ダッシュボードへ戻る（母艦はサイドバーを持たないので、戻り道はページ側が抱える）
    private let back: () -> Void

    init(engine: TimerEngine, back: @escaping () -> Void) {
        self.engine = engine
        self.back = back
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    sectionEyebrow("SETTINGS")
                    Spacer()
                    BackToTimerLink(action: back)
                }
                Text("設定")
                    .pomoFont(18, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
                Text("タイマーの形式、休憩のふるまい、音。")
                    .pomoFont(12)
                    .foregroundStyle(Tokens.sumiSecondary)
            }
            .staggeredAppear(0)

            timerSection.staggeredAppear(1)
            breakSection.staggeredAppear(2)
            displaySection.staggeredAppear(3)
            soundSection.staggeredAppear(4)
            shortcutSection.staggeredAppear(5)
            generalSection.staggeredAppear(6)
        }
        // モード・時間の変更を待機中の表示へ反映
        .onChange(of: settings.mode) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.pomodoroWorkMinutes) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.timerMinutes) { _, _ in engine.settingsChanged() }
    }

    // MARK: - タイマー

    private var timerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("タイマー")
            VStack(alignment: .leading, spacing: 16) {
                Picker("", selection: $settings.mode) {
                    Text("フロー").tag(TimerMode.flow)
                    Text("ポモドーロ").tag(TimerMode.pomodoro)
                    Text("タイマー").tag(TimerMode.timer)
                    Text("時計").tag(TimerMode.clock)
                }
                .pickerStyle(.segmented)
                .labelsHidden()

                Text(modeDescription)
                    .pomoFont(12)
                    .foregroundStyle(Tokens.sumiSecondary)

                Divider().overlay(Tokens.sumi.opacity(0.05))

                // モード切替で条件行が静かに差し替わる
                Group {
                    switch settings.mode {
                    case .flow:
                        settingRow("休憩の長さ") {
                            Picker("", selection: $settings.flowRatio) {
                                ForEach([3, 4, 5, 6], id: \.self) { r in
                                    Text("作業の 1/\(r)（45分なら約\(45 / r)分）").tag(r)
                                }
                            }
                            .labelsHidden()
                        }
                        settingRow("フローの上限") {
                            Picker("", selection: $settings.flowMaxMinutes) {
                                Text("なし").tag(0)
                                ForEach([45, 60, 90, 120, 180], id: \.self) { m in
                                    Text("\(m)分").tag(m)
                                }
                            }
                            .labelsHidden()
                        }
                        if settings.flowMaxMinutes > 0 {
                            Text("上限に届いても止めません。合図（音・グロー・通知）だけ出し、リングは上限を分母に満ちていきます。")
                                .pomoFont(12)
                                .foregroundStyle(Tokens.sumiSecondary)
                                .transition(.opacity)
                        }
                    case .pomodoro:
                        settingRow("作業") {
                            stepper(value: $settings.pomodoroWorkMinutes, range: 5...120, step: 5, unit: "分")
                        }
                        settingRow("休憩") {
                            stepper(value: $settings.pomodoroBreakMinutes, range: 1...30, step: 1, unit: "分")
                        }
                    case .timer:
                        settingRow("計測時間") {
                            stepper(value: $settings.timerMinutes, range: 5...120, step: 5, unit: "分")
                        }
                    case .clock:
                        Text("現在時刻を表示するだけのモードです。開始・一時停止・記録はありません。")
                            .pomoFont(12)
                            .foregroundStyle(Tokens.sumiSecondary)
                    }
                }
                .transition(.opacity)
            }
            .animation(.easeOut(duration: 0.25), value: settings.mode)
            .pomoCard()
        }
    }

    private var modeDescription: String {
        switch settings.mode {
        case .flow: return "作業はカウントアップ。終えると、作業した時間に応じた休憩が自動で算出されます。"
        case .pomodoro: return "残り時間と今回の経過時間を見ながら、決まった長さで集中と休憩を切り替えます。"
        case .timer: return "好きな時間を測るだけのカウントダウンタイマーです。"
        case .clock: return "現在時刻を表示します。開始操作はありません。"
        }
    }

    // MARK: - 休憩

    private var breakSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("休憩")
            VStack(alignment: .leading, spacing: 14) {
                toggleRow("休憩を自動開始", isOn: $settings.autoStartBreak)
                toggleRow("次の作業を自動開始", isOn: $settings.autoStartWork)
                toggleRow("休憩は全画面で（休憩モード）", isOn: $settings.breakFullscreen)
                if settings.breakFullscreen {
                    toggleRow("通話・会議中は全画面にしない", isOn: $settings.deferOverlayInCall)
                        .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.25), value: settings.breakFullscreen)
            .pomoCard()
        }
    }

    // MARK: - 表示

    private var displaySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("表示")
            VStack(alignment: .leading, spacing: 14) {
                settingRow("集中時の濃さ") {
                    Picker("", selection: opacityBinding) {
                        Text("15%（ほぼ消える）").tag(15)
                        Text("30%").tag(30)
                        Text("50%").tag(50)
                        Text("70%").tag(70)
                        Text("100%（透けない）").tag(100)
                    }
                    .labelsHidden()
                }
                Text("タイマー実行中、パネルがどれくらい見えるか。マウスを乗せると必ず戻ります。")
                    .pomoFont(12)
                    .foregroundStyle(Tokens.sumiSecondary)
            }
            .pomoCard()
        }
    }

    private var opacityBinding: Binding<Int> {
        Binding(
            get: { Int((settings.focusOpacity * 100).rounded()) },
            set: { settings.focusOpacity = Double($0) / 100 }
        )
    }

    // MARK: - サウンド

    private static let soundChoices = ["Glass", "Tink", "Pop", "Purr", "Blow", "Hero", "Submarine", "Ping"]

    private var soundSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("サウンド")
            VStack(alignment: .leading, spacing: 14) {
                toggleRow("鳴らす", isOn: $settings.soundEnabled)
                if settings.soundEnabled {
                    Group {
                        settingRow("作業おわりの音") {
                            soundPicker($settings.workSound)
                        }
                        settingRow("休憩おわりの音") {
                            soundPicker($settings.breakSound)
                        }
                        settingRow("音量") {
                            Slider(value: $settings.soundVolume, in: 0.1...1.0) { editing in
                                if !editing { previewSound(settings.workSound) }
                            }
                            .frame(maxWidth: 220)
                            .tint(Tokens.kohaku)
                        }
                    }
                    .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.25), value: settings.soundEnabled)
            .pomoCard()
        }
        // 選ぶと試し鳴らし（メニュー時代と同じふるまい）
        .onChange(of: settings.workSound) { _, name in previewSound(name) }
        .onChange(of: settings.breakSound) { _, name in previewSound(name) }
    }

    private func soundPicker(_ selection: Binding<String>) -> some View {
        Picker("", selection: selection) {
            ForEach(Self.soundChoices, id: \.self) { Text($0).tag($0) }
        }
        .labelsHidden()
    }

    private func previewSound(_ name: String) {
        guard let s = NSSound(named: name) else { return }
        s.volume = Float(settings.soundVolume)
        s.play()
    }

    // MARK: - ショートカット

    /// グローバルショートカット（M7）の一覧。tooltip でしか知る手段がなく発見性が低かったので明示する。
    /// 変更機能は持たない（表示のみ。カスタマイズは需要が出てから）
    private var shortcutSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("ショートカット")
            VStack(alignment: .leading, spacing: 14) {
                shortcutRow("開始 / 一時停止", keys: "⌃⌥P", note: "どのアプリにいても効く")
                shortcutRow("パネルを表示 / 隠す", keys: "⌃⌥T", note: "どのアプリにいても効く")
                shortcutRow("ページ移動", keys: "⌘1〜4", note: "母艦ウィンドウを開く")
                shortcutRow("ウィンドウを閉じる", keys: "⌘W", note: "パネルも出さず、すべてしまう")
            }
            .pomoCard()
        }
    }

    private func shortcutRow(_ label: String, keys: String, note: String) -> some View {
        HStack {
            Text(label)
                .pomoFont(13)
                .foregroundStyle(Tokens.sumi)
            if !note.isEmpty {
                Text(note)
                    .pomoFont(11)
                    .foregroundStyle(Tokens.sumiTertiary)
            }
            Spacer()
            Text(keys)
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundStyle(Tokens.sumi.opacity(0.75))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(RoundedRectangle(cornerRadius: 6).fill(Tokens.sumi.opacity(0.05)))
        }
    }

    // MARK: - 一般

    private var generalSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("一般")
            VStack(alignment: .leading, spacing: 14) {
                Toggle("ログイン時に起動", isOn: $loginEnabled)
                    .toggleStyle(.switch)
                    .tint(Tokens.kohaku)
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumi)
                    .onChange(of: loginEnabled) { _, enabled in
                        if enabled {
                            // まず正規ルート（SMAppService）。ad-hoc 署名では失敗する既知の制約があるため、
                            // 非サンドボックス環境に限り LaunchAgent フォールバックで「Macを開いたらそこにいる」を保証する
                            try? SMAppService.mainApp.register()
                            if SMAppService.mainApp.status == .enabled {
                                LoginLaunch.removeAgent() // 二重起動経路を残さない
                                loginNote = nil
                            } else if !LoginLaunch.isSandboxed, (try? LoginLaunch.installAgent()) != nil {
                                loginNote = "LaunchAgent 方式で設定しました（ad-hoc ビルド用の代替。次回ログインから有効）"
                            } else {
                                // 登録できなかった: 理由を表示してトグルを戻す。
                                // 戻し（false 代入）で onChange が再入し else 分岐に入るが、
                                // そこでは loginNote を消さないので文言は残る。
                                loginNote = "ログイン項目を登録できませんでした（署名済みのビルドで有効になります）"
                                loginEnabled = false
                            }
                        } else {
                            try? SMAppService.mainApp.unregister()
                            LoginLaunch.removeAgent()
                        }
                    }
                if let loginNote {
                    Text(loginNote)
                        .pomoFont(12)
                        .foregroundStyle(Tokens.sumiTertiary)
                }
                let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
                Text("Fika v\(version)")
                    .pomoFont(12)
                    .foregroundStyle(Tokens.sumiTertiary)
            }
            .pomoCard()
        }
    }

    // MARK: - 部品

    private func settingRow<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label)
                .pomoFont(13)
                .foregroundStyle(Tokens.sumi)
            Spacer()
            content()
        }
    }

    private func toggleRow(_ label: String, isOn: Binding<Bool>) -> some View {
        Toggle(label, isOn: isOn)
            .toggleStyle(.switch)
            .tint(Tokens.kohaku)
            .pomoFont(13)
            .foregroundStyle(Tokens.sumi)
    }

    private func stepper(value: Binding<Int>, range: ClosedRange<Int>, step: Int, unit: String) -> some View {
        HStack(spacing: 10) {
            Text("\(value.wrappedValue)\(unit)")
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(Tokens.sumi)
            Stepper("", value: value, in: range, step: step)
                .labelsHidden()
        }
    }
}
