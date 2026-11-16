import AppKit
import Foundation
import Darwin
import SwiftUI

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
        await menuClicks()
        check(NSApp.activationPolicy() == .accessory, "Menu-bar use keeps the Dock icon hidden")
        presence.reopen()
        await settle { window.isVisible && NSApp.activationPolicy() == .regular }
        check(window.isVisible && NSApp.activationPolicy() == .regular, "Reopen restores the Dock icon")
        window.performClose(nil)
        await settle { NSApp.activationPolicy() == .accessory }
        check(NSApp.activationPolicy() == .accessory, "Repeated close keeps menu-only mode")
        await navigationClicks()
        await manualPinEntry()
        print("All window lifecycle and manual PIN checks passed")
    }
    private static func click(_ view: NSView, at point: NSPoint) {
        guard let window = view.window else { check(false, "Click target has a window"); return }
        let local = NSPoint(x: point.x, y: view.isFlipped ? point.y : view.bounds.height - point.y)
        let location = view.convert(local, to: nil)
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            guard let event = NSEvent.mouseEvent(with: type, location: location, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: type == .leftMouseDown ? 1 : 0) else { check(false, "Mouse event can be created"); return }
            window.sendEvent(event)
        }
    }
    private static func hasSecureField(_ view: NSView) -> Bool {
        view is NSSecureTextField || view.subviews.contains { hasSecureField($0) }
    }
    private static func menuClicks() async {
        let model = VPNModel(preview: true)
        model.stage = .ready; model.isSetUp = true
        let menu = MenuBarController(model: model)
        defer { menu.remove() }
        menu.show()
        await settle { menu.popover.isShown }
        check(menu.popover.isShown, "Native menu popover opens")
        try? await Task.sleep(nanoseconds: 220_000_000)
        guard let host = menu.popover.contentViewController?.view, let window = host.window else { check(false, "Native popover hosts the controls"); return }
        check(!window.isMovable, "Popover cannot be dragged out of place")
        if let screen = window.screen { check(screen.frame.contains(window.frame), "Native popover stays on screen") }
        click(host, at: NSPoint(x: 280, y: 156))
        await settle { model.pinRequest != nil }
        check(model.pinRequest != nil && !model.connected, "Connect works across the button and only opens PIN confirmation")
        try? await Task.sleep(nanoseconds: 220_000_000)
        click(host, at: NSPoint(x: 35, y: 272))
        await settle { model.pinRequest == nil }
        check(model.pinRequest == nil && !model.connected, "Cancel works across the whole button")
        try? await Task.sleep(nanoseconds: 220_000_000)
        click(host, at: NSPoint(x: 180, y: 214))
        await settle { hasSecureField(host) }
        check(hasSecureField(host), "The whole server terminal card opens its form")
        menu.close()
        await settle { !menu.popover.isShown && menu.popover.contentViewController == nil }
        check(menu.popover.contentViewController == nil, "Closing the menu releases all form state")
    }
    private static func navigationClicks() async {
        let model = VPNModel(preview: true)
        model.stage = .ready; model.isSetUp = true
        let window = NSWindow(contentRect: NSRect(x: 200, y: 100, width: 480, height: 400), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        let host = NSHostingView(rootView: HStack(spacing: 0) { AccessRail(); Color.clear }.frame(width: 480, height: 400).environmentObject(model).background(MainWindowRegistration()))
        window.contentView = host
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        try? await Task.sleep(nanoseconds: 200_000_000)
        click(host, at: NSPoint(x: 140, y: 120))
        await settle { model.section == .ssh }
        check(model.section == .ssh, "Navigation responds to clicks away from its icon and text")
        let image = AnimatedImage.FillView(frame: NSRect(x: 0, y: 0, width: 44, height: 44))
        check(image.hitTest(NSPoint(x: 22, y: 22)) == nil, "Avatar artwork passes clicks to the account button")
        window.close()
    }
    private static func manualPinEntry() async {
        let model = VPNModel(preview: true)
        model.stage = .ready; model.isSetUp = true
        model.requestConnect()
        check(model.pinRequest != nil && !model.connected, "Requesting connection only opens confirmation")
        let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 360, height: 260), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        let host = NSHostingView(rootView: PinConfirmation(compact: true).environmentObject(model).padding(16))
        window.contentView = host
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        try? await Task.sleep(nanoseconds: 200_000_000)
        func secureField(_ view: NSView) -> NSSecureTextField? {
            if let field = view as? NSSecureTextField { return field }
            for child in view.subviews { if let field = secureField(child) { return field } }
            return nil
        }
        guard let field = secureField(host) else { check(false, "PIN input is available to keyboard users"); return }
        window.makeFirstResponder(field)
        guard let editor = field.currentEditor() as? NSTextView else { check(false, "PIN input receives keyboard focus"); return }
        editor.insertText("123456", replacementRange: NSRange(location: NSNotFound, length: 0))
        try? await Task.sleep(nanoseconds: 200_000_000)
        check(model.pinRequest != nil && !model.connected && !model.busy && !model.pinBusy, "Typing six PIN digits never starts the VPN")
        model.cancelPin()
        check(model.pinRequest == nil && !model.connected, "Cancel leaves the VPN off")
        window.close()
        withExtendedLifetime(model) {}
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
