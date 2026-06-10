import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var engine: TimerEngine!
    private var panelController: PanelController!
    private var menuBar: MenuBarController!
    private var hotKeys: HotKeyManager!

    func applicationDidFinishLaunching(_ notification: Notification) {
        engine = TimerEngine()
        panelController = PanelController(engine: engine)
        menuBar = MenuBarController(engine: engine, panelController: panelController)
        hotKeys = HotKeyManager(engine: engine, panelController: panelController)

        // ディスプレイ構成変更で画面外に出たら主ディスプレイへ戻す（§7-C）
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.panelController.clampToVisibleScreen() }
        }
    }
}

@main
struct PomoMain {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory) // LSUIElement 相当（Dock 非表示）
        app.run()
    }
}
