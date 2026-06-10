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
            if settings.deferOverlayInCall && MeetingGuard.isMicrophoneInUse() { return }
            show()
        } else {
            collapsedThisBreak = false
            hide()
        }
    }

    private func show() {
        guard panels.isEmpty else { return }
        for screen in NSScreen.screens {
            let panel = NSPanel(
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

struct BreakOverlayView: View {
    @ObservedObject var engine: TimerEngine
    let onCollapse: () -> Void
    @State private var breathe = false
    // スキップだけ3秒の間を置く（反射クリックの習慣化を防ぐ・one sec の研究知見）。
    // 「+5分」「小さく」は即時 = 延期と放棄を区別する
    @State private var skipEnabled = false

    var body: some View {
        ZStack {
            Tokens.sumi.opacity(0.92)

            // 呼吸のリズムの琥珀のグロー（4秒周期・休憩のペースメーカー）
            Circle()
                .fill(RadialGradient(
                    colors: [Tokens.kohaku.opacity(0.12), .clear],
                    center: .center, startRadius: 60, endRadius: 380
                ))
                .frame(width: 760, height: 760)
                .scaleEffect(breathe ? 1.1 : 0.9)
                .animation(.easeInOut(duration: 4).repeatForever(autoreverses: true), value: breathe)

            VStack(spacing: 26) {
                Text("ひと休み")
                    .font(.system(size: 22, weight: .medium, design: .rounded))
                    .foregroundStyle(Tokens.washi.opacity(0.6))

                Text(engine.timeString)
                    .font(.system(size: 110, weight: .medium, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Tokens.washi)
                    .contentTransition(.numericText())

                ProgressBar(progress: engine.progress, active: true)
                    .frame(width: 280, height: 4)

                Text("画面から目を離して、少し伸びをしよう")
                    .font(.system(size: 14, weight: .regular, design: .rounded))
                    .foregroundStyle(Tokens.washi.opacity(0.45))
                    .padding(.bottom, 12)

                HStack(spacing: 14) {
                    PillButton(label: "+5分") { engine.extendFiveMinutes() }
                    PillButton(label: "小さく", action: onCollapse)
                    PillButton(label: "スキップ") { engine.skipBreak() }
                        .disabled(!skipEnabled)
                        .opacity(skipEnabled ? 1 : 0.35)
                        .animation(.easeOut(duration: 0.4), value: skipEnabled)
                }
            }
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
}

struct PillButton: View {
    let label: String
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(Tokens.washi.opacity(0.9))
                .padding(.horizontal, 22)
                .padding(.vertical, 10)
                .background(Capsule().fill(Tokens.washi.opacity(hovered ? 0.24 : 0.12)))
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
    }
}
