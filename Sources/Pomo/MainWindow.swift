import AppKit
import Combine
import SwiftUI

/// 母艦の3ページ。サイドバーは廃止し、フッターのリンクと ⌘1〜3 で行き来する
/// （型名は AppMenu / PomoApp / MenuBarController からの参照互換のため据え置き）。
enum SidebarItem: String, CaseIterable, Identifiable {
    case dashboard, settings, philosophy, mechanism
    var id: String { rawValue }

    /// ページの名前（メニューの項目名と揃える）
    var title: String {
        switch self {
        case .dashboard: return "タイマー"
        case .settings: return "設定"
        case .philosophy: return "願い"
        case .mechanism: return "フロータイマーとは"
        }
    }

    /// フッターの細いリンクに出す短い名前（420 幅に3つ並ぶので、ページ名より詰める）
    var footerLabel: String {
        switch self {
        case .mechanism: return "仕組み"
        default: return title
        }
    }
}

@MainActor
final class MainWindowState: ObservableObject {
    @Published var selection: SidebarItem = .dashboard
}

/// 母艦ウィンドウ。メニューバーに潜らずタイマー操作と設定ができる「Fika の家」。
/// パネルとの関係（Issue #39 で意図を分離）:
/// - 母艦が見えている間はパネルをしまう
/// - 「パネルで始める」/フォーカスモード経由の close → パネル復帰（明示的にパネルが欲しい操作）
/// - 赤バツ/⌘W の close → すべてしまう（macOS 標準の「閉じる」。復帰は ⌃⌥T・メニューバー・Dock）
@MainActor
final class MainWindowController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private let engine: TimerEngine
    private let panelController: PanelController
    private let state = MainWindowState()
    /// 「パネルに戻る」意図で閉じるときだけ true（赤バツ/⌘W との意図分離）
    private var showPanelOnClose = false

    init(engine: TimerEngine, panelController: PanelController) {
        self.engine = engine
        self.panelController = panelController
    }

    func show(page: SidebarItem? = nil) {
        // すでに開いている窓は動かさない（⌘1〜3 のページ切替でも show が来るため、
        // ユーザーがドラッグした位置を奪わないように「開くとき」だけ合わせる）
        let alreadyOpen = window?.isVisible ?? false
        if window == nil {
            let host = NSHostingController(
                rootView: MainWindowView(engine: engine, state: state, shrinkToPanel: { [weak self] in
                    self?.shrinkToPanel()
                })
            )
            let w = NSWindow(contentViewController: host)
            w.title = "Fika"
            // 固定サイズ（Issue #53 / 2026-08-20 にミニマム化）: 縦長カード 420×540。
            // .resizable を持たないためズーム/フルスクリーンも無効。min/max を一致させ、
            // 過去に保存されたリサイズ済みフレームからの復元でもこの寸法を維持する。
            // 高さはダッシュボード最長状態（待機中＋時間設定 UI 表示）がスクロールなしで収まる寸法
            let fixedSize = NSSize(width: 420, height: 540)
            // fullSizeContentView で地（canvas）を窓の一番上まで届かせる。
            // トラフィックライトの分は MainWindowView 側の上余白で逃がす
            w.styleMask = [.titled, .closable, .miniaturizable, .fullSizeContentView]
            w.contentMinSize = fixedSize
            w.contentMaxSize = fixedSize
            w.isReleasedWhenClosed = false
            // 白ベース方針: ダークモードでも常にライト・和紙背景
            w.appearance = NSAppearance(named: .aqua)
            w.backgroundColor = NSColor(red: 0xFA / 255, green: 0xFB / 255, blue: 0xFC / 255, alpha: 1) // Tokens.canvas と一致
            w.titlebarAppearsTransparent = true
            w.titleVisibility = .hidden
            // 位置は覚えない（frameAutosave も center もしない）。母艦はパネルの右上角に呼び出されるだけで、
            // 「どこに出るか」の記憶はパネル側の panelFrame 一本に統一する
            w.setContentSize(fixedSize)
            w.delegate = self
            window = w
        }
        // 開くたびに合わせ直す（前回からパネルを動かしていても、必ずパネルのいた角に出る）
        if !alreadyOpen { alignToPanel() }
        if let page { state.selection = page }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
        panelController.hide()
    }

    /// 「パネルに戻る」/フォーカスモード用: 母艦を閉じてパネルを出す（明示的なパネル導線）
    func shrinkToPanel() {
        showPanelOnClose = true
        window?.performClose(nil)
    }

    // MARK: - 位置の共有（パネルと母艦は右上角を共通アンカーにする）

    /// 母艦をパネルの右上角に合わせる。titled なので frame 高 ≠ content 高（タイトルバー分ずれる）
    private func alignToPanel() {
        guard let window else { return }
        let size = window.frame.size
        let anchor = panelController.topRight
        var origin = NSPoint(x: anchor.x - size.width, y: anchor.y - size.height)

        // パネルより背が高いぶん、そのまま合わせると下がはみ出しやすい。ここは常に画面内へ収める
        guard let vf = panelController.currentScreen?.visibleFrame else {
            window.center()
            return
        }
        origin.x = min(max(origin.x, vf.minX), max(vf.minX, vf.maxX - size.width))
        origin.y = min(max(origin.y, vf.minY), max(vf.minY, vf.maxY - size.height))
        window.setFrameOrigin(origin)
    }

    /// 母艦がいた右上角をパネルへ引き継ぐ。赤バツで閉じた場合も引き継ぐので、
    /// 次に ⌃⌥T で呼び出したパネルは母艦のあった場所に現れる
    private func handOverPositionToPanel() {
        guard let window else { return }
        panelController.alignTopRight(to: NSPoint(x: window.frame.maxX, y: window.frame.maxY))
    }

    // MARK: - 閉じ方の意図分離（Issue #39）

    func windowWillClose(_ notification: Notification) {
        handOverPositionToPanel()
        // 赤バツ/⌘W はすべてしまう。「パネルに戻る」経由のときだけパネルを出す
        if showPanelOnClose {
            panelController.show()
        }
        showPanelOnClose = false
    }

    func windowDidMiniaturize(_ notification: Notification) {
        handOverPositionToPanel()
        panelController.show()
    }

    func windowDidDeminiaturize(_ notification: Notification) {
        panelController.hide()
    }
}

/// 母艦の骨格: 上余白（トラフィックライトの逃げ場）＋ ページ本体 ＋ フッターバー。
/// ページ切替はフッターのリンクと、ページ側ヘッダーの「タイマーへ」で行う（サイドバーは持たない）。
struct MainWindowView: View {
    @ObservedObject var engine: TimerEngine
    @ObservedObject var state: MainWindowState
    var shrinkToPanel: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // fullSizeContentView なので中身が窓の一番上から始まる。トラフィックライトに被らせない
            Color.clear.frame(height: 32)
            page
            footer
        }
        .frame(minWidth: 420, minHeight: 540)
        .background(Tokens.canvas)
    }

    private var page: some View {
        ScrollView {
            pageContent
                .padding(.horizontal, state.selection == .dashboard ? 32 : 22)
                .padding(.top, 10)
                .padding(.bottom, 20)
                .frame(maxWidth: .infinity)
                .id(state.selection)
                .transition(.opacity.combined(with: .offset(y: 8)))
        }
        .background(Tokens.canvas)
        .animation(.easeOut(duration: 0.25), value: state.selection)
    }

    @ViewBuilder
    private var pageContent: some View {
        switch state.selection {
        case .dashboard:
            DashboardPage(
                engine: engine,
                enterFocus: { engine.startWork(); shrinkToPanel() },
                shrinkToPanel: shrinkToPanel
            )
        case .settings:
            SettingsPage(engine: engine, back: { select(.dashboard) })
        case .philosophy:
            PhilosophyPage(back: { select(.dashboard) })
        case .mechanism:
            MechanismPage(back: { select(.dashboard) })
        }
    }

    /// 下端の細いバー。左に他ページへのリンク、右にパネル復帰のキーの覚え書き
    private var footer: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Tokens.line).frame(height: 1)
            HStack(spacing: 16) {
                footerLink(.settings)
                footerLink(.philosophy)
                footerLink(.mechanism)
                Spacer(minLength: 12)
                Text("⌃⌥T")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Tokens.sumiTertiary)
                    .help("パネルを表示 / 隠す（どのアプリにいても効く）")
                    .accessibilityLabel("パネルの表示切り替えは コントロール オプション T")
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 11)
        }
    }

    private func footerLink(_ item: SidebarItem) -> some View {
        InlineLink(title: item.footerLabel, weight: .medium, current: state.selection == item) {
            select(item)
        }
    }

    private func select(_ item: SidebarItem) {
        withAnimation(.easeOut(duration: 0.25)) {
            state.selection = item
        }
    }
}
