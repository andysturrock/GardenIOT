# GardenIOT — Raspberry Pi side

Node.js process that runs on the Pi, controls four GPIO relays via the
[SB Components PiRelay V2](https://github.com/sbcshop/PiRelay-V2) board,
and syncs state with AWS IoT Core via MQTT Thing Shadows.

## Layout

```
.
├── index.ts              # main loop: connect, init relays, schedule watering, heartbeat, signal handling
├── aws-connection.ts     # MQTT connection wrapper, LWT, online/offline status, lifecycle events
├── shadow-relay.ts       # Relay + AWS IoT Thing Shadow sync (desired/reported/delta) + safety timeout
├── relay.ts              # bare GPIO relay wrapper (active-HIGH, BOARD pin numbering 35/33/31/29)
├── watering-job.ts       # scheduled open-then-close cycle for a set of relays
├── watering-plan.ts      # collection of watering jobs (persistence is half-built — TODO)
├── mqtt-logger.ts        # tslog logger that ships INFO+ to an MQTT topic
├── utils/getenv.ts       # .env loader
├── __tests__/            # jest tests + mock-gpio + jest-setup
├── ecosystem.config.js   # pm2 process definition
├── deploy.sh             # pull-based deploy script
└── systemd/              # gardeniot-deploy.{service,timer} for auto-deploy
```

## Env vars (.env at this directory)

| Var | Example | Notes |
|-----|---------|-------|
| `CLIENT_ID` | `raspberrypi-1` | Used as the IoT Thing name and the MQTT client id |
| `ENDPOINT` | `xxxxxx-ats.iot.eu-west-1.amazonaws.com` | AWS IoT endpoint |
| `CERTFILE` | `/etc/gardeniot/cert.pem.crt` | Device certificate (rotated separately via AWS IoT console) |
| `KEYFILE` | `/etc/gardeniot/private.pem.key` | Private key (one-shot download — back it up) |
| `CAFILE` | `/etc/gardeniot/AmazonRootCA1.pem` | Amazon root CA |
| `MOCK_GPIO` | `1` | Optional; set in test/dev to avoid loading `rpi-gpio` native binding |

## MQTT topics published

| Topic | Retained | Use |
|-------|----------|-----|
| `${CLIENT_ID}/status` | yes | `{online:true,timestamp,uptime_seconds}` every 60s; `{online:false}` on shutdown (graceful via `publishOffline`, ungraceful via LWT) |
| `${CLIENT_ID}/logging` | no | Logger output (everything INFO+) |
| `$aws/things/${CLIENT_ID}/shadow/name/RELAY${1..4}/update` | no | Reported/desired shadow updates |

## Local development

```bash
npm ci --ignore-scripts        # native rpi-gpio build is skipped on non-Pi
MOCK_GPIO=1 npm test           # jest, with mock GPIO
MOCK_GPIO=1 npm run start:dev  # ts-node, requires a .env
```

## Deploying to the Pi

### One-off setup

```bash
# 1. Clone the repo somewhere the pm2 user can read+write.
sudo -u pm2 git clone https://github.com/andysturrock/GardenIOT.git ~pm2/git_repos/GardenIOT

# 2. Put the .env file at RaspberryPi/.env (it's gitignored, must be created manually).
sudo -u pm2 cp /path/to/your.env ~pm2/git_repos/GardenIOT/RaspberryPi/.env

# 3. Build once + start pm2 + register at boot.
sudo -u pm2 bash -c 'cd ~/git_repos/GardenIOT/RaspberryPi && npm ci && npm run build'
sudo mkdir -p /opt/pm2_programs/GardenIOT /var/log/gardeniot
sudo chown pm2:pm2 /opt/pm2_programs/GardenIOT /var/log/gardeniot
sudo -u pm2 rsync -a --delete ~pm2/git_repos/GardenIOT/RaspberryPi/dist/ /opt/pm2_programs/GardenIOT/
sudo -u pm2 cp ~pm2/git_repos/GardenIOT/RaspberryPi/ecosystem.config.js /opt/pm2_programs/GardenIOT/

sudo -u pm2 pm2 start /opt/pm2_programs/GardenIOT/ecosystem.config.js
sudo -u pm2 pm2 save
sudo -u pm2 pm2 startup   # follow the printed sudo command

# 4. Install log rotation so the SD card doesn't fill up.
sudo -u pm2 pm2 install pm2-logrotate
sudo -u pm2 pm2 set pm2-logrotate:max_size 10M
sudo -u pm2 pm2 set pm2-logrotate:retain 7

# 5. Install the systemd timer that pulls + redeploys every 5 mins.
sudo cp ~pm2/git_repos/GardenIOT/RaspberryPi/systemd/gardeniot-deploy.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gardeniot-deploy.timer
```

### Day-to-day

Push to `main`. Within ~5 minutes the timer fires, [`deploy.sh`](deploy.sh)
fetches the new commit, builds, rsyncs to `/opt/pm2_programs/GardenIOT/`,
and `pm2 reload`s the process. pm2 sends SIGINT first so the
[`index.ts`](index.ts) shutdown handler has 10 seconds (`kill_timeout` in
[`ecosystem.config.js`](ecosystem.config.js)) to force-close every relay
and publish offline status before pm2 sends SIGKILL.

To see deploys in real time:

```bash
journalctl -fu gardeniot-deploy.service
```

To check what version is currently deployed:

```bash
cat /opt/pm2_programs/GardenIOT/version.json
pm2 logs GardenIOT --lines 50
```

### Manual deploy (skipping the timer)

```bash
~/git_repos/GardenIOT/RaspberryPi/deploy.sh
```
