'use strict';
// Desktop tests only (left out of builds): the downloads service answers from a local folder (feed.json and the
// installers), and HN Group Auth from a stand-in where any sign-in works and the PIN is 246810.
const fs = require('node:fs');
const path = require('node:path');
const AUTH = 'https://auth.hngroup.org.uk', TOKEN = 'a'.repeat(64);
const USER = { displayName: 'Charlie Livsey', email: 'charlie.livsey@hngroup.org.uk', jobTitle: 'Managing director' };
function fetcher(dir, log) {
  return async (url, options = {}) => {
    const u = new URL(url);
    if (u.origin === AUTH) {
      const body = options.body ? JSON.parse(options.body) : {};
      log.push({ auth: u.pathname });
      if (u.pathname === '/api/native/exchange') return Response.json({ token: TOKEN, user: USER });
      if ((options.headers || {}).Authorization !== 'Bearer ' + TOKEN) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
      if (u.pathname === '/api/native/unlock') return body.code === '246810' ? Response.json({ user: USER }) : Response.json({ error: 'That PIN isn’t right. 4 tries left.' }, { status: 400 });
      if (u.pathname === '/api/native/session') return Response.json({ user: USER });
      if (['/api/native/lock', '/api/native/logout'].includes(u.pathname)) return Response.json({ ok: true });
      return new Response('', { status: 404 });
    }
    if (fs.existsSync(path.join(dir, 'offline'))) throw Error('offline');
    if (u.pathname === '/api/releases') return new Response(fs.readFileSync(path.join(dir, 'feed.json')), { headers: { 'Content-Type': 'application/json' } });
    const file = path.join(dir, path.basename(u.pathname));
    return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('', { status: 404 });
  };
}
module.exports = { fetcher };
