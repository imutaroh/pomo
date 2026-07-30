import SwiftUI

// imutaro.com「データエンジニアのフィールドノート」トーン（imutaro リポジトリ DESIGN.md 準拠）。
// 旧: monora 公式トークン（白基調・琥珀の和テイスト）→ 2026-07-30 に本人のトンマナへ全面刷新（Issue #30）。
// 原則: 面で塗らない（色は線と文字に）、影は原則使わない、mono=機械が読む情報。
// 既存コードの参照名（sumi/kohaku/washi 等）は互換のため残し、値だけ差し替える（統一パスで改名予定）
enum Tokens {
    /// ink #1A2330 — 見出し・本文の主文字色（旧 sumi）
    static let sumi = Color(red: 0x1A / 255, green: 0x23 / 255, blue: 0x30 / 255)
    /// accent #0087A8 — アクセント。線と文字だけに、点在させすぎない（旧 kohaku）
    static let kohaku = Color(red: 0x00 / 255, green: 0x87 / 255, blue: 0xA8 / 255)
    /// アイコン・塗り用の濃いアクセント（白地でのコントラスト確保）
    static let kohakuDeep = Color(red: 0x00 / 255, green: 0x70 / 255, blue: 0x8C / 255)
    /// 操作テキスト（リンク等）用。白地で WCAG AA を満たす濃さ
    static let kohakuText = Color(red: 0x00 / 255, green: 0x5F / 255, blue: 0x77 / 255)
    /// bg #FAFBFC — ページ・パネルの下敷き（旧 washi）
    static let washi = Color(red: 0xFA / 255, green: 0xFB / 255, blue: 0xFC / 255)
    /// code-bg #F0F3F6 — 淡い面（サイドバー・hover背景・チップ地。塗ってよい唯一の面）（旧 usugumo）
    static let usugumo = Color(red: 0xF0 / 255, green: 0xF3 / 255, blue: 0xF6 / 255)
    /// ページ背景も bg に統一（カードは面で浮かせず、ヘアライン罫線で区切る）
    static let canvas = Color(red: 0xFA / 255, green: 0xFB / 255, blue: 0xFC / 255)
    /// line #E3E8ED — ヘアライン罫線・カード枠
    static let line = Color(red: 0xE3 / 255, green: 0xE8 / 255, blue: 0xED / 255)

    /// サブテキスト。sub #5B6572 相当を ink の不透明度で表現（AA 維持）
    static let sumiSecondary = sumi.opacity(0.66)
    static let sumiTertiary = sumi.opacity(0.55)

    /// 角丸スケール。panel=18（ガラスの機能上維持）/ カード=10 / ピル=8 / チップ・バー=4
    /// （フィールドノートは基本4px・カード8px だが、ネイティブの窓・ガラスに合わせ一段だけ丸く）
    static let cornerRadius: CGFloat = 18
    static let radiusCard: CGFloat = 10
    static let radiusPill: CGFloat = 8
    static let radiusChip: CGFloat = 4

    static let fadeDuration: Double = 0.45 // 300-600ms ease-out の中庸
}

/// Dynamic Type 対応フォント（フィールドノート化に伴い丸ゴシック → SF 標準へ。2026-07-30 Issue #30）。
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
        content.font(.system(size: size, weight: weight, design: .default))
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
