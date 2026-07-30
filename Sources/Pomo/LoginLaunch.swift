import Foundation

/// ログイン時に起動の LaunchAgent フォールバック（Issue #37）。
/// ad-hoc 署名のローカルビルドでは SMAppService の登録が失敗する（既知の制約）ため、
/// 非サンドボックス環境に限り ~/Library/LaunchAgents への plist 書き込みで代替する。
/// 「Macを開いたらパネルがそこにいる」= 習慣科学で最強の行動アンカーへの接続なので、
/// ローカルビルドでも必ず動く経路を用意する価値がある。
enum LoginLaunch {
    private static var agentURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/com.imutaakihiro.pomo.plist")
    }

    /// App Sandbox 下ではコンテナ外への書き込みができない（MAS ビルドは署名済みなので SMAppService が動く）
    static var isSandboxed: Bool {
        ProcessInfo.processInfo.environment["APP_SANDBOX_CONTAINER_ID"] != nil
    }

    static var agentInstalled: Bool {
        FileManager.default.fileExists(atPath: agentURL.path)
    }

    static func installAgent() throws {
        let plist: [String: Any] = [
            "Label": "com.imutaakihiro.pomo",
            // open 経由なら翻訳環境（Rosetta等）や再ビルド後のパス解決も OS に任せられる
            "ProgramArguments": ["/usr/bin/open", Bundle.main.bundlePath],
            "RunAtLoad": true,
        ]
        let data = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
        try FileManager.default.createDirectory(
            at: agentURL.deletingLastPathComponent(), withIntermediateDirectories: true
        )
        try data.write(to: agentURL)
    }

    static func removeAgent() {
        try? FileManager.default.removeItem(at: agentURL)
    }
}
