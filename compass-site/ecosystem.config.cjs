module.exports = {
  apps: [{
    name: 'hn-compass',
    script: '/opt/hn-compass/server.js',
    cwd: '/opt/hn-compass',
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: 5690 },
    max_memory_restart: '200M'
  }]
};
