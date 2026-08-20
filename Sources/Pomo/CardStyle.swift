import SwiftUI

// 母艦ウィンドウで共用する白カード・見出し・選択チップ。

extension View {
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

/// 番号つきのぶら下げ行。mono の番号を左の溝に置き、見出しと本文はその右で左端を揃える
/// （手順や箇条書きを、記号ではなく「計器の目盛り」として並べる意図）。
struct NumberedRow: View {
    let number: String
    let title: String
    let detail: String
    var last = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                Text(number)
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Tokens.kohakuText)
                    .frame(width: 18, alignment: .leading)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .pomoFont(13, weight: .semibold)
                        .foregroundStyle(Tokens.sumi)
                    Text(detail)
                        .pomoFont(12)
                        .foregroundStyle(Tokens.sumiSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 10)
            .accessibilityElement(children: .combine)
            if !last {
                Divider().overlay(Tokens.line)
            }
        }
    }
}

/// 母艦の細いテキストリンク（フッター・各ページのヘッダーで共用）。
/// 面を持たず、ティールの文字だけで操作を示す（ボタンは主操作のリング下だけに絞る意図）。
struct InlineLink: View {
    let title: String
    var symbol: String?
    var weight: Font.Weight = .semibold
    /// 現在地を指すリンク: 墨色にして押せなくする
    var current = false
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 11, weight: .semibold))
                }
                Text(title).pomoFont(12, weight: weight)
            }
            .foregroundStyle(current ? Tokens.sumi : (hovered ? Tokens.kohakuDeep : Tokens.kohakuText))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(current)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
    }
}

/// ダッシュボード以外のページのヘッダーに置く戻り道
struct BackToTimerLink: View {
    let action: () -> Void

    var body: some View {
        InlineLink(title: "タイマーへ", symbol: "chevron.left", action: action)
            .help("ダッシュボードに戻る（⌘1）")
    }
}

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
                .background(Capsule().fill(selected ? Tokens.sumi : (hovered ? Tokens.usugumo : Color.white)))
                .overlay(Capsule().strokeBorder(selected ? Tokens.sumi : Tokens.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.15), value: hovered)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
