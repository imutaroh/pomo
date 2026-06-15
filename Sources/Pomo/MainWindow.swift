import AppKit
import Combine
import SwiftUI

enum SidebarItem: String, CaseIterable, Identifiable {
    case dashboard, sessions, stats, settings
    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard: return "ダッシュボード"
        case .sessions: return "セッション"
        case .stats: return "統計"
        case .settings: return "設定"
        }
    }

    var symbol: String {
        switch self {
        case .dashboard: return "house"
        case .sessions: return "list.bullet"
        case .stats: return "chart.bar"
        case .settings: return "gearshape"
        }
    }
}

@MainActor
final class MainWindowState: ObservableObject {
    @Published var selection: SidebarItem = .dashboard
}

/// 母艦ウィンドウ。メニューバーに潜らず設定・操作・振り返りができる「Pomo の家」。
/// フローティングパネルとは排他切替: 母艦が見えている間はパネルをしまい、閉じる/最小化で戻す
/// （「どちらか一方がそこにいる」）。通常ウィンドウ — フォーカスを取ってよい。
@MainActor
final class MainWindowController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private let engine: TimerEngine
    private let panelController: PanelController
    private let state = MainWindowState()

    init(engine: TimerEngine, panelController: PanelController) {
        self.engine = engine
        self.panelController = panelController
    }

    func show(page: SidebarItem? = nil) {
        if window == nil {
            let host = NSHostingController(
                rootView: MainWindowView(engine: engine, state: state, shrinkToPanel: { [weak self] in
                    self?.window?.performClose(nil)
                })
            )
            let w = NSWindow(contentViewController: host)
            w.title = "Pomo"
            w.setContentSize(NSSize(width: 880, height: 620))
            // 最小を 560×440 まで下げ、狭く畳んでも崩れないようにした（ページは ViewThatFits/ScrollView で追従）
            w.contentMinSize = NSSize(width: 560, height: 440)
            // fullSizeContentView でサイドバーをタイトルバー下まで届かせる（トラフィックライトの分は上余白で逃がす）
            w.styleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
            w.isReleasedWhenClosed = false
            // 白ベース方針: ダークモードでも常にライト・和紙背景
            w.appearance = NSAppearance(named: .aqua)
            w.backgroundColor = NSColor(red: 0.945, green: 0.933, blue: 0.910, alpha: 1) // Tokens.canvas と一致
            w.titlebarAppearsTransparent = true
            w.titleVisibility = .hidden
            w.setFrameAutosaveName("PomoMainWindow")
            w.center()
            w.delegate = self
            window = w
        }
        if let page { state.selection = page }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
        panelController.hide()
    }

    // MARK: - 排他切替（「母艦が可視でなければパネルを出す」が唯一の真実）

    func windowWillClose(_ notification: Notification) {
        panelController.show()
    }

    func windowDidMiniaturize(_ notification: Notification) {
        panelController.show()
    }

    func windowDidDeminiaturize(_ notification: Notification) {
        panelController.hide()
    }
}

struct MainWindowView: View {
    @ObservedObject var engine: TimerEngine
    @ObservedObject var state: MainWindowState
    var shrinkToPanel: () -> Void
    @StateObject private var store = SessionStore()
    @Namespace private var pillNS

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            page
        }
        .frame(minWidth: 560, minHeight: 440)
        .onAppear { store.reload() }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            store.reload() // ウィンドウを開き直すたびに最新化
        }
        .onReceive(engine.$phase) { _ in
            store.reload() // セッション記録直後（finishWork 等）に即時反映
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 3) {
            // トラフィックライトと衝突しない上余白 + ロゴ
            Text("Pomo")
                .pomoFont(21, weight: .semibold)
                .foregroundStyle(Tokens.sumi)
                .padding(.top, 52)
                .padding(.leading, 14)
                .padding(.bottom, 18)

            ForEach(SidebarItem.allCases) { item in
                SidebarRow(item: item, selected: state.selection == item, ns: pillNS) {
                    withAnimation(.easeOut(duration: 0.25)) {
                        state.selection = item
                    }
                }
            }
            Spacer()

            // 排他切替: パネルに戻る（母艦を閉じる → デリゲートがパネルを復帰させる）
            Button(action: shrinkToPanel) {
                HStack(spacing: 10) {
                    Image(systemName: "rectangle.bottomthird.inset.filled")
                        .font(.system(size: 13, weight: .medium))
                        .frame(width: 20)
                    Text("パネルに戻る")
                        .pomoFont(13, weight: .medium)
                    Spacer()
                }
                .foregroundStyle(Tokens.sumi.opacity(0.55))
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .contentShape(RoundedRectangle(cornerRadius: Tokens.radiusPill))
            }
            .buttonStyle(SidebarHoverStyle())
            .help("ウィンドウを閉じて、フローティングパネルで続ける")
            .padding(.bottom, 14)
        }
        .padding(.horizontal, 12)
        .frame(width: 200)
        .frame(maxHeight: .infinity)
        .background(Tokens.usugumo)
    }

    private var page: some View {
        ScrollView {
            pageContent
                .padding(40)
                .frame(maxWidth: 980)
                .frame(maxWidth: .infinity, alignment: .center)
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
                store: store,
                openSessions: { withAnimation(.easeOut(duration: 0.25)) { state.selection = .sessions } },
                openSettings: { withAnimation(.easeOut(duration: 0.25)) { state.selection = .settings } },
                enterFocus: { engine.startWork(); shrinkToPanel() }
            )
        case .sessions:
            SessionsPage(store: store)
        case .stats:
            StatsPage(store: store)
        case .settings:
            SettingsPage(engine: engine)
        }
    }
}

private struct SidebarRow: View {
    let item: SidebarItem
    let selected: Bool
    let ns: Namespace.ID
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: item.symbol)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(selected ? Tokens.kohakuDeep : Tokens.sumi.opacity(0.55))
                    .frame(width: 20)
                Text(item.title)
                    .pomoFont(13, weight: selected ? .semibold : .medium)
                    .foregroundStyle(selected ? Tokens.sumi : Tokens.sumi.opacity(0.6))
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background {
                if selected {
                    // 選択ピルは matchedGeometryEffect で行間を滑って移動する
                    RoundedRectangle(cornerRadius: Tokens.radiusPill)
                        .fill(Color.white)
                        .shadow(color: .black.opacity(0.05), radius: 5, y: 1)
                        .matchedGeometryEffect(id: "sidebar.pill", in: ns)
                } else if hovered {
                    RoundedRectangle(cornerRadius: Tokens.radiusPill)
                        .fill(Tokens.sumi.opacity(0.04))
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: Tokens.radiusPill))
            .animation(.easeOut(duration: 0.15), value: hovered)
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
    }
}

/// サイドバー下部ボタン用: ホバーで薄く沈むだけの控えめなスタイル
private struct SidebarHoverStyle: ButtonStyle {
    @State private var hovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: Tokens.radiusPill)
                    .fill(Tokens.sumi.opacity(hovered ? 0.04 : 0))
            )
            .opacity(configuration.isPressed ? 0.6 : 1)
            .animation(.easeOut(duration: 0.15), value: hovered)
            .onHover { hovered = $0 }
    }
}
