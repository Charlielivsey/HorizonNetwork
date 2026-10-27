'use strict';
// HN Group App Manager 3: installs, updates and removes HN Browser and HN Secure Network from checked downloads,
// changes their settings while they're closed, and keeps itself up to date in the app. It opens only on a computer
// approved on devices.hngroup.org.uk, after signing in with an HN Group account (HN Group Auth) and unlocking it with
// the six-digit PIN. Everything it does is written to a log (Settings → Diagnostics). This file only starts things
// and connects the window to src/core/; the work is done there.
const electron = require('electron');
const { app, BrowserWindow, ipcMain, shell, nativeTheme, Notification, Tray, Menu, nativeImage, safeStorage, clipboard } = electron;
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { Log } = require('./core/log.cjs');
const { Store } = require('./core/store.cjs');
const { Manager } = require('./core/manager.cjs');
const { Updater } = require('./core/updater.cjs');
const { selfCheck } = require('./core/self-check.cjs');
const { APPS, IDS, app: entry } = require('./core/catalog.cjs');
const { short } = require('./core/feed.cjs');
const { Account, AUTH } = require('./account.cjs');
const { Vault } = require('./vault.cjs');
const { Device, testFetcher } = require('./device.cjs');
const { createDeviceGate } = require('./device-gate.cjs');
const appimage = require('./appimage.cjs');

// ---------- Setting up ----------
// Desktop tests only (never in an installed copy): a temporary profile, a pretend Windows PC and local fixtures.
const TEST = !app.isPackaged && process.env.HN_MANAGER_TEST === '1';
// Linux desktops other than KDE and GNOME (such as Bazzite's Gaming Mode) keep the account in the Secret Service.
if (process.platform === 'linux' && app.isPackaged && !/KDE|GNOME|Unity|XFCE|Cinnamon|MATE|Pantheon|Budgie/i.test(process.env.XDG_CURRENT_DESKTOP || '') && !app.commandLine.hasSwitch('password-store')) app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
if (TEST && process.env.HN_MANAGER_TEST_PROFILE) app.setPath('userData', process.env.HN_MANAGER_TEST_PROFILE);
const DATA = app.getPath('userData');
const log = new Log(DATA, { echo: !app.isPackaged && !TEST });
let build = 0; try { build = Number(require('./build.json').build) || 0; } catch {}
const VERSION = app.getVersion(), ARCH = TEST ? 'x64' : process.arch;
const UI = path.join(__dirname, '..', 'ui');
const SELF_CHECK = (process.argv.find((a) => a.startsWith('--self-check=')) || '').slice('--self-check='.length);
const testLog = [];
const fetcher = TEST ? require('./core/test-fixtures.cjs').fetcher(process.env.HN_MANAGER_TEST_FIXTURES, testLog) : fetch;
function makePlatform() {
  if (TEST) return new (require('./core/fake.cjs').FakePlatform)({ log, dir: path.join(DATA, 'roaming') });
  if (process.platform === 'darwin') return new (require('./core/macos.cjs').MacPlatform)({ log, packaged: app.isPackaged });
  if (process.platform === 'win32') return new (require('./core/windows.cjs').WindowsPlatform)({ log, packaged: app.isPackaged });
  if (process.platform === 'linux') return new (require('./core/linux.cjs').LinuxPlatform)({ log, packaged: app.isPackaged, dataDir: DATA });
  return { name: process.platform, supported: false, self: () => ({ location: 'development' }), find: async () => null, running: async () => false, preferencesFile: () => null };
}
const platform = makePlatform();
log.info('start', 'HN Group App Manager ' + VERSION + ' (build ' + build + ') on ' + process.platform + ' ' + process.arch + (app.isPackaged ? '' : ' (development)') + (TEST ? ' (test)' : ''), { location: platform.self().location });
process.on('uncaughtException', (e) => log.error('crash', e.stack || e.message));
process.on('unhandledRejection', (e) => log.error('crash', (e && e.stack) || String(e)));

// --self-check=<file>: check everything on this computer (changing nothing), write the result and quit. CI runs this
// on the built app on a real Mac and PC.
if (SELF_CHECK) {
  app.dock?.hide();
  selfCheck({ platform, log, fetcher, arch: ARCH, deep: true }).then((r) => { fs.writeFileSync(SELF_CHECK, JSON.stringify({ version: VERSION, build, ...r }, null, 1)); app.exit(r.ok ? 0 : 1); })
    .catch((e) => { fs.writeFileSync(SELF_CHECK, JSON.stringify({ ok: false, error: e.message })); app.exit(1); });
} else start();

function start() {
  const store = new Store(DATA);
  const updater = new Updater({ platform, log, dir: DATA, version: VERSION, build, arch: ARCH, fetcher });
  let account = null, device = null, deviceGate = null, win = null, tray = null, quitting = false, stateTimer = null, notified = '';
  const dialogs = new Map();
  // Installs and updates need an approved computer and the account unlocked; automatic ones need an approved
  // computer and a remembered account (it may be locked).
  const guard = (kind, { auto } = {}) => {
    if (!device || !device.state().allowed) throw Object.assign(Error('This computer isn’t approved on devices.hngroup.org.uk, so apps can’t be installed or changed here.'), { status: 403 });
    if (auto ? !account.token : !account.unlocked) throw Object.assign(Error('Unlock App Manager with your HN Group PIN first.'), { status: 401 });
  };
  const manager = new Manager({ platform, store, log, updater, dataDir: DATA, arch: ARCH, fetcher, guard });

  // ---------- The window's view of things (sent at most once a frame) ----------
  function snapshot() {
    return { version: VERSION, build, platform: platform.name, arch: ARCH, supported: platform.supported, test: TEST,
      account: account ? account.snapshot() : { status: 'signed-out', user: null, avatar: null }, accountError: account && account.lastError || null,
      device: device ? device.state() : null, manager: manager.snapshot(), updater: updater.state,
      preferences: store.preferences, activity: store.activity.slice(0, 100) };
  }
  function changed() { if (stateTimer) return; stateTimer = setTimeout(() => { stateTimer = null; if (win && !win.isDestroyed()) win.webContents.send('am:state', snapshot()); updateTray(); }, 16); }
  manager.on('changed', changed); updater.on('changed', changed);
  manager.on('failed', ({ id, message }) => notify(APPS[id].name + ' couldn’t be changed', message, () => show(id)));
  function show(page) {
    if (!win || win.isDestroyed()) createWindow(true); else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    if (process.platform === 'darwin') app.dock?.show();
    if (page) win.webContents.send('am:go', page);
  }
  function notify(title, body, onClick) {
    if (!store.preferences.notify || !Notification.isSupported() || (win && win.isVisible() && win.isFocused())) return;
    const n = new Notification({ title, body, silent: true }); if (onClick) n.on('click', onClick); n.show();
  }
  // Asks a question in the window (an HN-design card, never a system box) and resolves with the chosen button's id.
  function ask(spec) {
    const id = crypto.randomUUID(); show();
    return new Promise((resolve) => {
      dialogs.set(id, { buttons: spec.buttons.map((b) => b.id), finish: (choice) => { if (!dialogs.has(id)) return; dialogs.delete(id); win?.webContents.send('am:dialog-close', id); resolve(choice); } });
      const send = () => win.webContents.send('am:dialog', { id, ...spec });
      if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send); else send();
    });
  }

  // ---------- Checking and automatic updates ----------
  manager.on('checked', (updates) => {
    if (store.preferences.autoUpdateApps) for (const id of updates) { try { manager.enqueue(id, 'update', { auto: true }); } catch (e) { log.info('auto', 'Not updating ' + id + ' automatically: ' + e.message); } }
    const key = updates.join() + (updater.state.latest ? updater.state.latest.version : '');
    if (updates.length && key !== notified && !store.preferences.autoUpdateApps) notify('Updates are ready', updates.map((id) => APPS[id].name).join(' and ') + (updates.length === 1 ? ' has' : ' have') + ' an update.', () => show('apps'));
    notified = key;
    autoSelf();
  });
  // App Manager's own update downloads by itself (after a check, or once someone signs in or unlocks), and installs
  // when App Manager quits, or straight away from Updates.
  function autoSelf() {
    if (!store.preferences.autoUpdateSelf || updater.state.status !== 'available' || !device || !device.state().allowed || !account || !account.token) return;
    updater.download().then(() => notify('App Manager update ready', 'Version ' + short(updater.state.latest.version) + ' installs when App Manager restarts.', () => show('updates'))).catch(() => {});
  }
  const checkNow = (quiet = true) => manager.check({ quiet });

  // ---------- Window, tray, sign-in at login ----------
  const colors = () => (nativeTheme.shouldUseDarkColors ? { color: '#0E1020', symbolColor: '#ECEBF4' } : { color: '#F6F4FA', symbolColor: '#1B1A21' });
  let away = null;
  function createWindow(visible) {
    win = new BrowserWindow({ width: 1120, height: 780, minWidth: 900, minHeight: 620, show: false, title: 'HN Group App Manager', backgroundColor: nativeTheme.shouldUseDarkColors ? '#0E1020' : '#F6F4FA',
      titleBarStyle: 'hidden', ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 18 } } : { titleBarOverlay: { ...colors(), height: 48 } }),
      ...(process.platform === 'linux' ? { icon: path.join(UI, 'assets', 'app-icon.png') } : {}),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false } });
    win.removeMenu();
    const wc = win.webContents;
    wc.on('will-navigate', (e) => e.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));
    wc.on('render-process-gone', (_e, d) => log.error('window', 'The window stopped: ' + d.reason));
    win.loadFile(path.join(UI, 'index.html'));
    win.once('ready-to-show', () => { if (visible) win.show(); });
    win.on('hide', () => { clearTimeout(away); away = setTimeout(() => account && account.lock().catch(() => {}), 15 * 60000); away.unref?.(); });
    win.on('show', () => clearTimeout(away));
    // Closing keeps App Manager in the menu bar or tray when it runs in the background.
    win.on('close', (e) => {
      if (quitting) return;
      if (store.preferences.background && !TEST) { e.preventDefault(); win.hide(); if (process.platform === 'darwin') app.dock?.hide(); return; }
      if (manager.working) { e.preventDefault(); ask({ title: 'Quit when this finishes?', text: 'App Manager is still installing or downloading. It quits by itself as soon as it’s done.', icon: 'clock', buttons: [{ id: 'cancel', label: 'Keep it open' }, { id: 'ok', label: 'Quit when done', tone: 'primary' }] }).then((c) => { if (c === 'ok') quitWhenIdle(); }); }
    });
    win.on('closed', () => { clearTimeout(away); win = null; });
  }
  function quitWhenIdle() { const tick = () => { if (manager.working || updater.state.status === 'downloading') return setTimeout(tick, 500); quitting = true; app.quit(); }; tick(); }
  function trayImage() { const f = path.join(UI, 'assets', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'); if (!fs.existsSync(f)) return nativeImage.createEmpty(); const i = nativeImage.createFromPath(f); if (process.platform === 'darwin') i.setTemplateImage(true); return i; }
  function setupTray() { if (!store.preferences.background || TEST) { tray?.destroy(); tray = null; return; } if (tray) return; tray = new Tray(trayImage()); tray.setToolTip('HN Group App Manager'); tray.on('click', () => show()); updateTray(true); }
  let trayKey = '';
  function updateTray(force) {
    if (!tray) return;
    const s = manager.snapshot(), updates = s.apps.filter((a) => a.update).length, key = [updates, !!s.job, s.checking, updater.state.status, account && account.unlocked].join();
    if (key === trayKey && !force) return; trayKey = key;
    tray.setToolTip('HN Group App Manager' + (updates ? ' · ' + updates + ' update' + (updates === 1 ? '' : 's') : ''));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: s.job ? 'Working on ' + APPS[s.job.id].name + '…' : updates ? updates + ' update' + (updates === 1 ? '' : 's') + ' ready' : 'Everything is up to date', enabled: false },
      { type: 'separator' },
      ...(updates ? [{ label: 'Update all', enabled: !!(account && account.unlocked), click: () => { try { updateAll(); } catch { show('apps'); } } }] : []),
      { label: 'Check for updates', enabled: !s.checking, click: () => checkNow(false) },
      ...(updater.state.status === 'ready' ? [{ label: 'Restart to update App Manager', click: () => restartToUpdate().catch(() => show('updates')) }] : []),
      { label: 'Open App Manager', click: () => show() },
      { type: 'separator' },
      { label: 'Quit App Manager', click: () => { quitting = true; app.quit(); } },
    ]));
  }
  // Open at sign-in: the system's login items, or on Linux a desktop entry in ~/.config/autostart (AppImage only).
  function loginItem() {
    if (TEST || !app.isPackaged) return;
    if (process.platform === 'linux') { const self = platform.self(); if (store.preferences.openAtLogin && !self.bundle) return; try { appimage.setAutostart(!!store.preferences.openAtLogin, { id: 'hn-group-app-manager', name: 'HN Group App Manager', exec: self.bundle, args: ['--hidden'], comment: 'Install and update HN Group apps' }); } catch (e) { log.warn('start', 'Open at sign-in couldn’t be changed: ' + e.message); } return; }
    app.setLoginItemSettings({ openAtLogin: store.preferences.openAtLogin, args: ['--hidden'] });
  }
  function updateAll() { for (const a of manager.snapshot().apps) if (a.update) { try { manager.enqueue(a.id, 'update'); } catch (e) { if (e.status) throw e; } } }
  async function restartToUpdate() {
    if (manager.working) throw Error('Wait for the current change to finish first.');
    await updater.apply({ reopen: true });
    store.record('manager', 'App Manager is updating to ' + short(updater.state.latest.version) + '. It reopens by itself.');
    if (TEST) { testLog.push({ restartToUpdate: updater.state.latest.version }); return; }
    quitting = true; setTimeout(() => app.quit(), 300);
  }
  async function moveToApplications() {
    if (platform.self().location !== 'temporary') throw Error('App Manager is already installed.');
    if (manager.working) throw Error('Wait for the current change to finish first.');
    store.record('manager', process.platform === 'linux' ? 'App Manager was installed in your Applications folder and app menu.' : 'App Manager moved to the Applications folder.');
    await platform.moveToApplications();
    quitting = true; setTimeout(() => app.quit(), 300);
  }
  function diagnostics() {
    const s = snapshot();
    return ['HN Group App Manager ' + VERSION + ' (build ' + build + ')', 'Computer: ' + process.platform + ' ' + process.arch + ' · ' + require('node:os').release() + ' · ' + platform.self().location,
      'Device: ' + (s.device ? s.device.status + (s.device.allowed ? ' (approved)' : '') : 'not checked') + ' · Account: ' + s.account.status,
      'Self-update: ' + s.updater.status + (s.updater.latest ? ' (' + s.updater.latest.version + ')' : '') + (s.updater.error ? ' – ' + s.updater.error : ''),
      ...s.manager.apps.map((a) => a.name + ': ' + (a.installed ? a.installed.version + (a.installed.build ? ' (' + a.installed.build + ')' : '') + ' at ' + a.installed.path + (a.running ? ', open' : '') : 'not installed') + (a.latest ? ' · latest ' + a.latest.version : '') + (a.error ? ' · ' + a.error : '')),
      '', '— Recent log —', ...log.tail(200)].join('\n');
  }

  // ---------- Requests from the window ----------
  const OPEN = new Set(['state', 'sign-in', 'sign-in-cancel', 'unlock', 'sign-out', 'dialog-answer', 'website', 'theme', 'diagnostics', 'copy-diagnostics', 'open-logs']);
  const handlers = {
    state: () => snapshot(),
    'sign-in': async () => { account.lastError = null; await account.start(); },
    'sign-in-cancel': () => account.cancel(),
    unlock: async (code) => { account.lastError = null; try { await account.unlock(code); store.record('account', 'Unlocked as ' + account.user.displayName + '.'); } finally { changed(); } },
    lock: () => account.lock(),
    'sign-out': async () => { if (manager.working) throw Error('Wait for the current change to finish first.'); await account.signOut(); store.record('account', 'Signed out.'); },
    check: () => checkNow(false),
    enqueue: (id, kind) => manager.enqueue(id, kind),
    cancel: (id) => manager.cancel(id),
    'update-all': () => updateAll(),
    open: async (id) => { const f = await platform.find(id); if (!f) throw Error(entry(id).name + ' isn’t installed.'); if (TEST) return void testLog.push({ open: id }); if (platform.open) return void await platform.open(f); const e = await shell.openPath(process.platform === 'darwin' ? f.path : f.exe); if (e) throw Error(e); },
    reveal: async (id) => { const f = await platform.find(id); if (!f) throw Error(entry(id).name + ' isn’t installed.'); if (TEST) return void testLog.push({ reveal: id }); shell.showItemInFolder(process.platform === 'darwin' ? f.path : f.exe); },
    settings: (id) => manager.readSettings(entry(id).id),
    'save-settings': (id, patch) => manager.saveSettings(entry(id).id, patch),
    preference: (key, value) => { store.set(key, value); if (key === 'background') setupTray(); if (key === 'openAtLogin') loginItem(); if (key === 'autoUpdateSelf') autoSelf(); },
    theme: (value) => { store.set('theme', value); nativeTheme.themeSource = value; },
    'clear-activity': () => store.clearActivity(),
    'self-check': () => updater.check(),
    'self-download': () => { guard('update'); return updater.download(); },
    'self-install': () => { guard('update'); return restartToUpdate(); },
    'move-to-applications': () => moveToApplications(),
    diagnostics: async (deep) => ({ text: diagnostics(), check: deep ? await selfCheck({ platform, log, fetcher, arch: ARCH }) : null }),
    'copy-diagnostics': () => { clipboard.writeText(diagnostics()); },
    'open-logs': () => (TEST ? void testLog.push({ openLogs: true }) : shell.openPath(path.join(DATA, 'logs'))),
    website: (page) => { const pages = { downloads: 'https://downloads.hngroup.org.uk/', devices: 'https://devices.hngroup.org.uk/', account: 'https://accounts.hngroup.org.uk/' }; if (!Object.hasOwn(pages, page)) throw Error('Unknown page.'); if (TEST) return void testLog.push({ website: page }); return shell.openExternal(pages[page]); },
    'dialog-answer': (id, choice) => { const d = dialogs.get(String(id)); if (d) d.finish(d.buttons.includes(choice) ? choice : 'cancel'); },
  };
  const page = pathToFileURL(path.join(UI, 'index.html')).href;
  ipcMain.handle('am:call', async (event, method, ...args) => {
    try {
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== page) throw Error('Untrusted request.');
      if (typeof method !== 'string' || !Object.hasOwn(handlers, method)) throw Error('Unknown request.');
      if (!OPEN.has(method) && !(account && account.unlocked)) throw Error('Unlock App Manager with your HN Group PIN first.');
      const value = await handlers[method](...args);
      if (method !== 'state') changed();
      return { ok: true, value };
    } catch (e) {
      if (!e.status || e.status >= 500) log.warn('request', method + ': ' + e.message);
      changed();
      return { ok: false, error: e.message || 'Something went wrong.' };
    }
  });

  // ---------- Starting ----------
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => show());
  app.whenReady().then(async () => {
    app.setAppUserModelId('uk.org.hngroup.appmanager');
    nativeTheme.themeSource = store.preferences.theme;
    nativeTheme.on('updated', () => { if (win && !win.isDestroyed() && process.platform !== 'darwin') win.setTitleBarOverlay(colors()); });
    // This computer must be approved on devices.hngroup.org.uk before App Manager opens (tests answer from a file).
    const deviceTest = TEST ? { dir: path.join(DATA, 'device'), fetcher: testFetcher(path.join(DATA, 'device-status.txt')), machine: '0'.repeat(64), name: 'Test PC' } : {};
    device = new Device({ app: 'app-manager', version: VERSION, ...deviceTest });
    deviceGate = createDeviceGate({ device, appName: 'HN Group App Manager', electron, uiDir: UI, preloadDir: __dirname });
    await deviceGate.ensure();
    log.info('device', 'This computer is ' + device.state().status);
    // The HN account: remembered (encrypted by the operating system) and locked until the PIN is entered.
    const storage = TEST ? { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'test', encryptString: (s) => Buffer.from('test:' + s), decryptString: (b) => String(b).replace(/^test:/, '') } : safeStorage;
    account = new Account({ vault: new Vault(path.join(DATA, 'account.enc'), storage), fetcher,
      open: async (url) => { log.info('account', 'Opening HN Group Auth in the browser'); if (TEST) return void testLog.push({ signIn: url }); await shell.openExternal(url); },
      changed: (r) => { if (r.error) { account.lastError = r.error; log.warn('account', r.error); } if (r.signedIn) { account.lastError = null; store.record('account', 'Signed in as ' + account.user.displayName + '.'); show(); } if (account.unlocked) autoSelf(); changed(); } });
    account.load(); account.restore().catch(() => {});
    setInterval(() => account.refresh().catch(() => {}), 10 * 60000).unref();
    const hidden = process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin);
    createWindow(!hidden); setupTray(); loginItem();
    if (hidden && process.platform === 'darwin') app.dock?.hide();
    // Revoked while open: hide behind the "not authorised" window until approved again.
    deviceGate.watch({ onBlocked: () => { log.warn('device', 'This computer is no longer approved'); for (const j of manager.snapshot().queue) manager.cancel(j.id); if (win && !win.isDestroyed()) win.hide(); changed(); }, onAllowed: () => { show(); changed(); } });
    await manager.refresh().catch(() => {});
    if (store.preferences.autoCheck || TEST) checkNow(true);
    setInterval(() => { if (!manager.working) manager.refresh().catch(() => {}); }, 15000).unref();
    setInterval(() => { if (store.preferences.autoCheck) checkNow(true); }, 4 * 3600000).unref();
  }).catch((e) => { log.error('start', e.stack || e.message); app.quit(); });
  app.on('activate', () => show());
  // Quitting with an App Manager update ready installs it (with "Keep App Manager up to date" on).
  app.on('before-quit', () => {
    quitting = true;
    for (const d of dialogs.values()) d.finish('cancel');
    if (updater.state.status === 'ready' && store.preferences.autoUpdateSelf && !TEST) updater.apply({ reopen: false }).catch(() => {});
    log.info('quit', 'Quitting');
  });
  app.on('window-all-closed', () => { if (!store.preferences.background || TEST) app.quit(); });
  if (TEST) global.__managerTest = { log: testLog, platform, store, manager, updater, state: () => snapshot(), account: () => account };
}
