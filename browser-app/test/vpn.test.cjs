'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const{VPN,FakeController,WindowsController,keyPair,SERVER}=require('../src/vpn.cjs');
const memoryVault=()=>{let value=null;return{save:v=>{value=v;},load:()=>value,clear:()=>{value=null;},get value(){return value;}};};
// A stand-in for vpn.hngroup.org.uk: app sign-in exchange, account, devices and sign-out.
function fakeService(){const s={codes:new Map(),devices:[],tokens:new Set(),headers:[]};
 s.fetch=async(url,options={})=>{const u=new URL(url),auth=(options.headers?.Authorization||'').slice(7),body=options.body?JSON.parse(options.body):{};s.headers.push(options.headers);
  if(u.pathname==='/api/app/exchange'){const c=s.codes.get(body.code);if(!c||crypto.createHash('sha256').update(body.verifier).digest('hex')!==c)return Response.json({error:'Expired.'},{status:401});const token=crypto.randomBytes(32).toString('hex');s.tokens.add(token);return Response.json({token,user:{displayName:'Sam',email:'sam@hngroup.org.uk'}});}
  if(!s.tokens.has(auth))return Response.json({error:'Sign in again.'},{status:401});
  if(u.pathname==='/api/me')return Response.json({user:{displayName:'Sam',email:'sam@hngroup.org.uk'},devices:s.devices,limit:5});
  if(u.pathname==='/api/sign-out'){s.tokens.delete(auth);return Response.json({ok:true});}
  if(u.pathname==='/api/devices'&&options.method==='POST'){const d={id:crypto.randomBytes(12).toString('hex'),name:body.name,address:'10.88.0.'+(2+s.devices.length),publicKey:body.publicKey};s.devices.push(d);return Response.json({device:d,connection:{config:'[Interface]\nPrivateKey = <this device’s private key>\n[Peer]\nAllowedIPs = 10.88.0.1/32, fd88:88::1/128\n'}},{status:201});}
  const m=/^\/api\/devices\/([a-f0-9]{24})$/.exec(u.pathname);if(m&&options.method==='DELETE'){s.devices=s.devices.filter(d=>d.id!==m[1]);return Response.json({ok:true});}
  return Response.json({error:'Not found.'},{status:404});};
 return s;}

test('WireGuard keys are made locally as valid Curve25519 key pairs',()=>{const k=keyPair();assert.match(k.publicKey,/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$/);assert.match(k.privateKey,/^[A-Za-z0-9+/]{43}=$/);const derived=crypto.createPublicKey(crypto.createPrivateKey({key:{kty:'OKP',crv:'X25519',d:Buffer.from(k.privateKey,'base64').toString('base64url'),x:Buffer.from(k.publicKey,'base64').toString('base64url')},format:'jwk'})).export({format:'jwk'}).x;assert.equal(Buffer.from(derived,'base64url').toString('base64'),k.publicKey);});

test('HN VPN sign-in through a tab, set-up, connect, remove and sign-out',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-vpn-test-')),service=fakeService(),vault=memoryVault(),controller=new FakeController();let opened=null,closed=null;
 const vpn=new VPN({vault,controller,stateFile:path.join(dir,'vpn.json'),fetcher:service.fetch,origin:'https://vpn.example.test',version:'0.6.0',hostname:'Test-PC',reach:async()=>true,openTab:async url=>{opened=url;return'tab-1';},closeTab:id=>{closed=id;}});
 try{
  await vpn.restore();assert.equal(vpn.snapshot().signedIn,false);
  await vpn.signIn();const u=new URL(opened);assert.equal(u.origin+u.pathname,'https://vpn.example.test/auth/login');const challenge=u.searchParams.get('app'),port=u.searchParams.get('loopback');assert.match(challenge,/^[a-f0-9]{64}$/);assert.equal(vpn.snapshot().signingIn,true);
  // Only the matching one-time code and loopback address finish sign-in.
  const code=crypto.randomBytes(32).toString('hex');service.codes.set(code,challenge);
  assert.equal((await fetch('http://127.0.0.1:'+port+'/elsewhere?code='+code)).status,400);
  const done=await fetch('http://127.0.0.1:'+port+'/vpn-callback?code='+code);assert.equal(done.status,200);assert.match(await done.text(),/HN VPN is ready/);
  assert.match(vault.value,/^[a-f0-9]{64}$/);assert.equal(vpn.snapshot().user.email,'sam@hngroup.org.uk');assert.equal(vpn.snapshot().signingIn,false);
  await new Promise(r=>setTimeout(r,1400));assert.equal(closed,'tab-1');
  assert.ok(service.headers.some(h=>h&&h['X-HN-VPN-Client']==='hn-browser'&&h['X-HN-VPN-App']==='0.6.0'));
  // Set up: the server gets only the public key; the private key goes straight into the configuration.
  assert.equal(vpn.snapshot().ready,false);await assert.rejects(vpn.connect(),/Set up/);
  await vpn.setUp();const s=vpn.snapshot();assert.equal(s.ready,true);assert.equal(s.device.name,'HN Browser on Test-PC');assert.equal(s.shared,false);
  assert.doesNotMatch(controller.installed,/this device’s private key/);const priv=/PrivateKey = (\S+)/.exec(controller.installed)[1];assert.notEqual(priv,service.devices[0].publicKey);assert.ok(!JSON.stringify(service.headers).includes(priv));
  assert.ok(!fs.readFileSync(path.join(dir,'vpn.json'),'utf8').includes(priv));
  await vpn.connect();assert.equal(vpn.snapshot().connected,true);assert.equal(vpn.snapshot().reachable,true);assert.equal(vpn.snapshot().server,SERVER);
  await vpn.toggle();assert.equal(vpn.snapshot().connected,false);
  // Setting up again replaces this computer's old registration rather than adding another.
  await vpn.setUp();assert.equal(service.devices.length,1);
  await vpn.remove();assert.equal(service.devices.length,0);assert.equal(vpn.snapshot().ready,false);
  await vpn.signOut();assert.equal(vault.value,null);assert.equal(service.tokens.size,0);assert.equal(vpn.snapshot().signedIn,false);
 }finally{vpn.cancel();fs.rmSync(dir,{recursive:true,force:true});}
});

test('an ended VPN sign-in is forgotten and a wrong code does not sign in',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-vpn-test-')),service=fakeService(),vault=memoryVault();vault.save('b'.repeat(64));let opened;
 const vpn=new VPN({vault,controller:new FakeController(),stateFile:path.join(dir,'vpn.json'),fetcher:service.fetch,origin:'https://vpn.example.test',reach:async()=>false,openTab:async url=>{opened=url;return'x';}});
 try{await vpn.restore();assert.equal(vpn.snapshot().signedIn,false);assert.equal(vault.value,null);assert.match(vpn.snapshot().error,/ended/);
  await vpn.signIn();const port=new URL(opened).searchParams.get('loopback');assert.equal((await fetch('http://127.0.0.1:'+port+'/vpn-callback?code='+'c'.repeat(64))).status,400);assert.equal(vpn.snapshot().signedIn,false);assert.ok(vpn.snapshot().error);
  // The loopback address accepts one attempt only.
  assert.equal((await fetch('http://127.0.0.1:'+port+'/vpn-callback?code='+'d'.repeat(64)).catch(()=>({status:0}))).status!==200,true);
 }finally{vpn.cancel();fs.rmSync(dir,{recursive:true,force:true});}
});

test('Windows set-up keeps the configuration Administrators-only and lets users start and stop only the HN VPN',()=>{
 const w=new WindowsController({programFiles:'C:\\Program Files',programData:'C:\\ProgramData'}),script=w.setupScript("C:\\Users\\Jo O'Neil\\Temp\\hn-vpn.conf");
 assert.match(script,/icacls \$dir \/inheritance:r \/grant:r "\*S-1-5-18:\(OI\)\(CI\)F" "\*S-1-5-32-544:\(OI\)\(CI\)F"/);
 assert.match(script,/'C:\\Users\\Jo O''Neil\\Temp\\hn-vpn\.conf'/);
 assert.match(script,/\/installtunnelservice 'C:\\ProgramData\\HN Group\\VPN\\hn-vpn\.conf'/);
 assert.match(script,/sdset 'WireGuardTunnel\$hn-vpn' ".*\(A;;CCLCSWRPWPDTLOCRRC;;;IU\)"/);
});

test('the bundled Mac helper matches Secure Network’s, so both apps share one connection',()=>{
 const theirs=path.join(__dirname,'../../mac-vpn-app/Resources/hn-vpn-ctl');if(!fs.existsSync(theirs))return;
 assert.equal(fs.readFileSync(path.join(__dirname,'../src/hn-vpn-ctl'),'utf8'),fs.readFileSync(theirs,'utf8'));
});
