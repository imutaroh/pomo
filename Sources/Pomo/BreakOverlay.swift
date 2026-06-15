import AppKit
import Combine
import SwiftUI

/// 休憩モード: 休憩開始と同時に全ディスプレイを覆うオーバーレイを出す。
/// クリックは遮るが、キーボードとメニューバー・Dock は奪わない（看守ではなく秘書 §1）。
/// 「小さく」でこの休憩中だけ折りたためる＝ユーザーが OFF にしたくならない逃げ道を必ず残す。
@MainActor
final class BreakOverlayController {
    private var panels: [NSPanel] = []
    private let engine: TimerEngine
    private let settings = Settings.shared
    private var cancellables = Set<AnyCancellable>()
    private var collapsedThisBreak = false
    /// 通話中に休憩が始まった場合、通話終了を待つ再チェックタイマー
    private var recheckTimer: Timer?

    init(engine: TimerEngine) {
        self.engine = engine
        engine.$phase
            .receive(on: RunLoop.main)
            .sink { [weak self] phase in self?.phaseChanged(phase) }
            .store(in: &cancellables)
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self, !self.panels.isEmpty else { return }
                self.hide()
                self.show()
            }
        }
    }

    func collapse() {
        collapsedThisBreak = true
        hide()
    }

    private func phaseChanged(_ phase: Phase) {
        if phase == .breakTime {
            guard settings.breakFullscreen, !collapsedThisBreak else { return }
            // 通話・会議中は全画面で割り込まない（小パネルの休憩カウントダウンだけが残る）
            if settings.deferOverlayInCall && MeetingGuard.isMicrophoneInUse() {
                // 通話が終わったら自動で出る: 10秒ごとに再チェック
                startRecheckTimer()
                return
            }
            show()
        } else {
            collapsedThisBreak = false
            invalidateRecheckTimer()
            hide()
        }
    }

    /// 通話終了を10秒ごとに監視し、終わったらオーバーレイを表示する
    private func startRecheckTimer() {
        invalidateRecheckTimer()
        recheckTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.recheckAndShowIfReady()
            }
        }
    }

    private func recheckAndShowIfReady() {
        guard
            engine.phase == .breakTime,
            settings.breakFullscreen,
            !collapsedThisBreak,
            panels.isEmpty,
            settings.deferOverlayInCall,
            !MeetingGuard.isMicrophoneInUse()
        else { return }
        // 通話が終わった → オーバーレイを出す
        invalidateRecheckTimer()
        show()
    }

    private func invalidateRecheckTimer() {
        recheckTimer?.invalidate()
        recheckTimer = nil
    }

    private func show() {
        guard panels.isEmpty else { return }
        for screen in NSScreen.screens {
            let panel = BreakPanel(
                contentRect: screen.frame,
                styleMask: [.nonactivatingPanel, .borderless],
                backing: .buffered,
                defer: false
            )
            panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            panel.becomesKeyOnlyIfNeeded = true
            panel.hidesOnDeactivate = false
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.hasShadow = false

            let view = BreakOverlayView(engine: engine, onCollapse: { [weak self] in self?.collapse() })
            let host = NSHostingView(rootView: view)
            host.frame = NSRect(origin: .zero, size: screen.frame.size)
            panel.contentView = host
            panel.alphaValue = 0
            panel.orderFrontRegardless()
            // ゆっくり現れる（300-600ms ease-out の流儀 §6-P2）
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.6
                panel.animator().alphaValue = 1
            }
            panels.append(panel)
        }
    }

    private func hide() {
        invalidateRecheckTimer()
        let closing = panels
        panels = []
        for panel in closing {
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = 0.4
                panel.animator().alphaValue = 0
            }, completionHandler: {
                panel.orderOut(nil)
            })
        }
    }
}

/// 休憩オーバーレイ専用パネル。メモ入力のため key になれる
/// （休憩中＝作業していない時間なので、メインパネルの「フォーカス非奪取」原則と矛盾しない）
final class BreakPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

struct BreakOverlayView: View {
    @ObservedObject var engine: TimerEngine
    let onCollapse: () -> Void
    @State private var breathe = false
    // スキップだけ3秒の間を置く（反射クリックの習慣化を防ぐ・one sec の研究知見）。
    // 「+5分」「小さく」は即時 = 延期と放棄を区別する
    @State private var skipEnabled = false
    // 休憩の入口メモ（interstitial journaling）: 記憶が一番新鮮な瞬間に聞く。無視してもよい
    @State private var memoText = ""
    @State private var memoSaved = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            let dim = min(geo.size.width, geo.size.height)
            ZStack {
                Tokens.sumi.opacity(0.92)

                // 呼吸のリズムの琥珀のグロー（4秒周期・休憩のペースメーカー）
                Circle()
                    .fill(RadialGradient(
                        colors: [Tokens.kohaku.opacity(0.12), .clear],
                        center: .center, startRadius: 60, endRadius: 380
                    ))
                    .frame(width: dim * 0.7, height: dim * 0.7)
                    .scaleEffect(reduceMotion ? 1.0 : (breathe ? 1.1 : 0.9))
                    .animation(
                        reduceMotion ? nil : .easeInOut(duration: 4).repeatForever(autoreverses: true),
                        value: breathe
                    )

                VStack(spacing: 26) {
                    Text("ひと休み")
                        .pomoFont(22, weight: .medium)
                        .foregroundStyle(Tokens.washi.opacity(0.6))

                    Text(engine.timeString)
                        .font(.system(size: 110, weight: .medium, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Tokens.washi)
                        .contentTransition(.numericText())

                    ProgressBar(progress: engine.progress, active: true)
                        .frame(width: min(360, geo.size.width * 0.25), height: 4)

                    Text("画面から目を離して、少し伸びをしよう")
                        .pomoFont(14)
                        .foregroundStyle(Tokens.washi.opacity(0.45))

                    if Settings.shared.askMemoOnBreak {
                        memoField
                            .padding(.bottom, 8)
                    } else {
                        Color.clear.frame(height: 8)
                    }

                    HStack(spacing: 14) {
                        PillButton(label: "+5分") { engine.extendFiveMinutes() }
                        PillButton(label: "小さく", action: onCollapse)
                        PillButton(label: "スキップ") { engine.skipBreak() }
                            .disabled(!skipEnabled)
                            .opacity(skipEnabled ? 1 : 0.35)
                            .animation(.easeOut(duration: 0.4), value: skipEnabled)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
        .onAppear {
            breathe = true
            Task {
                try? await Task.sleep(for: .seconds(3))
                skipEnabled = true
            }
        }
    }

    @ViewBuilder
    private var memoField: some View {
        if memoSaved {
            Text("メモを残しました")
                .pomoFont(13, weight: .medium)
                .foregroundStyle(Tokens.kohaku)
                .padding(.vertical, 9)
        } else {
            HStack(spacing: 10) {
                TextField(
                    "", text: $memoText,
                    prompt: Text("いまの時間、何してた？（書かなくてもOK）")
                        .foregroundStyle(Tokens.washi.opacity(0.35))
                )
                .textFieldStyle(.plain)
                .pomoFont(14)
                .foregroundStyle(Tokens.washi)
                .tint(Tokens.kohaku)
                .multilineTextAlignment(.center)
                .frame(width: 320)
                .padding(.vertical, 9)
                .padding(.horizontal, 16)
                .background(Capsule().fill(.white.opacity(0.10)))
                .onSubmit(saveMemo)
                if !memoText.trimmingCharacters(in: .whitespaces).isEmpty {
                    PillButton(label: "保存", action: saveMemo)
                }
            }
        }
    }

    private func saveMemo() {
        let text = memoText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        SessionLogger.shared.amendLastWorkMemo(text)
        withAnimation(.easeOut(duration: 0.3)) { memoSaved = true }
    }
}

struct PillButton: View {
    let label: String
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .pomoFont(14, weight: .semibold)
                .foregroundStyle(Tokens.washi.opacity(0.9))
                .padding(.horizontal, 22)
                .padding(.vertical, 10)
                .background(Capsule().fill(Tokens.washi.opacity(hovered ? 0.24 : 0.12)))
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
    }
}
