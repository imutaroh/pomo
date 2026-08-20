// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Pomo",
    platforms: [.macOS(.v14)],
    dependencies: [
        // 自動アップデート（無料構成: EdDSA 署名 + GitHub Releases の appcast）。
        // Apple Developer Program なしで動く。MAS 提出時はこの依存を外すこと（Sparkle は MAS 不可）
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.6.0"),
    ],
    targets: [
        .executableTarget(
            name: "Pomo",
            dependencies: [
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            path: "Sources/Pomo",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
