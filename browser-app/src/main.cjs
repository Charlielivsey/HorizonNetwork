'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, session, protocol, net, safeStorage, powerMonitor, Notification } = require('electron');

const { SSH } = require('./ssh.cjs');
const { Frames } = require('./runtime/frames.cjs');
const { Themes } = require('./runtime/themes.cjs');
const { Preferences } = require('./runtime/preferences.cjs');
const { keyboard } = require('./runtime/shortcuts.cjs');
const { ASSETS } = require('./homepage.cjs');
const { websiteHeaders } = require('./auth-headers.cjs');
const { Vault } = require('./vault.cjs');
const { Library } = require('./library.cjs');
const settings = require('./settings.cjs');
const { Downloads } = require('./downloads.cjs');
const { Updates } = require('./updates.cjs');
const { HOME, webURL, theme } = require('./policy.cjs');
const { Account } = require('./sign-in.cjs');
const { VPN, FakeController, controllerFor } = require('./vpn.cjs');
const { Device, testFetcher } = require('./device.cjs');
const { createDeviceGate } = require('./device-gate.cjs');

const { Dialogs } = require('./core/dialogs.cjs');
const { ShellViews } = require('./core/shell-views.cjs');
const { TabManager } = require('./core/tabs.cjs');
const { renderNewTab, greetingText } = require('./core/newtab.cjs');
const { installAppMenu } = require('./core/menu.cjs');
const { registerIpc } = require('./core/ipc.cjs');

// Preserve the OS encryption namespace and userData path so safeStorage keys, accounts, tabs and history survive.
app.setName('HN Browser');
app.setPath('userData', path.join(app.getPath('appData'), 'HN Browser'));
if (!app.isPackaged && process.env.HN_BROWSER_TEST_PROFILE) {
  app.setPath('userData', path.resolve(process.env.HN_BROWSER_TEST_PROFILE));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'hn-browser', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

if (
  process.platform === 'linux' &&
  app.isPackaged &&
  !/KDE|GNOME|Unity|XFCE|Cinnamon|MATE|Pantheon|Budgie/i.test(process.env.XDG_CURRENT_DESKTOP || '') &&
  !app.commandLine.hasSwitch('password-store')
) {
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
}

const UI = path.join(__dirname, '../ui');
const REMOTE_PREFS = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  safeDialogs: true,
  navigateOnDragDrop: false
};

let win = null;
let authWindow = null;
let authTheme = null;
let preferences = settings.load(null);
let preferencesStore = null;
let frames = null;
let themes = null;
let shellViews = null;
let tabs = null;
let dialogs = null;
let device = null;
let deviceGate = null;
let account = null;
let vpn = null;
let ssh = null;
let downloads = null;
let updates = null;
let library = null;

let sshKey = null;
let unlockEmail = null;
let build = 0;
let historyVersion = 0;
let sessionTimer = null;
let quitting = false;
let allowClose = false;
let keepTabsOnce = false;
let exitReady = false;

function changed() { frames?.changed(); }
function flush() { frames?.flush(); }
function clearSshKey() { if (sshKey) sshKey.fill(0); sshKey = null; }
function requireDevice() {
  if (!device?.state().allowed) {
    throw Error('This computer isn’t approved on devices.hngroup.org.uk, so Compass can’t be updated here.');
  }
}

function saveSession() {
  if (quitting || !library || preferences.startup !== 'restore') return;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    if (!quitting && tabs?.tabs.length) {
      library.saveSession(
        tabs.tabs.map(t => ({ url: t.url, pinned: t.pinned })),
        tabs.tabs.findIndex(t => t.id === tabs.active)
      );
    }
  }, 800);
  sessionTimer.unref?.();
}

function flushSession() {
  if (quitting) return;
  clearTimeout(sessionTimer);
  if (library && (preferences.startup === 'restore' || keepTabsOnce) && tabs?.tabs.length) {
    library.saveSession(
      tabs.tabs.map(t => ({ url: t.url, pinned: t.pinned })),
      tabs.tabs.findIndex(t => t.id === tabs.active)
    );
  }
  quitting = true;
  library?.flush();
}

function persistPreferences() {
  preferencesStore?.save(preferences);
  changed();
}

function titleTheme() {
  themes?.native(preferences.theme);
}

async function applySiteTheme(tab) {
  return themes?.page(tab.view.webContents, preferences.theme, preferences.hnThemes);
}

async function saveTheme(value) {
  preferences.theme = theme(value);
  themes.change(preferences.theme, preferences.reduceMotion);
  persistPreferences();
  await Promise.all([...tabs.tabs, ...(authTheme ? [authTheme] : [])].map(applySiteTheme));
}

async function lockBrowser() {
  if (!account?.user) return;
  ssh?.closeAll();
  clearSshKey();
  tabs?.stopFind();
  await account.lock();
  dialogs.clearMessage();
  await shellViews.setPanel('account');
}

function shortcut(key) {
  try {
    if (key === 'd') tabs.toggleBookmark();
    else if (key === 'p') tabs.activeTab?.view.webContents.print({}, () => {});
    else if (key === 'f') tabs.openFind();
    else if (key === 't') tabs.add();
    else if (key === 'w') tabs.close(tabs.active);
    else if (key === 'l') { win.webContents.focus(); win.webContents.send('browser:focus-address'); }
    else if (key === 'r') tabs.activeTab?.view.webContents.reload();
  } catch (err) {
    dialogs.report(err);
  }
}

function keys(input) {
  return keyboard(input, {
    tab: n => tabs.selectByNumber(n),
    cycle: step => tabs.cycle(step),
    shortcut,
    history: step => tabs.history(step),
    reopen: () => { try { tabs.reopenClosed(); } catch (e) { dialogs.report(e); } },
    panel: value => shellViews.setPanel(value).catch(err => dialogs.report(err)),
    lock: () => lockBrowser().catch(err => dialogs.report(err)),
    zoom: delta => tabs.zoom(delta)
  });
}

function snapshot() {
  return {
    themeAt: themes?.at || 0,
    themeRevision: themes?.revision || 0,
    ssh: ssh?.snapshot() || null,
    preferences: { ...preferences, downloadPath: preferences.downloadPath || app.getPath('downloads') },
    chromium: process.versions.chrome,
    electron: process.versions.electron,
    platform: process.platform,
    historyVersion,
    panel: shellViews?.panel || null,
    panelClosing: !!shellViews?.closingPanel,
    question: dialogs?.current || null,
    anchors: shellViews?.anchors || {},
    update: updates?.state,
    build,
    avatar: account?.avatar || null,
    locked: !!account?.locked,
    remembered: account?.remembered || null,
    theme: preferences.theme,
    bookmarks: library?.bookmarks || [],
    profileEditable: !!account?.unlockKey,
    user: account?.user || null,
    message: dialogs?.message || '',
    downloads: downloads?.snapshot() || [],
    active: tabs?.active || null,
    tabs: tabs?.snapshot() || [],
    version: app.getVersion(),
    vpn: vpn?.snapshot() || null,
    find: {
      open: !!tabs?.find.open,
      text: tabs?.find.text || '',
      active: tabs?.find.active || 0,
      matches: tabs?.find.matches || 0
    }
  };
}

function secureNetworkOpen() {
  return new Promise(resolve => {
    if (process.platform === 'darwin') {
      execFile('/bin/ps', ['-axo', 'comm='], { timeout: 3000 }, (e, out) =>
        resolve(!e && String(out).split('\n').some(l => /\.app\/Contents\/MacOS\/(HN Secure Network|HN Secure Access Terminal|HN Group VPN)$/.test(l.trim())))
      );
    } else if (process.platform === 'win32') {
      execFile('tasklist', ['/FI', 'IMAGENAME eq HN Secure Network.exe', '/FO', 'CSV', '/NH'], { timeout: 3000, windowsHide: true }, (e, out) =>
        resolve(!e && /"HN Secure Network\.exe"/i.test(String(out)))
      );
    } else if (process.platform === 'linux') {
      let found = false;
      try {
        for (const pid of fs.readdirSync('/proc')) {
          if (!/^\d+$/.test(pid)) continue;
          try {
            if (path.basename(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0]) === 'hn-secure-network') {
              found = true;
              break;
            }
          } catch {}
        }
      } catch {}
      resolve(found);
    } else {
      resolve(false);
    }
  });
}

async function vpnOffOnQuit() {
  let result = 'off already';
  try {
    await vpn?.poll().catch(() => {});
    if (vpn?.connected) {
      if ((!app.isPackaged && process.env.HN_BROWSER_TEST_SECURE_NETWORK_OPEN === '1') || await secureNetworkOpen()) {
        result = 'left on for HN Secure Access Terminal';
      } else {
        await Promise.race([vpn.disconnect(), new Promise(r => setTimeout(r, 8000))]);
        result = vpn.connected ? 'still on' : 'turned off';
      }
    }
  } catch {
    result = 'still on';
  }
  if (!app.isPackaged && process.env.HN_BROWSER_TEST_PROFILE) {
    try { fs.writeFileSync(path.join(app.getPath('userData'), 'vpn-on-quit.txt'), result); } catch {}
  }
}

async function handlePermission(contents, permission, callback, details) {
  const allowed = ['media', 'geolocation', 'notifications', 'clipboard-sanitized-write'];
  if (!contents || !tabs.tabs.some(t => t.view.webContents === contents && t.id === tabs.active) || !allowed.includes(permission)) {
    return callback(false);
  }
  let origin;
  try { origin = new URL(details.requestingUrl || contents.getURL()).origin; } catch { return callback(false); }
  if (!origin.startsWith('https://') || dialogs.pendingCount >= 3) return callback(false);
  const what = {
    media: 'your camera or microphone',
    geolocation: 'your location',
    notifications: 'notifications',
    'clipboard-sanitized-write': 'your clipboard'
  }[permission];
  const answer = await dialogs.ask({
    title: `Allow ${new URL(origin).host} to use ${what}?`,
    text: 'Only allow websites you trust. This is allowed once, for this visit.',
    icon: 'shield',
    buttons: [
      { id: 'cancel', label: 'Block' },
      { id: 'allow', label: 'Allow once', tone: 'primary' }
    ]
  });
  callback(answer === 'allow');
}

async function setup() {
  app.setAppUserModelId('uk.org.hngroup.browser');
  try { build = JSON.parse(fs.readFileSync(path.join(__dirname, 'build.json'))).build || 0; } catch {}

  const userData = app.getPath('userData');
  const deviceTest = !app.isPackaged && process.env.HN_BROWSER_TEST_PROFILE
    ? { dir: path.join(userData, 'device'), fetcher: testFetcher(path.join(userData, 'device-status.txt')), machine: '0'.repeat(64), name: 'Test computer' }
    : {};
  device = new Device({ app: 'browser', version: app.getVersion(), ...deviceTest });
  deviceGate = createDeviceGate({ device, appName: 'Compass', electron: require('electron'), uiDir: UI, preloadDir: __dirname });
  await deviceGate.ensure();

  try { preferences = settings.load(JSON.parse(fs.readFileSync(path.join(userData, 'preferences.json')))); } catch {}
  preferencesStore = new Preferences(path.join(userData, 'preferences.json'));
  library = new Library({ dir: userData });

  dialogs = new Dialogs({
    onChange: changed,
    onFlush: flush,
    reduceMotion: () => preferences.reduceMotion,
    onShow: () => {
      if (win && !win.isDestroyed()) {
        shellViews?.hidePopup();
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        shellViews?.overlay?.webContents.focus();
      }
    },
    onDone: () => {
      if (!shellViews?.panel && win && !win.isDestroyed()) {
        tabs?.activeTab?.view.webContents.focus();
      }
    }
  });

  downloads = new Downloads({
    file: path.join(userData, 'downloads.json'),
    changed,
    done: record => {
      if (record.status !== 'completed' || !preferences.downloadNotify || !Notification.isSupported() || (win?.isFocused() && shellViews?.panel === 'downloads')) return;
      const n = new Notification({ title: 'Download complete', body: record.name, silent: true });
      n.on('click', () => {
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
          shellViews.setPanel('downloads').catch(() => {});
        }
      });
      n.show();
    }
  });

  updates = new Updates({
    dir: path.join(userData, 'updates'),
    current: `${app.getVersion()}-${build}`,
    changed
  });

  ssh = new SSH({
    file: path.join(userData, 'ssh.json'),
    verify: async ({ host, fingerprint }) =>
      await dialogs.ask({
        title: 'Check the HN Group server',
        text: `This is the first SSH session from this computer. Check that this fingerprint matches the one HN Group gave you before trusting ${host}.`,
        detail: fingerprint,
        note: 'It’s remembered on this computer, and Compass refuses to connect if it ever changes.',
        icon: 'server',
        buttons: [
          { id: 'cancel', label: 'Don’t connect' },
          { id: 'trust', label: 'Trust the server', tone: 'primary' }
        ]
      }) === 'trust'
  });
  ssh.on('changed', changed);
  ssh.on('data', data => {
    if (shellViews?.overlay && !shellViews.overlay.webContents.isDestroyed()) {
      shellViews.overlay.webContents.send('browser:ssh-data', data);
    }
  });

  const pages = session.fromPartition('persist:hn-browser-pages');
  const startFiles = {
    '/': 'newtab.html',
    '/themes.css': 'themes.css',
    '/newtab.css': 'newtab.css',
    '/icons.svg': 'icons.svg',
    ...Object.fromEntries(ASSETS.map(name => ['/assets/' + name, 'assets/' + name])),
    '/assets/hn-group-wordmark.svg': 'assets/hn-group-wordmark.svg',
    '/assets/hn-group-wordmark-white.svg': 'assets/hn-group-wordmark-white.svg',
    '/assets/plus-jakarta-sans.woff2': 'assets/plus-jakarta-sans.woff2'
  };
  pages.protocol.handle('hn-browser', request => {
    const url = new URL(request.url);
    const file = url.hostname === 'start' && startFiles[url.pathname];
    if (file === 'newtab.html') {
      return new Response(renderNewTab({ uiDir: UI, user: account?.user, preferences, library }), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return file ? net.fetch(pathToFileURL(path.join(UI, file)).href) : new Response('Not found', { status: 404 });
  });
  pages.setPermissionRequestHandler(handlePermission);
  pages.setPermissionCheckHandler(() => false);
  pages.on('will-download', (event, item) => {
    if (!webURL(item.getURL())) { event.preventDefault(); return; }
    const downloadPath = path.join(preferences.downloadPath || app.getPath('downloads'), path.basename(item.getFilename()));
    if (preferences.askDownload) {
      item.setSaveDialogOptions({ title: 'Save download', defaultPath: downloadPath });
    } else {
      let target = downloadPath;
      let n = 1;
      while (fs.existsSync(target)) {
        target = path.join(path.dirname(downloadPath), `${path.parse(downloadPath).name} (${n++})${path.extname(downloadPath)}`);
      }
      item.setSavePath(target);
    }
    downloads.track(item);
    if (preferences.openDownloadsOnStart && shellViews?.panel !== 'downloads') {
      shellViews.setPanel('downloads').catch(() => {});
    }
  });

  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 760,
    minHeight: 520,
    title: 'Compass',
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 26 } }
      : { titleBarOverlay: { color: '#100d1a', symbolColor: '#f4efff', height: 72 } }),
    ...(process.platform === 'linux' && fs.existsSync(path.join(UI, 'app-icon.png')) ? { icon: path.join(UI, 'app-icon.png') } : {}),
    backgroundColor: '#100d1a',
    autoHideMenuBar: true,
    webPreferences: { ...REMOTE_PREFS, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') }
  });

  shellViews = new ShellViews({
    getWin: () => win,
    uiDir: UI,
    preloadDir: __dirname,
    remotePreferences: REMOTE_PREFS,
    keys,
    getPreferences: () => preferences,
    getTabsCount: () => tabs?.tabs.length || 0,
    getFind: () => tabs?.find || { open: false },
    getDialogs: () => dialogs,
    onFlush: flush,
    onChanged: changed
  });

  tabs = new TabManager({
    getWin: () => win,
    shellViews,
    remotePreferences: REMOTE_PREFS,
    keys,
    getPreferences: () => preferences,
    getLibrary: () => library,
    applySiteTheme,
    report: err => dialogs.report(err),
    notify: text => dialogs.notify(text),
    onChanged: changed,
    onFlush: flush,
    onHistory: () => { historyVersion++; }
  });

  themes = new Themes({
    window: () => win,
    emit: detail => {
      for (const wc of shellViews.appearanceRecipients()) {
        if (wc && !wc.isDestroyed()) wc.send('browser:appearance', detail);
      }
    }
  });

  frames = new Frames({
    snapshot,
    recipients: () => shellViews.allRecipients(),
    before: () => { shellViews.placeRail(); shellViews.placeOverlay(); },
    after: saveSession
  });

  titleTheme();
  win.webContents.on('before-input-event', (event, input) => { if (keys(input)) event.preventDefault(); });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  account = new Account({
    vault: new Vault(path.join(userData, 'account.enc'), safeStorage),
    open: async url => {
      if (authWindow && !authWindow.isDestroyed()) authWindow.close();
      authWindow = new BrowserWindow({
        parent: win,
        width: 520,
        height: 820,
        title: 'HN account sign-in',
        autoHideMenuBar: true,
        webPreferences: { ...REMOTE_PREFS, partition: 'persist:hn-browser-auth' }
      });
      authTheme = { view: { webContents: authWindow.webContents } };
      authWindow.webContents.on('did-finish-load', () => { if (authTheme) applySiteTheme(authTheme); });
      const authSession = authWindow.webContents.session;
      authSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
      authSession.setPermissionCheckHandler(() => false);
      const allow = (event, targetUrl) => {
        let parsed;
        try { parsed = new URL(targetUrl); } catch { return event.preventDefault(); }
        if (parsed.origin !== 'https://auth.hngroup.org.uk' && !(account.pending && targetUrl.startsWith(account.pending.redirect + '?'))) {
          event.preventDefault();
        }
      };
      authWindow.webContents.on('will-navigate', allow);
      authWindow.webContents.on('will-redirect', allow);
      authWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      authWindow.on('closed', () => { authWindow = null; authTheme = null; account.cancel(); });
      await authWindow.loadURL(url);
    },
    changed: result => {
      if (result.error) dialogs.report(result.error);
      if (!account.user) ssh?.closeAll();
      const email = account.user?.email?.toLowerCase() || null;
      if (unlockEmail && email && unlockEmail !== email) ssh?.closeAll();
      if (email) unlockEmail = email;
      if (vpn?.user && account.remembered && vpn.user.email?.toLowerCase() !== account.remembered.email?.toLowerCase()) {
        vpn.signOut().catch(() => {});
      }
      changed();
      if (result.user && authWindow && !authWindow.isDestroyed()) authWindow.close();
    }
  });

  const vpnController = !app.isPackaged && process.env.HN_BROWSER_VPN_FAKE
    ? Object.assign(
        new FakeController(),
        ['set-up', 'connected'].includes(process.env.HN_BROWSER_VPN_FAKE)
          ? { installed: '[Interface]\n', on: process.env.HN_BROWSER_VPN_FAKE === 'connected' }
          : {}
      )
    : controllerFor(process.platform, { helperSource: path.join(__dirname, 'hn-vpn-ctl') });

  vpn = new VPN({
    vault: new Vault(path.join(userData, 'vpn.enc'), safeStorage),
    controller: vpnController,
    stateFile: path.join(userData, 'vpn.json'),
    version: app.getVersion(),
    ...(vpnController instanceof FakeController ? { reach: async () => true } : {}),
    openTab: async url => { await shellViews.setPanel(null); return tabs.add(url).id; },
    closeTab: id => { if (tabs.tabs.some(t => t.id === id)) tabs.close(id); },
    changed: () => { if (!vpn?.connected) ssh?.closeAll(); changed(); }
  });

  pages.webRequest.onBeforeSendHeaders({ urls: ['https://auth.hngroup.org.uk/*'] }, (details, callback) => {
    websiteHeaders(details, account)
      .then(requestHeaders => callback({ requestHeaders }))
      .catch(() => callback({ requestHeaders: details.requestHeaders }));
  });

  win.on('close', event => {
    if (quitting || allowClose || !preferences.confirmClose || tabs.tabs.length < 2) return;
    event.preventDefault();
    if (dialogs.hasClosing()) return;
    dialogs.ask({
      closing: true,
      title: `Close ${tabs.tabs.length} tabs?`,
      text: preferences.startup === 'restore' ? 'They’ll open again next time.' : 'You can turn this warning off in Settings → Tabs.',
      icon: 'window',
      buttons: [
        { id: 'cancel', label: 'Cancel' },
        { id: 'ok', label: 'Close tabs', tone: 'primary' }
      ]
    }).then(choice => {
      if (choice === 'ok' && win && !win.isDestroyed()) {
        allowClose = true;
        win.close();
      }
    });
  });

  win.on('resize', () => { shellViews.hidePopup(); tabs.resize(); });
  win.on('closed', () => {
    flushSession();
    tabs.destroyAll();
    account.cancel();
    if (authWindow && !authWindow.isDestroyed()) authWindow.close();
    win = null;
  });

  registerIpc({
    getWin: () => win, pages, shellViews, tabs, dialogs, account, vpn, ssh, downloads,
    updates, library, snapshot, keys, shortcut, lockBrowser,
    getPreferences: () => preferences,
    setPreferences: next => { preferences = next; },
    persistPreferences,
    saveSession,
    applySiteTheme,
    saveTheme,
    titleTheme,
    requireDevice,
    setKeepTabsOnce: val => { keepTabsOnce = val; },
    getSshKey: () => sshKey,
    setSshKey: buf => { sshKey = buf; },
    clearSshKey,
    changed
  });

  installAppMenu({
    shortcut,
    reopenClosed: () => tabs.reopenClosed(),
    setPanel: value => shellViews.setPanel(value),
    checkUpdates: () => updates.check(),
    lockBrowser,
    toggleBookmark: () => tabs.toggleBookmark(),
    zoom: delta => tabs.zoom(delta),
    report: err => dialogs.report(err)
  });

  account.load();
  deviceGate.watch({
    onBlocked: () => {
      lockBrowser().catch(() => {});
      if (win && !win.isDestroyed()) win.hide();
    },
    onAllowed: () => {
      if (win && !win.isDestroyed()) { win.show(); win.focus(); }
    }
  });

  await win.loadFile(path.join(UI, 'shell.html'));
  await shellViews.createAll();

  const once = path.join(userData, 'restore-once');
  const afterUpdate = fs.existsSync(once);
  fs.rmSync(once, { force: true });
  const previous = preferences.startup === 'restore' || afterUpdate ? library.session() : null;
  if (previous) {
    let first = null;
    for (const [i, item] of previous.tabs.entries()) {
      const tab = tabs.add(item.url, { background: i !== previous.active, next: false, pinned: item.pinned });
      if (i === previous.active) first = tab;
    }
    if (first) tabs.select(first.id);
  } else {
    tabs.add();
  }

  if (account.locked) {
    if (process.platform === 'darwin') app.focus({ steal: true });
    win.show();
    await shellViews.setPanel('account');
  }

  const idle = setInterval(() => {
    if (preferences.autoLock && account?.user && powerMonitor.getSystemIdleTime() >= preferences.autoLock * 60) {
      lockBrowser().catch(() => {});
    }
  }, 20000);
  idle.unref();

  for (const event of ['lock-screen', 'suspend']) {
    powerMonitor.on(event, () => {
      if (preferences.lockOnSleep) lockBrowser().catch(() => {});
    });
  }

  const rememberedAtStart = account.locked;
  account.restore().then(() => {
    if (!rememberedAtStart && !account.locked) {
      shortcut('l');
      tabs.refreshHomeGreetings(greetingText(account.user, preferences.greeting));
    }
  }).catch(err => dialogs.report(err));

  vpn.restore().catch(() => {});
  setInterval(() => { vpn.poll().catch(() => {}); }, 15000).unref();
  setInterval(() => { vpn.refresh().catch(() => {}); }, 300000).unref();
  setInterval(() => account.refresh(), 60000).unref();
  setTimeout(() => updates.check(), 15000).unref();
  setInterval(() => updates.check(), 6 * 3600000).unref();
}

app.whenReady().then(() => {
  if (process.platform === 'linux' && app.isPackaged) {
    try {
      require('./appimage.cjs').integrate({
        id: 'hn-browser',
        name: 'Compass',
        comment: 'The HN Group web browser',
        categories: 'Network;WebBrowser;',
        args: ['%U'],
        icon: path.join(UI, 'app-icon.png')
      });
    } catch {}
  }
});

app.whenReady().then(setup).catch(error => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', event => {
  if (!exitReady && preferencesStore) {
    event.preventDefault();
    exitReady = true;
    setTimeout(() => app.exit(0), 12000).unref?.();
    Promise.all([preferencesStore.drain().catch(() => {}), vpnOffOnQuit()]).finally(() => app.quit());
    return;
  }
  flushSession();
  ssh?.closeAll();
  clearSshKey();
  preferencesStore?.drain().catch(() => {});
  account?.cancel();
});
