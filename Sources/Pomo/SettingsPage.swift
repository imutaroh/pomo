import AppKit
import ServiceManagement
import SwiftUI

/// 設定ページ。Settings は ObservableObject + 全項目 @Published なので双方向バインド直結。
/// メニューバー側の詳細設定はここに一本化した（メニューは「操作の場」、母艦は「設定と振り返りの場」）。
struct SettingsPage: View {
    @ObservedObject var engine: TimerEngine
    @ObservedObject private var settings = Settings.shared
    @State private var loginEnabled = SMAppService.mainApp.status == .enabled
    @State private var loginNote: String?

    init(engine: TimerEngine) {
        self.engine = engine
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 6) {
                Text("設定")
                    .pomoFont(28, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
                Text("タイマーの形式、休憩のふるまい、音。")
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumiSecondary)
            }
            .staggeredAppear(0)

            timerSection.staggeredAppear(1)
            breakSection.staggeredAppear(2)
            displaySection.staggeredAppear(3)
            soundSection.staggeredAppear(4)
            generalSection.staggeredAppear(5)
        }
        // モード・時間の変更を待機中の表示（クラシックの予告時間等）へ反映
        .onChange(of: settings.mode) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.classicWorkMin) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.simpleTimerMinutes) { _, _ in engine.settingsChanged() }
    }

    // MARK: - タイマー

    private var timerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("タイマー")
            VStack(alignment: .leading, spacing: 16) {
                Picker("", selection: $settings.mode) {
                    Text("フロー").tag(TimerMode.flow)
                    Text("クラシック").tag(TimerMode.classic)
                    Text("タイマー").tag(TimerMode.simple)
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
                    case .classic:
                        settingRow("作業") {
                            stepper(value: $settings.classicWorkMin, range: 5...120, step: 5, unit: "分")
                        }
                        settingRow("短い休憩") {
                            stepper(value: $settings.classicShortBreakMin, range: 1...30, step: 1, unit: "分")
                        }
                        settingRow("長い休憩") {
                            stepper(value: $settings.classicLongBreakMin, range: 5...60, step: 5, unit: "分")
                        }
                        settingRow("長い休憩までのセット数") {
                            stepper(value: $settings.classicSetCount, range: 2...8, step: 1, unit: "セット")
                        }
                    case .simple:
                        settingRow("計測時間") {
                            stepper(value: $settings.simpleTimerMinutes, range: 5...120, step: 5, unit: "分")
                        }
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
        case .classic: return "決まった時間で作業と休憩を繰り返す、いわゆるポモドーロ。"
        case .simple: return "好きな時間を測るだけのキッチンタイマー。記録には残りません。"
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
                    toggleRow("休憩のはじめにメモを聞く", isOn: $settings.askMemoOnBreak)
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
                        // ad-hoc 署名のローカルビルドではパス変更で登録が外れることがある（既知の制約）
                        if enabled {
                            try? SMAppService.mainApp.register()
                            if SMAppService.mainApp.status == .enabled {
                                loginNote = nil
                            } else {
                                // 登録できなかった: 理由を表示してトグルを戻す。
                                // 戻し（false 代入）で onChange が再入し else 分岐に入るが、
                                // そこでは loginNote を消さないので文言は残る。
                                loginNote = "ログイン項目を登録できませんでした（署名済みのビルドで有効になります）"
                                loginEnabled = false
                            }
                        } else {
                            try? SMAppService.mainApp.unregister()
                        }
                    }
                if let loginNote {
                    Text(loginNote)
                        .pomoFont(12)
                        .foregroundStyle(Tokens.sumiTertiary)
                }
                let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
                Text("Pomo v\(version)")
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
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Tokens.sumi)
            Stepper("", value: value, in: range, step: step)
                .labelsHidden()
        }
    }
}
