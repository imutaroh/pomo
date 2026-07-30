import AppKit

/// メニューバー常駐（M6）: 残り時間/経過時間テキスト＋今日の完了数。
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
        statusItem.button?.toolTip = "Pomo"
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
            button.title = ""
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

        // 状態表示
        let logger = SessionLogger.shared
        let summary = NSMenuItem(
            title: "今日: \(logger.todayWorkCount) セッション（\(hmString(logger.todayWorkSeconds))）",
            action: nil, keyEquivalent: ""
        )
        summary.isEnabled = false
        menu.addItem(summary)
        let week = logger.weekStats()
        let weekItem = NSMenuItem(
            title: "今週: \(week.count) セッション（\(hmString(week.seconds))）",
            action: nil, keyEquivalent: ""
        )
        weekItem.isEnabled = false
        menu.addItem(weekItem)
        menu.addItem(.separator())

        // 主操作
        switch engine.phase {
        case .idle:
            let startLabel: String
            if settings.mode == .simple {
                startLabel = "タイマーを開始（\(settings.simpleTimerMinutes)分）"
            } else {
                startLabel = "作業を開始"
            }
            menu.addItem(item(startLabel, #selector(startWork), key: "s"))
            if let pending = engine.pendingBreakDuration {
                menu.addItem(item("休憩を開始（\(Int(pending) / 60)分\(Int(pending) % 60 > 0 ? "\(Int(pending) % 60)秒" : "")）", #selector(startPendingBreak)))
            }
        case .work:
            menu.addItem(item(engine.isPaused ? "再開" : "一時停止", #selector(togglePause), key: "p"))
            if engine.activeMode == .simple {
                // simple は記録しないのでメモ項目は出さない
                menu.addItem(item("タイマーを止める", #selector(resetTimer)))
            } else {
                menu.addItem(item(engine.activeMode == .flow ? "作業を終えて休憩へ" : "作業を終える", #selector(finishWork), key: "b"))
                let memoTitle = engine.currentMemo.map { "メモ: \($0)" } ?? "この作業にメモを付ける…"
                menu.addItem(item(memoTitle, #selector(editMemo), key: "m"))
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
        menu.addItem(item("Pomo を開く", #selector(openMainWindow), key: "d"))
        menu.addItem(item(panelController.isShown ? "パネルを隠す" : "パネルを表示", #selector(togglePanel), key: "t"))
        menu.addItem(.separator())

        // モードだけは作業フローの一部なのでメニューに残す。詳細設定は母艦の設定ページへ
        let modeMenu = NSMenu()
        let flowItem = item("フロー（作業した時間の 1/\(settings.flowRatio) が休憩になる）", #selector(setModeFlow))
        flowItem.state = settings.mode == .flow ? .on : .off
        modeMenu.addItem(flowItem)
        let classicItem = item("クラシック（\(settings.classicWorkMin)分作業 → \(settings.classicShortBreakMin)分休憩）", #selector(setModeClassic))
        classicItem.state = settings.mode == .classic ? .on : .off
        modeMenu.addItem(classicItem)
        let simpleItem = item("タイマー（好きな時間を測るだけ）", #selector(setModeSimple))
        simpleItem.state = settings.mode == .simple ? .on : .off
        modeMenu.addItem(simpleItem)
        let modeRoot = NSMenuItem(title: "モード", action: nil, keyEquivalent: "")
        menu.addItem(modeRoot)
        menu.setSubmenu(modeMenu, for: modeRoot)

        menu.addItem(item("設定…", #selector(openSettings), key: ","))
        menu.addItem(.separator())
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
        let versionItem = NSMenuItem(title: "Pomo v\(version)", action: nil, keyEquivalent: "")
        versionItem.isEnabled = false
        menu.addItem(versionItem)
        menu.addItem(item("Pomo を終了", #selector(quit), key: "q"))
    }

    private func item(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
        i.target = self
        return i
    }

    // MARK: - Actions

    @objc private func startWork() { engine.startWork() }
    @objc private func startPendingBreak() { engine.startBreak() }

    /// メモはパネルではなくダイアログで入力する（パネルにテキスト入力を置かない原則 §8）
    @objc private func editMemo() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "この作業、何をしてる？"
        alert.informativeText = "セッション記録（JSONL）に保存されます"
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.stringValue = engine.currentMemo ?? ""
        field.placeholderString = "例: Go の学習、ブログ執筆"
        alert.accessoryView = field
        alert.addButton(withTitle: "保存")
        alert.addButton(withTitle: "キャンセル")
        alert.window.initialFirstResponder = field
        if alert.runModal() == .alertFirstButtonReturn {
            let text = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            engine.currentMemo = text.isEmpty ? nil : text
        }
    }

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
    @objc private func setModeClassic() { settings.mode = .classic; engine.settingsChanged() }
    @objc private func setModeSimple() { settings.mode = .simple; engine.settingsChanged() }
    @objc private func quit() { NSApp.terminate(nil) }
}
