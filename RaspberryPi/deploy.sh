#!/usr/bin/env bash
#
# Pull-based deploy for GardenIOT. Run periodically by the systemd timer.
# Exits 0 quickly if there's nothing new on origin/main.
#
# Env var overrides:
#   REPO_DIR    path to the git checkout (default: $HOME/git_repos/GardenIOT)
#   DEPLOY_DIR  destination for the built artefact (default: /opt/gardeniot)
#   BRANCH      branch to track (default: main)

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/git_repos/GardenIOT}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/gardeniot}"
BRANCH="${BRANCH:-main}"

PI_DIR="$REPO_DIR/RaspberryPi"

log() { printf '[deploy %s] %s\n' "$(date -Iseconds)" "$*"; }

cd "$PI_DIR"

# Refuse to deploy from a dirty tree; preserves any in-progress local edits.
if ! git diff --quiet HEAD || ! git diff --cached --quiet; then
  log "ERROR: working tree has uncommitted changes; refusing to deploy"
  exit 1
fi

git fetch --quiet origin "$BRANCH"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [[ "$LOCAL" == "$REMOTE" ]]; then
  log "Already at ${LOCAL:0:8}; nothing to do"
  exit 0
fi

log "Updating ${LOCAL:0:8} -> ${REMOTE:0:8}"
git pull --ff-only origin "$BRANCH"

log "Installing deps + building"
# npm ci runs install scripts by default — we need them for rpi-gpio's
# native epoll binding.
npm ci --no-audit --no-fund
npm run build

# Stamp the build so we can see what's running from inside the app or via curl
# on a future health endpoint.
cat > dist/version.json <<EOF
{
  "git_sha": "$(git rev-parse HEAD)",
  "git_branch": "$BRANCH",
  "deployed_at": "$(date -Iseconds)"
}
EOF

log "Syncing dist/ -> $DEPLOY_DIR (--delete will prune stale files)"
mkdir -p "$DEPLOY_DIR"
rsync -a --delete dist/ "$DEPLOY_DIR/"

# Copy the ecosystem config alongside the build so pm2 reload finds it.
cp ecosystem.config.js "$DEPLOY_DIR/"

# `pm2 reload <ecosystem>` doesn't re-anchor an existing process's cwd
# or script path — it just restarts in place. If the deploy dir has
# moved since the last registration, we have to delete + start fresh.
CURRENT_CWD=$(pm2 jlist 2>/dev/null \
  | python3 -c "import sys,json; apps=json.load(sys.stdin); print(next((a['pm2_env']['pm_cwd'] for a in apps if a['name']=='GardenIOT'), ''))" \
  2>/dev/null || true)

if [[ -z "$CURRENT_CWD" ]]; then
  log "GardenIOT not registered in pm2 -> starting"
  pm2 start "$DEPLOY_DIR/ecosystem.config.js"
elif [[ "$CURRENT_CWD" != "$DEPLOY_DIR" ]]; then
  log "GardenIOT registered at stale cwd ($CURRENT_CWD); deleting + starting fresh at $DEPLOY_DIR"
  pm2 delete GardenIOT
  pm2 start "$DEPLOY_DIR/ecosystem.config.js"
else
  log "Reloading pm2"
  pm2 reload "$DEPLOY_DIR/ecosystem.config.js" --update-env
fi
pm2 save

log "Deploy of ${REMOTE:0:8} complete"
