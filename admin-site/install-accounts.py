#!/usr/bin/env python3
"""Move the one staff-account writer out of Auth, preserving existing staff data."""
import json, subprocess, time, urllib.request, socket
from pathlib import Path
root=Path(__file__).resolve().parent.parent
run=lambda *a:subprocess.run(a,check=True,stdout=subprocess.DEVNULL)
def apps(): return json.loads(subprocess.check_output(['pm2','jlist']))
def healthy():
    for _ in range(40):
        try:
            if urllib.request.urlopen('http://127.0.0.1:3250/healthz',timeout=2).status==200:return
        except Exception: time.sleep(.25)
    raise RuntimeError('Private staff account service failed to start')
base=Path('/var/lib/hn-control');marker=base/'accounts-independent';legacy=base/'accounts-enabled'
current=apps();staff=next(a for a in current if a['name']=='hn-staff-portal');auth=next(a for a in current if a['name']=='hn-auth')
conf=Path('/var/lib/hn-auth/accounts-env.json')
if not conf.exists():
    conf.write_text(json.dumps({'DATA_DIR':staff['pm2_env'].get('DATA_DIR','/var/lib/hn-staff-portal')})+'\n');conf.chmod(0o600)
if marker.exists():
    if staff['pm2_env'].get('pm_exec_path')!='/opt/hn-staff-portal/public-proxy.js':raise RuntimeError('Unexpected public staff process; refusing to risk a second account writer')
    run('pm2','startOrRestart',str(root/'admin-site/accounts.config.cjs'),'--update-env');healthy()
    print('Independent private staff account service refreshed; Auth power state preserved.')
else:
    had_legacy=legacy.exists();previous='hn-auth' if had_legacy else 'hn-staff-portal'
    auth_online=auth['pm2_env']['status']=='online'
    run('pm2','stop',previous)
    for _ in range(40):
        with socket.socket() as s:
            s.settimeout(.2)
            if s.connect_ex(('127.0.0.1',3250))!=0:break
        time.sleep(.25)
    else:raise RuntimeError('Old private account writer is still listening; refusing to launch another')
    try:
        legacy.write_text('1\n');marker.write_text('1\n')
        run('pm2','startOrRestart',str(root/'admin-site/accounts.config.cjs'),'--update-env');healthy()
        if not had_legacy:
            run('pm2','delete','hn-staff-portal')
            run('pm2','start','/opt/hn-staff-portal/public-proxy.js','--name','hn-staff-portal','--update-env')
        if auth_online:
            run('pm2','delete','hn-auth')
            run('pm2','startOrRestart',str(root/'auth-site/ecosystem.config.cjs'),'--update-env')
        print('One private staff account service now runs as hn-accounts; Auth can be stopped independently.')
    except Exception:
        subprocess.run(['pm2','delete','hn-accounts'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        marker.unlink(missing_ok=True)
        if not had_legacy:legacy.unlink(missing_ok=True)
        if had_legacy and auth_online:run('pm2','startOrRestart',str(root/'auth-site/ecosystem.config.cjs'),'--update-env')
        elif not had_legacy:
            subprocess.run(['pm2','delete','hn-staff-portal'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            run('pm2','start','/opt/hn-staff-portal/server.js','--name','hn-staff-portal','--update-env')
        raise
