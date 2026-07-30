import SwiftUI

/// 直近14日のセッションを日別に一覧。メモ付き JSONL がこのアプリの差別化資産 — 見返す場所
struct SessionsPage: View {
    @ObservedObject var store: SessionStore
    @State private var searchText = ""
    @State private var period: PeriodFilter = .days14
    @State private var interruptedOnly = false

    enum PeriodFilter: Int, CaseIterable, Identifiable {
        case days14 = 14, days30 = 30, all = 0
        var id: Int { rawValue }
        var label: String {
            switch self {
            case .days14: return "14日"
            case .days30: return "30日"
            case .all: return "全期間"
            }
        }
    }

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "M月d日（E）"
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 6) {
                Text("セッション")
                    .pomoFont(28, weight: .semibold)
                    .foregroundStyle(Tokens.sumi)
                Text("直近14日の記録。中断も延長も、ぜんぶただの事実。")
                    .pomoFont(13)
                    .foregroundStyle(Tokens.sumiSecondary)
            }
            .staggeredAppear(0)

            // 検索フィールド
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(Tokens.sumiSecondary)
                    .font(.system(size: 14))
                TextField("メモを検索（例: Go、レビュー）", text: $searchText)
                    .textFieldStyle(.plain)
                    .pomoFont(14)
                    .foregroundStyle(Tokens.sumi)
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(Tokens.sumiTertiary)
                            .font(.system(size: 14))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: Tokens.radiusPill).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: Tokens.radiusPill).strokeBorder(Tokens.sumi.opacity(0.08), lineWidth: 1))
            .staggeredAppear(1)

            // 期間・中断フィルタのチップ
            HStack(spacing: 8) {
                ForEach(PeriodFilter.allCases) { p in
                    FilterChip(label: p.label, selected: period == p) { period = p }
                }
                Spacer().frame(width: 4)
                FilterChip(label: "中断のみ", selected: interruptedOnly) { interruptedOnly.toggle() }
            }
            .staggeredAppear(1)

            let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)

            if trimmed.isEmpty {
                // 通常表示（期間・中断フィルタ適用後）
                let filteredDays = filteredByDay(store.allWorkByDay)
                if filteredDays.isEmpty {
                    Text(store.allWorkByDay.isEmpty ? "まだ記録はありません。タイマーを回すと、ここに積み上がっていきます。" : "この条件に合う記録はありません。")
                        .pomoFont(13)
                        .foregroundStyle(Tokens.sumiSecondary)
                        .padding(.vertical, 8)
                        .pomoCard()
                        .staggeredAppear(2)
                } else {
                    ForEach(Array(filteredDays.enumerated()), id: \.element.date) { index, day in
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                sectionLabel(Self.dayLabel(day.date))
                                Text("\(day.entries.filter(\.completed).count) セッション · \(hmString(day.entries.filter(\.completed).reduce(0) { $0 + $1.durationSec }))")
                                    .font(.system(size: 11, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(Tokens.sumiTertiary)
                            }
                            SessionListCard(entries: day.entries, onChanged: { store.reload() })
                        }
                        .staggeredAppear(min(index + 2, 6)) // 遅延の上限は 240ms（下の方まで待たせない）
                    }
                }
            } else {
                // 検索結果表示（期間・中断フィルタ適用後）
                let allHits = SessionIndex.shared.search(trimmed)
                let results = filteredEntries(allHits)
                VStack(alignment: .leading, spacing: 12) {
                    sectionLabel("「\(trimmed)」の検索結果 · \(results.count)件")
                    if results.isEmpty {
                        // フィルタで隠れているだけなら「見つからない」と誤誘導しない
                        Text(allHits.isEmpty
                            ? "一致するメモは見つかりませんでした。"
                            : "この条件では0件です（フィルタを外すと \(allHits.count)件）。")
                            .pomoFont(13)
                            .foregroundStyle(Tokens.sumiSecondary)
                            .padding(.vertical, 8)
                            .pomoCard()
                    } else {
                        SessionListCard(entries: results, onChanged: { store.reload() })
                    }
                }
                .staggeredAppear(2)
            }
        }
        .animation(.easeOut(duration: 0.25), value: period)
        .animation(.easeOut(duration: 0.25), value: interruptedOnly)
    }

    /// 期間カットオフ日（.all なら nil）
    private func periodCutoff(_ cal: Calendar) -> Date? {
        guard period != .all else { return nil }
        let todayStart = cal.startOfDay(for: Date())
        return cal.date(byAdding: .day, value: -(period.rawValue - 1), to: todayStart)
    }

    /// 日別リストにフィルタは常に最後段で適用する
    private func filteredByDay(_ source: [(date: Date, entries: [SessionLogger.ParsedEntry])]) -> [(date: Date, entries: [SessionLogger.ParsedEntry])] {
        let cal = Calendar.current
        var result = source
        if let cutoff = periodCutoff(cal) {
            result = result.filter { $0.date >= cutoff }
        }
        if interruptedOnly {
            result = result.compactMap { day in
                let filtered = day.entries.filter(\.interrupted)
                return filtered.isEmpty ? nil : (date: day.date, entries: filtered)
            }
        }
        return result
    }

    /// 検索結果（フラットな配列）にフィルタは常に最後段で適用する
    private func filteredEntries(_ source: [SessionLogger.ParsedEntry]) -> [SessionLogger.ParsedEntry] {
        var result = source
        if let cutoff = periodCutoff(Calendar.current) {
            result = result.filter { $0.start >= cutoff }
        }
        if interruptedOnly {
            result = result.filter(\.interrupted)
        }
        return result
    }

    private static func dayLabel(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "今日" }
        if cal.isDateInYesterday(date) { return "昨日" }
        return dayFormat.string(from: date)
    }
}

/// 選択式フィルタチップ（期間・中断フィルタ用の共用部品）
private struct FilterChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .pomoFont(12, weight: selected ? .semibold : .medium)
                .foregroundStyle(selected ? Tokens.kohakuText : Tokens.sumiSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(
                    Capsule().fill(
                        selected
                            ? Tokens.kohaku.opacity(0.22)
                            : Tokens.sumi.opacity(hovered ? 0.09 : 0.05)
                    )
                )
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
