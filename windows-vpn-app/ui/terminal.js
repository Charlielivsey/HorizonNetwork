'use strict';
// The SSH terminal inside HN Secure Network (pinned xterm in ui/vendor). Output arrives from the main
// process in base64 chunks and each chunk is acknowledged once drawn. Terminals live in one dock element
// that the SSH page re-attaches whenever it redraws, so sessions survive page changes.
(()=>{
 const api=window.secureNetwork,terms=new Map(),pending=new Map(),dock=document.createElement('div');dock.className='term-dock';let active=null;
 const theme={background:'#0D0B1F',foreground:'#ECEBF4',cursor:'#C9B4FF',cursorAccent:'#0D0B1F',selectionBackground:'#3A2E6E',black:'#0D0B1F',red:'#ED7199',green:'#8BCBA2',yellow:'#E3D77F',blue:'#A29BF3',magenta:'#DC9CDC',cyan:'#78D4CA',white:'#ECEBF4',brightBlack:'#8A86A8',brightWhite:'#FFFFFF'};
 function write(event){const entry=terms.get(event.id);if(!entry){const list=pending.get(event.id)||[];list.push(event);pending.set(event.id,list);return;}
  entry.term.write(Uint8Array.from(atob(event.data),c=>c.charCodeAt(0)),()=>api.terminalAck(event.id,event.bytes));}
 api.terminalData(write);
 function create(session){
  const host=document.createElement('div');host.className='term-host';dock.append(host);
  const term=new Terminal({fontFamily:'Cascadia Mono, Consolas, ui-monospace, Menlo, monospace',fontSize:13,lineHeight:1.2,scrollback:5000,cursorBlink:true,theme,allowProposedApi:false});
  const fit=new FitAddon.FitAddon();term.loadAddon(fit);term.open(host);
  term.onData(data=>api.action('ssh-input',{id:session.id,data}));
  // Ctrl+Shift+C copies and Ctrl+Shift+V pastes, like Windows Terminal.
  term.attachCustomKeyEventHandler(e=>{if(e.type!=='keydown'||!e.ctrlKey||!e.shiftKey)return true;const k=e.key.toLowerCase();if(k==='c'){copy();return false;}if(k==='v'){paste();return false;}return true;});
  const entry={term,fit,host,status:session.status};terms.set(session.id,entry);
  for(const event of pending.get(session.id)||[])write(event);pending.delete(session.id);return entry;}
 function fit(){const entry=terms.get(active);if(!entry||!dock.isConnected||entry.host.clientWidth<40||entry.host.clientHeight<40)return;try{entry.fit.fit();api.action('ssh-resize',{id:active,cols:entry.term.cols,rows:entry.term.rows});}catch{}}
 // Matches the terminals to the sessions the main process reports.
 function sync(ssh){const live=new Set(ssh.sessions.map(s=>s.id));
  for(const[id,entry]of terms)if(!live.has(id)){entry.term.dispose();entry.host.remove();terms.delete(id);pending.delete(id);}
  for(const s of ssh.sessions){const entry=terms.get(s.id)||create(s);if(entry.status!==s.status&&['error','closed'].includes(s.status))entry.term.writeln('\r\n\x1b[33m'+(s.error||'The session ended.')+'\x1b[0m');entry.status=s.status;}
  if(active&&!live.has(active))active=null;if(!active&&ssh.sessions.length)active=ssh.sessions.at(-1).id;
  for(const[id,entry]of terms)entry.host.hidden=id!==active;}
 function select(id){if(!terms.has(id))return;active=id;for(const[key,entry]of terms)entry.host.hidden=key!==id;requestAnimationFrame(()=>{fit();terms.get(id)?.term.focus();});}
 function copy(){const text=terms.get(active)?.term.getSelection();if(text)api.action('ssh-copy',text);}
 async function paste(){const id=active;if(!id)return;const r=await api.action('ssh-paste');if(typeof r?.result==='string'&&r.result)api.action('ssh-input',{id,data:r.result});}
 new ResizeObserver(()=>requestAnimationFrame(fit)).observe(dock);
 window.SNTerminal=Object.freeze({dock,sync,select,fit,copy,paste,focus:()=>terms.get(active)?.term.focus(),get active(){return active;}});
})();
