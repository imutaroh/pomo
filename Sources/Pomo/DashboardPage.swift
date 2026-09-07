import SwiftUI

/// 母艦のホーム。履歴も統計も持たず、いま使うタイマーだけを地（canvas）に直置きする。
/// 白カードで囲わないのは、420×540 の縦長ではカード枠が窓枠と二重に見えるため（2026-08-20 のミニマム化）。
struct DashboardPage: View {
    @ObservedObject var engine: TimerEngine
    @ObservedObject private var settings = Settings.shared
    /// 作業を始めて、そのままパネルへ移る
    var enterFocus: () -> Void
    /// 計測には触らず、母艦を閉じてパネルへ戻る
    var shrinkToPanel: () -> Void

    /// 待機中はモード選択と時間設定が挟まるぶん、行間を詰める
    private var stackSpacing: CGFloat { engine.phase == .idle ? 18 : 22 }

    var body: some View {
        VStack(spacing: stackSpacing) {
            header.staggeredAppear(0)
            timerStack.staggeredAppear(1)
        }
        .frame(maxWidth: .infinity)
        .animation(.easeOut(duration: 0.3), value: engine.phase)
        .animation(.easeOut(duration: 0.25), value: settings.mode)
        .onChange(of: settings.mode) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.pomodoroWorkMinutes) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.timerMinutes) { _, _ in engine.settingsChanged() }
    }

    // MARK: - ヘッダー（左に状態、右にパネルへの導線か計測の副情報）

    private var header: some View {
        HStack(spacing: 8) {
            status
            Spacer(minLength: 8)
            trailing
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var status: some View {
        if engine.phase == .idle {
            sectionEyebrow(statusText)
        } else {
            HStack(spacing: 7) {
                // 実行中だけ灯る点。一時停止では消して「止まっている」を色で示す
                Circle()
                    .fill(engine.isPaused ? Tokens.sumi.opacity(0.25) : Tokens.kohaku)
                    .frame(width: 7, height: 7)
                Text(statusText)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .tracking(1.4)
                    .foregroundStyle(Tokens.sumiSecondary)
            }
            .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private var trailing: some View {
        if engine.phase == .idle, settings.mode != .clock {
            InlineLink(title: "パネルで始める", symbol: "rectangle.bottomthird.inset.filled", action: enterFocus)
                .help("母艦を閉じて、パネルだけで計測を始める")
        } else if let detailLabel {
            Text(detailLabel)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Tokens.kohakuText)
                .contentTransition(.numericText())
        } else {
            // 「パネルで始める」も副情報も出ない状態（時計・フロー作業中など）でも、パネルへの戻り道は絶やさない
            InlineLink(title: "パネルへ", symbol: "rectangle.bottomthird.inset.filled", action: shrinkToPanel)
                .help("ウィンドウを閉じて、フローティングパネルで続ける")
        }
    }

    private var statusText: String {
        switch engine.phase {
        case .idle: return settings.mode == .clock ? "CLOCK" : "TIMER"
        case .work:
            if engine.isPaused { return "PAUSED" }
            return engine.activeMode == .timer ? "TIMER" : "FOCUS"
        case .breakTime: return engine.isPaused ? "PAUSED" : "BREAK"
        }
    }

    private var phaseLabel: String {
        switch engine.phase {
        case .idle:
            if settings.mode == .clock { return "現在時刻" }
            if let pending = engine.pendingBreakLabel { return "\(pending)の休憩が待っています" }
            return "いつでもどうぞ"
        case .work:
            if engine.isPaused { return engine.pausedBySleep ? "スリープで一時停止" : "一時停止" }
            return engine.activeMode == .timer ? "タイマー" : "集中"
        case .breakTime: return engine.isPaused ? "休憩を一時停止" : "休憩"
        }
    }

    private var detailLabel: String? {
        if engine.phase == .work, engine.activeMode == .pomodoro {
            return "今回の経過 \(engine.workElapsedString)"
        }
        if engine.phase == .breakTime, let worked = engine.lastWorkString {
            return "今回の集中 \(worked)"
        }
        return nil
    }

    // MARK: - リング・モード選択・操作

    private var timerStack: some View {
        VStack(spacing: stackSpacing) {
            ring

            if engine.phase == .idle {
                timerSetup.transition(.opacity)
            }

            if engine.phase == .work, engine.activeMode == .flow {
                BankedBreakPill(engine: engine).transition(.opacity)
            }

            TimerControlsView(engine: engine, settings: settings, large: true, hideTimerAdjust: true)
                .padding(.top, engine.phase == .idle ? 0 : 6)
        }
    }

    private var ring: some View {
        ZStack {
            TimerRing(
                progress: engine.progress,
                active: engine.phase != .idle,
                saturated: engine.phase == .work && engine.activeMode == .flow && engine.progress >= 1,
                glowing: engine.justFinished
            )
            .frame(width: 190, height: 190)
            .accessibilityHidden(true)

            VStack(spacing: 4) {
                Text(engine.timeString)
                    .font(.system(size: settings.mode == .clock && engine.phase == .idle ? 36 : 42,
                                  weight: .medium, design: .monospaced))
                    .tracking(-1.5)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .foregroundStyle(Tokens.sumi)
                    .contentTransition(.numericText())
                Text(phaseLabel)
                    .pomoFont(12, weight: .medium)
                    .foregroundStyle(Tokens.sumiSecondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .padding(.horizontal, 18)
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder
    private var timerSetup: some View {
        VStack(spacing: 14) {
            HStack(spacing: 8) {
                SelectChip(label: "フロー", selected: settings.mode == .flow) { settings.mode = .flow }
                SelectChip(label: "ポモドーロ", selected: settings.mode == .pomodoro) { settings.mode = .pomodoro }
                SelectChip(label: "タイマー", selected: settings.mode == .timer) { settings.mode = .timer }
                SelectChip(label: "時計", selected: settings.mode == .clock) { settings.mode = .clock }
            }

            switch settings.mode {
            case .flow:
                Text("止めるまで、今回の経過時間を測ります。")
                    .pomoFont(12).foregroundStyle(Tokens.sumiSecondary)
            case .pomodoro:
                durationRow("集中する時間", value: $settings.pomodoroWorkMinutes)
            case .timer:
                durationRow("タイマーの時間", value: $settings.timerMinutes)
            case .clock:
                Text("現在時刻を表示します。開始操作はありません。")
                    .pomoFont(12).foregroundStyle(Tokens.sumiSecondary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func durationRow(_ label: String, value: Binding<Int>) -> some View {
        VStack(spacing: 8) {
            Text(label).pomoFont(12, weight: .medium).foregroundStyle(Tokens.sumiSecondary)
            HStack(spacing: 14) {
                adjustButton("minus", disabled: value.wrappedValue <= 5) {
                    value.wrappedValue = max(5, value.wrappedValue - 5)
                }
                Text("\(value.wrappedValue) 分")
                    .font(.system(size: 15, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Tokens.sumi)
                    .frame(minWidth: 52)
                adjustButton("plus", disabled: value.wrappedValue >= 120) {
                    value.wrappedValue = min(120, value.wrappedValue + 5)
                }
            }
        }
    }

    private func adjustButton(_ symbol: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Tokens.sumi.opacity(0.7))
                .frame(width: 28, height: 28)
                .background(Circle().fill(Color.white))
                .overlay(Circle().strokeBorder(Tokens.line, lineWidth: 1))
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
    }
}

struct TimerRing: View {
    let progress: Double
    let active: Bool
    let saturated: Bool
    let glowing: Bool

    var body: some View {
        ZStack {
            Circle().stroke(Tokens.line, lineWidth: 1)
            Circle()
                .trim(from: 0, to: max(0.0001, min(1, progress)))
                .stroke(Tokens.kohaku, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .opacity(saturated ? 0.35 : (active ? 1 : 0))
                .shadow(color: Tokens.kohaku.opacity(glowing ? 0.7 : 0), radius: glowing ? 10 : 0)
        }
        .animation(.linear(duration: 0.5), value: progress)
        .animation(.easeOut(duration: Tokens.fadeDuration), value: active)
    }
}

struct BankedBreakPill: View {
    @ObservedObject var engine: TimerEngine
    @State private var hovered = false

    var body: some View {
        Button { engine.finishWork() } label: {
            HStack(spacing: 4) {
                Image(systemName: "cup.and.saucer.fill").font(.system(size: 10))
                Text("休憩 +\(engine.bankedBreakString)")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
            }
            .foregroundStyle(Tokens.kohakuText)
            .padding(.horizontal, 12).padding(.vertical, 5)
            .background(Capsule().fill(hovered ? Tokens.usugumo : Color.white))
            .overlay(Capsule().strokeBorder(Tokens.kohaku.opacity(hovered ? 0.6 : 0.35), lineWidth: 1))
        }
        .buttonStyle(PressableButtonStyle())
        .onHover { hovered = $0 }
        .help("作業を終えて、この長さの休憩を始める")
    }
}
