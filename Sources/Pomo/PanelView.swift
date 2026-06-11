import SwiftUI

struct VisualEffectBackground: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let v = NSVisualEffectView()
        v.material = .popover
        v.blendingMode = .behindWindow
        v.state = .active
        // 白ベース方針: OS のダークモードに引きずられず常にライトのガラス
        v.appearance = NSAppearance(named: .aqua)
        return v
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

struct PanelView: View {
    @ObservedObject var engine: TimerEngine
    @ObservedObject var settings = Settings.shared
    @State private var hovering = false
    @State private var pillHovered = false

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
            return "いつでもどうぞ"
        case .work: return engine.isPaused ? "一時停止" : "集中"
        case .breakTime: return engine.isPaused ? "一時停止" : "休憩"
        }
    }

    var body: some View {
        glassCard
            // 終了の合図: 琥珀のグロー（M5）
            .overlay {
                if engine.justFinished {
                    RoundedRectangle(cornerRadius: Tokens.cornerRadius)
                        .stroke(Tokens.kohaku, lineWidth: 3)
                        .shadow(color: Tokens.kohaku.opacity(0.8), radius: 12)
                }
            }
            .opacity(panelOpacity)
            .animation(.easeOut(duration: Tokens.fadeDuration), value: panelOpacity)
            .animation(.easeOut(duration: Tokens.fadeDuration), value: hovering)
            .animation(.easeOut(duration: 0.3), value: engine.justFinished)
            .onHover { h in
                hovering = h
                if h { engine.clearFinishedFlag() }
            }
            .padding(12) // グローのハローが描ける余白（ウィンドウは 220、ガラスは 196）
    }

    /// 本物の Liquid Glass（macOS 26+）。.regular は背景輝度に応じて可読性を自動調整する仕様
    /// （HIG: テキストを載せるなら regular。clear は減光なしで黒文字が沈むため不採用）。
    /// 薄い和紙ティントで「白っぽいガラス」に寄せる。屈折・縁の光は OS が描くので自作の縁取りは持たない。
    /// 26 未満は従来の NSVisualEffectView 構成にフォールバック
    @ViewBuilder
    private var glassCard: some View {
        if #available(macOS 26.0, *) {
            content
                .glassEffect(
                    // ティントは最小限（10%）。透け感は glass 本体に任せ、可読性は .regular の自動減光に任せる
                    .regular.tint(Tokens.washi.opacity(0.10)),
                    in: RoundedRectangle(cornerRadius: Tokens.cornerRadius)
                )
        } else {
            ZStack {
                VisualEffectBackground()
                Tokens.washi.opacity(0.28)
                RoundedRectangle(cornerRadius: Tokens.cornerRadius)
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.7), .white.opacity(0.08)],
                            startPoint: .top, endPoint: .bottom
                        ),
                        lineWidth: 1.2
                    )
                content
            }
            .clipShape(RoundedRectangle(cornerRadius: Tokens.cornerRadius))
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
                // 上端中央の細い進捗インジケータ（P0-1）
                ProgressBar(
                    progress: engine.progress,
                    active: engine.phase != .idle,
                    // フローで基準25分を超えたら薄くする（満タン静止だと「完了」に誤読される）
                    saturated: engine.phase == .work && settings.mode == .flow && engine.progress >= 1
                )
                .frame(width: 132, height: 3)
                .padding(.top, 14)

                Spacer()

                Text(phaseLabel)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(Tokens.sumi.opacity(0.5)) // サブテキストは墨50%（§6 の原則）
                    .opacity(hovering || engine.phase == .idle || engine.isPaused || engine.justFinished ? 1 : 0)

                // 巨大な丸ゴシック数字（P0-1: ウィンドウ幅の約6割）
                Text(engine.timeString)
                    // サイズ分岐だと 1:00:00 到達の瞬間に数字がガクッと縮む → 固定+自動縮小
                    .font(.system(size: 54, weight: .medium, design: .rounded))
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                    .frame(maxWidth: 170)
                    .monospacedDigit()
                    .foregroundStyle(Tokens.sumi) // 白ベース化に伴い数字は墨色（2026-06-11 の方針転換）
                    .contentTransition(.numericText())

                // フロー作業中: 貯まった休憩をライブ表示（動機づけ＝追加要件の核）
                // 報酬（貯めた休憩）自体をボタンにする: 押せば受け取れる構造で核メカニクスを説明なしで伝える
                if engine.phase == .work && settings.mode == .flow {
                    Button { engine.finishWork() } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "cup.and.saucer.fill")
                                .font(.system(size: 10))
                            Text("休憩 +\(engine.bankedBreakString)")
                                .font(.system(size: 12, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                        }
                        .foregroundStyle(Tokens.kohakuDeep)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Tokens.kohaku.opacity(pillHovered ? 0.4 : 0.22)))
                    }
                    .buttonStyle(.plain)
                    .onHover { pillHovered = $0 }
                    .help("作業を終えて、この長さの休憩を始める")
                } else {
                    Color.clear.frame(height: 23)
                }

                Spacer()

                // ホバー時のみ出現する操作列（P1-4）
                // 待機中は常時表示（初見で操作がわかるように）。作業/休憩中はホバー時のみ
                controls
                    .opacity(hovering || engine.phase == .idle ? 1 : 0)
                    .padding(.bottom, 14)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
    var saturated = false

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Tokens.sumi.opacity(0.10))
                Capsule()
                    .fill(Tokens.kohaku)
                    .frame(width: max(0, geo.size.width * min(1, progress)))
            }
        }
        .opacity(saturated ? 0.35 : (active ? 1 : 0.4))
        .animation(.linear(duration: 0.5), value: progress)
        .animation(.easeOut(duration: Tokens.fadeDuration), value: saturated)
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
                .foregroundStyle(prominent ? Tokens.washi : Tokens.sumi.opacity(0.75))
                .frame(width: prominent ? 40 : 32, height: prominent ? 40 : 32)
                .background(
                    // 副ボタンは半透明の白ガラス玉、主ボタンだけ墨で焦点を作る
                    Circle().fill(prominent ? AnyShapeStyle(Tokens.sumi) : AnyShapeStyle(Color.white.opacity(hovered ? 0.8 : 0.55)))
                )
                .overlay(Circle().strokeBorder(.white.opacity(prominent ? 0 : 0.5), lineWidth: 0.8))
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
    }
}
