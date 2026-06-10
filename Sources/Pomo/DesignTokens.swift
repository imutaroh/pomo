import SwiftUI

// monora 公式 design-components のトークン（REQUIREMENTS.md §6）
enum Tokens {
    static let sumi = Color(red: 0x1A / 255, green: 0x1A / 255, blue: 0x1B / 255)
    static let kohaku = Color(red: 0xFF / 255, green: 0xB3 / 255, blue: 0x47 / 255)
    static let washi = Color(red: 0xFA / 255, green: 0xF9 / 255, blue: 0xF7 / 255)
    static let usugumo = Color(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF7 / 255)

    static let cornerRadius: CGFloat = 18
    static let fadeDuration: Double = 0.45 // 300-600ms ease-out の中庸
}
