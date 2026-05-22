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

Layout (paths shown relative to the pm2 user's home dir — `~` below
refers to whatever `~pm2` is, e.g. `/opt/pm2`):

| What | Where |
|------|-------|
| Git checkout (source) | `~/git_repos/GardenIOT` |
| Deployed artefact (compiled JS + `node_modules` + `ecosystem.config.js`) | `~/GardenIOT` |
| pm2 logs | `/var/log/gardeniot/` |
| Auto-deploy systemd units | `/etc/systemd/system/gardeniot-deploy.{service,timer}` |

### One-off setup

Three manual steps, then [`bootstrap.sh`](bootstrap.sh) handles the rest
(build, pm2 setup, pm2 startup unit, log rotation, systemd auto-deploy
timer). The script is idempotent — safe to re-run if something needs
adjusting.

```bash
# 1. Clone the repo into the pm2 user's home.
sudo -u pm2 git clone https://github.com/andysturrock/GardenIOT.git ~pm2/git_repos/GardenIOT

# 2. Put the .env file at RaspberryPi/.env (it's gitignored, must be
#    created manually). Make sure the cert/key files referenced inside
#    exist and the private key is mode 0400 owned by the pm2 user.
sudo -u pm2 cp /path/to/your.env ~pm2/git_repos/GardenIOT/RaspberryPi/.env

# 3. Run bootstrap. Needs sudo for the systemd + dir setup.
~pm2/git_repos/GardenIOT/RaspberryPi/bootstrap.sh
```

Override the defaults via env vars if your layout differs:
`REPO_DIR`, `DEPLOY_DIR`, `LOG_DIR`, `PM2_USER`. With no overrides,
everything is anchored at the pm2 user's home dir (looked up via
`getent passwd`).

### Day-to-day

Push to `main`. Within ~5 minutes the timer fires, [`deploy.sh`](deploy.sh)
fetches the new commit, builds, rsyncs to `~pm2/GardenIOT/`, and
`pm2 reload`s the process. pm2 sends SIGINT first so the
[`index.ts`](index.ts) shutdown handler has 10 seconds (`kill_timeout`
in [`ecosystem.config.js`](ecosystem.config.js)) to force-close every
relay and publish offline status before pm2 sends SIGKILL.

To see deploys in real time:

```bash
journalctl -fu gardeniot-deploy.service
```

To check what version is currently deployed:

```bash
sudo -u pm2 cat ~pm2/GardenIOT/version.json
sudo -u pm2 pm2 logs GardenIOT --lines 50
```

### Manual deploy (skipping the timer)

```bash
~pm2/git_repos/GardenIOT/RaspberryPi/deploy.sh
```
