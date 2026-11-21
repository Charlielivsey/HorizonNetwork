'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { app, ipcMain, Menu, dialog, shell, clipboard, nativeImage } = require('electron');
const { HOME, webURL } = require('../policy.cjs');
const { siteShortcut } = require('../sites.cjs');
const { hnSite } = require('../hn.cjs');
const settings = require('../settings.cjs');
const { installMac, installWindows, installLinux } = require('../installer.cjs');
const { ORIGIN: VPN_ORIGIN } = require('../vpn.cjs');
const { greetingText } = require('./newtab.cjs');

function photoData(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const size = fs.statSync(file).size;
  if (ext === 'gif') {
    if (size > 1.4 * 1024 * 1024) throw Error('That GIF is too large (max 1.4 MB).');
    return 'data:image/gif;base64,' + fs.readFileSync(file).toString('base64');
  }
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) throw Error('Choose a JPG, PNG, WebP or GIF image.');
  if (size > 25 * 1024 * 1024) throw Error('That image is too large.');
  let image = nativeImage.createFromPath(file);
  if (image.isEmpty()) throw Error('That image couldn’t be opened. Try a JPG or PNG.');
  const { width, height } = image.getSize();
  const side = Math.min(width, height);
  image = image
    .crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
    .resize({ width: Math.min(512, side), height: Math.min(512, side), quality: 'best' });
  return 'data:image/jpeg;base64,' + image.toJPEG(88).toString('base64');
}

function registerIpc(ctx) {
  const {
    getWin, pages, shellViews, tabs, dialogs, account, vpn, ssh, downloads,
    updates, library, snapshot, keys, shortcut, lockBrowser,
    getPreferences, setPreferences, persistPreferences, saveSession,
    applySiteTheme, saveTheme, titleTheme, requireDevice, setKeepTabsOnce,
    getSshKey, setSshKey, clearSshKey, changed
  } = ctx;

  let themeQueue = Promise.resolve();

  function assertTrusted(event) {
    if (!shellViews.isTrustedEvent(event)) {
      throw Error('This page cannot access browser controls.');
    }
  }

  function bookmarkMenu(id) {
    const b = library.bookmarks.find(x => x.id === id);
    if (!b) return;
    const safe = fn => () => { try { fn(); } catch (e) { dialogs.report(e); } };
    Menu.buildFromTemplate([
      { label: 'Open', click: safe(() => tabs.navigate(tabs.activeTab, b.url)) },
      { label: 'Open in new tab', click: safe(() => tabs.add(b.url, { next: true })) },
      { label: 'Copy address', click: () => clipboard.writeText(b.url) },
      { type: 'separator' },
      { label: 'Edit bookmarks…', click: () => shellViews.setPanel('bookmarks') },
      { label: 'Remove', click: safe(() => { library.removeBookmark(b.id); changed(); }) }
    ]).popup({ window: getWin() });
  }

  ipcMain.handle('browser:state', event => {
    assertTrusted(event);
    return snapshot();
  });

  ipcMain.on('popup:choose', (event, index) => {
    if (!shellViews.isPopupEvent(event)) return;
    const item = shellViews.popupItems[index];
    shellViews.hidePopup();
    if (!item || !webURL(item.url)) return;
    const activeTab = tabs.activeTab;
    if (activeTab) {
      tabs.navigate(activeTab, item.url);
      activeTab.view.webContents.focus();
    }
    const win = getWin();
    if (win && !win.isDestroyed()) win.webContents.send('browser:suggest-chosen');
  });

  ipcMain.on('browser:ssh-ack', (event, id, bytes) => {
    assertTrusted(event);
    ssh.ack(String(id), bytes);
  });

  ipcMain.handle('browser:action', async (event, action, data) => {
    assertTrusted(event);
    try {
      const win = getWin();
      const t = tabs.activeTab;
      const prefs = getPreferences();
      let result = null;

      switch (action) {
        case 'question-answer':
          dialogs.answer(String(data?.id || ''), String(data?.choice || ''));
          break;
        case 'anchors':
          shellViews.updateAnchors(data);
          break;
        case 'tab-reorder':
          tabs.reorder(data?.id, data?.before);
          break;
        case 'tab-menu':
          tabs.tabMenu(String(data));
          break;
        case 'reopen':
          tabs.reopenClosed();
          break;
        case 'new':
          tabs.add();
          break;
        case 'close':
          tabs.close(String(data));
          break;
        case 'select':
          tabs.select(String(data));
          break;
        case 'navigate':
          shellViews.hidePopup();
          tabs.navigate(t, data);
          break;
        case 'back':
          tabs.history(-1);
          break;
        case 'forward':
          tabs.history(1);
          break;
        case 'reload':
          t?.view.webContents.reload();
          break;
        case 'stop':
          t?.view.webContents.stop();
          break;
        case 'home':
          tabs.navigate(t, HOME);
          break;
        case 'theme':
          themeQueue = themeQueue.catch(() => {}).then(() => saveTheme(data));
          await themeQueue;
          break;
        case 'profile':
          await shellViews.setPanel(data === true ? 'account' : null);
          break;
        case 'panel':
          await shellViews.setPanel(data);
          break;

        // Downloads
        case 'download-pause':
          downloads.pause(String(data));
          break;
        case 'download-resume':
          downloads.resume(String(data));
          break;
        case 'download-cancel':
          downloads.cancel(String(data));
          break;
        case 'download-retry': {
          const url = downloads.retry(String(data));
          pages.downloadURL(url);
          break;
        }
        case 'download-reveal':
          shell.showItemInFolder(downloads.reveal(String(data)));
          break;
        case 'download-open': {
          const file = downloads.reveal(String(data));
          if (await dialogs.confirm({
            title: 'Open ' + path.basename(file) + '?',
            text: 'Only open files from sources you trust.',
            icon: 'file',
            confirm: 'Open file'
          })) {
            const error = await shell.openPath(file);
            if (error) throw Error(error);
          }
          break;
        }
        case 'download-remove':
          downloads.remove(String(data));
          break;
        case 'download-folder': {
          const error = await shell.openPath(prefs.downloadPath || app.getPath('downloads'));
          if (error) throw Error(error);
          break;
        }
        case 'download-clear':
          downloads.clear();
          break;

        // Preferences & data
        case 'preference': {
          const { key, value } = data || {};
          if (key === 'theme' || key === 'downloadPath' || !(key in settings.DEFAULTS)) throw Error('Invalid setting.');
          prefs[key] = settings.validate(key, value);
          persistPreferences();
          if (key === 'sidebarExpanded') tabs.resize();
          if (key === 'defaultZoom') tabs.setDefaultZoom(value);
          if (key === 'hnThemes') await Promise.all(tabs.tabs.map(applySiteTheme));
          if (key === 'startup' && value === 'restore') saveSession();
          break;
        }
        case 'choose-download-folder': {
          const chosen = await dialog.showOpenDialog(win, { title: 'Downloads folder', properties: ['openDirectory', 'createDirectory'] });
          if (!chosen.canceled) {
            prefs.downloadPath = chosen.filePaths[0];
            persistPreferences();
          }
          break;
        }
        case 'clear-data': {
          if (!['cache', 'cookies'].includes(data)) throw Error('Choose browsing data to clear.');
          if (await dialogs.confirm({
            title: data === 'cookies' ? 'Clear website cookies and sign out of websites?' : 'Clear cached website images and files?',
            text: 'Your Compass account and downloaded files are kept.',
            icon: 'trash',
            tone: 'danger',
            confirm: 'Clear data'
          })) {
            if (data === 'cache') await pages.clearCache();
            else await pages.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'] });
            dialogs.notify('Browsing data cleared.');
          }
          break;
        }
        case 'reset-settings': {
          if (await dialogs.confirm({
            title: 'Reset Compass settings?',
            text: 'Settings go back to how they were when Compass was installed. Your account, bookmarks, history and downloads are kept.',
            icon: 'settings',
            tone: 'danger',
            confirm: 'Reset settings'
          })) {
            setPreferences(settings.load(null));
            titleTheme();
            persistPreferences();
            tabs.setDefaultZoom(getPreferences().defaultZoom);
            await Promise.all(tabs.tabs.map(applySiteTheme));
            dialogs.notify('Settings reset.');
          }
          break;
        }

        // Updates
        case 'check-update':
          await updates.check();
          break;
        case 'download-update':
          requireDevice();
          await updates.download();
          break;
        case 'install-update': {
          requireDevice();
          const file = await updates.verifiedFile();
          const asset = updates.asset;
          const inPlace = asset.kind === 'zip' || asset.kind === 'exe' || asset.kind === 'appimage';
          if (!await dialogs.confirm({
            title: inPlace ? `Restart Compass to update to ${asset.version.split('-')[0]}?` : 'Open the verified update installer?',
            icon: 'download',
            confirm: inPlace ? 'Restart and update' : 'Open installer and quit',
            cancel: 'Later',
            text: inPlace
              ? 'Compass closes, updates itself and opens again in a few seconds. Your tabs, account and browsing data are kept.'
              : process.platform === 'darwin'
                ? 'Compass will close. In the disk image, drag Compass to Applications and replace the existing app. Your saved browser data stays on this Mac.'
                : 'Compass will close so the installer can update it. Your saved browser data stays on this PC.'
          })) break;
          if (asset.kind === 'zip') await installMac(file, asset.version);
          else if (asset.kind === 'exe') installWindows(file);
          else if (asset.kind === 'appimage') await installLinux(file);
          else {
            const error = await shell.openPath(file);
            if (error) throw Error(error);
          }
          if (inPlace) {
            setKeepTabsOnce(true);
            try { fs.writeFileSync(path.join(app.getPath('userData'), 'restore-once'), '1', { mode: 0o600 }); } catch {}
          }
          app.quit();
          break;
        }

        // View & find
        case 'zoom-in':
          tabs.zoom(0.5);
          break;
        case 'zoom-out':
          tabs.zoom(-0.5);
          break;
        case 'zoom-reset':
          tabs.zoom(null);
          break;
        case 'fullscreen':
          await shellViews.setPanel(null);
          win.setFullScreen(!win.isFullScreen());
          break;
        case 'find':
          tabs.runFind(data);
          break;
        case 'find-open':
          await shellViews.setPanel(null);
          shortcut('f');
          break;
        case 'find-close':
          tabs.stopFind();
          changed();
          t?.view.webContents.focus();
          break;
        case 'key': {
          const k = data || {};
          if (typeof k.key !== 'string' || k.key.length > 12) throw Error('Unknown shortcut.');
          keys({ type: 'keyDown', key: k.key, control: !!k.control, meta: !!k.meta, shift: !!k.shift, alt: !!k.alt });
          break;
        }
        case 'print':
          t?.view.webContents.print({}, () => {});
          break;
        case 'copy-address':
          if (t && webURL(t.url)) {
            clipboard.writeText(t.url);
            dialogs.notify('Page address copied.');
          }
          break;

        // Account & PIN
        case 'unlock-account':
          await account.unlock(String(data || ''));
          if (account.user) {
            dialogs.clearMessage();
            await shellViews.setPanel(null);
            shortcut('l');
            tabs.refreshHomeGreetings(greetingText(account.user, prefs.greeting));
          }
          break;
        case 'sign-in':
          await account.start();
          break;
        case 'sign-out':
          ssh.closeAll();
          await account.signOut();
          await vpn.signOut();
          break;
        case 'lock':
          ssh.closeAll();
          await lockBrowser();
          break;
        case 'staff-settings':
          await shellViews.setPanel(null);
          tabs.add('https://staff.hngroup.org.uk/settings', { next: true });
          break;
        case 'account-get':
          result = await account.account();
          break;
        case 'account-update':
          result = await account.account('update', { profile: data });
          dialogs.notify('Profile saved.');
          break;
        case 'account-status':
          result = await account.account('status', { status: data || null });
          dialogs.notify(data?.type ? 'Status updated.' : 'Status cleared.');
          break;
        case 'account-photo': {
          if (data === 'remove') {
            if (!await dialogs.confirm({
              title: 'Remove your profile picture?',
              text: 'Your initials are shown instead on HN Group websites.',
              icon: 'image',
              tone: 'danger',
              confirm: 'Remove'
            })) break;
            result = await account.account('photo', { remove: true });
            dialogs.notify('Profile picture removed.');
            break;
          }
          const chosen = await dialog.showOpenDialog(win, {
            title: 'Choose a profile picture',
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
          });
          if (chosen.canceled || !chosen.filePaths[0]) break;
          result = await account.account('photo', { image: photoData(chosen.filePaths[0]) });
          dialogs.notify('Profile picture updated.');
          break;
        }

        // SSH
        case 'ssh-key': {
          if (!account.user) throw Error('Unlock Compass first.');
          const chosen = await dialog.showOpenDialog(win, { title: 'Choose an SSH private key', properties: ['openFile'] });
          if (!chosen.canceled) {
            const file = chosen.filePaths[0];
            if (fs.statSync(file).size > 1024 * 1024) throw Error('That key file is too large.');
            setSshKey(fs.readFileSync(file));
            result = { name: path.basename(file) };
          }
          break;
        }
        case 'ssh-connect': {
          if (!account.user) throw Error('Unlock your HN account before using SSH.');
          if (!vpn.ready) throw Error('Set up this computer’s HN VPN first.');
          if (!vpn.connected) throw Error('Connect the HN VPN first, then retry SSH.');
          if (!await vpn.reach('10.88.0.1', 22, 15000)) {
            throw Error("The server isn't answering through the VPN. Check the VPN is connected and UDP 51820 is open.");
          }
          try {
            result = {
              id: ssh.connect({
                username: String(data?.username || ssh.username),
                password: String(data?.password || ''),
                privateKey: data?.useKey ? getSshKey() : null,
                passphrase: data?.useKey ? String(data?.password || '') : undefined,
                cols: data?.cols,
                rows: data?.rows
              })
            };
          } finally {
            if (data) data.password = '';
            clearSshKey();
          }
          break;
        }
        case 'ssh-input':
          if (!account.user) throw Error('Unlock Compass first.');
          ssh.input(String(data?.id), data?.data);
          break;
        case 'ssh-resize':
          ssh.resize(String(data?.id), data?.cols, data?.rows);
          break;
        case 'ssh-close':
          ssh.close(String(data));
          break;
        case 'ssh-link': {
          const url = String(data || '');
          if (!webURL(url)) throw Error('Only website links can be opened.');
          tabs.add(url, { background: true });
          break;
        }
        case 'ssh-copy':
          if (typeof data === 'string' && data.length <= 65536) clipboard.writeText(data);
          break;
        case 'ssh-paste':
          result = clipboard.readText().slice(0, 65536);
          break;

        // VPN
        case 'vpn-sign-in':
          if (!account.user) throw Error('Unlock your HN account first.');
          await vpn.signIn();
          break;
        case 'vpn-sign-out':
          await vpn.signOut();
          break;
        case 'vpn-setup':
          if (!account.user) throw Error('Unlock your HN account first.');
          await vpn.setUp();
          break;
        case 'vpn-connect':
          if (!account.user) throw Error('Unlock your HN account first.');
          await vpn.connect();
          break;
        case 'vpn-disconnect':
          ssh.closeAll();
          await vpn.disconnect();
          break;
        case 'vpn-toggle':
          if (!vpn.connected && !account.user) throw Error('Unlock your HN account first.');
          await vpn.toggle();
          break;
        case 'vpn-refresh':
          await vpn.poll();
          await vpn.refresh();
          break;
        case 'vpn-remove': {
          if (await dialogs.confirm({
            title: 'Remove the HN VPN from this computer?',
            text: 'This disconnects the VPN and removes this computer’s VPN connection and registration. You can set it up again at any time.',
            icon: 'vpn',
            tone: 'danger',
            confirm: 'Remove'
          })) {
            await vpn.remove();
          }
          break;
        }
        case 'vpn-tools':
          if (process.platform === 'darwin') {
            const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find(f => fs.existsSync(f));
            if (brew) {
              execFile('/usr/bin/osascript', [
                '-e', 'tell application "Terminal" to activate',
                '-e', `tell application "Terminal" to do script "${brew} install wireguard-tools"`
              ]);
            } else {
              await shell.openExternal('https://brew.sh');
            }
          } else {
            await shell.openExternal('https://www.wireguard.com/install/');
          }
          break;
        case 'vpn-manage':
          await shellViews.setPanel(null);
          tabs.add(VPN_ORIGIN + '/');
          break;

        // Suggestions & Library
        case 'suggest': {
          const text = String(data?.text ?? '').slice(0, 300);
          const rect = data?.rect;
          let items = [];
          if (text.trim() && !shellViews.panel) {
            let first = null;
            try {
              const url = tabs.resolve(text);
              const site = siteShortcut(text);
              const [engineName, enginePrefix] = tabs.engineInfo();
              first = url.startsWith(enginePrefix)
                ? { kind: 'search', url, title: text.trim(), engine: engineName }
                : { kind: site ? 'site' : 'go', url, title: site ? text.trim() : url };
            } catch {}
            const more = prefs.suggestions ? library.suggest(text, 6).filter(x => x.url !== first?.url) : [];
            items = [first, ...more].filter(Boolean).slice(0, 7).map(x => ({
              ...x,
              hn: x.kind === 'search' ? null : hnSite(x.url)?.name || null
            }));
          }
          const valid = rect && [rect.x, rect.y, rect.width].every(Number.isFinite);
          if (valid && (prefs.suggestions || items[0]?.hn) && items.length > 0) {
            shellViews.showPopup(prefs.suggestions ? items : items.slice(0, 1), rect, -1);
          } else {
            shellViews.hidePopup();
          }
          result = items;
          break;
        }
        case 'suggest-index':
          shellViews.updatePopupIndex(data);
          break;
        case 'suggest-close':
          shellViews.hidePopup();
          break;
        case 'open': {
          shellViews.hidePopup();
          const url = String(data?.url || '');
          if (!webURL(url)) throw Error('Only websites can be opened.');
          if (data?.newTab) tabs.add(url, { next: true, background: !!data.background });
          else {
            await shellViews.setPanel(null);
            tabs.navigate(t, url);
          }
          break;
        }
        case 'bookmark-toggle':
          tabs.toggleBookmark();
          break;
        case 'bookmark-remove':
          library.removeBookmark(String(data));
          changed();
          break;
        case 'bookmark-rename':
          library.renameBookmark(String(data?.id), data?.title);
          changed();
          break;
        case 'bookmark-move':
          library.moveBookmark(String(data?.id), data?.step === -1 ? -1 : 1);
          changed();
          break;
        case 'bookmark-menu':
          bookmarkMenu(String(data));
          break;
        case 'history-list':
          result = library.searchHistory(String(data || ''), 400);
          break;
        case 'history-remove':
          library.removeHistory(String(data));
          break;
        case 'history-clear': {
          const ranges = { hour: 3600000, day: 86400000, week: 7 * 86400000, all: 0 };
          if (!(data in ranges)) throw Error('Choose what to clear.');
          const labels = { hour: 'the last hour', day: 'the last day', week: 'the last 7 days', all: 'all time' };
          const clear = await dialogs.confirm({
            title: `Clear browsing history from ${labels[data]}?`,
            text: 'Bookmarks, downloads and website sign-ins are kept.',
            icon: 'clock',
            tone: 'danger',
            confirm: 'Clear history'
          });
          if (clear) {
            library.clearHistory(ranges[data] ? Date.now() - ranges[data] : 0);
            dialogs.notify('History cleared.');
          }
          result = clear;
          break;
        }

        default:
          throw Error('Unknown browser control.');
      }

      return { ok: true, result };
    } catch (err) {
      if (data?.password) data.password = '';
      if (action !== 'suggest') dialogs.report(err);
      return { error: err.message, relock: !!err.relock };
    }
  });
}

module.exports = { registerIpc };
