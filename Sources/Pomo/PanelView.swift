import SwiftUI

struct VisualEffectBackground: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let v = NSVisualEffectView()
        v.material = .hudWindow
        v.blendingMode = .behindWindow
        v.state = .active
        return v
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

struct PanelView: View {
    @ObservedObject var engine: TimerEngine
    @ObservedObject var settings = Settings.shared
    @State private var hovering = false

    // 存在感の3段階制御（§7-B）: 操作=1.0 / 待機=1.0(要素少) / 集中=focusOpacity
    private var panelOpacity: Double {
        if hovering { return 1.0 }
        if engine.justFinished { return 1.0 } // 終了の合図は必ず見せる
        if engine.phase != .idle && !engine.isPaused { return settings.focusOpacity }
        return 1.0
    }

    private var phaseLabel: String {
        switch engine.phase {
        case .idle:
            // 待機中のホバーは「今日の積み上げ」を見せる場所として使う
            if hovering {
                let logger = SessionLogger.shared
                if logger.todayWorkCount > 0 {
                    let h = logger.todayWorkSeconds / 3600
                    let m = (logger.todayWorkSeconds % 3600) / 60
                    return "今日 \(logger.todayWorkCount)回 · \(h > 0 ? "\(h)時間" : "")\(m)分"
                }
            }
            return "開始待ち"
        case .work: return engine.isPaused ? "一時停止" : "集中"
        case .breakTime: return engine.isPaused ? "一時停止" : "休憩"
        }
    }

    var body: some View {
        ZStack {
            VisualEffectBackground()
            // スクリム: 壁紙が白でも黒でも白文字のコントラストを保証する薄い墨の被膜
            Tokens.sumi.opacity(0.45)
            // 黒背景でパネルの輪郭が消えないための極薄の縁取り
            RoundedRectangle(cornerRadius: Tokens.cornerRadius)
                .strokeBorder(Tokens.washi.opacity(0.14), lineWidth: 1)

            // 終了の合図: 琥珀のグロー（通知 OFF・集中モードでも気づける第1の合図 M5）
            if engine.justFinished {
                RoundedRectangle(cornerRadius: Tokens.cornerRadius)
                    .stroke(Tokens.kohaku, lineWidth: 3)
                    .shadow(color: Tokens.kohaku.opacity(0.8), radius: 12)
            }

            VStack(spacing: 0) {
                // 上端中央の細い進捗インジケータ（P0-1）
                ProgressBar(progress: engine.progress, active: engine.phase != .idle)
                    .frame(width: 132, height: 3)
                    .padding(.top, 14)

                Spacer()

                Text(phaseLabel)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(Tokens.washi.opacity(0.55)) // サブテキストは同色の半透過（§6 の原則を白基調に適用）
                    .opacity(hovering || engine.phase == .idle || engine.isPaused || engine.justFinished ? 1 : 0)

                // 巨大な丸ゴシック数字（P0-1: ウィンドウ幅の約6割）
                Text(engine.timeString)
                    .font(.system(size: engine.displaySeconds >= 3600 ? 42 : 54, weight: .medium, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Tokens.washi) // monora P0-1: 巨大な「白い」丸ゴシック数字
                    .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                    .contentTransition(.numericText())

                // フロー作業中: 貯まった休憩をライブ表示（動機づけ＝追加要件の核）
                if engine.phase == .work && settings.mode == .flow {
                    HStack(spacing: 4) {
                        Image(systemName: "cup.and.saucer.fill")
                            .font(.system(size: 10))
                        Text("休憩 +\(engine.bankedBreakString)")
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                    }
                    .foregroundStyle(Tokens.kohaku)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Tokens.kohaku.opacity(0.16)))
                } else {
                    Color.clear.frame(height: 23)
                }

                Spacer()

                // ホバー時のみ出現する操作列（P1-4）
                controls
                    .opacity(hovering ? 1 : 0)
                    .padding(.bottom, 14)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Tokens.cornerRadius))
        .opacity(panelOpacity)
        .animation(.easeOut(duration: Tokens.fadeDuration), value: panelOpacity)
        .animation(.easeOut(duration: Tokens.fadeDuration), value: hovering)
        .animation(.easeOut(duration: 0.3), value: engine.justFinished)
        .onHover { h in
            hovering = h
            if h { engine.clearFinishedFlag() }
        }
    }

    @ViewBuilder
    private var controls: some View {
        HStack(spacing: 14) {
            switch engine.phase {
            case .idle:
                CircleButton(symbol: "play.fill", prominent: true) { engine.startWork() }
                    .help("作業を開始（⌃⌥P）")
                if hasPendingBreak {
                    CircleButton(symbol: "cup.and.saucer.fill") { engine.startBreak() }
                        .help("貯めた休憩を開始")
                }
            case .work:
                CircleButton(symbol: "arrow.counterclockwise") { engine.reset() }
                    .help("リセット")
                CircleButton(symbol: engine.isPaused ? "play.fill" : "pause.fill", prominent: true) { engine.togglePause() }
                    .help(engine.isPaused ? "再開（⌃⌥P）" : "一時停止（⌃⌥P）")
                // フローの核: ここを押すと作業時間に応じた休憩が自動で始まる
                CircleButton(symbol: "cup.and.saucer.fill") { engine.finishWork() }
                    .help("作業を終えて休憩へ（貯めた分だけ休める）")
            case .breakTime:
                CircleButton(symbol: "goforward.plus") { engine.extendFiveMinutes() } // +5分（M4）
                    .help("休憩を5分延長")
                CircleButton(symbol: engine.isPaused ? "play.fill" : "pause.fill", prominent: true) { engine.togglePause() }
                    .help(engine.isPaused ? "再開" : "一時停止")
                CircleButton(symbol: "forward.end.fill") { engine.skipBreak() }       // スキップ（M4）
                    .help("休憩をスキップ")
            }
        }
    }

    private var hasPendingBreak: Bool { engine.pendingBreakDuration != nil }
}

struct ProgressBar: View {
    let progress: Double
    let active: Bool

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Tokens.washi.opacity(0.18))
                Capsule()
                    .fill(Tokens.kohaku)
                    .frame(width: max(0, geo.size.width * progress))
            }
        }
        .opacity(active ? 1 : 0.4)
        .animation(.linear(duration: 0.5), value: progress)
    }
}

struct CircleButton: View {
    let symbol: String
    var prominent = false
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: prominent ? 15 : 12, weight: .semibold))
                .foregroundStyle(prominent ? Tokens.sumi : Tokens.washi.opacity(0.85))
                .frame(width: prominent ? 40 : 32, height: prominent ? 40 : 32)
                .background(
                    Circle().fill(prominent ? Tokens.washi : Tokens.washi.opacity(hovered ? 0.28 : 0.14))
                )
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
    }
}
