import AppKit
import Sparkle

/// Sparkle 自動アップデート（Issue #48・無料構成）。
/// Apple Developer Program なしで動く: 更新の真正性は自前の EdDSA 鍵（SUPublicEDKey）で検証し、
/// appcast は GitHub Releases の安定URL（releases/latest/download/appcast.xml）から取得する。
/// 注意: MAS 提出時は Sparkle 依存ごと外すこと（App Store は自前アップデータ禁止）。
@MainActor
final class UpdaterManager {
    static let shared = UpdaterManager()

    /// 標準UI付きのアップデータ。起動時から自動チェックが走る（SUEnableAutomaticChecks）
    let controller: SPUStandardUpdaterController

    private init() {
        controller = SPUStandardUpdaterController(
            startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil
        )
    }
}
