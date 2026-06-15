// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Pomo",
    platforms: [.macOS(.v14)],
    dependencies: [
        // ローカル SQLite 派生インデックス（メモ全文検索）用。JSONL は引き続き一次ストア。
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "7.0.0")
    ],
    targets: [
        .executableTarget(
            name: "Pomo",
            dependencies: [.product(name: "GRDB", package: "GRDB.swift")],
            path: "Sources/Pomo",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
