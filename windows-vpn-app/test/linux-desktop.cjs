'use strict';
// HN Secure Network for Linux, end to end in the real app: the same journey as test/desktop.cjs with the Linux app's
// wording, SSH through the system's real OpenSSH client (to a local SSH server) and its AppImage update.
//   xvfb-run -a node test/linux-desktop.cjs      (screenshots: windows-vpn-app/screenshots/linux-*)
const{execFileSync}=require('node:child_process');
try{execFileSync('ssh',['-V'],{stdio:'ignore'});execFileSync('which',['ssh-keyscan'],{stdio:'ignore'});}
catch{console.log('Skipped the Linux desktop test: OpenSSH (ssh and ssh-keyscan) isn’t installed here.');process.exit(0);}
process.env.HN_TEST_PLATFORM='linux';
require('./desktop.cjs');
