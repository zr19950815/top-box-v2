# Deployment Pattern

- Updated at: `2026-08-13T18:20:00+08:00`
- Pattern name: `top-box-v2 release + PM2 + NapCat`
- Type: `Node.js service with external Docker QQ gateway`
- Runtime: `Node.js 22, PM2, Docker NapCat`
- Process manager: `PM2 single-instance fork`
- Web server: `Nginx to Express on 127.0.0.1:3001`
- Remote project directory: `/www/wwwroot/top-box-v2`

## Build Commands

- `npm test -- --runInBand`
- `node --check backend/server.js`

`node --check` 不解析 JSX，`frontend/src/**/*.jsx` 报 SyntaxError 属预期，改用构建或
ESLint 校验前端文件。

Manager 侧已装 jest，Framework 侧未装。若要在服务器跑 Framework 测试需按 lockfile 补
开发依赖，会改动生产 release 的 `node_modules`，一般不做——在本地跑即可。

## Start Or Restart Commands

- `./node_modules/.bin/pm2 restart smartbuy-manager --update-env`

## Environment Keys

- `NODE_ENV`
- `HOST`
- `PORT`
- `DB_PATH`
- `FRAMEWORK_PATH`
- `QQ_BOT_ENABLED`
- `QQ_BOT_WS_URL`
- `QQ_BOT_ACCESS_TOKEN`
- `NEWBEE_ANNOUNCEMENT_ENABLED`
- `NEWBEE_ANNOUNCEMENT_INTERVAL_MS`
- `NEWBEE_ANNOUNCEMENT_QQ_GROUP`

## Notes

Timestamped releases with atomic current symlink; shared storage persists SQLite, logs, QQ state; NapCat is kept running during Manager-only releases.

## 发布注意事项（历次踩坑固化，按顺序检查）

**1. 发布门禁：`runningCount=0`。**
执行凭据（含米玛）只存在内存中、从不落盘，重启即中断且无法恢复。启动时残留的
`running`/`pending` 任务会被标成 `interrupted` 并通知发起人重新提交。因此这不是例行
检查，而是真正的门禁。

**2. 改了 Framework 时，测试要在切换 `current` 之后跑。**
`.env` 中 `FRAMEWORK_PATH=<项目根>/current/SmartBuyFramework` 指向软链。切换前跑测试
会加载旧 release 的 Framework，产生与代码无关的失败。要么切换后再测，要么显式传
`FRAMEWORK_PATH=<新 release>/SmartBuyFramework`。

**3. `cp -al` 建立基线后，务必确认 inode 已分离。**
新旧 release 共享 inode，同步工具若原地写入会连带改坏回滚版本。rsync 用临时文件 +
rename，安全；`sed -i`、`cat >`、`truncate` 等原地写入的方式会污染旧 release。
验证方法：`stat -c %i` 对比两个 release 的同名文件，并抽查旧 release 内容未变。

**4. 清空 PM2 正在写的日志用 `truncate -s 0`，不要 `rm`。**
PM2 持有文件句柄，`rm` 后进程继续写已释放的 inode，磁盘不回收且新日志不可见。

**5. 判断端口暴露面看 Docker 映射，不看应用配置。**
`onebot11.json` 中 `"host": "0.0.0.0"` 是容器内部监听所需，边界在宿主机映射层
（当前 `127.0.0.1:3002->3001`、`127.0.0.1:6099->6099`）。用 `docker ps` 的 Ports 和
`ss -tlnp` 确认，必要时从公网 IP 实测。**不要把映射改成 `-p 3002:3001`**，那会把
OneBot 暴露到公网，届时 token 是唯一防线。

**6. DB schema 变更保持向前兼容，回滚不做 down migration。**
`ensureTaskOwnershipSchema()` 在启动时幂等执行（`qq_user_id` 列、
`task_notifications` 表、索引）。旧代码不读这些新对象，因此回滚安全。

**7. NapCat 默认不落盘存消息。**
`fileLog: false`、`onebot11.json` 的 `debug: false`。排障若临时开启 `debug`，会打印
完整事件 JSON 从而带出私聊明文凭据，事后必须关闭。

**8. 只重启 Manager，不动 NapCat。**
`pm2 restart smartbuy-manager --update-env` 即可；重启 NapCat 会丢失 QQ 登录态，
需要重新扫码。
