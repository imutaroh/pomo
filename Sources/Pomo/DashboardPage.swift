import SwiftUI

/// 母艦のホーム。リングタイマー＋今日のサマリー＋今週の推移＋最近のアクティビティ
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

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            header
                .staggeredAppear(0)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 24) {
                    timerCard
                    summaryCard
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(minWidth: 660)
                VStack(spacing: 24) {
                    timerCard
                    summaryCard
                }
            }
            .staggeredAppear(1)
            weekSection
                .staggeredAppear(2)
            recentSection
                .staggeredAppear(3)
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 6) {
                Text("ダッシュボード")
                    .pomoFont(28, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
                Text("集中して、ちゃんと休む。")
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumiSecondary)
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
            .foregroundStyle(Tokens.washi)
            .padding(.horizontal, 16).padding(.vertical, 9)
            .background(Capsule().fill(Tokens.kohakuDeep))
        }
        .buttonStyle(PressableButtonStyle())
        .help("母艦を閉じて、パネルだけで作業を始める")
        .accessibilityLabel("フォーカスモードに入る")
    }

    private var phaseLabel: String {
        switch engine.phase {
        case .idle: return "いつでもどうぞ"
        case .work: return engine.isPaused ? "一時停止" : (engine.activeMode == .simple ? "タイマー" : "集中")
        case .breakTime: return engine.isPaused ? "一時停止" : "休憩"
        }
    }

    // MARK: - タイマーカード（モックの象徴: リング＋黒丸ボタン）

    private var timerCard: some View {
        VStack(spacing: 24) {
            HStack {
                Text("集中タイマー").pomoFont(13, weight: .medium).foregroundStyle(Tokens.sumiSecondary)
                Spacer()
                Button(action: openSettings) {
                    Image(systemName: "gearshape").font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Tokens.sumiSecondary)
                }
                .buttonStyle(.plain)
                .help("設定を開く")
                .accessibilityLabel("設定を開く")
            }
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
                        .font(.system(size: 44, weight: .medium, design: .rounded))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                        .monospacedDigit()
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
            .padding(.top, 8)

            // 待機中はこの画面でモードと時間を変更できる（設定ページに行かなくてよい）
            if engine.phase == .idle {
                timerSetup
                    .transition(.opacity)
            }

            // フロー実行中: 貯まった休憩ピル（押せば受け取れる = パネルと同じ核メカニクス）
            if engine.phase == .work && engine.activeMode == .flow {
                BankedBreakPill(engine: engine)
                    .transition(.opacity)
            }

            // 母艦は独自の時間設定UI（timerSetup）を持つので、play 行では simple の ±5分を出さない
            TimerControlsView(engine: engine, settings: settings, large: true, hideSimpleAdjust: true)
                .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity)
        .animation(.easeOut(duration: 0.3), value: engine.phase)
        .animation(.easeOut(duration: 0.25), value: settings.mode)
        // モード・時間の変更を待機中の大きな数字へ即反映
        .onChange(of: settings.mode) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.classicWorkMin) { _, _ in engine.settingsChanged() }
        .onChange(of: settings.simpleTimerMinutes) { _, _ in engine.settingsChanged() }
        .pomoCard()
    }

    // MARK: - 待機中のモード＋時間設定（この画面でタイマーを変更）

    @ViewBuilder
    private var timerSetup: some View {
        VStack(spacing: 14) {
            Picker("", selection: $settings.mode) {
                Text("フロー").tag(TimerMode.flow)
                Text("クラシック").tag(TimerMode.classic)
                Text("タイマー").tag(TimerMode.simple)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(maxWidth: 300)

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
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                    .monospacedDigit()
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
                .frame(width: 32, height: 32)
                .background(Circle().fill(Color.white))
                .overlay(Circle().strokeBorder(Tokens.sumi.opacity(0.10), lineWidth: 1))
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityLabel(symbol == "minus" ? "5分減らす" : "5分増やす")
    }

    // MARK: - 今日のサマリー（円形チップ＋大きな数字）

    private var summaryCard: some View {
        // 縦線をやめ、上下に余白を逃がして「箱で仕切られた密度」=圧迫感を解消。
        // 統計はカード中央に空気を持って並び、日の出は静かなフッターとして下端に置く。
        VStack(spacing: 0) {
            Spacer(minLength: 12)
            HStack(alignment: .top, spacing: 8) {
                summaryStat(label: "今日の集中", value: hmString(store.todaySeconds), symbol: "clock",
                            help: "今日ちゃんと終えた作業の合計時間。手動リセット・スリープ中断・単純タイマーは含みません。")
                summaryStat(label: "完了", value: "\(store.todayCount)回", symbol: "checkmark",
                            help: "今日ちゃんと終えた作業セッションの本数。")
                summaryStat(label: "休憩", value: "\(store.todayBreakCount)回", symbol: "cup.and.saucer",
                            help: "今日、最後まで取った休憩の回数。スキップした休憩は含みません。")
            }
            Spacer(minLength: 20)
            SunriseFooter()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .pomoCard()
    }

    private func summaryStat(label: String, value: String, symbol: String, help: String = "") -> some View {
        VStack(spacing: 12) {
            // 円形チップのアイコン（モック準拠。色は琥珀のみ — 評価色を持ち込まない）
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Tokens.kohakuDeep)
                .frame(width: 40, height: 40)
                .background(Circle().fill(Tokens.kohaku.opacity(0.14)))
            Text(value)
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .monospacedDigit()
                .foregroundStyle(Tokens.sumi)
                .contentTransition(.numericText())
            Text(label)
                .pomoFont(12, weight: .medium)
                .foregroundStyle(Tokens.sumiSecondary)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .help(help)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label) \(value)")
        .accessibilityHint(help)
    }

    // MARK: - 今週・最近

    private var weekSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("今週の推移")
            WeekChart(days: store.days).pomoCard()
        }
    }

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionLabel("最近のアクティビティ")
                Spacer()
                Button(action: openSessions) {
                    HStack(spacing: 2) {
                        Text("すべて見る")
                            .pomoFont(12, weight: .medium)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9))
                            .foregroundStyle(Tokens.kohakuText)
                    }
                    .foregroundStyle(Tokens.kohakuText)
                }
                .buttonStyle(.plain)
            }
            let recent = Array(store.recentByDay.flatMap(\.entries).prefix(6))
            if recent.isEmpty {
                Text("まだ記録はありません。タイマーを回すと、ここに積み上がっていきます。")
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumiSecondary)
                    .padding(.vertical, 8)
                    .pomoCard()
            } else {
                SessionListCard(entries: recent)
            }
        }
    }
}

/// 円形プログレスリング。トラックの上を琥珀が周回し、先端にドット。
/// flow 25分超（saturated）はパネルの横棒と同じ条件で減光（満タン静止＝完了の誤読防止）。
/// justFinished はゆっくり明滅して6秒で静まる（パネルのグローと同じ言語）
struct TimerRing: View {
    let progress: Double
    let active: Bool
    let saturated: Bool
    let glowing: Bool

    private let lineWidth: CGFloat = 6

    var body: some View {
        ZStack {
            Circle()
                .stroke(Tokens.sumi.opacity(0.06), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.0001, min(1, progress)))
                .stroke(Tokens.kohaku, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .opacity(ringOpacity)
                .shadow(color: Tokens.kohaku.opacity(glowing ? 0.7 : 0), radius: glowing ? 10 : 0)
            // 先端のドット（モック準拠）。idle 時は上端で待つ
            GeometryReader { geo in
                let r = geo.size.width / 2
                Circle()
                    .fill(active ? Tokens.kohaku : Tokens.kohaku.opacity(0.4)) // idle でも温かい琥珀の点で待つ
                    .frame(width: 10, height: 10)
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
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .monospacedDigit()
            }
            .foregroundStyle(Tokens.kohakuDeep)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Capsule().fill(Tokens.kohaku.opacity(hovered ? 0.4 : 0.22)))
        }
        .buttonStyle(PressableButtonStyle())
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .help("作業を終えて、この長さの休憩を始める")
    }
}

/// サマリーカード下部の静かな日の出イラスト（SVG アセット不要・SwiftUI 純描画）
struct SunriseFooter: View {
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // 薄い日の出グラデ + 太陽 + 山。静かなトーン。
            LinearGradient(colors: [.clear, Tokens.kohaku.opacity(0.10)], startPoint: .top, endPoint: .bottom)
            Circle().fill(Tokens.kohaku.opacity(0.22)).frame(width: 44, height: 44)
                .offset(x: 0, y: 18).frame(maxWidth: .infinity, alignment: .trailing).padding(.trailing, 24)
            Hills().fill(Tokens.sumi.opacity(0.05))
            Text("小さな一歩の積み重ねが、大きな成果につながります。")
                .pomoFont(12).foregroundStyle(Tokens.sumiTertiary)
                .padding(.bottom, 10)
        }
        .frame(height: 88)
        .clipShape(RoundedRectangle(cornerRadius: Tokens.radiusChip))
    }
}

/// サマリーカード下部のなだらかな山シルエット（静かなトーン）
struct Hills: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: r.maxY))
        p.addCurve(to: CGPoint(x: r.midX, y: r.maxY - r.height * 0.45),
                   control1: CGPoint(x: r.width * 0.18, y: r.maxY - r.height * 0.1),
                   control2: CGPoint(x: r.width * 0.34, y: r.maxY - r.height * 0.5))
        p.addCurve(to: CGPoint(x: r.maxX, y: r.maxY - r.height * 0.2),
                   control1: CGPoint(x: r.width * 0.66, y: r.maxY - r.height * 0.38),
                   control2: CGPoint(x: r.width * 0.84, y: r.maxY - r.height * 0.05))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}
