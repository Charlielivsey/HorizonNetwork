'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict');const{hnSite}=require('../src/hn.cjs');
test('HN Group websites are recognised by their exact https host only',()=>{
 assert.equal(hnSite('https://staff.hngroup.org.uk/people').name,'Staff portal');assert.equal(hnSite('https://www.horizon-network.co.uk/').name,'Horizon Network');assert.equal(hnSite('https://horizonetwork.com/').name,'Horizon Network');
 for(const url of ['http://staff.hngroup.org.uk/','https://staff.hngroup.org.uk.evil.test/','https://evilhngroup.org.uk/','https://mail.google.com/','https://user:pw@staff.hngroup.org.uk/','not a url'])assert.equal(hnSite(url),null,url);
});
