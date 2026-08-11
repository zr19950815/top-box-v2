# Deployment Pattern

- Updated at: `2026-08-11T11:30:21+08:00`
- Pattern name: `top-box-v2 PM2 Nginx SQLite deployment`
- Type: `Node.js service with bundled React frontend`
- Runtime: `Node.js 22, Express, Socket.IO, SQLite, impit`
- Process manager: `PM2 single-instance fork mode`
- Web server: `Nginx on port 3000 proxying 127.0.0.1:3001`
- Remote project directory: `/www/wwwroot/top-box-v2`

## Build Commands

- `cd SmartBuyManager && npm run build`
- `cd SmartBuyFramework && npm test -- --runInBand test/HcAdapter.catalog.test.js`
- `cd SmartBuyFramework && node cli.js --status`

## Start Or Restart Commands

- `cd /www/wwwroot/top-box-v2/current/SmartBuyManager && ./node_modules/.bin/pm2 startOrRestart ecosystem.production.config.js --update-env`
- `./node_modules/.bin/pm2 save`

## Environment Keys

- `NODE_ENV`
- `HOST`
- `PORT`
- `DB_PATH`
- `FRAMEWORK_PATH`
- `CORS_ORIGIN`
- `LOG_LEVEL`
- `MAX_CONCURRENT_TASKS`
- `TASK_TIMEOUT_MS`
- `TTSHITU_USERNAME`
- `TTSHITU_PASSWORD`

## Notes

Build frontend locally, deploy timestamped releases, preserve shared SQLite/log storage, and keep the previous release for atomic symlink rollback.
