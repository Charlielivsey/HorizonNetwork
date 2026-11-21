'use strict';
const { Menu } = require('electron');

function installAppMenu({ shortcut, reopenClosed, setPanel, checkUpdates, lockBrowser, toggleBookmark, zoom, report }) {
  const macMenu = process.platform === 'darwin'
    ? [{
        label: 'Compass',
        submenu: [
          { label: 'About Compass', click: () => setPanel('updates') },
          { label: 'Check for updates…', click: async () => { await setPanel('updates'); checkUpdates(); } },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide', label: 'Hide Compass' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit', label: 'Quit Compass' }
        ]
      }]
    : [];

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...macMenu,
    {
      label: 'File',
      submenu: [
        { label: 'New tab', accelerator: 'CmdOrCtrl+T', click: () => shortcut('t') },
        { label: 'Reopen closed tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => { try { reopenClosed(); } catch (e) { report(e); } } },
        { label: 'Close tab', accelerator: 'CmdOrCtrl+W', click: () => shortcut('w') },
        { type: 'separator' },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => shortcut('p') },
        { label: 'Lock Compass', accelerator: 'CmdOrCtrl+Shift+L', click: () => lockBrowser().catch(report) },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Compass' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Reload tab', accelerator: 'CmdOrCtrl+R', click: () => shortcut('r') },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => setPanel('settings') },
        { label: 'Downloads', accelerator: 'CmdOrCtrl+J', click: () => setPanel('downloads') },
        { label: 'History', accelerator: process.platform === 'darwin' ? 'Cmd+Y' : 'Ctrl+H', click: () => setPanel('history') },
        { label: 'Bookmarks', accelerator: 'CmdOrCtrl+Shift+O', click: () => setPanel('bookmarks') },
        { label: 'Bookmark this page', accelerator: 'CmdOrCtrl+D', click: () => { try { toggleBookmark(); } catch (e) { report(e); } } },
        { label: 'Address bar', accelerator: 'CmdOrCtrl+L', click: () => shortcut('l') },
        { label: 'Find in page…', accelerator: 'CmdOrCtrl+F', click: () => shortcut('f') },
        { label: 'SSH terminal', accelerator: 'CmdOrCtrl+Shift+S', click: () => setPanel('ssh') },
        { label: 'HN VPN', accelerator: 'CmdOrCtrl+Shift+V', click: () => setPanel('vpn') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Zoom in', accelerator: 'CmdOrCtrl+Plus', click: () => zoom(0.5) },
        { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.5) },
        { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => zoom(null) }
      ]
    }
  ]));
}

module.exports = { installAppMenu };
