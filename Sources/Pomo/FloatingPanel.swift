import AppKit
import SwiftUI

/// 検証済みレシピ（REQUIREMENTS.md §7-A）: NSPanel + .nonactivatingPanel + .floating +
/// [.canJoinAllSpaces, .fullScreenAuxiliary] の3点セットで全Space・フルスクリーン上に追従する。
final class FloatingPanel: NSPanel {
    init(contentRect: NSRect) {
        super.init(
            contentRect: contentRect,
            styleMask: [.nonactivatingPanel, .borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        becomesKeyOnlyIfNeeded = true
        hidesOnDeactivate = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isMovableByWindowBackground = true
        animationBehavior = .utilityWindow
        // ガラスを常にライト基調に固定（白ベース方針。ダークモードや暗い壁紙でガラスが黒く沈むのを防ぐ）
        appearance = NSAppearance(named: .aqua)
    }

    // パネルはボタン操作のみ（§8 破綻条件3）。キーを取らないことでフォーカス非奪取を保証する
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class PanelController: NSObject, NSWindowDelegate {
    static let panelSize = NSSize(width: 220, height: 220)
    private let frameKey = "panelFrame"

    let panel: FloatingPanel

    init(engine: TimerEngine) {
        panel = FloatingPanel(contentRect: NSRect(origin: .zero, size: Self.panelSize))
        super.init()

        let host = NSHostingView(rootView: PanelView(engine: engine))
        host.frame = NSRect(origin: .zero, size: Self.panelSize)
        panel.contentView = host
        panel.delegate = self

        restorePosition()
        panel.orderFrontRegardless()
    }

    func toggleVisibility() {
        if panel.isVisible {
            panel.orderOut(nil)
        } else {
            clampToVisibleScreen()
            panel.orderFrontRegardless()
        }
    }

    // MARK: - 位置の保存・復元（フルスクリーン遷移でシステムが位置を動かす罠への対処 §7-A）

    func windowDidMove(_ notification: Notification) {
        UserDefaults.standard.set(NSStringFromRect(panel.frame), forKey: frameKey)
    }

    private func restorePosition() {
        if let str = UserDefaults.standard.string(forKey: frameKey) {
            let rect = NSRectFromString(str)
            if rect.width > 0 {
                panel.setFrame(NSRect(origin: rect.origin, size: Self.panelSize), display: true)
                clampToVisibleScreen()
                return
            }
        }
        // 初回: 主ディスプレイ右上
        if let screen = NSScreen.main {
            let vf = screen.visibleFrame
            let origin = NSPoint(x: vf.maxX - Self.panelSize.width - 24, y: vf.maxY - Self.panelSize.height - 24)
            panel.setFrameOrigin(origin)
        }
    }

    /// 外部ディスプレイ抜去などで画面外に出たら主ディスプレイへ戻す（§7-C）
    func clampToVisibleScreen() {
        let frame = panel.frame
        let onSomeScreen = NSScreen.screens.contains { $0.visibleFrame.intersects(frame) }
        if !onSomeScreen, let screen = NSScreen.main {
            let vf = screen.visibleFrame
            let origin = NSPoint(x: vf.maxX - Self.panelSize.width - 24, y: vf.maxY - Self.panelSize.height - 24)
            panel.setFrameOrigin(origin)
        }
    }
}
