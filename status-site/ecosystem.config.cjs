module.exports = {
  apps: [{
    name: 'hn-status',
    script: '/opt/hn-status/server.js',
    cwd: '/opt/hn-status',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '256M',
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3300', DATA_DIR: '/var/lib/hn-status' }
  }]
};
