// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Pomo",
    platforms: [.macOS(.v14)],
    dependencies: [
        // ローカル SQLite 派生インデックス（メモ全文検索）用。JSONL は引き続き一次ストア。
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "7.0.0"),
        // 自動アップデート（無料構成: EdDSA 署名 + GitHub Releases の appcast）。
        // Apple Developer Program なしで動く。MAS 提出時はこの依存を外すこと（Sparkle は MAS 不可）
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.6.0"),
    ],
    targets: [
        .executableTarget(
            name: "Pomo",
            dependencies: [
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            path: "Sources/Pomo",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
