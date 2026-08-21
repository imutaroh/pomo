import AppKit

/// メニューバー常駐（M6）: 現在の残り時間・経過時間・現在時刻だけを表示する。
/// メニューは「操作の場」— 主操作とモード切替だけを置き、詳細設定は母艦ウィンドウの設定ページに一本化
/// （二重管理は状態不整合と保守コストの源。モードだけは作業フローの一部なので例外的に残す）
@MainActor
final class MenuBarController: NSObject, NSMenuDelegate {
    private let statusItem: NSStatusItem
    private let engine: TimerEngine
    private let panelController: PanelController
    private let settings = Settings.shared
    private var updateTimer: Timer?
    private let mainWindow: MainWindowController
    private let breakOverlay: BreakOverlayController

    init(engine: TimerEngine, panelController: PanelController, mainWindow: MainWindowController, breakOverlay: BreakOverlayController) {
        self.engine = engine
        self.panelController = panelController
        self.mainWindow = mainWindow
        self.breakOverlay = breakOverlay
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        super.init()

        statusItem.button?.font = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        statusItem.button?.imagePosition = .imageLeading
        statusItem.button?.toolTip = "Quiet"
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu

        let t = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.updateTitle() }
        }
        RunLoop.main.add(t, forMode: .common)
        updateTimer = t
        updateTitle()
    }

    /// メニューバーのブランドマーク: アプリアイコンと同じ270°ダイヤル＋中心点のテンプレート画像。
    /// テンプレートなのでメニューバーのライト/ダーク・選択状態に自動追従する（絵文字は使わない）
    private static let dialIcon: NSImage = {
        let img = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { _ in
            let center = NSPoint(x: 9, y: 9)
            NSColor.black.setStroke()
            let arc = NSBezierPath()
            arc.appendArc(withCenter: center, radius: 6.2, startAngle: 90, endAngle: 180, clockwise: true)
            arc.lineWidth = 2.2
            arc.lineCapStyle = .round
            arc.stroke()
            NSColor.black.setFill()
            NSBezierPath(ovalIn: NSRect(x: 9 - 1.7, y: 9 - 1.7, width: 3.4, height: 3.4)).fill()
            return true
        }
        img.isTemplate = true
        return img
    }()

    private static let pauseIcon = NSImage(systemSymbolName: "pause.fill", accessibilityDescription: "一時停止中")
    private static let breakIcon = NSImage(systemSymbolName: "cup.and.saucer.fill", accessibilityDescription: "休憩中")

    private func updateTitle() {
        guard let button = statusItem.button else { return }
        switch engine.phase {
        case .idle:
            button.image = Self.dialIcon
            button.title = settings.mode == .clock ? " " + engine.timeString : ""
        case .work:
            button.image = engine.isPaused ? Self.pauseIcon : Self.dialIcon
            button.title = " " + engine.timeString
        case .breakTime:
            // 一時停止はアイコンで可視化（付けないと走行中と区別できない）
            button.image = engine.isPaused ? Self.pauseIcon : Self.breakIcon
            button.title = " " + engine.timeString
        }
    }

    // メニューは開くたびに作り直す（状態反映のため）
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        // 主操作
        switch engine.phase {
        case .idle:
            if settings.mode == .clock {
                let clockItem = NSMenuItem(title: "現在時刻  \(engine.timeString)", action: nil, keyEquivalent: "")
                clockItem.isEnabled = false
                menu.addItem(clockItem)
            } else {
                let startLabel = settings.mode == .timer
                    ? "タイマーを開始（\(settings.timerMinutes)分）"
                    : "作業を開始"
                menu.addItem(item(startLabel, #selector(startWork), key: "s"))
            }
            if let pending = engine.pendingBreakDuration {
                menu.addItem(item("休憩を開始（\(Int(pending) / 60)分\(Int(pending) % 60 > 0 ? "\(Int(pending) % 60)秒" : "")）", #selector(startPendingBreak)))
            }
        case .work:
            menu.addItem(item(engine.isPaused ? "再開" : "一時停止", #selector(togglePause), key: "p"))
            if engine.activeMode == .timer {
                menu.addItem(item("タイマーを止める", #selector(resetTimer)))
            } else {
                menu.addItem(item(engine.activeMode == .flow ? "作業を終えて休憩へ" : "作業を終える", #selector(finishWork), key: "b"))
                menu.addItem(item("リセット", #selector(resetTimer)))
            }
        case .breakTime:
            menu.addItem(item("+5分延長", #selector(extendBreak)))
            menu.addItem(item("休憩をスキップ", #selector(skipBreak)))
            menu.addItem(item(engine.isPaused ? "再開" : "一時停止", #selector(togglePause), key: "p"))
            // 「小さく」で畳んだ後に全画面へ戻す導線（全画面が今出ていない時だけ）
            if settings.breakFullscreen, !breakOverlay.isShowing {
                menu.addItem(item("休憩を全画面で表示", #selector(expandBreak)))
            }
        }
        menu.addItem(.separator())
        menu.addItem(item("Quiet を開く", #selector(openMainWindow), key: "d"))
        menu.addItem(item(panelController.isShown ? "パネルを隠す" : "パネルを表示", #selector(togglePanel), key: "t"))
        menu.addItem(.separator())

        // モードだけは作業フローの一部なのでメニューに残す。詳細設定は母艦の設定ページへ
        let modeMenu = NSMenu()
        let flowItem = item("フロー（作業した時間の 1/\(settings.flowRatio) が休憩になる）", #selector(setModeFlow))
        flowItem.state = settings.mode == .flow ? .on : .off
        modeMenu.addItem(flowItem)
        let pomodoroItem = item("ポモドーロ（\(settings.pomodoroWorkMinutes)分作業 → \(settings.pomodoroBreakMinutes)分休憩）", #selector(setModePomodoro))
        pomodoroItem.state = settings.mode == .pomodoro ? .on : .off
        modeMenu.addItem(pomodoroItem)
        let timerItem = item("タイマー（好きな時間を測る）", #selector(setModeTimer))
        timerItem.state = settings.mode == .timer ? .on : .off
        modeMenu.addItem(timerItem)
        let clockItem = item("時計（現在時刻を表示）", #selector(setModeClock))
        clockItem.state = settings.mode == .clock ? .on : .off
        modeMenu.addItem(clockItem)
        let modeRoot = NSMenuItem(title: "モード", action: nil, keyEquivalent: "")
        menu.addItem(modeRoot)
        menu.setSubmenu(modeMenu, for: modeRoot)

        menu.addItem(item("設定…", #selector(openSettings), key: ","))
        menu.addItem(.separator())
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
        let versionItem = NSMenuItem(title: "Quiet v\(version)", action: nil, keyEquivalent: "")
        versionItem.isEnabled = false
        menu.addItem(versionItem)
        menu.addItem(item("Quiet を終了", #selector(quit), key: "q"))
    }

    private func item(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
        i.target = self
        return i
    }

    // MARK: - Actions

    @objc private func startWork() { engine.startWork() }
    @objc private func startPendingBreak() { engine.startBreak() }

    @objc private func openMainWindow() { mainWindow.show() }
    @objc private func openSettings() { mainWindow.show(page: .settings) }
    @objc private func togglePause() { engine.togglePause() }
    @objc private func finishWork() { engine.finishWork() }
    @objc private func resetTimer() { engine.reset() }
    @objc private func extendBreak() { engine.extendFiveMinutes() }
    @objc private func skipBreak() { engine.skipBreak() }
    @objc private func expandBreak() { breakOverlay.expand() }
    @objc private func togglePanel() { panelController.toggleVisibility() }
    @objc private func setModeFlow() { settings.mode = .flow; engine.settingsChanged() }
    @objc private func setModePomodoro() { settings.mode = .pomodoro; engine.settingsChanged() }
    @objc private func setModeTimer() { settings.mode = .timer; engine.settingsChanged() }
    @objc private func setModeClock() { settings.mode = .clock; engine.settingsChanged() }
    @objc private func quit() { NSApp.terminate(nil) }
}
