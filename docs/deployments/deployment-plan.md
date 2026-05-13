# top-box-v2 Deployment Plan

更新时间：2026-05-13

## 1. 部署目标

- 目标服务器：`tool-124`
- SSH：`root@124.221.245.146:22`
- 系统：OpenCloudOS 9.2
- 远程目录：`/www/wwwroot/top-box-v2`
- 运行目录：`/www/wwwroot/top-box-v2/current`
- 对外访问：优先使用 `http://124.221.245.146:3000`

## 2. 项目分析

`top-box-v2` 分为两个主要模块：

- `SmartBuyFramework`：Node.js CLI 抢购执行核心，入口为 `cli.js` / `main.js`。
- `SmartBuyManager`：Node.js + Express + Socket.IO 后端，React/Vite 前端，SQLite 本地数据库。

当前可用命令：

- `SmartBuyFramework`：`npm ci --omit=dev`，`node cli.js --status`
- `SmartBuyManager`：`npm ci --omit=dev`，`node backend/database/init.js`，`node backend/server.js`
- `SmartBuyManager/frontend`：由 `SmartBuyManager` 的 `npm run build` 间接执行 `vite build`

本地已验证：

- `SmartBuyManager` 的 `npm run build` 可成功生成 `frontend/dist`。
- `SmartBuyFramework` 的 `node cli.js --status` 可加载 `kyart`、`hzmiss`、`julianbaby`、`hc` 共 4 个平台。

构建策略：

- 前端生产构建在本地执行，并将生成后的 `SmartBuyManager/frontend/dist` 同步到服务器。
- 远程只安装生产依赖，不在远程执行 `npm run build`。
- 原因：`vite` 在 `SmartBuyManager/frontend` 的 `devDependencies` 中，远程执行 `npm ci --omit=dev` 后不具备前端构建依赖。

## 3. 必要代码适配

部署前需要调整前端连接地址：

- `SmartBuyManager/frontend/src/services/api.js` 不能写死 `http://localhost:3001/api`，默认应改为同源 `/api`，并允许通过 `VITE_API_BASE_URL` 覆盖。
- `SmartBuyManager/frontend/src/services/websocket.js` 不能写死 `http://localhost:3001`，默认应使用当前页面同源，允许通过 `VITE_WS_URL` 覆盖。

原因：服务器页面在用户浏览器里打开时，`localhost` 会指向用户本机，不是 124 服务器。

## 4. 服务方案

采用 `PM2 + Nginx`：

- PM2 运行 `SmartBuyManager/backend/server.js`
- PM2 使用单实例 fork 模式，不使用项目当前 `ecosystem.config.js` 的 `instances: 2` cluster 配置，避免 SQLite 多进程写入锁冲突。
- Express 后端监听 `127.0.0.1:3001`
- Express 同时托管 `SmartBuyManager/frontend/dist`
- Nginx 新增独立站点配置，监听 `3000`，反向代理到 `127.0.0.1:3001`
- Nginx 同时代理 `/api/`、`/socket.io/` 和页面路由，确保 REST API、Socket.IO WebSocket 和 SPA 刷新都可用。
- Nginx 配置路径：`/www/server/panel/vhost/nginx/smartbuy-manager.conf`

不使用当前 `docker-compose.yml`，因为项目中缺少它引用的 `Dockerfile.backend`、`frontend/Dockerfile` 和 `nginx.conf`。

## 5. 环境变量

只记录变量名，不记录密钥值：

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=3001`
- `DB_PATH=/www/wwwroot/top-box-v2/shared/storage/database/smartbuy.db`
- `FRAMEWORK_PATH=/www/wwwroot/top-box-v2/current/SmartBuyFramework`
- `CORS_ORIGIN=http://124.221.245.146:3000`
- `LOG_LEVEL=info`
- `MAX_CONCURRENT_TASKS=10`
- `SMARTBUY_ENCRYPTION_KEY`
- `SMARTBUY_CREDENTIAL_KEY`
- `TTSHITU_USERNAME`
- `TTSHITU_PASSWORD`

说明：`TTSHITU_USERNAME`、`TTSHITU_PASSWORD` 当前代码已有默认值，本次不会在部署记录中写入具体值。

落地方式：

- 在远程 release 内生成 `SmartBuyManager/ecosystem.production.config.js`。
- PM2 配置显式设置 `cwd: /www/wwwroot/top-box-v2/current/SmartBuyManager`，`script: backend/server.js`，`instances: 1`，`exec_mode: fork`。
- PM2 的 `env` 字段写入生产运行变量：`NODE_ENV`、`HOST`、`PORT`、`DB_PATH`、`FRAMEWORK_PATH`、`CORS_ORIGIN`、`LOG_LEVEL`、`MAX_CONCURRENT_TASKS`。
- 本次不写入 `TTSHITU_USERNAME`、`TTSHITU_PASSWORD`，先使用代码默认值。
- `SMARTBUY_ENCRYPTION_KEY`、`SMARTBUY_CREDENTIAL_KEY` 如果本次未提供，则不写入部署记录；部署时可先沿用代码默认值，后续再单独加固。
- 启动和重启优先使用项目生产依赖里的 `SmartBuyManager/node_modules/.bin/pm2`，避免依赖远程全局 npm bin 的 PATH。
- 启动命令为 `./node_modules/.bin/pm2 startOrRestart ecosystem.production.config.js --env production --update-env`。
- 启动成功后执行 `./node_modules/.bin/pm2 save`；如果服务器尚未配置 PM2 开机自启，则执行 `./node_modules/.bin/pm2 startup systemd -u root --hp /root` 并再次 save。

## 6. 数据库和持久化

- 数据库类型：SQLite
- 数据库文件：`/www/wwwroot/top-box-v2/shared/storage/database/smartbuy.db`
- 日志目录：`/www/wwwroot/top-box-v2/shared/storage/logs`
- 首次部署时执行 `node backend/database/init.js`
- 后续部署保留 `shared/storage`，不覆盖历史任务、订单、日志数据

## 7. 部署步骤

确认后执行：

1. 本地完成前端 API/WebSocket 同源适配。
2. 本地重新执行构建和基础校验。
3. 远程创建目录：`releases/`、`shared/storage/database`、`shared/storage/logs`。
4. 将 `SmartBuyFramework` 和 `SmartBuyManager` 同步到新的 release，包含本地构建好的 `SmartBuyManager/frontend/dist`，排除 `node_modules`、`.env`、本地日志、临时文件。
5. 在远程安装依赖：
   - `SmartBuyFramework`: `npm ci --omit=dev`
   - `SmartBuyManager`: `npm ci --omit=dev`
6. 链接持久化存储到当前 release 的 `SmartBuyManager/storage`：先删除 release 内可能存在的空 `storage` 目录，再软链到 `/www/wwwroot/top-box-v2/shared/storage`。
7. 初始化 SQLite 数据库。
8. 将 `current` 软链切换到新 release。
9. 使用 `SmartBuyManager` 生产依赖中的 PM2 CLI；如项目本地 PM2 不存在，再安装全局 PM2 作为兜底。
10. 生成单实例 `SmartBuyManager/ecosystem.production.config.js`。
11. 使用 PM2 启动或重启 `smartbuy-manager`，执行 PM2 save，并确保 PM2 已配置 systemd 开机自启。
12. 写入 Nginx 配置 `/www/server/panel/vhost/nginx/smartbuy-manager.conf`，监听 `3000` 并反代 `127.0.0.1:3001`。
13. Nginx 配置至少包含：
    - `/api/` 反向代理到 `http://127.0.0.1:3001/api/`
    - `/socket.io/` 反向代理到 `http://127.0.0.1:3001/socket.io/`，并设置 `Upgrade` / `Connection` 头
    - `/` 反向代理到 `http://127.0.0.1:3001/`
    - `proxy_read_timeout` 至少 `300s`，避免长连接过早断开
14. 执行 `nginx -t`，通过后 reload Nginx。

## 8. 验证命令

远程验证：

- `pm2 describe smartbuy-manager`
- `pm2 jlist | grep smartbuy-manager`
- `systemctl is-enabled pm2-root || true`
- `curl -fsSL http://127.0.0.1:3001/api/health`
- `curl -fsSL http://127.0.0.1:3000/api/health`
- `ss -ltnp | grep -E ':3000|:3001'`
- `node /www/wwwroot/top-box-v2/current/SmartBuyFramework/cli.js --status`
- `test -f /www/wwwroot/top-box-v2/current/SmartBuyManager/frontend/dist/index.html`
- `curl -fsSL http://127.0.0.1:3000/ | grep -E '<div id="root"|/assets/'`

浏览器验证：

- 打开 `http://124.221.245.146:3000`
- 检查任务页面是否能加载
- 检查 `/api/health` 是否正常
- 检查浏览器控制台不再请求 `localhost:3001`
- 检查 Socket.IO 连接不报错

## 9. 回滚方案

- 每次部署写入独立 release：`/www/wwwroot/top-box-v2/releases/<timestamp>`
- 回滚时将 `current` 软链切回上一个 release
- 执行 `pm2 restart smartbuy-manager --update-env`
- Nginx 配置不变
- `shared/storage` 不回滚，避免误删运行数据

## 10. 风险和假设

- 服务器已有 Nginx 和 Node.js 22，未安装全局 PM2；部署时可能需要安装 PM2。
- 服务器内存约 1.7G，PM2 先使用单实例，避免 SQLite 多进程写入锁冲突。
- `3000` 端口当前未监听，但云安全组或服务器防火墙可能未开放；如果外网打不开，需要在腾讯云安全组或 BT 防火墙放行 `3000`。
- 当前项目不是 Git 仓库，部署记录无法记录分支和 commit，只记录工作目录状态。
- Docker 配置不完整，本次不走 Docker。
- 远程不执行前端构建，因此本地构建产物 `SmartBuyManager/frontend/dist` 必须在同步前存在且通过验证。
- 如果未来要改成域名或 HTTPS，需要同步更新 `CORS_ORIGIN`、Nginx server_name 和访问地址。
