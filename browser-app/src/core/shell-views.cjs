'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { WebContentsView } = require('electron');

const VALID_PANELS = new Set([
  'account', 'appearance', 'menu', 'updates', 'downloads',
  'settings', 'vpn', 'history', 'bookmarks', 'ssh'
]);

const TOP = 76;

class ShellViews {
  constructor({ getWin, uiDir, preloadDir, remotePreferences, keys, getPreferences, getTabsCount, getFind, getDialogs, onFlush, onChanged }) {
    this.getWin = getWin;
    this.uiDir = uiDir;
    this.preloadDir = preloadDir;
    this.remotePreferences = remotePreferences;
    this.keys = keys;
    this.getPreferences = getPreferences;
    this.getTabsCount = getTabsCount;
    this.getFind = getFind;
    this.getDialogs = getDialogs;
    this.onFlush = onFlush;
    this.onChanged = onChanged;

    this.shellUrl = pathToFileURL(path.join(uiDir, 'shell.html')).href;
    this.overlayUrl = pathToFileURL(path.join(uiDir, 'workspace.html')).href + '?layer=overlay';
    this.railUrl = pathToFileURL(path.join(uiDir, 'rail.html')).href;
    this.popupUrl = pathToFileURL(path.join(uiDir, 'popup.html')).href;

    this.rail = null;
    this.overlay = null;
    this.popup = null;
    this.popupShown = false;
    this.popupItems = [];
    this.panel = null;
    this.closingPanel = false;
    this.panelRequest = 0;
    this.anchors = {};
  }

  get win() {
    return this.getWin();
  }

  sidebarWidth() {
    return this.getPreferences().sidebarExpanded ? 236 : 76;
  }

  async createAll() {
    this.createPopup();
    await this.createRail();
    await this.createOverlay();
  }

  createRail() {
    this.rail = new WebContentsView({
      webPreferences: {
        ...this.remotePreferences,
        backgroundThrottling: false,
        preload: path.join(this.preloadDir, 'preload.cjs')
      }
    });
    this.rail.setBackgroundColor('#00000000');
    this.rail.setBorderRadius(22);
    const wc = this.rail.webContents;
    wc.on('will-navigate', e => e.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('before-input-event', (event, input) => {
      if (this.keys(input)) event.preventDefault();
    });
    this.win.contentView.addChildView(this.rail);
    this.placeRail();
    return wc.loadURL(this.railUrl);
  }

  createOverlay() {
    this.overlay = new WebContentsView({
      webPreferences: {
        ...this.remotePreferences,
        backgroundThrottling: false,
        preload: path.join(this.preloadDir, 'preload.cjs')
      }
    });
    this.overlay.setBackgroundColor('#00000000');
    this.overlay.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    const wc = this.overlay.webContents;
    wc.on('will-navigate', e => e.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('before-input-event', (event, input) => {
      if (this.keys(input)) event.preventDefault();
    });
    this.win.contentView.addChildView(this.overlay);
    return wc.loadURL(this.overlayUrl);
  }

  createPopup() {
    this.popup = new WebContentsView({
      webPreferences: {
        ...this.remotePreferences,
        preload: path.join(this.preloadDir, 'popup-preload.cjs')
      }
    });
    this.popup.setBackgroundColor('#00000000');
    this.popup.webContents.on('will-navigate', e => e.preventDefault());
    this.popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.popup.webContents.loadFile(path.join(this.uiDir, 'popup.html'));
  }

  // Floating rounded vertical tab dock overlaid above the full-width page.
  placeRail() {
    if (!this.rail || !this.win || this.win.isDestroyed()) return;
    const [, h] = this.win.getContentSize();
    const count = Math.max(1, this.getTabsCount());
    const height = Math.min(Math.max(0, h - TOP - 32), 148 + count * 52);
    this.rail.setBounds({ x: 12, y: TOP + 16, width: this.sidebarWidth() - 20, height });
  }

  placeOverlay() {
    if (!this.overlay || !this.win || this.win.isDestroyed()) return;
    const [w, h] = this.win.getContentSize();
    const room = Math.max(0, h - TOP);
    const find = this.getFind();
    const dialogs = this.getDialogs();
    let bounds = { x: 0, y: 0, width: 0, height: 0 };

    if (this.panel || this.closingPanel || dialogs.question) {
      bounds = { x: 0, y: TOP, width: w, height: room };
    } else if (find.open) {
      const width = Math.min(w, 420);
      bounds = { x: w - width, y: TOP, width, height: Math.min(64, room) };
    } else if (dialogs.message) {
      const width = Math.min(Math.max(0, w - 24), 640);
      const height = Math.min(100, room);
      bounds = { x: Math.round((w - width) / 2), y: h - height, width, height };
    }

    const cur = this.overlay.getBounds();
    if (cur.x !== bounds.x || cur.y !== bounds.y || cur.width !== bounds.width || cur.height !== bounds.height) {
      this.overlay.setBounds(bounds);
    }
  }

  raise() {
    if (!this.win || this.win.isDestroyed()) return;
    if (this.rail) this.win.contentView.addChildView(this.rail);
    if (this.overlay) this.win.contentView.addChildView(this.overlay);
  }

  showPopup(items, rect, index = -1) {
    if (!this.popup || !this.win || this.win.isDestroyed()) return;
    this.popupItems = items;
    if (!items.length || !rect) {
      this.hidePopup();
      return;
    }
    const prefs = this.getPreferences();
    const x = Math.max(0, Math.round(rect.x) - 10);
    const y = Math.round(rect.y) - 6;
    const width = Math.round(rect.width) + 20;
    const height = Math.min(items.length, 8) * 44 + 38;
    this.popup.webContents.send('popup:items', {
      items,
      index,
      theme: prefs.theme,
      reduceMotion: prefs.reduceMotion
    });
    const cur = this.popup.getBounds();
    if (cur.x !== x || cur.y !== y || cur.width !== width || cur.height !== height) {
      this.popup.setBounds({ x, y, width, height });
    }
    if (!this.popupShown) this.win.contentView.addChildView(this.popup);
    this.popupShown = true;
  }

  hidePopup() {
    if (this.popupShown && this.win && !this.win.isDestroyed()) {
      const prefs = this.getPreferences();
      this.win.contentView.removeChildView(this.popup);
      this.popup.webContents.send('popup:items', {
        items: [],
        index: -1,
        theme: prefs.theme,
        reduceMotion: prefs.reduceMotion
      });
    }
    this.popupShown = false;
    this.popupItems = [];
  }

  updatePopupIndex(index) {
    if (!this.popupShown || !this.popup) return;
    const prefs = this.getPreferences();
    this.popup.webContents.send('popup:items', {
      items: this.popupItems,
      index: Number(index),
      theme: prefs.theme,
      reduceMotion: prefs.reduceMotion
    });
  }

  updateAnchors(data) {
    const next = {};
    for (const name of ['account', 'appearance', 'menu', 'downloads', 'vpn']) {
      const a = data?.[name];
      if (a && [a.x, a.right, a.bottom].every(Number.isFinite)) {
        next[name] = { x: Math.round(a.x), right: Math.round(a.right), bottom: Math.round(a.bottom) };
      }
    }
    this.anchors = next;
    this.onChanged();
  }

  async setPanel(value) {
    const request = ++this.panelRequest;
    this.hidePopup();
    if (!value) {
      const was = this.panel;
      if (!was && !this.closingPanel) return;
      this.panel = null;
      if (this.overlay?.webContents.isFocused() && this.win && !this.win.isDestroyed()) {
        this.win.webContents.focus();
      }
      if (was && !this.getPreferences().reduceMotion) {
        this.closingPanel = true;
        this.onFlush();
        await new Promise(resolve => setTimeout(resolve, 170));
        if (request !== this.panelRequest) return;
      }
      this.closingPanel = false;
      this.onFlush();
      return;
    }
    if (!VALID_PANELS.has(value)) throw Error('Unknown browser menu.');
    this.panel = value;
    this.closingPanel = false;
    this.onFlush();
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      this.overlay?.webContents.focus();
    }
  }

  dismissPanelImmediate() {
    this.panelRequest++;
    this.panel = null;
    this.closingPanel = false;
  }

  isTrustedEvent(event) {
    const from = (wc, url) => wc && event.sender === wc && event.senderFrame === wc.mainFrame && event.senderFrame.url === url;
    return !!(this.win && (
      from(this.win.webContents, this.shellUrl) ||
      from(this.overlay?.webContents, this.overlayUrl) ||
      from(this.rail?.webContents, this.railUrl)
    ));
  }

  isPopupEvent(event) {
    return !!(this.popup && event.sender === this.popup.webContents && event.senderFrame === this.popup.webContents.mainFrame && event.senderFrame.url === this.popupUrl);
  }

  allRecipients() {
    return [this.win?.webContents, this.overlay?.webContents, this.rail?.webContents];
  }

  appearanceRecipients() {
    return [this.win?.webContents, this.overlay?.webContents, this.rail?.webContents, this.popup?.webContents];
  }

  destroy() {
    for (const view of [this.popup, this.overlay, this.rail]) {
      try {
        if (view?.webContents && !view.webContents.isDestroyed()) view.webContents.close();
      } catch {}
    }
    this.popup = null;
    this.overlay = null;
    this.rail = null;
    this.popupShown = false;
    this.popupItems = [];
  }
}

module.exports = { ShellViews, TOP };
