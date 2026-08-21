import AppKit
import Sparkle

/// 「設定…」「Quietについて」メニュー項目の action 先。NSMenuItem の target は weak 参照のため、
/// このオブジェクトを AppDelegate がプロパティとして保持し続ける必要がある。
@MainActor
final class AppMenuActions: NSObject {
    private let openSettings: () -> Void
    private let openPage: (SidebarItem) -> Void

    init(openSettings: @escaping () -> Void, openPage: @escaping (SidebarItem) -> Void) {
        self.openSettings = openSettings
        self.openPage = openPage
    }

    @objc func openSettingsTapped() {
        openSettings()
    }

    @objc func openDashboardTapped() { openPage(.dashboard) }
    @objc func openSettingsPageTapped() { openPage(.settings) }
    @objc func openPhilosophyTapped() { openPage(.philosophy) }
    @objc func openMechanismTapped() { openPage(.mechanism) }

    /// Info.plist の CFBundleName/Version/Copyright は標準Aboutパネルが自動で拾うため、
    /// ここでは一言添えるだけ（罪悪感ゼロ・ローカル完結の哲学を伝える最小限のクレジット）
    @objc func aboutTapped() {
        NSApp.orderFrontStandardAboutPanel(options: [
            .credits: NSAttributedString(
                string: "集中して、ちゃんと休む。\nローカル完結・アカウントなしのポモドーロタイマー。",
                attributes: [
                    .font: NSFont.systemFont(ofSize: 11),
                    .foregroundColor: NSColor.secondaryLabelColor,
                ]
            ),
        ])
    }
}

/// 標準的な mainMenu（App/編集/ウィンドウ）を構築する。
/// これまで NSApp.mainMenu が未設定だったため、母艦ウィンドウにフォーカスしても
/// メニューバーにアプリ名・メニューが出ない不具合を解消する。
@MainActor
enum AppMenu {
    static func build(actions: AppMenuActions) -> NSMenu {
        let mainMenu = NSMenu()

        mainMenu.addItem(appMenuItem(actions: actions))
        mainMenu.addItem(fileMenuItem())
        mainMenu.addItem(editMenuItem())
        mainMenu.addItem(viewMenuItem(actions: actions))
        let windowItem = windowMenuItem()
        mainMenu.addItem(windowItem)
        NSApp.windowsMenu = windowItem.submenu

        return mainMenu
    }

    /// 閉じる＝すべてしまう（メニューバー🍅のみ残る。復帰は ⌃⌥T / メニューバー / Dock）。
    /// パネルが欲しいときはダッシュボード右肩の「パネルで始める / パネルへ」（Issue #39 で意図分離）
    private static func fileMenuItem() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "ファイル")
        menu.addItem(NSMenuItem(title: "閉じる", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"))
        item.submenu = menu
        return item
    }

    /// 母艦4ページへのキーボード移動（Cmd+1〜4）。母艦が閉じていても開いて遷移する
    private static func viewMenuItem(actions: AppMenuActions) -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "表示")
        let pages: [(String, Selector, String)] = [
            ("ダッシュボード", #selector(AppMenuActions.openDashboardTapped), "1"),
            ("設定", #selector(AppMenuActions.openSettingsPageTapped), "2"),
            ("願い", #selector(AppMenuActions.openPhilosophyTapped), "3"),
            ("フロータイマーとは", #selector(AppMenuActions.openMechanismTapped), "4"),
        ]
        for (title, action, key) in pages {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            i.target = actions
            menu.addItem(i)
        }
        item.submenu = menu
        return item
    }

    private static func appMenuItem(actions: AppMenuActions) -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu()

        let about = NSMenuItem(title: "Quietについて", action: #selector(AppMenuActions.aboutTapped), keyEquivalent: "")
        about.target = actions
        menu.addItem(about)
        // Sparkle 標準の更新確認（target は UpdaterManager が保持する controller）
        let checkUpdates = NSMenuItem(
            title: "アップデートを確認…",
            action: #selector(SPUStandardUpdaterController.checkForUpdates(_:)),
            keyEquivalent: ""
        )
        checkUpdates.target = UpdaterManager.shared.controller
        menu.addItem(checkUpdates)
        menu.addItem(.separator())

        let settings = NSMenuItem(title: "設定…", action: #selector(AppMenuActions.openSettingsTapped), keyEquivalent: ",")
        settings.target = actions
        menu.addItem(settings)
        menu.addItem(.separator())

        menu.addItem(NSMenuItem(title: "Quietを隠す", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"))
        let hideOthers = NSMenuItem(
            title: "他を隠す", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h"
        )
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        menu.addItem(hideOthers)
        menu.addItem(NSMenuItem(
            title: "すべてを表示", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: ""
        ))
        menu.addItem(.separator())

        menu.addItem(NSMenuItem(title: "Quietを終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        item.submenu = menu
        return item
    }

    private static func editMenuItem() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "編集")

        menu.addItem(NSMenuItem(title: "元に戻す", action: #selector(UndoManager.undo), keyEquivalent: "z"))
        let redo = NSMenuItem(title: "やり直す", action: #selector(UndoManager.redo), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        menu.addItem(redo)
        menu.addItem(.separator())

        menu.addItem(NSMenuItem(title: "切り取り", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        menu.addItem(NSMenuItem(title: "コピー", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        menu.addItem(NSMenuItem(title: "貼り付け", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        menu.addItem(NSMenuItem(title: "削除", action: #selector(NSText.delete(_:)), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "すべてを選択", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        item.submenu = menu
        return item
    }

    private static func windowMenuItem() -> NSMenuItem {
        let item = NSMenuItem()
        let menu = NSMenu(title: "ウィンドウ")

        menu.addItem(NSMenuItem(title: "しまう", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m"))
        menu.addItem(NSMenuItem(title: "拡大／縮小", action: #selector(NSWindow.zoom(_:)), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(
            title: "すべてを手前に表示", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: ""
        ))

        item.submenu = menu
        return item
    }
}
