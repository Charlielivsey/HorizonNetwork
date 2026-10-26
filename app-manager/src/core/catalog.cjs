'use strict';
// The HN Group apps App Manager looks after, and App Manager itself. Fixed here, never read from the network.
// `data` is the app's own data folder name (Electron's productName), where its preferences.json lives.
const APPS = Object.freeze({
  browser: Object.freeze({
    id: 'browser', name: 'HN Browser', bundle: 'uk.org.hngroup.browser', mac: 'HN Browser.app', exe: 'HN Browser.exe', data: 'HN Browser', icon: 'browser.svg',
    kind: 'Web browser', tagline: 'Your tabs, your HN account, every HN website one click away.',
    macArch: ['arm64'], // HN Browser is built for Apple silicon Macs only.
  }),
  network: Object.freeze({
    id: 'network', name: 'HN Secure Network', bundle: 'uk.org.hngroup.vpn', mac: 'HN Secure Network.app', macOld: ['HN Group VPN.app'], exe: 'HN Secure Network.exe', data: 'HN Secure Network', icon: 'secure-network.svg',
    kind: 'VPN and SSH', tagline: 'The HN Group VPN and SSH to the server, asking for your PIN each time it connects.',
    macArch: ['arm64', 'x64'],
  }),
});
const MANAGER = Object.freeze({ id: 'manager', name: 'HN Group App Manager', bundle: 'uk.org.hngroup.appmanager', mac: 'HN Group App Manager.app', exe: 'HN Group App Manager.exe' });
const IDS = Object.keys(APPS);
function app(id) { if (typeof id !== 'string' || !Object.hasOwn(APPS, id)) throw Object.assign(Error('Choose an HN Group app.'), { status: 400 }); return APPS[id]; }
module.exports = { APPS, MANAGER, IDS, app };
