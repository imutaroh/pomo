import AppKit
import Charts
import SwiftUI

// 母艦ウィンドウの4ページで共用する部品（白カード・見出し・時間表記・週チャート）

extension View {
    /// フィールドノートの白カード: 純白＋ヘアライン罫線（#E3E8ED）。影は使わない（DESIGN.md §5）
    func pomoCard() -> some View {
        padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: Tokens.radiusCard)
                    .fill(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: Tokens.radiusCard)
                            .strokeBorder(Tokens.line, lineWidth: 1)
                    )
            )
    }

    /// ページ表示時に上から順に静かにフェードインする（index ごとに 40ms 遅延、跳ねない）
    func staggeredAppear(_ index: Int) -> some View {
        modifier(StaggeredAppear(index: index))
    }
}

struct StaggeredAppear: ViewModifier {
    let index: Int
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 6)
            .onAppear {
                withAnimation(.easeOut(duration: 0.45).delay(Double(index) * 0.04)) {
                    shown = true
                }
            }
    }
}

func sectionLabel(_ text: String) -> some View {
    Text(text)
        .pomoFont(12, weight: .medium)
        .foregroundStyle(Tokens.sumiSecondary)
}

/// フィールドノートの署名: ミニダイヤル◉＋mono大文字のセクション見出し（DESIGN.md §4・§6）。
/// 小サイズの mono は広めのトラッキングでスキャナブルに（Linear/Raycast の作法）
func sectionEyebrow(_ text: String) -> some View {
    HStack(spacing: 7) {
        ZStack {
            Circle().strokeBorder(Tokens.kohaku, lineWidth: 1)
            Circle().fill(Tokens.kohaku).frame(width: 3.5, height: 3.5)
        }
        .frame(width: 10, height: 10)
        Text(text)
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .tracking(1.4)
            .foregroundStyle(Tokens.sumiSecondary)
    }
    .accessibilityElement(children: .combine)
}

/// 選択チップ（期間フィルタ・モード切替などの共用部品。旧 SessionsPage.FilterChip を昇格）
struct SelectChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .pomoFont(12, weight: selected ? .semibold : .medium)
                .foregroundStyle(selected ? Color.white : Tokens.sumiSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(
                    Capsule().fill(selected ? Tokens.sumi : (hovered ? Tokens.usugumo : Color.white))
                )
                .overlay(Capsule().strokeBorder(selected ? Tokens.sumi : Tokens.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// 秒数 → 「Xh Ym」（1時間未満は「Ym」）。コンパクト表記で統一（MM:SS のタイマーと誤読しないよう h/m を明記）
func hmString(_ seconds: Int) -> String {
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    return h > 0 ? "\(h)h \(m)m" : "\(m)m"
}

/// 直近7日の棒グラフ。ダッシュボード「今週の推移」と統計ページで共用。
/// 表示時にバーが下から伸びる（ease-out、跳ねない）
struct WeekChart: View {
    let days: [DaySummary]
    @State private var grown = false

    var body: some View {
        Chart(days) { day in
            BarMark(
                x: .value("日", day.date, unit: .day),
                y: .value("分", grown ? Double(day.workSeconds) / 60.0 : 0)
            )
            // 外科的アクセント: 「今」である今日のバーだけティール、他は墨の淡色（Linear 的な抑制）
            .foregroundStyle(Calendar.current.isDateInToday(day.date) ? Tokens.kohaku : Tokens.sumi.opacity(0.14))
            .cornerRadius(Tokens.radiusChip)
        }
        // 伸びるアニメーション中に軸スケールが暴れないよう、分母は実データで固定
        .chartYScale(domain: 0...max(30, days.map { Double($0.workSeconds) / 60.0 }.max() ?? 30))
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) { grown = true }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day)) { _ in
                AxisValueLabel(format: .dateTime.weekday(.abbreviated), centered: true)
            }
        }
        .chartYAxis {
            AxisMarks { value in
                AxisGridLine().foregroundStyle(Tokens.sumi.opacity(0.06))
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text("\(Int(v))分")
                    }
                }
            }
        }
        .frame(minHeight: 150, maxHeight: 200)
    }
}

struct SessionRow: View {
    let entry: SessionLogger.ParsedEntry
    var onChanged: () -> Void
    @State private var hovered = false
    @State private var showDeleteConfirm = false

    private static let time: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(Self.time.string(from: entry.start)) – \(Self.time.string(from: entry.end))")
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(Tokens.sumi)
                .layoutPriority(1)
            if let memo = entry.memo, !memo.isEmpty {
                Text(memo)
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumi.opacity(0.7))
                    .lineLimit(2)
                    .layoutPriority(0)
                    .textSelection(.enabled)
            }
            Spacer()
            if entry.interrupted {
                // 中断は失敗ではなく事実。色は付けない
                Text("中断")
                    .pomoFont(11)
                    .foregroundStyle(Tokens.sumiSecondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Tokens.sumi.opacity(0.05)))
            }
            Text("\(entry.durationSec / 60)分")
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(Tokens.sumi.opacity(0.5))
                .layoutPriority(1)
            // 常にレイアウトに置き opacity だけ切り替える（出し入れすると Spacer が幅を再配分し他要素がガタつくため）
            Menu {
                Button("メモを編集…") { presentEditMemo() }
                Button("削除…") { showDeleteConfirm = true }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Tokens.sumiSecondary)
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .frame(width: 20)
            .opacity(hovered ? 1 : 0)
            .allowsHitTesting(hovered)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 13)
        .background(Tokens.sumi.opacity(hovered ? 0.03 : 0))
        .animation(.easeOut(duration: 0.15), value: hovered)
        .onHover { hovered = $0 }
        // 「…」メニューと同じ操作を右クリックでも（macOS の標準作法）
        .contextMenu {
            Button("メモを編集…") { presentEditMemo() }
            Button("削除…", role: .destructive) { showDeleteConfirm = true }
        }
        .confirmationDialog("このセッションを削除しますか？", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("削除", role: .destructive) {
                SessionLogger.shared.deleteEntry(start: entry.start, end: entry.end)
                onChanged()
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("元に戻せません。")
        }
    }

    /// メモ編集は NSAlert（MenuBarController.editMemo と同じ体裁）。パネルではなく母艦上のダイアログなので
    /// テキスト入力を SwiftUI View に置く原則（§8）には抵触しない
    private func presentEditMemo() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "メモを編集"
        alert.informativeText = "セッション記録（JSONL）に保存されます"
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.stringValue = entry.memo ?? ""
        field.placeholderString = "例: Go の学習、ブログ執筆"
        alert.accessoryView = field
        alert.addButton(withTitle: "保存")
        alert.addButton(withTitle: "キャンセル")
        alert.window.initialFirstResponder = field
        if alert.runModal() == .alertFirstButtonReturn {
            let text = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            SessionLogger.shared.updateMemo(start: entry.start, end: entry.end, memo: text.isEmpty ? nil : text)
            onChanged()
        }
    }
}

/// SessionRow をリスト状に積む白カード（区切り線付き）
struct SessionListCard: View {
    let entries: [SessionLogger.ParsedEntry]
    var onChanged: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(entries) { e in
                SessionRow(entry: e, onChanged: onChanged)
                if e.id != entries.last?.id {
                    Divider().overlay(Tokens.sumi.opacity(0.05))
                }
            }
        }
        .background(RoundedRectangle(cornerRadius: Tokens.radiusCard).fill(Color.white))
        .clipShape(RoundedRectangle(cornerRadius: Tokens.radiusCard))
        .overlay(
            RoundedRectangle(cornerRadius: Tokens.radiusCard)
                .strokeBorder(Tokens.line, lineWidth: 1)
        )
    }
}
