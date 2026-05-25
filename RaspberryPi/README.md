# GardenIOT — Raspberry Pi side

Node.js process that runs on the Pi, controls four GPIO relays via the
[SB Components PiRelay V2](https://github.com/sbcshop/PiRelay-V2) board,
and syncs state with AWS IoT Core via MQTT Thing Shadows.

## Layout

```
.
├── index.ts                       # main loop: connect, init relays, schedule watering, heartbeat, signal handling
├── aws-connection.ts              # MQTT connection wrapper, LWT, online/offline status, lifecycle events
├── shadow-relay.ts                # Relay + AWS IoT Thing Shadow sync (desired/reported/delta) + bed-name resolver + watchdog
├── relay.ts                       # bare GPIO relay wrapper (active-HIGH, BOARD pin numbering 35/33/31/29)
├── watering-job.ts                # scheduled open-then-close cycle for a set of relays
├── watering-plan.ts               # collection of watering jobs, rebuilt from each config-shadow apply
├── config-shadow.ts               # `config` Thing Shadow: bed names + watering schedule + Schedule-updated user log
├── mqtt-logger.ts                 # tslog logger; publishes structured LogRecord JSON to the logging topic
├── serialization/garden-config.ts # GardenConfig schema (shared shape between Pi and app)
├── serialization/log-record.ts    # LogRecord schema with user/technical category tag
├── utils/getenv.ts                # .env loader
├── __tests__/                     # vitest tests + mock-gpio + setup
├── ecosystem.config.js            # pm2 process definition
├── deploy.sh                      # pull-based deploy script
└── systemd/                       # gardeniot-deploy.{service,timer} for auto-deploy
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
| `${CLIENT_ID}/logging` | no | Structured [`LogRecord`](serialization/log-record.ts) JSON (INFO+). Each record is tagged `category: "user"` (Watering started/stopped, Schedule updated, online/offline) or `category: "technical"` (everything else). Both are tee'd to CloudWatch; user-category records are also archived to DynamoDB for 90 days for the app's Logs tab |
| `$aws/things/${CLIENT_ID}/shadow/name/RELAY${1..4}/update` | no | Per-relay reported/desired/delta. `ShadowRelay.onActualStateChange` emits the per-bed Watering started/stopped user log lines from this path |
| `$aws/things/${CLIENT_ID}/shadow/name/config/update` | no | [`GardenConfig`](serialization/garden-config.ts) — bed names + watering schedule. The app writes `desired`, the Pi reflects `reported` once applied |

## Local development

```bash
npm ci --ignore-scripts        # native rpi-gpio build is skipped on non-Pi
MOCK_GPIO=1 npm test           # jest, with mock GPIO
MOCK_GPIO=1 npm run start:dev  # ts-node, requires a .env
```

## Deploying to the Pi

Layout:

| What | Where | Owner |
|------|-------|-------|
| Git checkout (source) | `~pm2/git_repos/GardenIOT` | pm2 |
| Deployed artefact (compiled JS + `node_modules` + `ecosystem.config.js`) | `/opt/gardeniot/` | pm2 |
| pm2 logs | `/var/log/gardeniot/` | pm2 |
| Auto-deploy systemd units | `/etc/systemd/system/gardeniot-deploy.{service,timer}` | root |

The repo lives under pm2's home (not the operator's home) because the
auto-deploy systemd timer runs as `User=pm2` — pm2 needs write access
to the checkout to `git pull`. The bootstrap is run by the operator
(see below).

### One-off setup

Three manual steps, then [`bootstrap.sh`](bootstrap.sh) handles the rest
(build, pm2 setup, pm2 startup unit, log rotation, systemd auto-deploy
timer). The script is idempotent — safe to re-run if something needs
adjusting.

Run all three steps as your normal (sudo-capable) account, NOT as the
pm2 user — bootstrap.sh needs sudo for the `/var/log` and
`/etc/systemd/system` setup, and the pm2 user usually can't sudo.

```bash
# 1. Clone the repo into the pm2 user's home. The git_repos parent dir
#    has to exist first — git clone won't mkdir -p for you.
sudo -u pm2 mkdir -p ~pm2/git_repos
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
fetches the new commit, builds, rsyncs to `/opt/gardeniot/`, and
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
cat /opt/gardeniot/version.json
sudo -u pm2 pm2 logs GardenIOT --lines 50
```

### Manual deploy (skipping the timer)

Either of these works:

```bash
# As your operator account — runs the same idempotent setup as the
# initial bootstrap, but the setup bits are no-ops if nothing has
# changed since last time. Use this when you've also tweaked
# ecosystem.config.js / the systemd units and want to be sure the
# installed copies are refreshed.
~pm2/git_repos/GardenIOT/RaspberryPi/bootstrap.sh

# As the pm2 user — just the deploy (git pull / build / rsync /
# pm2 reload), no systemd / logrotate / startup-unit reverification.
# Faster; mirrors what the auto-deploy timer does.
sudo -u pm2 ~pm2/git_repos/GardenIOT/RaspberryPi/deploy.sh
```

### Talking to pm2 from the operator account

The pm2 daemon lives at `$PM2_HOME/.pm2` (e.g. `/opt/pm2/.pm2`) and is
started by the `pm2-pm2.service` systemd unit. Any `pm2` invocation
that doesn't reach the same `PM2_HOME` will silently spawn a *second*
daemon, and the two will fight over the AWS IoT client ID — you'll see
`MQTT_NOT_CONNECTED` errors in the logs.

Three ways to invoke pm2 safely (bootstrap wires up all three):

```bash
sudo -iu pm2 pm2 list          # login shell — sources ~pm2/.bashrc which sets PM2_HOME
sudo -Hu pm2 pm2 list          # HOME=/opt/pm2 -> pm2 default $HOME/.pm2 = same path
sudo -u  pm2 pm2 list          # sudoers env_keep propagates PM2_HOME if you've exported it
```

What to **avoid**: `sudo -u pm2 pm2 list` from a shell where you haven't
exported `PM2_HOME` yourself. Without `-H` or `-i`, sudo keeps your
HOME, pm2 looks at `/home/<you>/.pm2`, finds nothing, and starts a new
daemon there. To check for stray daemons:

```bash
ps -ef | grep -E 'PM2.*God Daemon' | grep -v grep   # should be exactly one line
```
