#!/usr/bin/env python3
"""Move the single staff-account backend under Auth; leave the public staff process stoppable."""
import json,os,subprocess,time,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent.parent
run=lambda *a:subprocess.run(a,check=True,stdout=subprocess.DEVNULL)
apps=json.loads(subprocess.check_output(['pm2','jlist']))
staff=next(a for a in apps if a['name']=='hn-staff-portal')
base=Path('/var/lib/hn-control');first=not (base/'accounts-enabled').exists()
conf=Path('/var/lib/hn-auth/accounts-env.json')
if not conf.exists():
    data={'DATA_DIR':staff['pm2_env'].get('DATA_DIR','/var/lib/hn-staff-portal')}
    conf.write_text(json.dumps(data)+'\n');conf.chmod(0o600)
if first:
    run('pm2','stop','hn-staff-portal')
    (base/'accounts-enabled').write_text('1\n')
    run('pm2','delete','hn-auth')
    run('pm2','startOrRestart',str(root/'auth-site/ecosystem.config.cjs'),'--update-env')
    try:
        for _ in range(30):
            try:
                if urllib.request.urlopen('http://127.0.0.1:3250/healthz',timeout=2).status==200:break
            except Exception:time.sleep(.5)
        else:raise RuntimeError('Private account backend failed to start')
    except Exception:
        # Restore the original one-writer topology if migration fails.
        (base/'accounts-enabled').unlink(missing_ok=True)
        run('pm2','delete','hn-auth')
        run('pm2','startOrRestart',str(root/'auth-site/ecosystem.config.cjs'),'--update-env')
        run('pm2','restart','hn-staff-portal')
        raise
    run('pm2','delete','hn-staff-portal')
    run('pm2','start','/opt/hn-staff-portal/public-proxy.js','--name','hn-staff-portal','--update-env')
    print('Public staff website separated; the private account backend now runs inside Auth.')
else:
    if staff['pm2_env'].get('pm_exec_path')!='/opt/hn-staff-portal/public-proxy.js':
        raise RuntimeError('Unexpected public staff process. Resolve it before installing website control.')
    print('Private Auth account backend already configured.')
