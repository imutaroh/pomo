import AppKit

/// メニューバー常駐（M6）: 残り時間/経過時間テキスト＋今日の完了数。設定はすべてメニューで完結
/// （テキスト入力 UI を持たない方針 §8 のため、選択肢はサブメニューで提供する）
@MainActor
final class MenuBarController: NSObject, NSMenuDelegate {
    private let statusItem: NSStatusItem
    private let engine: TimerEngine
    private let panelController: PanelController
    private let settings = Settings.shared
    private var updateTimer: Timer?

    init(engine: TimerEngine, panelController: PanelController) {
        self.engine = engine
        self.panelController = panelController
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        super.init()

        statusItem.button?.font = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .medium)
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

    private func updateTitle() {
        guard let button = statusItem.button else { return }
        switch engine.phase {
        case .idle:
            button.title = "🍅"
        case .work:
            button.title = (engine.isPaused ? "⏸ " : "") + engine.timeString
        case .breakTime:
            button.title = "☕️ " + engine.timeString
        }
    }

    // メニューは開くたびに作り直す（状態反映のため）
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        // 状態表示
        let logger = SessionLogger.shared
        let summary = NSMenuItem(
            title: "今日: \(logger.todayWorkCount) セッション（\(Self.hm(logger.todayWorkSeconds))）",
            action: nil, keyEquivalent: ""
        )
        summary.isEnabled = false
        menu.addItem(summary)
        let week = logger.weekStats()
        let weekItem = NSMenuItem(
            title: "今週: \(week.count) セッション（\(Self.hm(week.seconds))）",
            action: nil, keyEquivalent: ""
        )
        weekItem.isEnabled = false
        menu.addItem(weekItem)
        menu.addItem(.separator())

        // 主操作
        switch engine.phase {
        case .idle:
            menu.addItem(item("作業を開始", #selector(startWork), key: "s"))
            if let pending = engine.pendingBreakDuration {
                menu.addItem(item("休憩を開始（\(Int(pending) / 60)分\(Int(pending) % 60 > 0 ? "\(Int(pending) % 60)秒" : "")）", #selector(startPendingBreak)))
            }
        case .work:
            menu.addItem(item(engine.isPaused ? "再開" : "一時停止", #selector(togglePause), key: "p"))
            menu.addItem(item(settings.mode == .flow ? "作業を終えて休憩へ" : "作業を終える", #selector(finishWork), key: "b"))
            let memoTitle = engine.currentMemo.map { "メモ: \($0)" } ?? "この作業にメモを付ける…"
            menu.addItem(item(memoTitle, #selector(editMemo), key: "m"))
            menu.addItem(item("リセット", #selector(resetTimer)))
        case .breakTime:
            menu.addItem(item("+5分延長", #selector(extendBreak)))
            menu.addItem(item("休憩をスキップ", #selector(skipBreak)))
            menu.addItem(item(engine.isPaused ? "再開" : "一時停止", #selector(togglePause), key: "p"))
        }
        menu.addItem(.separator())
        menu.addItem(item(panelController.panel.isVisible ? "パネルを隠す" : "パネルを表示", #selector(togglePanel), key: "t"))
        menu.addItem(.separator())

        // モード
        let modeMenu = NSMenu()
        let flowItem = item("フロー（作業時間に応じて休憩が決まる）", #selector(setModeFlow))
        flowItem.state = settings.mode == .flow ? .on : .off
        modeMenu.addItem(flowItem)
        let classicItem = item("クラシック（固定 \(settings.classicWorkMin)/\(settings.classicShortBreakMin)）", #selector(setModeClassic))
        classicItem.state = settings.mode == .classic ? .on : .off
        modeMenu.addItem(classicItem)
        let modeRoot = NSMenuItem(title: "モード", action: nil, keyEquivalent: "")
        menu.addItem(modeRoot)
        menu.setSubmenu(modeMenu, for: modeRoot)

        // フロー比率
        let ratioMenu = NSMenu()
        for r in [3, 4, 5, 6] {
            let sample = 45 / r
            let i = NSMenuItem(title: "1:\(r)（45分 → 約\(sample)分）", action: #selector(setRatio(_:)), keyEquivalent: "")
            i.target = self
            i.tag = r
            i.state = settings.flowRatio == r ? .on : .off
            ratioMenu.addItem(i)
        }
        let ratioRoot = NSMenuItem(title: "休憩の比率（フロー）", action: nil, keyEquivalent: "")
        menu.addItem(ratioRoot)
        menu.setSubmenu(ratioMenu, for: ratioRoot)

        // クラシック プリセット
        let presetMenu = NSMenu()
        for (w, b, l) in [(25, 5, 15), (50, 10, 20), (90, 15, 30)] {
            let i = NSMenuItem(title: "\(w)分作業 / \(b)分休憩 / 長休憩\(l)分", action: #selector(setPreset(_:)), keyEquivalent: "")
            i.target = self
            i.tag = w * 10000 + b * 100 + l
            i.state = (settings.classicWorkMin == w && settings.classicShortBreakMin == b) ? .on : .off
            presetMenu.addItem(i)
        }
        let presetRoot = NSMenuItem(title: "時間プリセット（クラシック）", action: nil, keyEquivalent: "")
        menu.addItem(presetRoot)
        menu.setSubmenu(presetMenu, for: presetRoot)

        // 集中時の透明度
        let opacityMenu = NSMenu()
        for pct in [15, 30, 50, 70, 100] {
            let i = NSMenuItem(title: "\(pct)%", action: #selector(setOpacity(_:)), keyEquivalent: "")
            i.target = self
            i.tag = pct
            i.state = Int(settings.focusOpacity * 100) == pct ? .on : .off
            opacityMenu.addItem(i)
        }
        let opacityRoot = NSMenuItem(title: "集中時の見え方（透明度）", action: nil, keyEquivalent: "")
        menu.addItem(opacityRoot)
        menu.setSubmenu(opacityMenu, for: opacityRoot)

        // トグル類
        let breakFsItem = item("休憩は全画面で（休憩モード）", #selector(toggleBreakFullscreen))
        breakFsItem.state = settings.breakFullscreen ? .on : .off
        menu.addItem(breakFsItem)
        let soundItem = item("サウンド", #selector(toggleSound))
        soundItem.state = settings.soundEnabled ? .on : .off
        menu.addItem(soundItem)
        let autoBreakItem = item("休憩を自動開始", #selector(toggleAutoBreak))
        autoBreakItem.state = settings.autoStartBreak ? .on : .off
        menu.addItem(autoBreakItem)
        let autoWorkItem = item("次の作業を自動開始", #selector(toggleAutoWork))
        autoWorkItem.state = settings.autoStartWork ? .on : .off
        menu.addItem(autoWorkItem)

        menu.addItem(.separator())
        let apiItem = NSMenuItem(title: "API: http://127.0.0.1:\(APIServer.port)", action: nil, keyEquivalent: "")
        apiItem.isEnabled = false
        menu.addItem(apiItem)
        menu.addItem(item("Pomo を終了", #selector(quit), key: "q"))
    }

    private static func hm(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        return h > 0 ? "\(h)時間\(m)分" : "\(m)分"
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

    @objc private func toggleBreakFullscreen() { settings.breakFullscreen.toggle() }
    @objc private func togglePause() { engine.togglePause() }
    @objc private func finishWork() { engine.finishWork() }
    @objc private func resetTimer() { engine.reset() }
    @objc private func extendBreak() { engine.extendFiveMinutes() }
    @objc private func skipBreak() { engine.skipBreak() }
    @objc private func togglePanel() { panelController.toggleVisibility() }
    @objc private func setModeFlow() { settings.mode = .flow }
    @objc private func setModeClassic() { settings.mode = .classic }
    @objc private func setRatio(_ sender: NSMenuItem) { settings.flowRatio = sender.tag }
    @objc private func setPreset(_ sender: NSMenuItem) {
        settings.classicWorkMin = sender.tag / 10000
        settings.classicShortBreakMin = (sender.tag / 100) % 100
        settings.classicLongBreakMin = sender.tag % 100
    }
    @objc private func setOpacity(_ sender: NSMenuItem) { settings.focusOpacity = Double(sender.tag) / 100 }
    @objc private func toggleSound() { settings.soundEnabled.toggle() }
    @objc private func toggleAutoBreak() { settings.autoStartBreak.toggle() }
    @objc private func toggleAutoWork() { settings.autoStartWork.toggle() }
    @objc private func quit() { NSApp.terminate(nil) }
}
