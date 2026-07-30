import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var engine: TimerEngine!
    private var panelController: PanelController!
    private var mainWindow: MainWindowController!
    private var menuBar: MenuBarController!
    private var hotKeys: HotKeyManager!
    private var breakOverlay: BreakOverlayController!
    private var menuActions: AppMenuActions!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // メニューバー常駐 + Dock 常時表示。通常アプリとして起動する。
        NSApp.setActivationPolicy(.regular)

        engine = TimerEngine()
        panelController = PanelController(engine: engine)
        mainWindow = MainWindowController(engine: engine, panelController: panelController)
        panelController.openMainWindow = { [weak self] in self?.mainWindow.show() }
        menuActions = AppMenuActions(openSettings: { [weak self] in self?.mainWindow.show(page: .settings) })
        NSApp.mainMenu = AppMenu.build(actions: menuActions)
        breakOverlay = BreakOverlayController(engine: engine)
        menuBar = MenuBarController(engine: engine, panelController: panelController, mainWindow: mainWindow, breakOverlay: breakOverlay)
        hotKeys = HotKeyManager(engine: engine, panelController: panelController)

        // M5 第2合図: 通知のカテゴリ登録とアクション配線（許可要求は初回完了直前まで遅延）
        NotificationManager.shared.configure()
        NotificationManager.shared.actionHandler = { [weak self] id in
            guard let engine = self?.engine else { return }
            switch id {
            case NotificationManager.actStartBreak: engine.startBreak()
            case NotificationManager.actExtendBreak: engine.extendFiveMinutes()
            case NotificationManager.actSkipBreak: engine.skipBreak()
            case NotificationManager.actStartWork: engine.startWork()
            default: break
            }
        }

        // ディスプレイ構成変更で画面外に出たら主ディスプレイへ戻す（§7-C）
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.panelController.clampToVisibleScreen() }
        }

        // 初回起動: メニューバーだけだと存在に気づけないので、母艦ウィンドウを開いて全体像を見せる。
        // 一度だけ（didOnboard）。母艦を開くとパネルはしまわれ、閉じれば戻る（排他切替）。
        if !UserDefaults.standard.bool(forKey: "didOnboard") {
            UserDefaults.standard.set(true, forKey: "didOnboard")
            mainWindow.show()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        mainWindow.show()
        return false
    }

    // MARK: - Dock 右クリックメニュー（Dock 常時表示化に伴い新設。主操作をメニューバー版と揃える）

    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        let menu = NSMenu()
        if engine.phase == .idle {
            menu.addItem(dockItem("作業を開始", #selector(dockStartWork)))
        } else {
            menu.addItem(dockItem(engine.isPaused ? "再開" : "一時停止", #selector(dockTogglePause)))
        }
        menu.addItem(dockItem(panelController.panel.isVisible ? "パネルを隠す" : "パネルを表示", #selector(dockTogglePanel)))
        menu.addItem(.separator())
        menu.addItem(dockItem("設定を開く", #selector(dockOpenSettings)))
        return menu
    }

    private func dockItem(_ title: String, _ action: Selector) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: "")
        i.target = self
        return i
    }

    @objc private func dockStartWork() { engine.startWork() }
    @objc private func dockTogglePause() { engine.togglePause() }
    @objc private func dockTogglePanel() { panelController.toggleVisibility() }
    @objc private func dockOpenSettings() { mainWindow.show(page: .settings) }
}

@main
struct PomoMain {
    @MainActor
    static func main() {
        SelfTest.runIfRequested() // POMO_SELFTEST=1 のときだけ作動。検証して exit（通常起動は素通り）
        terminateOtherInstances() // 二重起動の根治: 後から起動した方が主導権を握る
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }

    /// 同一 bundle id の他インスタンス（古い /Applications 版など）を終了させ、🍅 二重・ポート競合を防ぐ
    @MainActor
    private static func terminateOtherInstances() {
        guard let bundleID = Bundle.main.bundleIdentifier else { return }
        let me = NSRunningApplication.current
        for other in NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
        where other != me && !other.isTerminated {
            other.terminate()
        }
    }
}
