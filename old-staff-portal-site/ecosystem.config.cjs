// The staff portal as it was just before sign-in moved to HN Group Auth (13 October 2026, commit 68caec7), run on its own: its own port, data folder and PM2 name, so it
// shares nothing with the real staff portal.
module.exports={apps:[{name:'hn-old-staff-portal',script:'/opt/hn-old-staff-portal/server.js',cwd:'/opt/hn-old-staff-portal',instances:1,exec_mode:'fork',autorestart:true,max_memory_restart:'256M',env:{NODE_ENV:'production',HOST:'127.0.0.1',PORT:'5640',DATA_DIR:'/var/lib/hn-old-staff-portal',STATUS_SSO_SECRET_FILE:'/var/lib/hn-old-staff-portal/no-status-sso-secret'}}]};
