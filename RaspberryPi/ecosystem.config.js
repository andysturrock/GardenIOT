// PM2 ecosystem config for GardenIOT.
//
// Usage on the Pi (one-off setup):
//   pm2 start /opt/pm2_programs/GardenIOT/ecosystem.config.js
//   pm2 save
//   pm2 startup    # follow the printed sudo command
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 10M
//   pm2 set pm2-logrotate:retain 7
//
// On every deploy, deploy.sh runs `pm2 reload ecosystem.config.js --update-env`
// which gracefully restarts the process (SIGINT, wait kill_timeout, SIGKILL),
// giving our SIGINT handler time to close relays + publish offline status.

module.exports = {
  apps: [{
    name: 'GardenIOT',
    // dist/ is rsync'd into cwd by deploy.sh, so index.js lives directly
    // alongside the other compiled files and node_modules/.
    script: 'index.js',
    cwd: '/opt/pm2_programs/GardenIOT',
    node_args: '--enable-source-maps',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '30s',
    restart_delay: 5000,
    // Give the SIGINT handler 10s to force-close relays + disconnect MQTT
    // cleanly before pm2 sends SIGKILL.
    kill_timeout: 10000,
    error_file: '/var/log/gardeniot/error.log',
    out_file: '/var/log/gardeniot/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
