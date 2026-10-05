module.exports = {
  apps: [
    {
      name: 'horizon-discord-bot',
      script: 'src/index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
