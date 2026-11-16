import AppKit
import Foundation

/// Real AppKit window lifecycle checks, run on the Mac build host without VPN/network actions.
@MainActor
enum WindowLifecycleChecks {
    static func run() async {
        let presence = MainWindowPresence()
        let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 600, height: 400),
                              styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        presence.register(window)
        presence.reopen()
        precondition(window.isVisible && NSApp.activationPolicy() == .regular, "Opening the app must restore its window and Dock icon")
        window.performClose(nil)
        try? await Task.sleep(nanoseconds: 200_000_000)
        precondition(!window.isVisible && NSApp.activationPolicy() == .accessory, "Red close must hide the Dock icon")
        let menu = NSPanel(contentRect: NSRect(x: 100, y: 100, width: MenuView.width, height: MenuView.height),
                           styleMask: [.borderless], backing: .buffered, defer: false)
        menu.isReleasedWhenClosed = false
        menu.contentView = MenuWindowAnchor.AnchorView(enabled: true)
        menu.orderFrontRegardless()
        NotificationCenter.default.post(name: NSWindow.didBecomeKeyNotification, object: menu)
        try? await Task.sleep(nanoseconds: 100_000_000)
        precondition(!menu.isMovable && !menu.isMovableByWindowBackground, "Menu panel must not detach by dragging")
        if let screen = menu.screen {
            precondition(abs(menu.frame.maxY - (screen.visibleFrame.maxY - 6)) < 1, "Menu panel must stay beneath the menu bar")
        } else { preconditionFailure("Menu panel must be attached to a screen") }
        menu.orderOut(nil)
        precondition(NSApp.activationPolicy() == .accessory, "Menu-bar use must not restore the Dock icon")
        presence.reopen()
        precondition(window.isVisible && NSApp.activationPolicy() == .regular, "Reopening after close must restore the Dock icon")
        window.performClose(nil)
        try? await Task.sleep(nanoseconds: 200_000_000)
        precondition(NSApp.activationPolicy() == .accessory, "Repeated close must keep menu-only mode")
        print("Window lifecycle: open, red close, menu-only use, reopen and repeated close passed")
    }
}
