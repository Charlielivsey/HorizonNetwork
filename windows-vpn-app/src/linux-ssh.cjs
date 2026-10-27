'use strict';
// SSH on Linux: the session opens in the desktop's own terminal (Konsole on Bazzite's KDE edition, Ptyxis or GNOME
// Terminal on GNOME, and the other common ones), running the system's OpenSSH. Like on Windows and the Mac, it signs in
// with the password only: SSH keys, agents and ~/.ssh/config are never read or offered. The password typed in the app is
// handed once to ssh through a private, self-deleting SSH_ASKPASS file in this user's own memory-backed runtime folder
// (never a command line), and the server's SHA-256 fingerprint is checked first: confirmed in the app the first time,
// then pinned, so ssh refuses a server whose identity has changed. The app keeps only the username and fingerprint.
const{EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{execFile,spawn}=require('node:child_process');
const HOST='10.88.0.1',PORT=22,USERNAME=/^[a-z_][a-z0-9_.-]{0,31}$/i,FINGERPRINT=/^SHA256:[A-Za-z0-9+/]{43}$/;
const TYPES=['ssh-ed25519','ecdsa-sha2-nistp256','ecdsa-sha2-nistp384','ecdsa-sha2-nistp521','ssh-rsa'];
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";

// Looks for a program on PATH (and the usual folders, which an AppImage's PATH may not list).
function which(name,env=process.env){
 for(const dir of[...String(env.PATH||'').split(':'),'/usr/bin','/bin','/usr/local/bin','/usr/sbin']){if(!dir||!path.isAbsolute(dir))continue;const f=path.join(dir,name);try{fs.accessSync(f,fs.constants.X_OK);if(fs.statSync(f).isFile())return f;}catch{}}
 return null;
}
// The SHA-256 fingerprint OpenSSH shows for a public key (base64 key blob).
const fingerprintOf=blob=>'SHA256:'+crypto.createHash('sha256').update(Buffer.from(blob,'base64')).digest('base64').replace(/=+$/,'');
// Asks the server for its public key (the strongest kind it has) with ssh-keyscan.
function keyscan(host,port,{timeout=15000}={}){
 const exe=which('ssh-keyscan');if(!exe)return Promise.reject(Error('OpenSSH isn’t installed on this computer, so SSH can’t open. Install the openssh-clients package.'));
 return new Promise(resolve=>execFile(exe,['-T','10','-p',String(port),'-t','ed25519,ecdsa,rsa',host],{timeout},(error,stdout)=>{
  const keys=String(stdout||'').split('\n').map(l=>l.trim().split(/\s+/)).filter(p=>p.length>=3&&!p[0].startsWith('#')&&TYPES.includes(p[1])&&/^[A-Za-z0-9+/]+={0,2}$/.test(p[2]));
  keys.sort((a,b)=>TYPES.indexOf(a[1])-TYPES.indexOf(b[1]));const k=keys[0];
  resolve(k?{type:k[1],key:k[2],fingerprint:fingerprintOf(k[2])}:null);}));
}
// The desktop's terminal, best match first, with how each one runs a command.
const TERMINALS={
 konsole:cmd=>['--separate','--hide-menubar','-e',...cmd],
 ptyxis:cmd=>['--new-window','-x',cmd.map(quote).join(' ')],
 'kgx':cmd=>['--',...cmd],
 'gnome-terminal':cmd=>['--',...cmd],
 'xfce4-terminal':cmd=>['-x',...cmd],
 'mate-terminal':cmd=>['-x',...cmd],
 tilix:cmd=>['-e',cmd.map(quote).join(' ')],
 alacritty:cmd=>['-e',...cmd],
 kitty:cmd=>[...cmd],
 foot:cmd=>[...cmd],
 wezterm:cmd=>['start','--',...cmd],
 'xdg-terminal-exec':cmd=>[...cmd],
 'x-terminal-emulator':cmd=>['-e',...cmd],
 xterm:cmd=>['-e',...cmd],
};
function terminalOrder(desktop=process.env.XDG_CURRENT_DESKTOP||''){
 const d=desktop.toUpperCase(),all=Object.keys(TERMINALS);
 const first=d.includes('KDE')?['konsole']:d.includes('GNOME')?['ptyxis','kgx','gnome-terminal']:d.includes('XFCE')?['xfce4-terminal']:d.includes('MATE')?['mate-terminal']:[];
 return[...first,...all.filter(n=>!first.includes(n))];
}
// The environment a terminal is opened with: the AppImage's own folders and libraries are left out.
function cleanEnv(env=process.env){const out={...env};for(const k of['APPIMAGE','APPDIR','ARGV0','OWD','LD_LIBRARY_PATH','GSETTINGS_SCHEMA_DIR','ELECTRON_RUN_AS_NODE','CHROME_DESKTOP'])delete out[k];if(env.APPDIR)out.PATH=String(env.PATH||'').split(':').filter(p=>!p.startsWith(env.APPDIR)).join(':');out.XDG_DATA_DIRS=String(env.XDG_DATA_DIRS||'').split(':').filter(p=>p&&!(env.APPDIR&&p.startsWith(env.APPDIR))).join(':')||undefined;if(!out.XDG_DATA_DIRS)delete out.XDG_DATA_DIRS;return out;}
// Opens the first terminal this computer has. Resolves once it has started.
function launchTerminal(cmd,{env=process.env}={}){
 for(const name of terminalOrder(env.XDG_CURRENT_DESKTOP)){
  const exe=which(name,env);if(!exe)continue;
  return new Promise((resolve,reject)=>{
   const child=spawn(exe,TERMINALS[name](cmd),{detached:true,stdio:'ignore',env:cleanEnv(env)});let settled=false;
   const done=e=>{if(settled)return;settled=true;clearTimeout(timer);child.unref();e?reject(e):resolve(name);};
   // A terminal that exits with an error straight away didn't open (ones that hand over to a running copy exit with 0).
   const timer=setTimeout(()=>done(),1500);
   child.once('error',()=>done(Error('The terminal ('+name+') couldn’t be opened.')));
   child.once('exit',code=>done(code?Error('The terminal ('+name+') couldn’t be opened.'):null));
  });
 }
 return Promise.reject(Error('No terminal app was found on this computer. Install Konsole, Ptyxis or GNOME Terminal and try again.'));
}
// A private folder for one session in this user's runtime folder (memory-backed on Bazzite and Fedora).
function sessionDir(env=process.env){
 const base=env.XDG_RUNTIME_DIR&&path.isAbsolute(env.XDG_RUNTIME_DIR)&&fs.existsSync(env.XDG_RUNTIME_DIR)?env.XDG_RUNTIME_DIR:os.tmpdir();
 return fs.mkdtempSync(path.join(base,'hn-ssh-'));
}
// The ssh command: password only, nothing from ~/.ssh, the pinned key only, and a note once signed in.
function sshArgs({host,port,username,type,dir}){
 return['-F','/dev/null','-p',String(port),
  '-o','PubkeyAuthentication=no','-o','IdentitiesOnly=yes','-o','IdentityFile=none','-o','IdentityAgent=none','-o','GSSAPIAuthentication=no','-o','HostbasedAuthentication=no',
  '-o','PreferredAuthentications=password,keyboard-interactive','-o','NumberOfPasswordPrompts=1',
  '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+path.join(dir,'known_hosts'),'-o','GlobalKnownHostsFile=/dev/null','-o','HostKeyAlgorithms='+(type==='ssh-rsa'?'rsa-sha2-512,rsa-sha2-256':type),'-o','UpdateHostKeys=no','-o','CheckHostIP=no',
  '-o','ConnectTimeout=15','-o','ServerAliveInterval=30','-o','ControlMaster=no','-o','ControlPath=none','-o','ForwardAgent=no','-o','ForwardX11=no',
  '-o','PermitLocalCommand=yes','-o','LocalCommand=: > '+quote(path.join(dir,'open')),
  username+'@'+host];
}
function sessionScript({host,port,username,type,dir,ssh}){
 const args=sshArgs({host,port,username,type,dir}).map(quote).join(' ');
 return['#!/bin/sh',"printf '\\033]0;HN Group server · ssh\\007'",
  'echo '+quote('HN Secure Network · SSH to '+username+'@'+host+' through the HN Group VPN'),'echo',
  'SSH_ASKPASS='+quote(path.join(dir,'askpass'))+' SSH_ASKPASS_REQUIRE=force '+quote(ssh)+' '+args,
  'code=$?','rm -f '+quote(path.join(dir,'secret')),'echo "$code" > '+quote(path.join(dir,'exit')),
  'echo','if [ "$code" -eq 0 ]; then echo "The session has ended."; else echo "The session couldn’t open or ended with an error ($code)."; fi',
  'printf "Press Enter to close this window. "','read _ 2>/dev/null','rm -rf '+quote(dir)].join('\n')+'\n';
}
// Hands the password over once, then deletes it.
const askpassScript=dir=>['#!/bin/sh','f='+quote(path.join(dir,'secret')),'if [ -f "$f" ]; then cat "$f"; rm -f "$f"; fi',''].join('\n');

class LinuxTerminals extends EventEmitter{
 // verify({host,fingerprint}) asks the person to confirm the server the first time. scan/launch can be replaced in tests.
 constructor({file,verify,host=HOST,port=PORT,scan=keyscan,launch=launchTerminal,env=process.env,watchFor=10*60000}){super();Object.assign(this,{file,verify,host,port,scan,launch,env,watchFor});this.username='root';this.fingerprint=null;this.last=null;this.opened=0;
  try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(USERNAME.test(saved.username||''))this.username=saved.username;if(FINGERPRINT.test(saved.fingerprint||''))this.fingerprint=saved.fingerprint;}catch{}}
 snapshot(){return{host:HOST,username:this.username,fingerprint:this.fingerprint,opened:this.opened,last:this.last&&{...this.last}};}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify({username:this.username,fingerprint:this.fingerprint}),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 note(status,error=''){this.last={status,error,at:Date.now()};this.emit('changed',this.snapshot());}
 // Resolves once the terminal window has opened (it then signs in by itself).
 async open({username,password}){
  username=String(username||'').trim()||'root';
  if(!USERNAME.test(username))throw Error('Enter a valid server username.');
  if(typeof password!=='string'||!password)throw Error('Enter your server password.');
  if(password.length>4096)throw Error('That password is too long.');
  if(/[\r\n\0]/.test(password))throw Error('That password can’t be used here.');
  this.username=username;this.save();
  const ssh=which('ssh',this.env);if(!ssh)throw Error('OpenSSH isn’t installed on this computer, so SSH can’t open. Install the openssh-clients package.');
  let dir=null;
  try{
   const found=await this.scan(this.host,this.port);
   if(!found)throw Error('The HN Group server didn’t answer. Check the VPN is connected and try again.');
   if(this.fingerprint&&found.fingerprint!==this.fingerprint)throw Error('The HN Group server’s identity has changed, so the session wasn’t opened. Contact an HN Group administrator before connecting again.');
   if(!this.fingerprint){
    const trusted=await Promise.resolve(this.verify({host:HOST,fingerprint:found.fingerprint})).catch(()=>false);
    if(!trusted)throw Error('The server’s identity wasn’t confirmed, so the session was not opened.');
    this.fingerprint=found.fingerprint;this.save();
   }
   dir=sessionDir(this.env);
   fs.writeFileSync(path.join(dir,'known_hosts'),(this.port===22?this.host:'['+this.host+']:'+this.port)+' '+found.type+' '+found.key+'\n',{mode:0o600});
   fs.writeFileSync(path.join(dir,'secret'),password,{mode:0o600});password=null;
   fs.writeFileSync(path.join(dir,'askpass'),askpassScript(dir),{mode:0o700});
   fs.writeFileSync(path.join(dir,'session.sh'),sessionScript({host:this.host,port:this.port,username,type:found.type,dir,ssh}),{mode:0o700});
   await this.launch(['/bin/sh',path.join(dir,'session.sh')],{env:this.env});
  }catch(e){if(dir)fs.rmSync(dir,{recursive:true,force:true});this.note('error',e.message);throw e;}
  this.opened++;this.note('connecting');this.follow(dir);
 }
 // Follows the session: signed in (ssh ran its local command), or how it ended. The password is deleted after two
 // minutes even if ssh never asked for it.
 follow(dir){
  const started=Date.now(),exists=f=>fs.existsSync(path.join(dir,f));let opened=false;
  const t=setInterval(()=>{
   if(Date.now()-started>120000)fs.rmSync(path.join(dir,'secret'),{force:true});
   if(!opened&&exists('open')){opened=true;this.note('open');}
   let code=null;try{code=Number(fs.readFileSync(path.join(dir,'exit'),'utf8').trim());}catch{}
   if(code!==null&&Number.isFinite(code)){clearInterval(t);if(!opened)this.note('error',code===255?'The server didn’t accept the sign-in, or couldn’t be reached. Check your username and password and try again.':'The SSH session ended ('+code+').');return;}
   if(!fs.existsSync(dir)||Date.now()-started>this.watchFor){clearInterval(t);fs.rmSync(path.join(dir,'secret'),{force:true});}
  },500);t.unref?.();
 }
}
module.exports={LinuxTerminals,keyscan,fingerprintOf,launchTerminal,terminalOrder,sshArgs,sessionScript,cleanEnv,which,HOST,PORT};
