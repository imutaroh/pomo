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
    /// 「拡大」ボタン → 母艦ウィンドウを開く（排他切替）
    var expand: (() -> Void)?
    @State private var hovering = false
    @State private var pillHovered = false
    @State private var expandHovered = false

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
        case .work: return engine.isPaused ? "一時停止" : (engine.activeMode == .simple ? "タイマー" : "集中")
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
            .overlay(alignment: .topTrailing) {
                if expand != nil {
                    Button { expand?() } label: {
                        Image(systemName: "macwindow")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Tokens.sumi.opacity(expandHovered ? 0.8 : 0.5))
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(Color.white.opacity(expandHovered ? 0.85 : 0.55)))
                            .overlay(Circle().strokeBorder(.white.opacity(0.5), lineWidth: 0.8))
                    }
                    .buttonStyle(.plain)
                    .onHover { expandHovered = $0 }
                    .help("ダッシュボードを開く（パネルはしまわれる）")
                    .accessibilityLabel("ダッシュボードを開く")
                    .padding(10)
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
                // 最透過の .clear。可読性の自動減光が無いバリアントなので、
                // HIG の作法どおり薄い下敷き（和紙15%）をガラスの下に敷いて墨文字の足場を作る
                .glassEffect(
                    .clear,
                    in: RoundedRectangle(cornerRadius: Tokens.cornerRadius)
                )
                .background(
                    Tokens.washi.opacity(0.15),
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
                    // フロー実行中かつ基準25分超えで薄くする（満タン静止だと「完了」に誤読される）
                    saturated: engine.phase == .work && engine.activeMode == .flow && engine.progress >= 1,
                    warm: engine.isApproachingEnd
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

                // フロー実行中: 貯まった休憩をライブ表示（動機づけ＝追加要件の核）
                // 報酬（貯めた休憩）自体をボタンにする: 押せば受け取れる構造で核メカニクスを説明なしで伝える
                if engine.phase == .work && engine.activeMode == .flow {
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

    private var controls: some View {
        TimerControlsView(engine: engine, settings: settings)
    }
}

/// フェーズ別の操作ボタン列。パネルと母艦ウィンドウのタイマーカードで共用
/// （状態とロジックは 100% engine 側、ここは表示のみ。large は母艦用の大型ボタン）
struct TimerControlsView: View {
    @ObservedObject var engine: TimerEngine
    @ObservedObject var settings: Settings
    var large = false

    var body: some View {
        HStack(spacing: large ? 18 : 14) {
            switch engine.phase {
            case .idle:
                // simple 選択時はタイマー時間の ±5分ボタンを出す（テキスト入力なし原則を維持）
                if settings.mode == .simple {
                    CircleButton(symbol: "minus", large: large, accessibilityLabel: "5分減らす") {
                        settings.simpleTimerMinutes = max(5, settings.simpleTimerMinutes - 5)
                        engine.settingsChanged()
                    }
                    .help("5分減らす")
                }
                CircleButton(symbol: "play.fill", prominent: true, large: large, accessibilityLabel: settings.mode == .simple ? "タイマーを開始" : "作業を開始") { engine.startWork() }
                    .help(settings.mode == .simple ? "タイマーを開始（⌃⌥P）" : "作業を開始（⌃⌥P）")
                if settings.mode == .simple {
                    CircleButton(symbol: "plus", large: large, accessibilityLabel: "5分増やす") {
                        settings.simpleTimerMinutes = min(120, settings.simpleTimerMinutes + 5)
                        engine.settingsChanged()
                    }
                    .help("5分増やす")
                } else if engine.pendingBreakDuration != nil {
                    CircleButton(symbol: "cup.and.saucer.fill", large: large, accessibilityLabel: "貯めた休憩を開始") { engine.startBreak() }
                        .help("貯めた休憩を開始")
                }
            case .work:
                CircleButton(symbol: "arrow.counterclockwise", large: large, accessibilityLabel: engine.activeMode == .simple ? "タイマーを止める" : "リセット") { engine.reset() }
                    .help(engine.activeMode == .simple ? "タイマーを止める" : "リセット")
                CircleButton(symbol: engine.isPaused ? "play.fill" : "pause.fill", prominent: true, large: large, accessibilityLabel: engine.isPaused ? "再開" : "一時停止") { engine.togglePause() }
                    .help(engine.isPaused ? "再開（⌃⌥P）" : "一時停止（⌃⌥P）")
                // フローの核: ここを押すと作業時間に応じた休憩が自動で始まる（simple では表示しない）
                if engine.activeMode != .simple {
                    CircleButton(symbol: "cup.and.saucer.fill", large: large, accessibilityLabel: "作業を終えて休憩へ") { engine.finishWork() }
                        .help("作業を終えて休憩へ（貯めた分だけ休める）")
                }
            case .breakTime:
                CircleButton(symbol: "goforward.plus", large: large, accessibilityLabel: "休憩を5分延長") { engine.extendFiveMinutes() } // +5分（M4）
                    .help("休憩を5分延長")
                CircleButton(symbol: engine.isPaused ? "play.fill" : "pause.fill", prominent: true, large: large, accessibilityLabel: engine.isPaused ? "再開" : "一時停止") { engine.togglePause() }
                    .help(engine.isPaused ? "再開" : "一時停止")
                CircleButton(symbol: "forward.end.fill", large: large, accessibilityLabel: "休憩をスキップ") { engine.skipBreak() }       // スキップ（M4）
                    .help("休憩をスキップ")
            }
        }
    }
}

struct ProgressBar: View {
    let progress: Double
    let active: Bool
    var saturated = false
    var warm: Bool = false

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Tokens.sumi.opacity(0.10))
                Capsule()
                    .fill(warm ? Tokens.kohakuDeep : Tokens.kohaku)
                    .frame(width: max(0, geo.size.width * min(1, progress)))
                    .animation(.easeOut(duration: 0.6), value: warm)
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
    /// 母艦のタイマーカード用の大型スタイル。パネルはデフォルト（false）のまま挙動・見た目とも不変
    var large = false
    var accessibilityLabel: String = ""
    let action: () -> Void
    @State private var hovered = false

    private var diameter: CGFloat { large ? (prominent ? 64 : 44) : (prominent ? 40 : 32) }
    private var iconSize: CGFloat { large ? (prominent ? 22 : 15) : (prominent ? 15 : 12) }

    var body: some View {
        if large {
            // 母艦: 黒丸の主ボタン＋白の副ボタン。ホバーで浮き、押下で沈む
            Button(action: action) {
                label
                    .background(
                        Circle().fill(prominent ? AnyShapeStyle(Tokens.kohakuDeep) : AnyShapeStyle(Color.white))
                    )
                    .overlay(Circle().strokeBorder(Tokens.sumi.opacity(prominent ? 0 : 0.08), lineWidth: 1))
                    .shadow(
                        color: .black.opacity(prominent ? (hovered ? 0.22 : 0.14) : (hovered ? 0.10 : 0.06)),
                        radius: hovered ? 10 : 6, y: 3
                    )
                    .scaleEffect(hovered ? 1.04 : 1)
                    .animation(.easeOut(duration: 0.15), value: hovered)
            }
            .buttonStyle(PressableButtonStyle())
            .onHover { hovered = $0 }
            .accessibilityLabel(accessibilityLabel)
        } else {
            Button(action: action) {
                label
                    .background(
                        // 副ボタンは半透明の白ガラス玉、主ボタンだけ墨で焦点を作る
                        Circle().fill(prominent ? AnyShapeStyle(Tokens.sumi) : AnyShapeStyle(Color.white.opacity(hovered ? 0.8 : 0.55)))
                    )
                    .overlay(Circle().strokeBorder(.white.opacity(prominent ? 0 : 0.5), lineWidth: 0.8))
            }
            .buttonStyle(.plain)
            .onHover { hovered = $0 }
            .accessibilityLabel(accessibilityLabel)
        }
    }

    private var label: some View {
        Image(systemName: symbol)
            .font(.system(size: iconSize, weight: .semibold))
            .foregroundStyle(prominent ? Tokens.washi : Tokens.sumi.opacity(0.75))
            .frame(width: diameter, height: diameter)
            // アイコン差し替え（再生⇄一時停止）のクロスフェードは母艦のみ。パネルは従来どおり
            .contentTransition(large ? .symbolEffect(.replace) : .identity)
    }
}

/// 押下で静かに沈むボタンスタイル（跳ねない）
struct PressableButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
