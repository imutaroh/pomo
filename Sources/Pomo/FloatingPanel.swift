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
    /// パネルの「拡大」ボタン → 母艦ウィンドウを開く（AppDelegate が配線）
    var openMainWindow: (() -> Void)?
    /// 最後に意図された表示状態。フェード中の isVisible は当てにならない
    /// （hide のフェード完了前に show が来ると、完了ハンドラの orderOut が意図を上書きするレース対策）
    private var desiredVisible = true
    /// メニューのラベル出し分け用（フェード中でも意図と一致する）
    var isShown: Bool { desiredVisible }

    init(engine: TimerEngine) {
        panel = FloatingPanel(contentRect: NSRect(origin: .zero, size: Self.panelSize))
        super.init()

        let host = NSHostingView(rootView: PanelView(
            engine: engine,
            expand: { [weak self] in self?.openMainWindow?() },
            hidePanel: { [weak self] in self?.hide() }
        ))
        host.frame = NSRect(origin: .zero, size: Self.panelSize)
        host.autoresizingMask = [.width, .height]
        panel.contentView = host
        panel.delegate = self

        restorePosition()
        panel.orderFrontRegardless()
    }

    func toggleVisibility() {
        // isVisible はフェードアウト中も true のままなので、意図ベースで切り替える
        if desiredVisible {
            hide()
        } else {
            show()
        }
    }

    /// 排他切替用: フェードアウトして消える（orderOut の瞬断を見せない）
    func hide() {
        desiredVisible = false
        guard panel.isVisible else { return }
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.25
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = 0
        } completionHandler: { [weak self] in
            Task { @MainActor in
                guard let self, !self.desiredVisible else { return } // フェード中に show が来たら消さない
                self.panel.orderOut(nil)
                self.panel.alphaValue = 1
            }
        }
    }

    /// 排他切替用: フェードインで復帰
    func show() {
        desiredVisible = true
        clampToVisibleScreen()
        if panel.isVisible {
            // hide のフェードアウト中に呼ばれた場合: orderOut は完了ハンドラ側で
            // キャンセルされる（desiredVisible）ので、alpha を戻すだけで復帰できる
            NSAnimationContext.runAnimationGroup { ctx in
                ctx.duration = 0.25
                ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
                panel.animator().alphaValue = 1
            }
            return
        }
        panel.alphaValue = 0
        panel.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.25
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = 1
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
