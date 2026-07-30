import SwiftUI

/// 母艦のホーム。フィールドノートの計器盤（Issue #30 フェーズ2）:
/// Bento 構成（タイマーヒーロー＋TODAY タイル / WEEK＋LOG タイル）、
/// mono の eyebrow、外科的アクセント（今日のバーだけティール）。装飾は情報を運ぶものだけ。
struct DashboardPage: View {
    @ObservedObject var engine: TimerEngine
    @ObservedObject var store: SessionStore
    @ObservedObject private var settings = Settings.shared
    var openSessions: () -> Void
    var openSettings: () -> Void
    var enterFocus: () -> Void

    init(engine: TimerEngine, store: SessionStore, openSessions: @escaping () -> Void, openSettings: @escaping () -> Void, enterFocus: @escaping () -> Void) {
        self.engine = engine
        self.store = store
        self.openSessions = openSessions
        self.openSettings = openSettings
        self.enterFocus = enterFocus
    }

    private static let headerDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd EEE"
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            header
                .staggeredAppear(0)
            // ヒーロー行: タイマー（主役・幅広）＋ TODAY タイル（従・幅狭）の非対称 Bento
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    timerCard.frame(minWidth: 400)
                    todayCard.frame(width: 240)
                }
                .fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 16) {
                    timerCard
                    todayCard
                }
            }
            .staggeredAppear(1)
            // 下段: WEEK ＋ LOG の2タイル（狭ければ縦積み）
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    weekCard
                    recentCard
                }
                .frame(minWidth: 660)
                VStack(spacing: 16) {
                    weekCard
                    recentCard
                }
            }
            .staggeredAppear(2)
        }
    }

    // MARK: - ヘッダー（eyebrow + 日付 + フォーカスCTA）

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 8) {
                sectionEyebrow("DASHBOARD")
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text("ダッシュボード")
                        .pomoFont(24, weight: .semibold)
                        .foregroundStyle(Tokens.sumi)
                    Text(Self.headerDate.string(from: Date()))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .tracking(0.5)
                        .foregroundStyle(Tokens.sumiTertiary)
                }
            }
            Spacer()
            focusModeButton
        }
    }

    private var focusModeButton: some View {
        Button(action: enterFocus) {
            HStack(spacing: 6) {
                Image(systemName: "moon.stars.fill").font(.system(size: 12, weight: .semibold))
                Text("フォーカスモード").pomoFont(13, weight: .semibold)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16).padding(.vertical, 9)
            .background(Capsule().fill(Tokens.sumi))
        }
        .buttonStyle(PressableButtonStyle())
        .help("母艦を閉じて、パネルだけで作業を始める")
        .accessibilityLabel("フォーカスモードに入る")
    }

    // MARK: - タイマーヒーロー

    private var statusText: String {
        switch engine.phase {
        case .idle: return "IDLE"
        case .work: return engine.isPaused ? "PAUSED" : (engine.activeMode == .simple ? "TIMER" : "FOCUS")
        case .breakTime: return engine.isPaused ? "PAUSED" : "BREAK"
        }
    }

    private var phaseLabel: String {
        switch engine.phase {
        case .idle:
            if let pending = engine.pendingBreakLabel {
                return "☕️ \(pending)の休憩が待っています"
            }
            return "いつでもどうぞ"
        case .work: return engine.isPaused ? "一時停止" : (engine.activeMode == .simple ? "タイマー" : "集中")
        case .breakTime: return engine.isPaused ? "一時停止" : "休憩"
        }
    }

    private var timerCard: some View {
        VStack(spacing: 22) {
            // 計器のステータス行: 状態ドット＋mono ラベル（実行中だけドットがアクセント色）
            HStack(spacing: 7) {
                Circle()
                    .fill(engine.phase != .idle && !engine.isPaused ? Tokens.kohaku : Tokens.sumi.opacity(0.25))
                    .frame(width: 7, height: 7)
                Text(statusText)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .tracking(1.4)
                    .foregroundStyle(Tokens.sumiSecondary)
                Spacer()
            }
            .accessibilityHidden(true) // phaseLabel が読み上げを担う

            ZStack {
                TimerRing(
                    progress: engine.progress,
                    active: engine.phase != .idle,
                    saturated: engine.phase == .work && engine.activeMode == .flow && engine.progress >= 1,
                    glowing: engine.justFinished
                )
                .frame(width: 196, height: 196)
                .accessibilityHidden(true)

                VStack(spacing: 4) {
                    Text(engine.timeString)
                        .font(.system(size: 46, weight: .medium, design: .monospaced))
                        .tracking(-1.5) // display 数字はタイトに詰める（計器の密度）
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                        .foregroundStyle(Tokens.sumi)
                        .contentTransition(.numericText())
                    Text(phaseLabel)
                        .pomoFont(12, weight: .medium)
                        .foregroundStyle(Tokens.sumiSecondary)
                        .contentTransition(.opacity)
                        .animation(.easeOut(duration: 0.3), value: phaseLabel)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(phaseLabel) \(engine.timeString)")
            }

            // 待機中はこの画面でモードと時間を変更できる
            if engine.phase == .idle {
                timerSetup
                    .transition(.opacity)
            }

            // フロー実行中: 貯まった休憩ピル（押せば受け取れる）
            if engine.phase == .work && engine.activeMode == .flow {
                BankedBreakPill(engine: engine)
                    .transition(.opacity)
            }

            TimerControlsView(engine: engine, settings: settings, large: true, hideSimpleAdjust: true)
                .padding(.bottom, 4)
        }
        .frame(maxWidth: .infinity)
        .animation(.easeOut(duration: 0.3), value: engine.phase)
        .animation(.easeOut(duration: 0.25), value: settings.mode)
        .onChange(of: settings.mode) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.classicWorkMin) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.simpleTimerMinutes) { _, _ in engine.settingsChanged() }
        .pomoCard()
    }

    // MARK: - 待機中のモード＋時間設定

    @ViewBuilder
    private var timerSetup: some View {
        VStack(spacing: 14) {
            // 標準 segmented ではなく SelectChip（フィルタと同じ言語で統一）
            HStack(spacing: 8) {
                SelectChip(label: "フロー", selected: settings.mode == .flow) { settings.mode = .flow }
                SelectChip(label: "クラシック", selected: settings.mode == .classic) { settings.mode = .classic }
                SelectChip(label: "タイマー", selected: settings.mode == .simple) { settings.mode = .simple }
            }

            switch settings.mode {
            case .flow:
                Text("止めるまで計測。休憩が自動で貯まります。")
                    .pomoFont(12)
                    .foregroundStyle(Tokens.sumiSecondary)
                    .multilineTextAlignment(.center)
            case .classic:
                durationRow("作業の長さ", value: $settings.classicWorkMin, range: 5...120, step: 5)
            case .simple:
                durationRow("計測する時間", value: $settings.simpleTimerMinutes, range: 5...120, step: 5)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func durationRow(_ label: String, value: Binding<Int>, range: ClosedRange<Int>, step: Int) -> some View {
        VStack(spacing: 8) {
            Text(label)
                .pomoFont(12, weight: .medium)
                .foregroundStyle(Tokens.sumiSecondary)
            HStack(spacing: 16) {
                adjustButton("minus", disabled: value.wrappedValue <= range.lowerBound) {
                    value.wrappedValue = max(range.lowerBound, value.wrappedValue - step)
                }
                Text("\(value.wrappedValue) 分")
                    .font(.system(size: 18, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Tokens.sumi)
                    .frame(minWidth: 70)
                    .contentTransition(.numericText())
                adjustButton("plus", disabled: value.wrappedValue >= range.upperBound) {
                    value.wrappedValue = min(range.upperBound, value.wrappedValue + step)
                }
            }
        }
    }

    private func adjustButton(_ symbol: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Tokens.sumi.opacity(0.7))
                .frame(width: 38, height: 38)
                .background(Circle().fill(Color.white))
                .overlay(Circle().strokeBorder(Tokens.line, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityLabel(symbol == "minus" ? "5分減らす" : "5分増やす")
    }

    // MARK: - TODAY タイル（縦積みの計器行。丸チップ・イラスト・標語は廃止）

    private var todayCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionEyebrow("TODAY")
                .padding(.bottom, 14)
            statRow(label: "集中時間", value: hmString(store.todaySeconds),
                    help: "今日ちゃんと終えた作業の合計時間。手動リセット・スリープ中断・単純タイマーは含みません。")
            Divider().overlay(Tokens.line)
            statRow(label: "完了", value: "\(store.todayCount)",
                    help: "今日ちゃんと終えた作業セッションの本数。")
            Divider().overlay(Tokens.line)
            statRow(label: "休憩", value: "\(store.todayBreakCount)",
                    help: "今日、最後まで取った休憩の回数。スキップした休憩は含みません。")
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .pomoCard()
    }

    private func statRow(label: String, value: String, help: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .pomoFont(12, weight: .medium)
                .foregroundStyle(Tokens.sumiSecondary)
            Spacer()
            Text(value)
                .font(.system(size: 22, weight: .semibold, design: .monospaced))
                .tracking(-0.5)
                .foregroundStyle(Tokens.sumi)
                .contentTransition(.numericText())
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .help(help)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label) \(value)")
        .accessibilityHint(help)
    }

    // MARK: - WEEK / LOG タイル

    private var weekCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                sectionEyebrow("THIS WEEK")
                Spacer()
                Text(hmString(store.days.reduce(0) { $0 + $1.workSeconds }))
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Tokens.sumiSecondary)
            }
            WeekChart(days: store.days)
        }
        .frame(maxWidth: .infinity)
        .pomoCard()
    }

    private var recentCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                sectionEyebrow("RECENT LOG")
                Spacer()
                Button(action: openSessions) {
                    HStack(spacing: 2) {
                        Text("すべて見る")
                            .pomoFont(12, weight: .medium)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9))
                    }
                    .foregroundStyle(Tokens.kohakuText)
                }
                .buttonStyle(.plain)
            }
            let recent = Array(store.recentByDay.flatMap(\.entries).prefix(5))
            if recent.isEmpty {
                Text("まだ記録はありません。タイマーを回すと、ここに積み上がっていきます。")
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumiSecondary)
                    .padding(.vertical, 8)
            } else {
                // タイル内リスト: カード内カードにせず、ヘアラインで区切るだけ
                VStack(spacing: 0) {
                    ForEach(recent) { e in
                        SessionRow(entry: e, onChanged: { store.reload() })
                            .padding(.horizontal, -20) // SessionRow 自身の横 padding をタイル余白に合わせて相殺
                        if e.id != recent.last?.id {
                            Divider().overlay(Tokens.line)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .pomoCard()
    }
}

/// 円形プログレスリング。トラックはヘアライン色、進行はアクセント、先端にドット。
/// flow 25分超（saturated）は減光（満タン静止＝完了の誤読防止）。
/// justFinished はゆっくり明滅して6秒で静まる（パネルのグローと同じ言語）
struct TimerRing: View {
    let progress: Double
    let active: Bool
    let saturated: Bool
    let glowing: Bool

    private let lineWidth: CGFloat = 5

    var body: some View {
        ZStack {
            Circle()
                .stroke(Tokens.line, lineWidth: 1) // トラックはヘアライン（計器の目盛りの静けさ）
            Circle()
                .trim(from: 0, to: max(0.0001, min(1, progress)))
                .stroke(Tokens.kohaku, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .opacity(ringOpacity)
                .shadow(color: Tokens.kohaku.opacity(glowing ? 0.7 : 0), radius: glowing ? 10 : 0)
            // 先端のドット。idle 時は上端で待つ
            GeometryReader { geo in
                let r = geo.size.width / 2
                Circle()
                    .fill(active ? Tokens.kohaku : Tokens.sumi.opacity(0.25))
                    .frame(width: 9, height: 9)
                    .position(x: r, y: lineWidth / 2)
                    .rotationEffect(.degrees(min(1, max(0, progress)) * 360), anchor: .center)
            }
        }
        .animation(.linear(duration: 0.5), value: progress)
        .animation(.easeOut(duration: Tokens.fadeDuration), value: active)
        .animation(.easeOut(duration: Tokens.fadeDuration), value: saturated)
        .animation(glowing ? .easeInOut(duration: 1.0).repeatCount(5, autoreverses: true) : .easeOut(duration: 0.45), value: glowing)
    }

    private var ringOpacity: Double {
        if saturated { return 0.35 }
        return active ? 1 : 0
    }
}

/// フロー作業中の「休憩 +X:XX」ピル（パネルと同じ報酬ボタン構造）
struct BankedBreakPill: View {
    @ObservedObject var engine: TimerEngine
    @State private var hovered = false

    var body: some View {
        Button { engine.finishWork() } label: {
            HStack(spacing: 4) {
                Image(systemName: "cup.and.saucer.fill")
                    .font(.system(size: 10))
                Text("休憩 +\(engine.bankedBreakString)")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
            }
            .foregroundStyle(Tokens.kohakuText)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Capsule().fill(hovered ? Tokens.usugumo : Color.white))
            .overlay(Capsule().strokeBorder(Tokens.kohaku.opacity(hovered ? 0.6 : 0.35), lineWidth: 1))
        }
        .buttonStyle(PressableButtonStyle())
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .help("作業を終えて、この長さの休憩を始める")
    }
}
