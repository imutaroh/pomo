import SwiftUI

// monora 公式 design-components のトークン（REQUIREMENTS.md §6）
enum Tokens {
    static let sumi = Color(red: 0x1A / 255, green: 0x1A / 255, blue: 0x1B / 255)
    static let kohaku = Color(red: 0xFF / 255, green: 0xB3 / 255, blue: 0x47 / 255)
    /// 白地の上のアイコン・塗り・大きな文字用の濃い琥珀（#FFB347 は白地だとコントラスト不足）
    static let kohakuDeep = Color(red: 0xD0 / 255, green: 0x82 / 255, blue: 0x14 / 255)
    /// 白地の上の「操作テキスト（リンク等）」用のさらに濃い琥珀。WCAG AA（約 4.6:1）を満たす
    static let kohakuText = Color(red: 0xA8 / 255, green: 0x65 / 255, blue: 0x10 / 255)
    static let washi = Color(red: 0xFA / 255, green: 0xF9 / 255, blue: 0xF7 / 255)
    static let usugumo = Color(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF7 / 255)
    /// 母艦ウィンドウのページ背景。白カードを浮かせるため washi より一段深い暖かな生成り色。
    /// （washi はパネルの下敷きに使うので変えない）
    static let canvas = Color(red: 0xF1 / 255, green: 0xEE / 255, blue: 0xE8 / 255)

    /// サブテキスト（§6 の「墨色の不透明度」原則）。可読性のため WCAG AA を満たす濃さに統一。
    /// secondary ≈ 4.5:1（本文サイズ AA）、tertiary ≈ 3.8:1（大きめ・補助情報用）。
    /// 白カード／和紙背景のどちらの上でも AA を確保する値。
    static let sumiSecondary = sumi.opacity(0.60)
    static let sumiTertiary = sumi.opacity(0.55)

    /// 角丸スケール。panel=18 / カード=16 / ピル=10 / チップ・バー=4
    static let cornerRadius: CGFloat = 18
    static let radiusCard: CGFloat = 16
    static let radiusPill: CGFloat = 10
    static let radiusChip: CGFloat = 4

    static let fadeDuration: Double = 0.45 // 300-600ms ease-out の中庸
}

/// Dynamic Type 対応の丸ゴシックフォント。
/// 既定のテキストサイズでは従来の固定 .system(size:) と完全に同一表示になり（@ScaledMetric は
/// 既定時に wrappedValue をそのまま返す）、ユーザーがアクセシビリティで文字を拡大したときだけ追従する。
/// 巨大表示数字（パネル/オーバーレイのタイマー）は minimumScaleFactor 前提なので対象外のまま固定でよい。
private struct ScaledRoundedFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight

    init(_ size: CGFloat, weight: Font.Weight, relativeTo: Font.TextStyle) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: relativeTo)
        self.weight = weight
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight, design: .rounded))
    }
}

extension View {
    /// `.font(.system(size:weight:design:.rounded))` の Dynamic Type 対応版。
    /// `.monospacedDigit()` を併用する表示数字には使わない（明示フォントが環境の monospaced を打ち消すため、
    /// それらは固定 `.system(size:).monospacedDigit()` のまま据え置く）。
    func pomoFont(_ size: CGFloat, weight: Font.Weight = .regular, relativeTo: Font.TextStyle = .body) -> some View {
        modifier(ScaledRoundedFont(size, weight: weight, relativeTo: relativeTo))
    }
}
