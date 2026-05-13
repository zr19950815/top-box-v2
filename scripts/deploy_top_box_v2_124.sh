#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="${SKILL_DIR:-/Users/zhangrui2/.codex/skills/remote-server-assistant}"
PROJECT_DIR="${PROJECT_DIR:-/Users/zhangrui2/Desktop/workSpace/ky/top-box-v2}"
REMOTE_ROOT="${REMOTE_ROOT:-/www/wwwroot/top-box-v2}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"
REMOTE_RELEASE="$REMOTE_ROOT/releases/$RELEASE_ID"

cd "$SKILL_DIR"
eval "$(python3 scripts/select_server_profile.py --alias tool-124)"
source scripts/common.sh

echo "Deploying release $RELEASE_ID to $REMOTE_RELEASE"

run_remote_script "set -euo pipefail
mkdir -p '$REMOTE_ROOT/releases' '$REMOTE_ROOT/shared/storage/database' '$REMOTE_ROOT/shared/storage/logs' '$REMOTE_RELEASE'
"

ssh_transport="$(build_ssh_transport_string)"

rsync -az --delete -e "$ssh_transport" \
  --exclude 'node_modules' \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --exclude 'logs' \
  "$PROJECT_DIR/SmartBuyFramework/" "$(remote_target):$REMOTE_RELEASE/SmartBuyFramework/"

rsync -az --delete -e "$ssh_transport" \
  --exclude 'node_modules' \
  --exclude 'frontend/node_modules' \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --exclude 'storage' \
  "$PROJECT_DIR/SmartBuyManager/" "$(remote_target):$REMOTE_RELEASE/SmartBuyManager/"

remote_script="$(python3 - "$REMOTE_ROOT" "$REMOTE_RELEASE" <<'PY'
import sys

root, release = sys.argv[1], sys.argv[2]
print(f"ROOT={root!r}")
print(f"RELEASE={release!r}")
print(r'''
set -euo pipefail
CURRENT="$ROOT/current"
SHARED="$ROOT/shared"

rm -rf "$RELEASE/SmartBuyManager/storage"
ln -s "$SHARED/storage" "$RELEASE/SmartBuyManager/storage"

cd "$RELEASE/SmartBuyFramework"
npm ci --omit=dev

cd "$RELEASE/SmartBuyManager"
npm ci --omit=dev
DB_PATH="$SHARED/storage/database/smartbuy.db" NODE_ENV=production node backend/database/init.js

RELEASE="$RELEASE" python3 - <<'PY_REMOTE'
import os
from pathlib import Path

release = Path(os.environ["RELEASE"])
content = """module.exports = {
  apps: [
    {
      name: 'smartbuy-manager',
      cwd: '/www/wwwroot/top-box-v2/current/SmartBuyManager',
      script: 'backend/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3001,
        DB_PATH: '/www/wwwroot/top-box-v2/shared/storage/database/smartbuy.db',
        FRAMEWORK_PATH: '/www/wwwroot/top-box-v2/current/SmartBuyFramework',
        CORS_ORIGIN: 'http://124.221.245.146:3000',
        LOG_LEVEL: 'info',
        MAX_CONCURRENT_TASKS: 10
      },
      max_memory_restart: '700M',
      min_uptime: '10s',
      max_restarts: 5,
      error_file: '/www/wwwroot/top-box-v2/shared/storage/logs/pm2-error.log',
      out_file: '/www/wwwroot/top-box-v2/shared/storage/logs/pm2-out.log',
      log_file: '/www/wwwroot/top-box-v2/shared/storage/logs/pm2-combined.log',
      time: true,
      watch: false,
      kill_timeout: 5000
    }
  ]
};
"""
(release / "SmartBuyManager" / "ecosystem.production.config.js").write_text(content, encoding="utf-8")
PY_REMOTE

ln -sfn "$RELEASE" "$CURRENT"

PM2_BIN="$CURRENT/SmartBuyManager/node_modules/.bin/pm2"
if [ ! -x "$PM2_BIN" ]; then
  npm install -g pm2
  PM2_BIN="$(command -v pm2)"
fi

cd "$CURRENT/SmartBuyManager"
"$PM2_BIN" startOrRestart ecosystem.production.config.js --env production --update-env
"$PM2_BIN" save
if ! systemctl is-enabled pm2-root >/dev/null 2>&1; then
  "$PM2_BIN" startup systemd -u root --hp /root >/tmp/top-box-v2-pm2-startup.log 2>&1 || true
fi
"$PM2_BIN" save

python3 - <<'PY_REMOTE'
from pathlib import Path

content = """server {
    listen 3000;
    server_name 124.221.245.146;

    access_log /www/wwwlogs/top-box-v2.access.log;
    error_log /www/wwwlogs/top-box-v2.error.log;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location / {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
"""
Path("/www/server/panel/vhost/nginx/smartbuy-manager.conf").write_text(content, encoding="utf-8")
PY_REMOTE

nginx -t
systemctl reload nginx

echo "DEPLOYED_RELEASE=$RELEASE"
''')
PY
)"

run_remote_script "$remote_script"
