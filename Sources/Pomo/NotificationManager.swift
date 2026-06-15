import AppKit
import UserNotifications

/// M5 第2合図: システム通知（アクションボタン付き）。第1合図（パネルの視覚変化＋サウンド）の冗長系。
/// 別 Space やフルスクリーンで作業していてもセッション終了に気づけるようにする。
///
/// 設計上の約束:
/// - 許可は**初回のセッション完了直前**に要求する（§9。起動直後には求めない）。拒否されても
///   サウンド＋パネルの視覚変化で全機能が成立する。
/// - 通知自体には音を付けない（TimerEngine が NSSound を鳴らすため、二重音を避ける）。
/// - アクションは現在の状態に一致するものだけを出す（罪悪感ゼロ: 「スキップ」「+5分」は失敗ではない）。
@MainActor
final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()

    /// 通知アクションのハンドラ。AppDelegate が engine に配線する。
    var actionHandler: ((String) -> Void)?

    static let actStartBreak = "pomo.action.startBreak"
    static let actExtendBreak = "pomo.action.extendBreak"
    static let actSkipBreak = "pomo.action.skipBreak"
    static let actStartWork = "pomo.action.startWork"

    private let center = UNUserNotificationCenter.current()
    private let catBreakPending = "pomo.cat.breakPending"   // 休憩は手動開始待ち
    private let catBreakRunning = "pomo.cat.breakRunning"   // 休憩が自動開始した
    private let catBreakEnded = "pomo.cat.breakEnded"       // 休憩おわり

    /// 起動時に呼ぶ: delegate 設定とカテゴリ（アクションボタン）の登録。許可要求はしない。
    func configure() {
        center.delegate = self

        let startBreak = UNNotificationAction(identifier: Self.actStartBreak, title: "休憩を始める", options: [.foreground])
        let extendBreak = UNNotificationAction(identifier: Self.actExtendBreak, title: "+5分")
        let skipBreak = UNNotificationAction(identifier: Self.actSkipBreak, title: "スキップ")
        let startWork = UNNotificationAction(identifier: Self.actStartWork, title: "作業を始める", options: [.foreground])

        center.setNotificationCategories([
            UNNotificationCategory(identifier: catBreakPending, actions: [startBreak], intentIdentifiers: []),
            UNNotificationCategory(identifier: catBreakRunning, actions: [extendBreak, skipBreak], intentIdentifiers: []),
            UNNotificationCategory(identifier: catBreakEnded, actions: [startWork], intentIdentifiers: []),
        ])
    }

    // MARK: - 通知の送出（engine から状態に応じて呼ばれる）

    /// 作業おわり → 休憩が自動で始まった
    func notifyWorkEndedBreakStarted(breakSeconds: Int) {
        deliver(title: "作業おわり", body: "\(Self.lengthText(breakSeconds))の休憩を始めました。画面から目を離して、ひと息どうぞ。",
                category: catBreakRunning, id: "pomo.work")
    }

    /// 作業おわり → 休憩は手動開始待ち（autoStartBreak OFF）
    func notifyWorkEndedBreakPending(breakSeconds: Int) {
        deliver(title: "作業おわり", body: "おつかれさま。\(Self.lengthText(breakSeconds))の休憩がたまっています。",
                category: catBreakPending, id: "pomo.work")
    }

    /// 単純タイマー終了（記録なし・休憩なし）
    func notifySimpleTimerEnded() {
        deliver(title: "タイマー終了", body: "時間になりました。", category: nil, id: "pomo.simple")
    }

    /// 休憩おわり
    func notifyBreakEnded(autoWork: Bool) {
        deliver(title: "休憩おわり", body: autoWork ? "次の作業を始めます。" : "リフレッシュできましたか。準備ができたら、また始めましょう。",
                category: autoWork ? nil : catBreakEnded, id: "pomo.break")
    }

    // MARK: - 内部

    private func deliver(title: String, body: String, category: String?, id: String) {
        ensureAuthorized { [weak self] granted in
            guard let self, granted else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            if let category { content.categoryIdentifier = category }
            // 音は付けない（engine の NSSound が単一の音源）。
            // 同一 id で都度差し替え（古い終了通知を積み上げない）。
            self.center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
        }
    }

    /// 許可状態を確認し、未決定なら要求してから completion（MainActor）を呼ぶ。
    private func ensureAuthorized(_ completion: @escaping @MainActor (Bool) -> Void) {
        // クロージャ内では current()（シングルトン）を都度呼び、非 Sendable な center をキャプチャしない
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional:
                Task { @MainActor in completion(true) }
            case .notDetermined:
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
                    Task { @MainActor in completion(granted) }
                }
            default: // denied
                Task { @MainActor in completion(false) }
            }
        }
    }

    private static func lengthText(_ seconds: Int) -> String {
        let m = seconds / 60, s = seconds % 60
        if m > 0 { return s > 0 ? "\(m)分\(s)秒" : "\(m)分" }
        return "\(s)秒"
    }

    // MARK: - UNUserNotificationCenterDelegate

    // アプリが前面にいても通知を見せる（集中して別ウィンドウにいる時に気づけるように）
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let id = response.actionIdentifier
        if id != UNNotificationDefaultActionIdentifier, id != UNNotificationDismissActionIdentifier {
            Task { @MainActor in NotificationManager.shared.actionHandler?(id) }
        }
        completionHandler()
    }
}
