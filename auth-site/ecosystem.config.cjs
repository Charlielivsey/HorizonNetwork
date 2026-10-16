module.exports = {
  apps: [{
    name: 'hn-auth',
    script: require('node:fs').existsSync('/var/lib/hn-control/accounts-enabled') ? '/opt/hn-auth/supervisor.js' : '/opt/hn-auth/server.js',
    cwd: '/opt/hn-auth',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '256M',
    kill_timeout: 10000,
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3400', DATA_DIR: '/var/lib/hn-auth', STAFF_PORTAL_BACKEND: require('node:fs').existsSync('/var/lib/hn-control/accounts-enabled') ? 'http://127.0.0.1:3250' : 'http://127.0.0.1:3200' }
  }]
};
