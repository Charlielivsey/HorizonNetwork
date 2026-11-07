'use strict';
// Every staff profile needs a Discord account, the bot fills in new ones quickly, and profile pictures follow Discord
// unless the person turns that off (the user's request, 5 November 2026). Run: node --test staff-portal/discord-profiles.test.cjs
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

test('Discord accounts on staff profiles and pictures that follow Discord', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-discord-profiles-'));
  try {
    const store = require('./lib/store'); store.init(dir);
    const company = store.COMPANIES[0], domain = store.COMPANY_DOMAINS[company];
    const make = (first, extra) => store.saveEmployee({ firstName: first, lastName: 'Tester', jobTitle: 'Designer', company, emails: [{ domain, auto: true, primary: true }], ...extra }, null);
    const jo = make('Jo', { discordId: '123456789012345678' }), sam = make('Sam', {});
    // Sam has no Discord account yet, so people who manage staff are asked for it.
    assert.deepEqual(store.missingDiscord().map((p) => p.id), [sam.id]);
    assert.throws(() => store.setRecordDiscord(sam, '123'), /15 to 22 digits/);
    // Several staff records can share one Discord ID (the user's request, 7 November 2026); the bot sees it once.
    store.setRecordDiscord(sam, '123456789012345678');
    assert.equal(store.getPerson(sam.id).discord.id, '123456789012345678');
    assert.equal(store.discordPositions().filter((x) => x.id === '123456789012345678').length, 1);
    store.setRecordDiscord(sam, '223456789012345678');
    assert.deepEqual(store.missingDiscord(), []);
    // A profile's Discord account can be changed but not removed.
    assert.throws(() => store.saveEmployee({ firstName: 'Jo', lastName: 'Tester', jobTitle: 'Designer', company, emails: [{ domain, auto: true, primary: true }], discordId: '' }, jo), /needs a Discord account/);
    // The bot reads job titles by company for every linked Discord ID, to keep Discord roles in step with positions.
    const pos = store.discordPositions();
    assert.deepEqual(pos.find((x) => x.id === '123456789012345678').titles, [{ company, title: 'Designer' }]);
    assert.ok(pos.every((x) => /^\d{15,22}$/.test(x.id)) && !pos.some((x) => x.id === undefined), 'only records with a Discord ID');
    // Newly added IDs are "pending" until the bot has filled them in; then they aren't.
    assert.deepEqual(store.discordIds(true).sort(), ['123456789012345678', '223456789012345678']);
    const avatar = 'a'.repeat(32);
    store.updateDiscordNames([{ id: '223456789012345678', username: 'sam_t', globalName: 'Sam', avatar }]);
    assert.deepEqual(store.discordIds(true), ['123456789012345678']);
    assert.equal(store.getPerson(sam.id).discord.username, 'sam_t');
    // Pictures follow Discord by default: Sam's new Discord picture is due to be copied, once.
    assert.equal(store.discordPhotoSync(store.getPerson(sam.id)), true);
    assert.deepEqual(store.discordPhotoTargets().map((p) => p.id), [sam.id]);
    store.saveDiscordPhoto(store.getPerson(sam.id), PNG, avatar);
    assert.equal(store.getPerson(sam.id).avatar.source, 'discord');
    assert.deepEqual(store.discordPhotoTargets(), [], 'nothing more to copy until the Discord picture changes');
    assert.throws(() => store.saveDiscordPhoto(store.getPerson(sam.id), Buffer.from('not a picture'), avatar), /couldn't be used/);
    // A new Discord picture is copied again; turned off, it isn't; turned back on, the current one is used straight away.
    store.updateDiscordNames([{ id: '223456789012345678', username: 'sam_t', globalName: 'Sam', avatar: 'b'.repeat(32) }]);
    assert.deepEqual(store.discordPhotoTargets().map((p) => p.id), [sam.id]);
    store.setDiscordPhotoSync(store.getPerson(sam.id), false);
    assert.deepEqual(store.discordPhotoTargets(), []);
    assert.equal(store.meView(Object.assign(store.getPerson(sam.id), { account: store.getPerson(sam.id).account || { enabled: true } })).discordPhotoSync, false);
    store.setDiscordPhotoSync(store.getPerson(sam.id), true);
    assert.deepEqual(store.discordPhotoTargets().map((p) => p.id), [sam.id]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
