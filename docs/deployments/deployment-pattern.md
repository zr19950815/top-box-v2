# Deployment Pattern

- Updated at: `2026-05-13T11:45:43+08:00`
- Pattern name: `top-box-v2 PM2 Nginx SQLite deployment`
- Type: `Node.js service with bundled React frontend`
- Runtime: `Node.js 22, Express, Socket.IO, SQLite`
- Process manager: `PM2 single-instance fork mode`
- Web server: `Nginx reverse proxy on port 3000 to 127.0.0.1:3001, including /api/ and /socket.io/`
- Remote project directory: `/www/wwwroot/top-box-v2`

## Build Commands

- `cd SmartBuyManager && npm run build`
- `cd SmartBuyFramework && node cli.js --status`

## Start Or Restart Commands

- `cd /www/wwwroot/top-box-v2/current/SmartBuyManager && ./node_modules/.bin/pm2 startOrRestart ecosystem.production.config.js --env production --update-env`
- `systemctl reload nginx`

## Environment Keys

- `NODE_ENV`
- `HOST`
- `PORT`
- `DB_PATH`
- `FRAMEWORK_PATH`
- `CORS_ORIGIN`
- `LOG_LEVEL`
- `MAX_CONCURRENT_TASKS`
- `SMARTBUY_ENCRYPTION_KEY`
- `SMARTBUY_CREDENTIAL_KEY`
- `TTSHITU_USERNAME`
- `TTSHITU_PASSWORD`

## Notes

Build frontend locally and sync SmartBuyManager/frontend/dist; keep shared SQLite/log storage outside releases; use project-local PM2 CLI when global pm2 is not on PATH.
