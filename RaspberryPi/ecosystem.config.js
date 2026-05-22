// PM2 ecosystem config for GardenIOT.
//
// Usage on the Pi (one-off setup): run bootstrap.sh. Day-to-day, the
// systemd timer + deploy.sh redeploys this on every push to main.
//
// `cwd: __dirname` so pm2 anchors the working directory to wherever
// this config file sits, regardless of the pm2 user's home dir. The
// rsync in deploy.sh / bootstrap.sh always copies this file alongside
// the built JS, so __dirname == the deploy dir at runtime.

const path = require('path');

const DEPLOY_DIR = __dirname;
// /var/log/gardeniot is created + chowned to the pm2 user by bootstrap.sh.
const LOG_DIR = '/var/log/gardeniot';

module.exports = {
  apps: [{
    name: 'GardenIOT',
    script: 'index.js',
    cwd: DEPLOY_DIR,
    node_args: '--enable-source-maps',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '30s',
    restart_delay: 5000,
    // Give the SIGINT handler 10s to force-close relays + disconnect MQTT
    // cleanly before pm2 sends SIGKILL.
    kill_timeout: 10000,
    error_file: path.join(LOG_DIR, 'error.log'),
    out_file: path.join(LOG_DIR, 'out.log'),
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
