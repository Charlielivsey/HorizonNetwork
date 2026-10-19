'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {eligible,css,PALETTES}=require('../src/site-theme.cjs');
const {SITES}=require('../src/sites.cjs');
test('browser themes cover every HN destination and exclude external pages and lookalike hosts',()=>{for(const[url]of SITES)assert.equal(eligible(url),new URL(url).hostname!=='mail.google.com',url);for(const url of ['https://hngroup.org.uk.evil.example/','http://staff.hngroup.org.uk/','https://google.com/','file:///etc/passwd'])assert.equal(eligible(url),false);assert.ok(eligible('hn-browser://start/'));for(const name of Object.keys(PALETTES)){assert.match(css(name),/--bg:/);assert.match(css(name),/--on-primary:/);}assert.throws(()=>css('unknown'));});
