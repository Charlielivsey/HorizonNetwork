'use strict';
// Keeps HN Group Auth's Discord bot online (the user's request, 28 October 2026: "need to start the bot"). The bot
// uses this gateway connection for approved rotating activities and Do Not Disturb presence.
// It uses only the non-privileged Guild Moderation intent to receive audit events; it does not read chat messages.
//
// No dependencies: a small WebSocket client over TLS (Node 20 has no built-in WebSocket), heartbeats, and
// reconnecting with a growing delay when Discord closes the connection.
const tls = require('node:tls');
const crypto = require('node:crypto');

const GATEWAY = { host: 'gateway.discord.gg', path: '/?v=10&encoding=json' };
const ROTATING_ACTIVITIES = [
  {name:'over Horizon Network',type:3},
  {name:'your HN accounts',type:3},
  {name:'a part in keeping HN connected',type:0},
  {name:'the leadership team',type:2},
  {name:'for your next command',type:3},
  {name:'nicely with server permissions',type:0}
];
const FATAL = new Set([4004, 4010, 4011, 4012, 4013, 4014]); // bad token, sharding, bad intents: don't retry

// A minimal WebSocket client: text frames, ping/pong, close, fragmented messages.
function connect({ host, path, port, tlsOptions }, { onOpen, onMessage, onClose }) {
  const socket = tls.connect({ host, port: port || 443, servername: host, ALPNProtocols: ['http/1.1'], ...(tlsOptions || {}) });
  const key = crypto.randomBytes(16).toString('base64');
  let buffer = Buffer.alloc(0), open = false, parts = [], closed = false;
  const finish = (code) => { if (closed) return; closed = true; socket.destroy(); onClose(code); };
  socket.setTimeout(90000, () => finish(4900));
  socket.on('secureConnect', () => {
    socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nUser-Agent: HN-Group-Auth (https://auth.hngroup.org.uk, 1.0)\r\n\r\n`);
  });
  socket.on('error', () => finish(4901));
  socket.on('close', () => finish(4902));
  function frame(op, payload) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
    const mask = crypto.randomBytes(4), len = data.length;
    const head = len < 126 ? Buffer.from([0x80 | op, 0x80 | len]) : len < 65536 ? Buffer.from([0x80 | op, 0xfe, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x80 | op, 0xff]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b; })()]);
    const body = Buffer.alloc(len); for (let i = 0; i < len; i++) body[i] = data[i] ^ mask[i & 3];
    if (!socket.destroyed) socket.write(Buffer.concat([head, mask, body]));
  }
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!open) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const head = buffer.slice(0, end).toString();
      const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      if (!/^HTTP\/1\.1 101/.test(head) || !head.toLowerCase().includes('sec-websocket-accept: ' + accept.toLowerCase())) return finish(4903);
      open = true; buffer = buffer.slice(end + 4); onOpen();
    }
    while (buffer.length >= 2) {
      const fin = buffer[0] & 0x80, op = buffer[0] & 0x0f;
      let len = buffer[1] & 0x7f, offset = 2;
      if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (len > 16 * 1024 * 1024) return finish(4904);
      if (buffer.length < offset + len) return;
      const payload = buffer.slice(offset, offset + len);
      buffer = buffer.slice(offset + len);
      if (op === 0x8) return finish(payload.length >= 2 ? payload.readUInt16BE(0) : 1005);
      if (op === 0x9) { frame(0xa, payload); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        parts.push(payload);
        if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; onMessage(text); }
      }
    }
  });
  return { send: (text) => frame(0x1, text), close: () => { frame(0x8, Buffer.from([0x03, 0xe8])); setTimeout(() => finish(1000), 500).unref(); } };
}

// Keeps the bot online for as long as `token()` returns a token (checked every minute, so adding or changing the
// token in discord.json takes effect without a restart).
function startPresence(token, { log = console, gateway = GATEWAY, settings = () => ({enabled:true,status:'dnd',activityRotation:true}), transport = connect, onInteraction = () => {}, onAuditLog = () => {}, onMemberAdd = () => {}, onGuildData = () => {}, onMemberRemove = () => {}, onReady = () => {}, onAction = () => {} } = {}) {
  let rotation=null,activityIndex=0;
  let ws=null,heartbeat=null,timer=null,current=null,fatal=null,generation=0,stopped=false,retry=0,seq=null,acked=true,sentAt=0;
  const state={phase:'offline',connectedAt:null,lastAck:null,latency:null,username:null,userId:null,reconnects:0,closeCode:null};
  const presenceData=()=>{const s=settings();return{status:s.status||'dnd',afk:false,since:null,activities:s.activityRotation!==false?[{...ROTATING_ACTIVITIES[activityIndex]}]:s.activity?[{name:s.activity,type:s.activityType??3}]:[]};};
  const audit=(action,details)=>{try{onAction(action,details);}catch{}};
  function transmit(payload){if(!ws)return;ws.send(JSON.stringify(payload));audit('gateway.send',{opcode:payload.op,...(payload.op===2?{presence:payload.d.presence}:payload.op===3?{presence:payload.d}:{})});}
  function disconnect(){clearInterval(rotation);rotation=null;generation++;clearInterval(heartbeat);clearTimeout(timer);heartbeat=timer=null;const old=ws;ws=null;if(old){old.close();audit('gateway.disconnect',{});}state.connectedAt=null;}
  function schedule(delay){if(stopped||!settings().enabled||!token())return;state.phase='reconnecting';state.reconnects++;audit('gateway.reconnect',{attempt:state.reconnects});clearTimeout(timer);timer=setTimeout(()=>{timer=null;check();},delay||Math.min(300000,2000*2**Math.min(retry++,8)));timer.unref();}
  function start(t){disconnect();current=t;acked=true;seq=null;state.phase='connecting';audit('gateway.connect',{});const epoch=generation;
    ws=transport(gateway,{onOpen(){},onMessage(text){if(epoch!==generation)return;let msg;try{msg=JSON.parse(text);}catch{return;}if(msg.s!=null)seq=msg.s;audit('gateway.receive',{opcode:msg.op,event:msg.t||null,guild:msg.d?.guild_id||null});
      if(msg.op===10){const every=Math.max(5000,Number(msg.d?.heartbeat_interval)||41250);clearInterval(heartbeat);heartbeat=setInterval(()=>{if(!acked){disconnect();schedule();return;}acked=false;sentAt=Date.now();transmit({op:1,d:seq});},every);heartbeat.unref();transmit({op:2,d:{token:t,intents:settings().guildMemberEvents?7:4,properties:{os:'linux',browser:'hn-group-auth',device:'hn-group-auth'},presence:presenceData()}});}
      else if(msg.op===11){acked=true;state.lastAck=new Date().toISOString();state.latency=sentAt?Date.now()-sentAt:null;}
      else if(msg.op===1)transmit({op:1,d:seq});
      else if(msg.op===0&&msg.t==='READY'){retry=0;state.phase='online';state.connectedAt=new Date().toISOString();state.username=msg.d?.user?.username||null;state.userId=msg.d?.user?.id||null;state.closeCode=null;clearInterval(rotation);rotation=setInterval(()=>{if(ws&&state.phase==='online'&&settings().activityRotation!==false){activityIndex=(activityIndex+1)%ROTATING_ACTIVITIES.length;transmit({op:3,d:presenceData()});}},30000);rotation.unref();log.log('Discord bot connected.');Promise.resolve().then(onReady).catch(()=>{});}
      else if(msg.op===0&&msg.t==='INTERACTION_CREATE')Promise.resolve(onInteraction(msg.d)).catch(()=>log.log('Discord command response failed.'));
      else if(msg.op===0&&msg.t==='GUILD_MEMBER_ADD')Promise.resolve(onMemberAdd(msg.d)).catch(()=>log.log('Member welcome delivery deferred.'));
      else if(msg.op===0&&msg.t==='GUILD_CREATE')Promise.resolve(onGuildData(msg.d)).catch(()=>{});
      else if(msg.op===0&&msg.t==='GUILD_MEMBER_REMOVE')Promise.resolve(onMemberRemove(msg.d)).catch(()=>{});
      else if(msg.op===0&&msg.t==='GUILD_AUDIT_LOG_ENTRY_CREATE')Promise.resolve(onAuditLog(msg.d)).catch(()=>log.log('Discord moderation log failed.'));
      else if(msg.op===7||msg.op===9){disconnect();schedule(msg.op===9?5000:1000);}
    },onClose(code){if(epoch!==generation)return;audit('gateway.closed',{code});clearInterval(heartbeat);clearInterval(rotation);rotation=null;heartbeat=null;ws=null;state.connectedAt=null;state.closeCode=code;if(stopped)return;if(FATAL.has(code)){fatal=current;state.phase='error';log.log('Discord bot connection refused (code '+code+').');return;}schedule();}});
  }
  function check(){if(stopped)return;const t=token();if(!settings().enabled||!t){disconnect();current=null;state.phase=!t?'not-configured':'offline';return;}if(t===fatal)return;if(t!==current||(!ws&&!timer)){fatal=null;start(t);}}
  check();const watcher=setInterval(check,60000);watcher.unref();
  return{check,snapshot:()=>({...state}),apply(){check();if(ws&&state.phase==='online')transmit({op:3,d:presenceData()});},restart(){disconnect();fatal=null;current=null;retry=0;check();},stop(){stopped=true;clearInterval(watcher);if(ws&&state.phase==='online')transmit({op:3,d:{status:'invisible',afk:false,since:null,activities:[]}});disconnect();state.phase='offline';}};
}

module.exports = { startPresence, connect, ROTATING_ACTIVITIES };
