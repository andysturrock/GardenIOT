#!/usr/bin/env bash
#
# One-off setup for GardenIOT on the Pi. Assumes:
#   - The repo has been cloned under the pm2 user's home directory
#     (default: ~pm2/git_repos/GardenIOT). Override via REPO_DIR.
#   - RaspberryPi/.env exists with valid CLIENT_ID, ENDPOINT, CERTFILE,
#     KEYFILE, CAFILE.
#   - pm2 is already installed globally for the pm2 user.
#   - You're running this AS YOUR NORMAL SUDO-CAPABLE USER, not as the
#     pm2 user. The script needs root for /var/log, /etc/systemd/system,
#     systemctl, and to register pm2's own systemd startup unit — the
#     pm2 user typically can't sudo. The script uses sudo -u pm2 for the
#     bits that need to run as pm2 (npm ci, npm run build, pm2 commands).
#
# Idempotent: safe to re-run. Detects whether GardenIOT is already in
# pm2 / pm2 startup unit is installed / systemd timer exists and skips
# accordingly.

set -euo pipefail

PM2_USER="${PM2_USER:-pm2}"

if ! id "$PM2_USER" >/dev/null 2>&1; then
  printf '[bootstrap] ERROR: user %q not found. Set PM2_USER=<your-user>.\n' "$PM2_USER" >&2
  exit 1
fi

CURRENT_USER=$(id -un)
if [[ "$CURRENT_USER" == "$PM2_USER" ]]; then
  cat >&2 <<EOF
[bootstrap] ERROR: don't run this as $PM2_USER. The pm2 user typically
[bootstrap]        can't sudo, and the script needs root for
[bootstrap]        /var/log + /etc/systemd/system + systemctl setup.
[bootstrap]        Switch back to your normal user and re-run:
[bootstrap]          exit
[bootstrap]          $0
EOF
  exit 1
fi

PM2_HOME=$(getent passwd "$PM2_USER" | cut -d: -f6)

REPO_DIR="${REPO_DIR:-$PM2_HOME/git_repos/GardenIOT}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/gardeniot}"
LOG_DIR="${LOG_DIR:-/var/log/gardeniot}"

PI_DIR="$REPO_DIR/RaspberryPi"
ENV_FILE="$PI_DIR/.env"

log()  { printf '[bootstrap] %s\n' "$*"; }
fail() { printf '[bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }

# ---- 0. Preflight -----------------------------------------------------------

if [[ ! -d "$PI_DIR" ]]; then
  printf '[bootstrap] ERROR: %s doesn'\''t exist. Clone the repo first:\n' "$PI_DIR" >&2
  printf '[bootstrap]   sudo -u %s mkdir -p %s\n' "$PM2_USER" "$(dirname "$REPO_DIR")" >&2
  printf '[bootstrap]   sudo -u %s git clone https://github.com/andysturrock/GardenIOT.git %s\n' "$PM2_USER" "$REPO_DIR" >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  fail "sudo not available. This script needs root privileges for systemd + dir setup."
fi

if ! sudo -n true 2>/dev/null; then
  log "Note: this script will prompt for sudo where needed."
fi

# ---- 1. .env sanity check ---------------------------------------------------

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found. Create it before running this script."

# Source it to validate. set -a exports each var to the environment so
# they're visible to the file-existence checks below.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for var in CLIENT_ID ENDPOINT CERTFILE KEYFILE CAFILE; do
  if [[ -z "${!var:-}" ]]; then
    fail "$var is not set in $ENV_FILE"
  fi
done

for f in "$CERTFILE" "$KEYFILE" "$CAFILE"; do
  [[ -r "$f" ]] || fail "Cannot read $f (referenced in $ENV_FILE)"
done

KEY_PERMS=$(stat -c '%a' "$KEYFILE")
if [[ "$KEY_PERMS" != "400" && "$KEY_PERMS" != "600" ]]; then
  log "WARN: $KEYFILE has perms $KEY_PERMS (expected 0400 or 0600). Fix with:"
  log "        sudo chmod 0400 $KEYFILE"
fi

KEY_OWNER=$(stat -c '%U' "$KEYFILE")
if [[ "$KEY_OWNER" != "$PM2_USER" ]]; then
  log "WARN: $KEYFILE is owned by $KEY_OWNER (expected $PM2_USER). Fix with:"
  log "        sudo chown $PM2_USER:$PM2_USER $KEYFILE"
fi

log ".env sanity check OK (CLIENT_ID=$CLIENT_ID, ENDPOINT=$ENDPOINT)"

# ---- 2. Build ---------------------------------------------------------------

log "Building (npm ci + tsc + copy node_modules into dist/)..."
sudo -u "$PM2_USER" bash -c "cd '$PI_DIR' && npm ci --no-audit --no-fund && npm run build"

# ---- 3. Deploy + log dirs ---------------------------------------------------

log "Ensuring $DEPLOY_DIR and $LOG_DIR exist and are owned by $PM2_USER"
sudo mkdir -p "$DEPLOY_DIR" "$LOG_DIR"
sudo chown "$PM2_USER:$PM2_USER" "$DEPLOY_DIR" "$LOG_DIR"

# ---- 4. Sync dist/ + ecosystem.config.js into the deploy dir ----------------

log "rsync dist/ -> $DEPLOY_DIR (with --delete so stale files are pruned)"
sudo -u "$PM2_USER" rsync -a --delete "$PI_DIR/dist/" "$DEPLOY_DIR/"
sudo -u "$PM2_USER" cp "$PI_DIR/ecosystem.config.js" "$DEPLOY_DIR/"

# Stamp the build so we can see what's deployed.
sudo -u "$PM2_USER" bash -c "cd '$PI_DIR' && cat > '$DEPLOY_DIR/version.json' <<EOF
{
  \"git_sha\": \"\$(git rev-parse HEAD)\",
  \"git_branch\": \"\$(git rev-parse --abbrev-ref HEAD)\",
  \"deployed_at\": \"\$(date -Iseconds)\",
  \"bootstrapped\": true
}
EOF"

# ---- 5. pm2: start or reload (idempotent) -----------------------------------

if sudo -u "$PM2_USER" pm2 describe GardenIOT >/dev/null 2>&1; then
  log "GardenIOT already running in pm2 -> reloading"
  sudo -u "$PM2_USER" pm2 reload "$DEPLOY_DIR/ecosystem.config.js" --update-env
else
  log "Starting GardenIOT in pm2"
  sudo -u "$PM2_USER" pm2 start "$DEPLOY_DIR/ecosystem.config.js"
fi

sudo -u "$PM2_USER" pm2 save

# ---- 6. pm2 startup systemd unit (idempotent) -------------------------------

PM2_STARTUP_UNIT="/etc/systemd/system/pm2-${PM2_USER}.service"
if [[ -f "$PM2_STARTUP_UNIT" ]]; then
  log "pm2 startup unit already installed at $PM2_STARTUP_UNIT"
else
  log "Installing pm2 startup unit for $PM2_USER"
  # `pm2 startup` prints a sudo command; capture and run it ourselves
  # so the operator doesn't have to copy-paste.
  STARTUP_CMD=$(sudo -u "$PM2_USER" pm2 startup systemd -u "$PM2_USER" --hp "$PM2_HOME" 2>&1 | grep -E '^sudo ' || true)
  if [[ -n "$STARTUP_CMD" ]]; then
    eval "$STARTUP_CMD"
  else
    log "WARN: pm2 startup didn't print a sudo command; install manually:"
    log "        sudo -u $PM2_USER pm2 startup systemd -u $PM2_USER --hp $PM2_HOME"
  fi
fi

# ---- 7. pm2-logrotate (idempotent — pm2 install reinstalls cleanly) ---------

log "Installing/refreshing pm2-logrotate"
sudo -u "$PM2_USER" pm2 install pm2-logrotate >/dev/null
sudo -u "$PM2_USER" pm2 set pm2-logrotate:max_size 10M
sudo -u "$PM2_USER" pm2 set pm2-logrotate:retain 7

# ---- 8. systemd auto-deploy timer (idempotent) ------------------------------

log "Installing systemd auto-deploy units to /etc/systemd/system/"
sudo cp "$PI_DIR/systemd/gardeniot-deploy.service" /etc/systemd/system/gardeniot-deploy.service
sudo cp "$PI_DIR/systemd/gardeniot-deploy.timer"   /etc/systemd/system/gardeniot-deploy.timer
sudo systemctl daemon-reload
sudo systemctl enable --now gardeniot-deploy.timer

# ---- Done -------------------------------------------------------------------

log ""
log "Bootstrap complete."
log ""
log "Status:"
log "  pm2 list:           sudo -u $PM2_USER pm2 list"
log "  pm2 logs:           sudo -u $PM2_USER pm2 logs GardenIOT --lines 50"
log "  auto-deploy timer:  systemctl status gardeniot-deploy.timer"
log "  auto-deploy log:    journalctl -fu gardeniot-deploy.service"
log "  deployed version:   cat $DEPLOY_DIR/version.json"
