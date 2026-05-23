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
#     pm2 user typically can't sudo. The script uses `sudo -Hu pm2` for
#     the bits that need to run as pm2 (npm ci, npm run build, pm2
#     commands). The capital -H is important: it sets HOME to pm2's
#     /etc/passwd entry, so `pm2 list` etc. reach the same daemon that
#     systemd `User=pm2` units reach. Without -H, sudo inherits the
#     invoking user's HOME and pm2 spawns a second daemon under
#     /home/<you>/.pm2.
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

# ---- 1.5. pm2 user environment ---------------------------------------------
#
# Make sure every entry path to the pm2 user lands at the same PM2_HOME
# as the pm2-${PM2_USER}.service systemd unit. Otherwise a stray
# invocation can spawn a second daemon (e.g. `sudo -u pm2 pm2 list`
# without -H inherits the caller's HOME and lands at /home/<you>/.pm2)
# and the two daemons fight for the same CLIENT_ID on AWS IoT.
#
# Three layers:
#   .bashrc/.profile/.bash_profile        -> interactive shells (sudo -iu pm2, su - pm2)
#   /etc/sudoers.d/pm2-env (env_keep)     -> non-interactive sudo -u pm2 ...
#   `sudo -Hu pm2`                        -> already used by this script; HOME=/opt/pm2
#                                            resolves $HOME/.pm2 to the same path

PM2_DATA_DIR="${PM2_HOME%/}/.pm2"

log "Ensuring pm2 user's shell init files export PM2_HOME=$PM2_DATA_DIR"
for f in .bashrc .profile .bash_profile; do
  path="$PM2_HOME/$f"
  sudo -u "$PM2_USER" touch "$path"
  existing=$(sudo grep -E '^[[:space:]]*export[[:space:]]+PM2_HOME=' "$path" 2>/dev/null || true)
  if [[ -z "$existing" ]]; then
    sudo tee -a "$path" >/dev/null <<EOF

# GardenIOT bootstrap: keep PM2_HOME aligned with pm2-$PM2_USER.service.
export PM2_HOME=$PM2_DATA_DIR
EOF
  elif ! grep -q "PM2_HOME=$PM2_DATA_DIR" <<<"$existing"; then
    log "WARN: $path already exports PM2_HOME but not to $PM2_DATA_DIR:"
    log "        $existing"
    log "      Fix this manually or pm2 commands will hit the wrong daemon."
  fi
done

SUDOERS_DROPIN="/etc/sudoers.d/pm2-env"
if [[ ! -f "$SUDOERS_DROPIN" ]]; then
  log "Installing sudoers drop-in at $SUDOERS_DROPIN"
  # Write to a temp file and visudo-check before moving into place, so a
  # syntax error never lands a broken file under /etc/sudoers.d/.
  TMP_SUDOERS=$(sudo mktemp)
  sudo tee "$TMP_SUDOERS" >/dev/null <<EOF
# GardenIOT bootstrap: let PM2_HOME propagate when running commands as
# $PM2_USER, so 'sudo -u $PM2_USER pm2 ...' reaches the same daemon as
# the pm2-$PM2_USER.service systemd unit.
Defaults>$PM2_USER env_keep += "PM2_HOME"
EOF
  sudo chmod 0440 "$TMP_SUDOERS"
  if sudo visudo -cf "$TMP_SUDOERS" >/dev/null; then
    sudo mv "$TMP_SUDOERS" "$SUDOERS_DROPIN"
  else
    sudo rm -f "$TMP_SUDOERS"
    fail "sudoers drop-in failed visudo check; not installed."
  fi
fi

# ---- 2. Build ---------------------------------------------------------------

log "Building (npm ci + tsc + copy node_modules into dist/)..."
sudo -Hu "$PM2_USER" bash -c "cd '$PI_DIR' && npm ci --no-audit --no-fund && npm run build"

# ---- 3. Deploy + log dirs ---------------------------------------------------

log "Ensuring $DEPLOY_DIR and $LOG_DIR exist and are owned by $PM2_USER"
sudo mkdir -p "$DEPLOY_DIR" "$LOG_DIR"
sudo chown "$PM2_USER:$PM2_USER" "$DEPLOY_DIR" "$LOG_DIR"

# ---- 4. Sync dist/ + ecosystem.config.js into the deploy dir ----------------

log "rsync dist/ -> $DEPLOY_DIR (with --delete so stale files are pruned)"
sudo -Hu "$PM2_USER" rsync -a --delete "$PI_DIR/dist/" "$DEPLOY_DIR/"
sudo -Hu "$PM2_USER" cp "$PI_DIR/ecosystem.config.js" "$DEPLOY_DIR/"

# Stamp the build so we can see what's deployed.
sudo -Hu "$PM2_USER" bash -c "cd '$PI_DIR' && cat > '$DEPLOY_DIR/version.json' <<EOF
{
  \"git_sha\": \"\$(git rev-parse HEAD)\",
  \"git_branch\": \"\$(git rev-parse --abbrev-ref HEAD)\",
  \"deployed_at\": \"\$(date -Iseconds)\",
  \"bootstrapped\": true
}
EOF"

# ---- 5. pm2: start or reload (idempotent) -----------------------------------
#
# `pm2 reload <ecosystem>` doesn't re-anchor an existing process's cwd
# or script path — it just restarts in place. If the deploy dir has
# moved since the last registration, we have to delete + start fresh.

CURRENT_CWD=$(sudo -Hu "$PM2_USER" pm2 jlist 2>/dev/null \
  | python3 -c "import sys,json; apps=json.load(sys.stdin); print(next((a['pm2_env']['pm_cwd'] for a in apps if a['name']=='GardenIOT'), ''))" \
  2>/dev/null || true)

if [[ -z "$CURRENT_CWD" ]]; then
  log "Starting GardenIOT in pm2 (not currently registered)"
  sudo -Hu "$PM2_USER" pm2 start "$DEPLOY_DIR/ecosystem.config.js"
elif [[ "$CURRENT_CWD" != "$DEPLOY_DIR" ]]; then
  log "GardenIOT registered at stale cwd ($CURRENT_CWD); deleting + starting fresh at $DEPLOY_DIR"
  sudo -Hu "$PM2_USER" pm2 delete GardenIOT
  sudo -Hu "$PM2_USER" pm2 start "$DEPLOY_DIR/ecosystem.config.js"
else
  log "GardenIOT already running from $DEPLOY_DIR -> reloading"
  sudo -Hu "$PM2_USER" pm2 reload "$DEPLOY_DIR/ecosystem.config.js" --update-env
fi

sudo -Hu "$PM2_USER" pm2 save

# ---- 6. pm2 startup systemd unit (idempotent) -------------------------------

PM2_STARTUP_UNIT="/etc/systemd/system/pm2-${PM2_USER}.service"
if [[ -f "$PM2_STARTUP_UNIT" ]]; then
  log "pm2 startup unit already installed at $PM2_STARTUP_UNIT"
else
  log "Installing pm2 startup unit for $PM2_USER"
  # `pm2 startup` prints a sudo command; capture and run it ourselves
  # so the operator doesn't have to copy-paste.
  STARTUP_CMD=$(sudo -Hu "$PM2_USER" pm2 startup systemd -u "$PM2_USER" --hp "$PM2_HOME" 2>&1 | grep -E '^sudo ' || true)
  if [[ -n "$STARTUP_CMD" ]]; then
    eval "$STARTUP_CMD"
  else
    log "WARN: pm2 startup didn't print a sudo command; install manually:"
    log "        sudo -u $PM2_USER pm2 startup systemd -u $PM2_USER --hp $PM2_HOME"
  fi
fi

# ---- 7. pm2-logrotate (idempotent — pm2 install reinstalls cleanly) ---------

log "Installing/refreshing pm2-logrotate"
sudo -Hu "$PM2_USER" pm2 install pm2-logrotate >/dev/null
sudo -Hu "$PM2_USER" pm2 set pm2-logrotate:max_size 10M
sudo -Hu "$PM2_USER" pm2 set pm2-logrotate:retain 7

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
