'use strict';
const crypto = require('node:crypto');
const { WebContentsView, Menu, session, clipboard } = require('electron');
const { HOME, address, webURL, navigationAllowed } = require('../policy.cjs');
const { homeSearch } = require('../sites.cjs');
const { hnSite } = require('../hn.cjs');
const { host } = require('../library.cjs');
const { TOP } = require('./shell-views.cjs');

const ENGINES = {
  google: ['Google', 'https://www.google.com/search?q='],
  bing: ['Bing', 'https://www.bing.com/search?q='],
  duckduckgo: ['DuckDuckGo', 'https://duckduckgo.com/?q=']
};

class TabManager {
  constructor({ getWin, shellViews, remotePreferences, keys, getPreferences, getLibrary, applySiteTheme, report, notify, onChanged, onFlush, onHistory }) {
    this.getWin = getWin;
    this.shellViews = shellViews;
    this.remotePreferences = remotePreferences;
    this.keys = keys;
    this.getPreferences = getPreferences;
    this.getLibrary = getLibrary;
    this.applySiteTheme = applySiteTheme;
    this.report = report;
    this.notify = notify;
    this.onChanged = onChanged;
    this.onFlush = onFlush;
    this.onHistory = onHistory;

    this.tabs = [];
    this.active = null;
    this.closedTabs = [];
    this.find = { open: false, text: '', active: 0, matches: 0 };
  }

  get win() {
    return this.getWin();
  }

  get activeTab() {
    return this.tabs.find(t => t.id === this.active) || null;
  }

  searchURL(query) {
    const prefs = this.getPreferences();
    return (ENGINES[prefs.searchEngine] || ENGINES.google)[1] + encodeURIComponent(query);
  }

  engineInfo() {
    const prefs = this.getPreferences();
    return ENGINES[prefs.searchEngine] || ENGINES.google;
  }

  resolve(value) {
    const target = address(value);
    if (target.startsWith('https://www.google.com/search?q=')) {
      return this.searchURL(new URL(target).searchParams.get('q'));
    }
    return target;
  }

  resize() {
    if (!this.win || this.win.isDestroyed()) return;
    const [w, h] = this.win.getContentSize();
    const bounds = { x: 0, y: TOP, width: w, height: Math.max(0, h - TOP) };
    for (const tab of this.tabs) {
      tab.view.setVisible(tab.id === this.active);
      tab.view.setBounds(bounds);
    }
    this.shellViews.placeRail();
    this.shellViews.placeOverlay();
  }

  navigate(tab, value) {
    if (!tab) return;
    const target = this.resolve(value);
    tab.error = '';
    tab.view.webContents.loadURL(target).catch(err => {
      if (err.code !== 'ERR_ABORTED' && err.errno !== -3) {
        this.report('That page could not be loaded. Check the address or your connection.');
      }
    });
  }

  add(value = HOME, { background = false, next = this.getPreferences().newTabNextToCurrent, pinned = false } = {}) {
    if (this.tabs.length >= 40) throw Error('Close a tab before opening another one.');
    const opener = this.tabs.findIndex(t => t.id === this.active);
    const view = new WebContentsView({
      webPreferences: { ...this.remotePreferences, partition: 'persist:hn-browser-pages' }
    });
    const tab = {
      id: crypto.randomUUID(),
      view,
      title: 'New tab',
      url: HOME,
      loading: false,
      error: '',
      pinned: !!pinned,
      icon: null,
      iconSource: null
    };

    if (next && opener >= 0) this.tabs.splice(opener + 1, 0, tab);
    else this.tabs.push(tab);

    view.setVisible(false);
    this.win.contentView.addChildView(view);
    this.shellViews.raise();
    this.resize();

    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url, disposition }) => {
      const prefs = this.getPreferences();
      if (!prefs.popups && disposition !== 'background-tab' && disposition !== 'foreground-tab') {
        this.notify('A pop-up from this site was blocked. Settings → Privacy can allow them.');
        return { action: 'deny' };
      }
      if (webURL(url)) {
        try {
          this.add(url, { background: disposition === 'background-tab', next: true });
        } catch (err) {
          this.report(err);
        }
      }
      return { action: 'deny' };
    });

    const restrict = (event, url) => {
      const query = homeSearch(url);
      if (wc.getURL() === HOME && query !== null) {
        event.preventDefault();
        try { this.navigate(tab, query); } catch (err) { this.report(err); }
        return;
      }
      if (!navigationAllowed(url)) event.preventDefault();
    };

    wc.on('will-navigate', restrict);
    wc.on('will-redirect', restrict);
    wc.on('will-attach-webview', e => e.preventDefault());

    wc.on('page-title-updated', (_e, title) => {
      tab.title = title.slice(0, 120);
      if (this.getPreferences().saveHistory) this.getLibrary().title(wc.getURL(), title);
      this.onChanged();
    });

    const remember = url => {
      if (this.getPreferences().saveHistory && webURL(url)) {
        this.getLibrary().visit(url, wc.getTitle());
        this.onHistory();
        this.onChanged();
      }
    };
    wc.on('did-navigate', (_e, url) => {
      remember(url);
      if (tab.icon) {
        tab.icon = null;
        this.onChanged();
      }
    });
    wc.on('did-navigate-in-page', (_e, url, isMain) => {
      if (isMain) remember(url);
    });

    wc.on('zoom-changed', () => this.onChanged());
    wc.on('focus', () => {
      if (this.shellViews.panel) {
        setTimeout(() => {
          if (this.shellViews.panel && this.shellViews.overlay && !this.shellViews.overlay.webContents.isDestroyed()) {
            this.shellViews.overlay.webContents.focus();
          }
        }, 0);
      }
    });
    wc.on('context-menu', (_e, params) => this.pageMenu(tab, params));
    wc.on('page-favicon-updated', (_e, icons) => this.fetchFavicon(tab, icons));

    wc.on('found-in-page', (_e, result) => {
      if (tab.id === this.active && this.find.open && result.finalUpdate !== false) {
        this.find.answered = Math.max(this.find.answered || 0, result.requestId || 0);
        this.find.active = result.activeMatchOrdinal || 0;
        this.find.matches = result.matches || 0;
        this.onChanged();
      }
    });

    wc.setZoomLevel(this.getPreferences().defaultZoom);
    wc.on('did-finish-load', () => this.applySiteTheme(tab));

    const update = () => {
      tab.url = wc.getURL() || HOME;
      tab.loading = wc.isLoading();
      this.onChanged();
    };
    for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page']) {
      wc.on(ev, update);
    }

    wc.on('did-fail-load', (_e, code, _description, url, isMain) => {
      if (isMain && code !== -3) {
        tab.error = 'This page could not be loaded. Check your connection or try another address.';
        tab.url = url;
        this.onChanged();
        this.report(tab.error);
      }
    });
    wc.on('render-process-gone', () => {
      tab.error = 'This tab stopped responding. Reload to try again.';
      this.onChanged();
      this.report(tab.error);
    });
    wc.on('before-input-event', (event, input) => {
      if (this.keys(input)) event.preventDefault();
    });

    this.navigate(tab, value);
    if (background && this.active) this.onChanged();
    else this.select(tab.id);
    return tab;
  }

  select(id) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;
    this.shellViews.hidePopup();
    if (this.active !== tab.id) this.stopFind();
    this.active = tab.id;
    this.shellViews.dismissPanelImmediate();
    this.resize();
    this.onChanged();
    tab.view.webContents.focus();
  }

  close(id) {
    const index = this.tabs.findIndex(t => t.id === id);
    if (index < 0) return;
    const [tab] = this.tabs.splice(index, 1);
    if (navigationAllowed(tab.url)) {
      this.closedTabs.push(tab.url);
      this.closedTabs = this.closedTabs.slice(-20);
    }
    this.win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    if (!this.tabs.length) this.add();
    else if (this.active === id) this.select(this.tabs[Math.min(index, this.tabs.length - 1)].id);
    this.onChanged();
  }

  reopenClosed() {
    if (this.closedTabs.length) this.add(this.closedTabs.pop());
  }

  reorder(id, beforeId) {
    const from = this.tabs.findIndex(x => x.id === id);
    const to = this.tabs.findIndex(x => x.id === beforeId);
    if (from >= 0 && to >= 0 && from !== to) {
      const [item] = this.tabs.splice(from, 1);
      this.tabs.splice(Math.min(to, this.tabs.length), 0, item);
      this.onChanged();
    }
  }

  cycle(step) {
    if (this.tabs.length < 2) return;
    const index = this.tabs.findIndex(t => t.id === this.active);
    this.select(this.tabs[(index + step + this.tabs.length) % this.tabs.length].id);
  }

  selectByNumber(n) {
    const tab = n === 9 ? this.tabs.at(-1) : this.tabs[n - 1];
    if (tab) this.select(tab.id);
  }

  history(step) {
    const nav = this.activeTab?.view.webContents.navigationHistory;
    if (step < 0 && nav?.canGoBack()) nav.goBack();
    else if (step > 0 && nav?.canGoForward()) nav.goForward();
  }

  zoom(delta) {
    const wc = this.activeTab?.view.webContents;
    if (!wc) return;
    const next = delta === null
      ? this.getPreferences().defaultZoom
      : Math.max(-3, Math.min(5, wc.getZoomLevel() + delta));
    wc.setZoomLevel(next);
    this.onChanged();
  }

  setDefaultZoom(level) {
    for (const tab of this.tabs) tab.view.webContents.setZoomLevel(level);
  }

  toggleBookmark() {
    const tab = this.activeTab;
    if (!tab || !webURL(tab.url)) throw Error('Only websites can be bookmarked.');
    const added = this.getLibrary().toggleBookmark(tab.url, tab.title);
    this.notify(added ? `Bookmarked “${(tab.title || host(tab.url)).slice(0, 60)}”.` : 'Bookmark removed.');
  }

  stopFind() {
    const wc = this.activeTab?.view.webContents;
    if (this.find.open && wc && !wc.isDestroyed()) wc.stopFindInPage('clearSelection');
    this.find = { open: false, text: '', active: 0, matches: 0 };
  }

  openFind() {
    this.shellViews.hidePopup();
    this.find.open = true;
    this.onFlush();
    this.shellViews.overlay?.webContents.focus();
    this.shellViews.overlay?.webContents.send('browser:find');
  }

  runFind({ text, forward = true, next = false } = {}) {
    if (typeof text !== 'string' || text.length > 500) throw Error('Enter something to find.');
    const wc = this.activeTab?.view.webContents;
    if (!wc) return;
    this.find.open = true;
    this.find.text = text;
    if (!text) {
      wc.stopFindInPage('clearSelection');
      this.find.active = 0;
      this.find.matches = 0;
      this.onChanged();
      return;
    }
    this.find.request = wc.findInPage(text, { forward: !!forward, findNext: !next });
    let tries = 0;
    const retry = () => {
      if (!this.find.open || this.find.text !== text || wc.isDestroyed() || (this.find.answered || 0) >= this.find.request || ++tries > 40) return;
      this.find.request = wc.findInPage(text, { forward: !!forward, findNext: !next });
      setTimeout(retry, 250);
    };
    setTimeout(retry, 250);
  }

  async fetchFavicon(tab, icons) {
    const url = (icons || []).find(u =>
      /^https?:\/\//.test(u) || /^data:image\/(png|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp);base64,/.test(u)
    );
    if (!url || tab.iconSource === url) return;
    tab.iconSource = url;
    try {
      let data = url;
      if (!url.startsWith('data:')) {
        const response = await session.fromPartition('persist:hn-browser-pages').fetch(url, {
          signal: AbortSignal.timeout(8000),
          redirect: 'follow'
        });
        const type = (response.headers.get('content-type') || '').split(';')[0].trim();
        if (!response.ok || !/^image\/(png|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp)$/.test(type)) return;
        const body = Buffer.from(await response.arrayBuffer());
        if (!body.length || body.length > 200000) return;
        data = `data:${type};base64,${body.toString('base64')}`;
      } else if (url.length > 270000) {
        return;
      }
      if (tab.iconSource === url && this.tabs.includes(tab)) {
        tab.icon = data;
        this.onChanged();
      }
    } catch {}
  }

  refreshHomeGreetings(greeting) {
    for (const tab of this.tabs.filter(x => x.url === HOME)) {
      tab.view.webContents.executeJavaScript(
        `const el=document.querySelector(".greeting");if(el)el.textContent=${JSON.stringify(greeting)};`
      ).catch(() => {});
    }
  }

  tabMenu(id) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;
    const index = this.tabs.indexOf(tab);
    const safe = fn => () => { try { fn(); } catch (e) { this.report(e); } };
    Menu.buildFromTemplate([
      { label: 'New tab to the right', click: safe(() => { const n = this.add(); this.tabs.splice(this.tabs.indexOf(n), 1); this.tabs.splice(this.tabs.indexOf(tab) + 1, 0, n); this.onChanged(); }) },
      { label: 'Reload tab', click: () => tab.view.webContents.reload() },
      { label: 'Duplicate tab', click: safe(() => this.add(tab.url)) },
      { label: tab.pinned ? 'Unpin tab' : 'Pin tab', click: () => { tab.pinned = !tab.pinned; this.tabs.splice(this.tabs.indexOf(tab), 1); this.tabs.splice(tab.pinned ? 0 : this.tabs.filter(x => x.pinned).length, 0, tab); this.onChanged(); } },
      { label: tab.view.webContents.isAudioMuted() ? 'Unmute tab' : 'Mute tab', click: () => { tab.view.webContents.setAudioMuted(!tab.view.webContents.isAudioMuted()); this.onChanged(); } },
      { type: 'separator' },
      { label: 'Close tab', click: () => this.close(id) },
      { label: 'Close other tabs', enabled: this.tabs.some(x => x !== tab && !x.pinned), click: () => { for (const x of [...this.tabs]) if (x !== tab && !x.pinned) this.close(x.id); } },
      { label: 'Close tabs to the right', enabled: this.tabs.slice(index + 1).some(x => !x.pinned), click: () => { for (const x of this.tabs.slice(this.tabs.indexOf(tab) + 1)) if (!x.pinned) this.close(x.id); } },
      { type: 'separator' },
      { label: 'Reopen closed tab', enabled: this.closedTabs.length > 0, click: safe(() => this.reopenClosed()) }
    ]).popup({ window: this.win });
  }

  pageMenu(tab, params) {
    const wc = tab.view.webContents;
    const items = [];
    const safe = fn => () => { try { fn(); } catch (e) { this.report(e); } };
    const sep = { type: 'separator' };

    if (params.linkURL && webURL(params.linkURL)) {
      items.push(
        { label: 'Open link in new tab', click: safe(() => this.add(params.linkURL, { background: true, next: true })) },
        { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) },
        sep
      );
    }
    if (params.mediaType === 'image' && params.srcURL) {
      if (webURL(params.srcURL)) {
        items.push(
          { label: 'Open image in new tab', click: safe(() => this.add(params.srcURL, { background: true, next: true })) },
          { label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) }
        );
      }
      items.push({ label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) }, sep);
    }
    if (params.isEditable) {
      items.push(
        { label: 'Undo', enabled: params.editFlags.canUndo, click: () => wc.undo() },
        { label: 'Redo', enabled: params.editFlags.canRedo, click: () => wc.redo() },
        sep,
        { label: 'Cut', enabled: params.editFlags.canCut, click: () => wc.cut() },
        { label: 'Copy', enabled: params.editFlags.canCopy, click: () => wc.copy() },
        { label: 'Paste', enabled: params.editFlags.canPaste, click: () => wc.paste() },
        { label: 'Select all', click: () => wc.selectAll() }
      );
    } else if (params.selectionText.trim()) {
      const text = params.selectionText.trim().replace(/\s+/g, ' ');
      const [engineName] = this.engineInfo();
      items.push(
        { label: 'Copy', click: () => wc.copy() },
        { label: `Search ${engineName} for “${text.length > 28 ? text.slice(0, 27) + '…' : text}”`, click: safe(() => this.add(this.searchURL(text.slice(0, 500)), { next: true })) }
      );
    } else if (!items.length) {
      const nav = wc.navigationHistory;
      items.push(
        { label: 'Back', enabled: nav.canGoBack(), click: () => nav.goBack() },
        { label: 'Forward', enabled: nav.canGoForward(), click: () => nav.goForward() },
        { label: 'Reload', click: () => wc.reload() },
        sep,
        { label: this.getLibrary().bookmarked(tab.url) ? 'Remove bookmark' : 'Bookmark this page', enabled: webURL(tab.url), click: safe(() => { this.select(tab.id); this.toggleBookmark(); }) },
        { label: 'Copy page address', enabled: webURL(tab.url), click: () => { clipboard.writeText(tab.url); this.notify('Page address copied.'); } },
        sep,
        { label: 'Find in page…', click: () => { this.select(tab.id); this.openFind(); } },
        { label: 'Print…', click: () => wc.print({}, () => {}) }
      );
    }
    while (items.at(-1)?.type === 'separator') items.pop();
    if (items.length) Menu.buildFromTemplate(items).popup({ window: this.win });
  }

  snapshot() {
    return this.tabs.map(t => ({
      id: t.id,
      hn: hnSite(t.url)?.name || null,
      icon: t.icon || null,
      zoom: t.view.webContents.isDestroyed() ? 0 : t.view.webContents.getZoomLevel(),
      pinned: !!t.pinned,
      muted: t.view.webContents.isAudioMuted(),
      title: t.title,
      url: t.url,
      loading: t.loading,
      error: t.error,
      back: !t.view.webContents.isDestroyed() && t.view.webContents.navigationHistory.canGoBack(),
      forward: !t.view.webContents.isDestroyed() && t.view.webContents.navigationHistory.canGoForward()
    }));
  }

  destroyAll() {
    for (const tab of this.tabs) {
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    }
    this.tabs = [];
  }
}

module.exports = { TabManager, ENGINES };
