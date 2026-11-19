import AppKit
import SwiftUI
import Combine

/// One native popover owns the frame, corners, anchoring and outside-click behaviour.
@MainActor
final class MenuBarController: NSObject, NSPopoverDelegate {
    static let shared = MenuBarController(model: VPNModel.shared)
    let statusItem: NSStatusItem
    let popover = NSPopover()
    private let model: VPNModel
    private var changes: AnyCancellable?
    private var initialPin: UUID?
    private var escapeMonitor: Any?

    init(model: VPNModel) {
        self.model = model
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        super.init()
        popover.behavior = .transient
        popover.delegate = self
        popover.contentSize = NSSize(width: MenuView.width, height: MenuView.height)
        if let button = statusItem.button {
            button.image = BundledArt.image(model.connected ? "MenuBarConnectedTemplate@2x" : "MenuBarTemplate@2x")
            button.target = self
            button.action = #selector(toggle(_:))
            button.imagePosition = .imageOnly
            button.setAccessibilityLabel("HN Secure Access Terminal")
        }
        changes = model.$connected.combineLatest(model.$busy).receive(on: RunLoop.main).sink { [weak self] connected, busy in
            guard let self = self else { return }
            self.statusItem.button?.image = BundledArt.image(connected ? "MenuBarConnectedTemplate@2x" : "MenuBarTemplate@2x")
            self.statusItem.button?.toolTip = busy ? "HN Secure Access · Updating connection" : connected ? "HN Secure Access · Connected" : "HN Secure Access · Not connected"
        }
    }
    @objc private func toggle(_ sender: Any?) {
        if popover.isShown { close() } else { show() }
    }
    func show(appearance: NSAppearance? = nil) {
        guard !popover.isShown, let button = statusItem.button else { return }
        initialPin = model.pinRequest?.id
        let host = NSHostingController(rootView: MenuView().environmentObject(model))
        host.preferredContentSize = NSSize(width: MenuView.width, height: MenuView.height)
        popover.contentViewController = host
        popover.animates = !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        popover.appearance = appearance ?? NSApp.effectiveAppearance
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        NSApp.activate(ignoringOtherApps: true)
        popover.contentViewController?.view.window?.makeKey()
        popover.contentViewController?.view.window?.isMovable = false
        escapeMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self, self.popover.isShown, event.keyCode == 53 else { return event }
            self.close()
            return nil
        }
    }
    func close() { popover.performClose(nil) }
    private func stopEscapeMonitor() {
        if let monitor = escapeMonitor { NSEvent.removeMonitor(monitor); escapeMonitor = nil }
    }
    func popoverDidClose(_ notification: Notification) {
        stopEscapeMonitor()
        if model.pinRequest?.id != initialPin && !model.pinBusy && !model.busy { model.cancelPin() }
        // Release all form state immediately, including any typed SSH password or PIN draft.
        popover.contentViewController = nil
        initialPin = nil
    }
    func remove() {
        stopEscapeMonitor()
        close()
        changes?.cancel()
        NSStatusBar.system.removeStatusItem(statusItem)
    }
}
