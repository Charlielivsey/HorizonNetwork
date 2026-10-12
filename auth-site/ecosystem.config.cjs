module.exports = {
  apps: [{
    name: 'hn-auth',
    script: '/opt/hn-auth/server.js',
    cwd: '/opt/hn-auth',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '256M',
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3400', DATA_DIR: '/var/lib/hn-auth' }
  }]
};
