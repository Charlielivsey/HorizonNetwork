'use strict';
window.HNVpnScreen=Object.freeze({create(context){const{action,$,icon,togglePanel}=context;
// ---------- HN VPN ----------
// One next step at a time: unlock, sign in to the VPN, install WireGuard, set up this computer, connect.
function renderVPN(state){
 const v=state.vpn||{supported:false},busy=v.busy,unlocked=!!state.user;
 const status=!v.supported?'Not available on this computer':v.connected?'Connected':v.ready?'Not connected':v.signedIn?'Not set up yet':'Not signed in';$('menu-vpn-status').textContent=status;$('settings-vpn-status').textContent='HN VPN · '+status;
 $('vpn-hero').dataset.state=v.connected?'on':v.ready?'off':'setup';
 $('vpn-title').textContent=busy==='connecting'?'Connecting…':busy==='disconnecting'?'Disconnecting…':v.connected?'Connected':v.ready?'Not connected':'Set up the HN VPN';
 $('vpn-subtitle').textContent=v.error?v.error:v.connected?'All of this computer’s traffic is going through HN Group’s private VPN.':v.ready?'Turn it on to send all of your traffic privately through HN Group’s server.':'A private, encrypted connection for all of this computer’s traffic, through HN Group’s server.';
 $('vpn-tag').textContent=v.connected?'PROTECTED':'PRIVATE CONNECTION';
 $('vpn-chip').hidden=!v.connected;$('vpn-chip').textContent=v.reachable===true?'Server reachable · '+v.server:v.reachable===false?'Server not answering yet · '+v.server:'Checking the server…';$('vpn-chip').dataset.good=String(v.reachable===true);
 const power=$('vpn-power');power.disabled=!v.ready||!!busy||(!v.connected&&!unlocked);power.setAttribute('aria-pressed',String(!!v.connected));power.setAttribute('aria-label',v.connected?'Disconnect the HN VPN':'Connect the HN VPN');power.classList.toggle('busy',busy==='connecting'||busy==='disconnecting');
 let step=null;
 if(!v.supported)step=[0,'Not available here','The HN VPN can be used from HN Browser on a Mac, a Windows PC or Linux.',null];
 else if(!unlocked)step=[1,state.locked?'Unlock your HN account':'Sign in to HN Browser','Your HN account keeps the VPN yours. '+(state.locked?'Enter your PIN to carry on.':'Sign in with your HN Group account.'),['account','Open your HN account']];
 else if(!v.signedIn)step=v.signingIn?[2,'Finish signing in','HN Group Auth is open in a new tab. Enter your PIN there and this updates by itself.',['vpn-sign-in','Open the sign-in tab again']]:[2,'Sign in to the HN VPN','Opens HN Group Auth in a tab. As your browser account is unlocked, you’ll only need your PIN.',['vpn-sign-in','Sign in to the HN VPN']];
 else if(!v.ready&&!v.tools)step=[3,'Install '+v.toolsName,state.platform==='darwin'?'The VPN uses WireGuard. This opens Terminal and installs it with Homebrew. Come back when it finishes.':state.platform==='linux'?'The VPN uses NetworkManager’s built-in WireGuard, which Bazzite and Fedora include. Install NetworkManager, then come back.':'The VPN uses WireGuard. Download and install WireGuard for Windows, then come back.',['vpn-tools','Install '+v.toolsName],['vpn-refresh','I’ve installed it']];
 else if(v.outdated)step=[4,'Update this computer’s VPN','HN VPN now sends all of your internet traffic through HN Group’s server. Update this computer’s connection to switch over. '+(state.platform==='darwin'?'macOS asks for your Mac password once.':state.platform==='linux'?'Your computer may ask for your password once.':'Windows asks for permission once.'),['vpn-setup',busy==='setting-up'?'Updating…':'Update the VPN']];
 else if(!v.ready)step=[4,'Set up this computer','Registers this computer with a key made on it. '+(state.platform==='darwin'?'macOS asks for your Mac password once.':state.platform==='linux'?'Your computer may ask for your password once.':'Windows asks for permission once.'),['vpn-setup',busy==='setting-up'?'Setting up…':'Set up this computer']];
 $('vpn-step').hidden=!step;
 if(step){$('vpn-step-number').textContent=step[0]?String(step[0]):'!';$('vpn-step-title').textContent=step[1];$('vpn-step-text').textContent=step[2];const b=$('vpn-step-button');b.hidden=!step[3];if(step[3]){b.dataset.vpnAction=step[3][0];b.textContent=step[3][1];b.disabled=!!busy;}const second=$('vpn-step-secondary');second.hidden=!step[4];if(step[4]){second.dataset.vpnAction=step[4][0];second.textContent=step[4][1];}}
 $('vpn-ip').textContent=v.publicIp||'Not connected';$('vpn-route').textContent=v.viaVpn===true?'Verified · traffic through HN VPN':v.connected?'Checking public route…':'Full tunnel · all traffic';$('vpn-handshake').textContent=v.lastHandshake?new Date(v.lastHandshake).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Not yet';$('vpn-reach').textContent=v.reachable===true?'HN server reachable':v.reachable===false?'Check UDP 51820 and VPN connection':'Server not checked';
 $('vpn-device').textContent=v.device?v.device.name+' · '+v.device.address:v.shared?'Set up by Secure Network':'Not set up';$('vpn-user').textContent=v.user?v.user.displayName:'Not signed in';$('vpn-server').textContent=v.server||'10.88.0.1';
 $('vpn-sign-out').hidden=!v.signedIn;$('vpn-remove').hidden=!v.ready;$('vpn-manage').disabled=!v.supported&&!v.signedIn;
}
function vpnStep(button){const kind=button.dataset.vpnAction;if(kind==='account')action('panel','account');else action(kind);}
$('vpn-step-button').onclick=()=>vpnStep($('vpn-step-button'));$('vpn-step-secondary').onclick=()=>vpnStep($('vpn-step-secondary'));
$('vpn-power').onclick=()=>action('vpn-toggle');$('vpn-manage').onclick=$('settings-vpn-manage').onclick=()=>action('vpn-manage');$('vpn-sign-out').onclick=()=>action('vpn-sign-out');$('vpn-remove').onclick=()=>action('vpn-remove');


return{render:renderVPN};}});
