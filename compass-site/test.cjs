'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer, formatVersion, formatBytes } = require('./server.js');

async function withServer(options, fn) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn('http://127.0.0.1:' + port);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
}

test('format helpers handle versions and file sizes', () => {
  assert.equal(formatVersion('2.1.0-70'), 'v2.1.0 (build 70)');
  assert.equal(formatVersion('2.1.0'), 'v2.1.0');
  assert.equal(formatVersion(null), null);
  assert.equal(formatBytes(128976539), '123.0 MB');
  assert.equal(formatBytes(2048), '2 KB');
});

test('serves Compass landing page with live release links and security headers', async () => {
  let fetches = 0;
  const fetcher = async () => {
    fetches++;
    return {
      ok: true,
      json: async () => ({
        release: {
          version: '2.1.0-70',
          publishedAt: '2026-11-21T16:00:00Z',
          assets: {
            'mac-arm64': { name: 'Compass-2.1.0-mac-arm64.dmg', size: 128000000, url: '/download/mac-arm64' },
            'windows-x64': { name: 'Compass-2.1.0-win-x64.exe', size: 113000000, url: '/download/windows-x64' },
            'linux-x64': { name: 'Compass-2.1.0-linux-x86_64.AppImage', size: 126000000, url: '/download/linux-x64' }
          }
        }
      })
    };
  };

  await withServer({ fetcher }, async base => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('content-security-policy').includes("default-src 'self'"));
    const html = await res.text();
    assert.ok(html.includes('v2.1.0 (build 70)'));
    assert.ok(html.includes('https://downloads.hngroup.org.uk/download/mac-arm64'));
    assert.ok(html.includes('https://downloads.hngroup.org.uk/download/windows-x64'));
    assert.ok(html.includes('https://downloads.hngroup.org.uk/download/linux-x64'));
    assert.ok(html.includes('Intel Macs are not supported.'));

    // Second request uses 5-minute cache
    await fetch(base + '/');
    assert.equal(fetches, 1);

    const health = await (await fetch(base + '/healthz')).json();
    assert.equal(health.ok, true);
    assert.equal(health.service, 'hn-compass');
    assert.equal(health.release, '2.1.0-70');

    const methodRes = await fetch(base + '/', { method: 'POST' });
    assert.equal(methodRes.status, 405);

    const missing = await fetch(base + '/../server.js');
    assert.equal(missing.status, 404);
  });
});

test('fails gracefully when downloads.hngroup.org.uk cannot be reached', async () => {
  const fetcher = async () => { throw new Error('offline'); };
  await withServer({ fetcher }, async base => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Latest installers available on HN Group Downloads'));
    assert.ok(html.includes('href="https://downloads.hngroup.org.uk/"'));
  });
});
