import AppKit
import Carbon.HIToolbox

/// グローバルショートカット（M7）。Carbon RegisterEventHotKey はアクセシビリティ権限不要。
/// ⌃⌥P = 開始/一時停止、⌃⌥T = パネル表示/非表示
@MainActor
final class HotKeyManager {
    static var shared: HotKeyManager?

    private var refs: [EventHotKeyRef?] = []
    private let engine: TimerEngine
    private let panelController: PanelController

    init(engine: TimerEngine, panelController: PanelController) {
        self.engine = engine
        self.panelController = panelController
        HotKeyManager.shared = self
        register()
    }

    private func register() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
            var hotKeyID = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID)
            let id = hotKeyID.id
            Task { @MainActor in
                guard let mgr = HotKeyManager.shared else { return }
                switch id {
                case 1: mgr.engine.togglePause()
                case 2: mgr.panelController.toggleVisibility()
                default: break
                }
            }
            return noErr
        }, 1, &eventType, nil, nil)

        let mods = UInt32(controlKey | optionKey)
        registerKey(keyCode: UInt32(kVK_ANSI_P), modifiers: mods, id: 1)
        registerKey(keyCode: UInt32(kVK_ANSI_T), modifiers: mods, id: 2)
    }

    private func registerKey(keyCode: UInt32, modifiers: UInt32, id: UInt32) {
        var ref: EventHotKeyRef?
        let hotKeyID = EventHotKeyID(signature: OSType(0x504F_4D4F /* 'POMO' */), id: id)
        RegisterEventHotKey(keyCode, modifiers, hotKeyID, GetApplicationEventTarget(), 0, &ref)
        refs.append(ref)
    }
}
