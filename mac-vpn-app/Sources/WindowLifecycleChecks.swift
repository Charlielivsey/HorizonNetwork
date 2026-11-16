import AppKit
import Foundation
import Darwin

/// Real AppKit windows, isolated from the automatic SwiftUI launch window. No VPN/network actions.
@MainActor
enum WindowLifecycleChecks {
    static func run() async {
        let presence = MainWindowPresence()
        // Production uses the process-lifetime singleton. Retain the fixture controller just as long
        // as its notification checks, including after its last reopen call under optimisation.
        defer { withExtendedLifetime(presence) {} }
        let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 600, height: 400),
                              styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        presence.register(window)
        presence.reopen()
        await settle { window.isVisible && NSApp.activationPolicy() == .regular }
        check(window.isVisible && NSApp.activationPolicy() == .regular, "Opening restores the window and Dock icon")
        window.performClose(nil)
        await settle { !window.isVisible && NSApp.activationPolicy() == .accessory }
        check(!window.isVisible && NSApp.activationPolicy() == .accessory, "Red close hides the Dock icon")
        let menu = NSPanel(contentRect: NSRect(x: 100, y: 100, width: MenuView.width, height: MenuView.height),
                           styleMask: [.borderless], backing: .buffered, defer: false)
        menu.isReleasedWhenClosed = false
        menu.contentView = MenuWindowAnchor.AnchorView(enabled: true)
        menu.orderFrontRegardless()
        NotificationCenter.default.post(name: NSWindow.didBecomeKeyNotification, object: menu)
        await settle { !menu.isMovable && !menu.isMovableByWindowBackground }
        check(!menu.isMovable && !menu.isMovableByWindowBackground, "Menu panel cannot detach by dragging")
        if let screen = menu.screen {
            await settle { abs(menu.frame.maxY - (screen.visibleFrame.maxY - 6)) < 1 }
            check(abs(menu.frame.maxY - (screen.visibleFrame.maxY - 6)) < 1, "Menu stays beneath the menu bar")
        } else { check(false, "Menu must be attached to a screen") }
        menu.orderOut(nil)
        check(NSApp.activationPolicy() == .accessory, "Menu-bar use keeps the Dock icon hidden")
        presence.reopen()
        await settle { window.isVisible && NSApp.activationPolicy() == .regular }
        check(window.isVisible && NSApp.activationPolicy() == .regular, "Reopen restores the Dock icon")
        window.performClose(nil)
        await settle { NSApp.activationPolicy() == .accessory }
        check(NSApp.activationPolicy() == .accessory, "Repeated close keeps menu-only mode")
        print("All window lifecycle checks passed")
    }
    private static func settle(_ condition: () -> Bool) async {
        for _ in 0..<60 {
            if condition() { return }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }
    private static func check(_ condition: Bool, _ message: String) {
        if !condition {
            FileHandle.standardError.write(Data("Window lifecycle FAILED: \(message)\n".utf8))
            Darwin.exit(1)
        }
        print("Window lifecycle passed: \(message)")
        fflush(stdout)
    }
}
