# top-box-v2 Deployment Plan

## 2026-08-13 QQ 任务控制发布（待执行）

### 部署目标

- 服务器：`tool-124`（`root@124.221.245.146:22`）
- 项目目录：`/www/wwwroot/top-box-v2`
- 当前 release：`/www/wwwroot/top-box-v2/releases/20260813122348`
- 运行软链：`/www/wwwroot/top-box-v2/current`
- 服务：PM2 `smartbuy-manager`、Docker `topbox-napcat`（本次不重启）

### 本次改动

安全修复（优先级最高）：

- 任务指令改用 `TOPBOX_COMMAND` 环境变量下发给子进程，不再作为 argv。argv 会落在
  `/proc/<pid>/cmdline`（全用户可读，`ps aux` 即可看到米玛）。
- 修复 `handleTaskError` 传 camelCase 字段导致 `UPDATE tasks SET errorMessage` 抛
  `SQLITE_ERROR`、冒泡成 `unhandledRejection` 进而 `process.exit(1)` 的链路——此前
  单个任务失败会杀掉整个 Manager 进程。
- `unhandledRejection` 不再退出进程，避免 QQ/NapCat 网络抖动中断所有在跑任务。
- 脱敏规则集中到 `backend/utils/redact.js`，覆盖 DB、PM2 日志与 QQ 回复。

正确性修复：

- 并发占用由裸计数器改为任务 ID 集合。此前多条收尾路径重复减一会让
  `runningCount` 变成负数，而部署门禁正是看这个数字。
- stdout 按行缓冲后再解析。此前 chunk 边界会切断“登录认证成功”等关键字，且
  单值 category 会被同 chunk 的后续分类覆盖，导致回执丢失（是丢失，不是重复）。

功能：

- QQ 私聊“菜单”回复七种中文任务格式，统一使用“米玛 / 支付米玛”。
- 任务绑定发起人 QQ（`tasks.qq_user_id`），通知只发给本人，归属跨重启保留。
- 通知节点：登录成功、支付成功（含已购数量，同一条）、合成成功、取消成功、
  上架结束、任务失败。去重由 `task_notifications` 主键保证。
- 群聊移除全部交互入口（含 `/topbox run` 与群白名单），仅保留单向公告。
- `幻藏取消` 按藏品名称解析 `product_id`，不再要求输入 ID。
- 新增 `幻藏上架`：库存不足按“有几个上几个”执行；支付米玛错误与风控立即整批
  中止不重试，仅网络类错误有限重试。
- 服务重启时残留任务标为 `interrupted` 并通知发起人重新提交（执行凭据只在内存中，
  无法自动恢复）。

### 环境、数据库和端口

- 不新增 npm 依赖，不构建前端，端口不变（Manager `127.0.0.1:3001`、
  OneBot `127.0.0.1:3002`）。
- 移除三个已失效的环境变量：`QQ_BOT_ALLOW_ALL_PRIVATE_USERS`、
  `QQ_BOT_ALLOWED_USERS`、`QQ_BOT_ALLOWED_GROUPS`。保留在 `.env` 里也无害，代码不再读取。
- `MAX_CONCURRENT_TASKS` 此前被硬编码覆盖而失效，现已生效；不设置时仍为 10。
- schema 变更由 `ensureTaskOwnershipSchema()` 在启动时幂等执行：`tasks.qq_user_id`
  列、`task_notifications` 表、`idx_tasks_qq_user_id` 索引。**向前兼容，回滚不需要
  down migration**：旧代码不读这些新对象。
- 新增状态值 `interrupted`，前端 `TaskTable.jsx` 已加映射。
- SQLite 与公告游标继续使用 `/www/wwwroot/top-box-v2/shared/storage`。

### 本地验证结果

- Manager Jest：`67/67` 通过（5 个套件）。
- Framework Jest：`64/64` 通过（4 个套件）。
- 全部改动的 `.js` 文件通过 `node --check`（`.jsx` 不适用，Node 不解析 JSX）。
- 未执行任何真实购买、合成、取消或上架。

`HcAdapter.catalog.test.js` 中原有两个用例要求 `getProductList` 在单次调用内翻三页，
已按决定移除：同一规则已由 `ListModeStrategy` 在策略层跨轮次实现，适配器内再翻一次
会导致两套翻页叠加、页码跳跃，且单轮请求数与延迟变三倍，对抢购时效与 EdgeOne 风控
都不利。移除仅涉及测试文件，`getProductList` 实现未改动。

### 发布前已核对的服务器状态（2026-08-13）

- `current` → `releases/20260813122348`，PM2 `smartbuy-manager` 在线（pid 1789408，Node 22.22.1）。
- `runningCount=0`、`qqBot.connected=true`、`database.connection=true` —— 发布门禁已满足。
- `SmartBuyManager/storage` → `shared/storage` 软链正常；NapCat 容器已运行 6 小时。
- 磁盘 `/` 已用 53%（19G 可用），releases 共 14 个，本次不清理。
- **Manager 侧已装 jest，Framework 侧未装。** 本次不为 Framework 补装开发依赖：其 64 条
  测试已在本地全绿，且改动的 HcAdapter/CommandParser 不依赖服务器环境；为跑测试而改动
  生产 release 的 `node_modules` 风险大于收益。远程只跑 Manager 的 67 条 + `node --check`。
- `SmartBuyManager/backend/utils/` 在服务器上不存在，`redact.js` 为新增落点，同步时需建目录。

### 发布步骤

1. 确认 `runningCount=0` 且 `qqBot.connected=true`。
2. 从当前 release 复制出新的时间戳 release。
3. 按下方清单逐文件上传，不整目录覆盖。不上传 `.env`、数据库、日志、
   `storage/napcat`、`node_modules`。

### 同步文件清单（逐文件核对与线上有差异，共 26 项）

Manager 后端：

- `backend/utils/redact.js`（新增，服务器上 `backend/utils/` 目录也需新建）
- `backend/integrations/qq/QQBotBridge.js`
- `backend/management/task/TaskManager.js`
- `backend/management/task/TaskExecutor.js`
- `backend/config/config.js`
- `backend/server.js`
- `backend/database/Database.js`、`backend/database/init.js`

Manager 测试（4 项）：`QQBotBridge.test.js`、`QQBotBridge.notifications.test.js`（新增）、
`TaskManager.test.js`（新增）、`TaskExecutor.test.js`

Manager 其他：`.env.example`、`package.json`（新增 `qq:stop` 脚本）、
`frontend/src/components/TaskTable.jsx`（`interrupted` 状态映射）、`doc/QQ_BOT.md`

Framework：

- `cli.js`（读取 `TOPBOX_COMMAND`）
- `main.js` —— **线上当前正在把完整指令（含米玛）打印到 PM2 日志**，本地已改为只打印
  指令类型。属于本次安全修复范围，必须同步。
- `core/CommandParser.js`、`core/TaskExecutor.js`
- `platforms/hc/HcAdapter.js`、`platforms/hc/commands.js`（注册 `hc上架`）
- `interfaces/DataTypes.js`（`payTypes` 注释）
- `platforms/hc/README.md`
- 测试 3 项：`HcAdapter.listing.test.js`（新增）、`CommandParser.aliases.test.js`（新增）、
  `HcAdapter.catalog.test.js`

已确认**无需**同步（本地与线上内容一致）：`config/intervals/hc.js`、`config/products/hc.js`、
`config/combinations/hc.js`、`ecosystem.config.js`、`docs/USER_GUIDE.md`、
`docker-compose.qq-bot.yml`。
4. 在新 release 内对全部改动的 `.js` 运行 `node --check`，并运行 Manager 的 Jest
   （67 条）。Framework 侧不跑（未装 jest，见上文）。
5. 保持 `SmartBuyManager/storage` 指向 shared storage，原子切换 `current` 软链。
6. 用项目本地 PM2 `restart smartbuy-manager --update-env`。**不重启 NapCat**，
   保留当前 QQ 登录态。

### 验证

- `curl -fsS http://127.0.0.1:3001/api/health`
- `curl -fsS http://127.0.0.1:3001/api/status`，确认 `qqBot.connected=true` 且
  `runningCount` 为非负数。
- PM2 日志无启动错误，且不含明文米玛或完整手机号。
- QQ 私聊发送“菜单”，确认回复包含七种格式且不含“密码”字样。
- QQ 私聊发送一条**格式合法但账号无效**的任务，确认：任务落库且带 `qq_user_id`；
  `command_string` 为 `幻藏指定-[已脱敏]`；登录失败后收到“任务失败：…”通知。
- 群里发送任务格式，确认无任何回复、无任务创建。
- 确认公告游标文件未变，不补发历史公告。
- **不发送真实购买、取消或上架任务作为线上测试。**

### 回滚

- 将 `current` 软链切回 `/www/wwwroot/top-box-v2/releases/20260813122348`。
- 重启 PM2 `smartbuy-manager --update-env`。
- shared storage、数据库、日志与 NapCat 登录态不回滚、不删除。
- DB schema 无需回滚（见上文向前兼容说明）。已被标成 `interrupted` 的任务不会
  自动恢复，需重新提交。

### 风险与假设

- 本次发布会重启 Manager，届时在跑的任务全部中断且**不可恢复**（凭据只在内存中）。
  因此第 1 步的 `runningCount=0` 是真正的发布门禁，不是例行检查。
- 私聊完全开放，任何好友都能提交任务并占用并发槽位。当前依靠控制好友列表来限制
  范围，IP 池方案后续再做。
- NapCat 容器日志与 QQ 聊天记录中仍可能留有用户发送的明文凭据，这部分不在本项目
  代码范围内。发布后需确认 NapCat 的消息日志级别（已核查，见文末补充）。

状态：**已于 2026-08-13 17:47 执行成功**，新 release `20260813174244`。

执行记录：

- 发布前按用户要求清理了 `shared/storage/logs`。清理前 575M，其中 34 处明文任务指令
  （两个 158/159 开头的手机号）。用 `truncate -s 0` 清空而非 `rm`——PM2 持有文件句柄，
  删除后进程会继续写已释放的 inode，磁盘不会回收。清理后明文残留 0，磁盘 52%。
- 新 release 用 `cp -al` 硬链接复制基线，随后逐文件核对确认 **inode 已分离**、
  旧 release `20260813122348` 未被污染（其 `main.js` 仍为旧版、无新增文件），
  回滚能力完好。rsync 采用临时文件 + rename，不会原地改写共享 inode。
- 26 个文件全部上传成功（5 新增 / 21 更新），远程 `node --check` 全部通过。
- 远程 Jest 首次运行 `13 failed`：`FRAMEWORK_PATH` 指向 `current/SmartBuyFramework`，
  而测试是在 `current` 仍指向旧 release 时执行的，因此加载到了没有中文别名的旧
  `CommandParser`。这是「切换前跑测试」的时序问题，非代码缺陷；以
  `FRAMEWORK_PATH=<新 release>` 重跑得到 `67/67` 通过。
  **后续发布应在切换 current 之后再跑一次测试，或显式指定 FRAMEWORK_PATH。**
- 原子切换 `current` → PM2 `restart smartbuy-manager --update-env`，2 秒内就绪。
  NapCat 未重启，QQ 登录态保留（容器持续 Up 6 hours）。

验证结果：

- `/api/health` 正常；`/api/status`：`runningCount=0`、`maxConcurrent=10`、
  `database.connection=true`、`qqBot.connected=true`，且 `qqBot` 已不再输出
  `allowAllPrivateUsers` / `allowedUsers` / `allowedGroups` 三个已废弃字段。
- 中文别名线上解析正确：`幻藏指定→smart-buy/list`、`幻藏自助→quick`、
  `幻藏批量→batch`、`幻藏上架→listing/on-sale`、`幻藏取消→cancel-resale`。
- `hc上架` 已注册；`tasks.qq_user_id` 列与 `task_notifications` 表均已就位。
- 菜单文本包含七种格式，统一使用「米玛 / 支付米玛」，正则校验确认不含「密码」。
- `main.js` 已脱敏，线上不再把完整指令写入 PM2 日志。
- 重启后日志中明文指令 0 处、完整手机号 0 处；`pm2-error-0.log` 为空。
- 公告游标保持 `32606`（《山海经·肥遗》合成活动），未补发历史公告。
- 全程未执行任何真实购买、合成、取消或上架。

### 发布后补充核查：NapCat 日志与端口暴露面（2026-08-13）

NapCat 不会把消息内容落盘，结论有据：

- `/app/napcat/config/napcat.json` 与 `napcat_1824945914.json` 均为 `fileLog: false`；
  `fileLogLevel: debug` 因文件日志关闭而不生效。
- 容器内 `/app/napcat/logs` 为空（0 文件 0 字节），即配置生效的结果而非偶然。
- `consoleLog: true` 但级别为 `info`；Docker stdout 日志仅 85K，其中明文任务指令 0 行、
  完整手机号 0 次、`raw_message` / `message_type` / `private` 关键字 0 处。
- `onebot11.json` 中 `debug: false`。该开关一旦打开会打印完整事件 JSON，从而带出原始
  消息内容，后续排障若临时开启，事后必须关闭。

因此发布前清理掉的 34 处明文只有一个来源，即 `SmartBuyFramework/main.js` 写入 PM2 日志，
本次已修复。服务器上目前没有明文凭据落盘。QQ 聊天记录中的明文属于客户端数据，按用户
决定不处理。

端口暴露面同时核查：

- Docker 映射为 `127.0.0.1:3002->3001`（OneBot）与 `127.0.0.1:6099->6099`（WebUI），
  Manager 自身监听 `127.0.0.1:3001`，三者均仅绑环回地址。
- 从公网 IP 实测 3002 与 6099 均不可连通。
- 容器内 `onebot11.json` 的 `"host": "0.0.0.0"` 是容器内部监听所需，真正的边界在宿主机
  映射层。**不要把映射改成 `-p 3002:3001`**，那会把 OneBot 暴露到公网，届时 token 是
  唯一防线。

### 发布后增量修复（2026-08-13 18:02–18:20，同一 release 原地更新）

首次真实使用 `幻藏成交` 后暴露的问题，均已修复并重启生效。未新建 release，
因为都是同一批功能的收尾，回滚目标仍是 `20260813122348`。

**1. 成交时间显示为 UTC，比本地早 8 小时。**
平台返回 Unix 秒，此前直接 `toISOString()` 得到 `2026-08-13T09:31:22.000Z`。
新增 `HcAdapter.formatShanghaiTime()`，用 `Intl.DateTimeFormat` 固定按
`Asia/Shanghai` 输出 `2026-08-13 17:31:22`，**不依赖服务器时区设置**，服务器
时区被改也不会错。UTC 值仍保留在 `trades[].time` 供程序使用，只是不再展示。

**2. 成交记录三列无表头，首列易被误读。**
首列是 `trade.no`（藏品编号／流水号），既不是订单号也不是价格。现加表头
`编号｜价格｜成交时间`。同时修正标题：此前写“50 条”却只列 20 行，现在明确
“50 条，显示前 20 条”。

**3. 查询类任务收不到登录回执。**
根因不是关键字不匹配，而是 `core/TaskExecutor.executeTradeHistory` 自己写了一份
登录逻辑且**完全不打印日志**（购买、上架走的 `authenticate()` 会打印
`✅ 登录认证成功`）。QQ 侧依赖该日志判断登录成功，因此静默。已改为复用
`authenticate()`。

**4. 按用户要求：成交查询不再发登录回执。**
只读查询紧接着就返回记录本身，回执属于噪音。在 QQ 侧按 `task_type` 判断，
`trade-history` 跳过 `login-success`；**失败通知保留**，否则查询失败无出口。
未改动框架日志，排障时仍可见登录记录。购买、合成、取消、上架的回执不变。

**5. 数据库中 9 条历史任务存有明文凭据。**
任务脱敏只对发布后新建的任务生效，此前入库的 `command_string` 保存了完整指令
（含登录米玛与支付米玛），`config` 里也留有 password / payPassword / token 字段。
新增一次性脚本 `SmartBuyManager/scripts/redact-existing-tasks.js`，支持
`--dry-run`，幂等可重复运行。执行流程：先 `.backup` 备份数据库
（`smartbuy.db.bak-20260813181048`）→ 试运行确认 9 条 → 实际执行 → 独立复查。
复查结果：11 位手机号 0 处、凭据字段 0 个、`command_string` 全部脱敏。

  脚本自身踩过一个坑：初版自检用 `config.includes('"password"')` 判断残留，把
  `authMode: "password"`（仅标记登录方式，不含凭据）误判成明文，报出“仍有 10 条
  未清理”。已改为 `JSON.parse` 后按键名判断。**数据当时已是干净的，是自检逻辑
  误报。** 教训：判断结构化字段不要用子串匹配。

测试：Framework 68/68、Manager 73/73（共 141 条）。新增 10 条覆盖时间格式化、
跨日转换、表头、截断提示、成交不发回执、成交失败仍通知、其他任务回执不变。

其中一条测试我自己写错过时间戳（把 `1786584419` 当成 `2026-08-12T23:26:59Z`，
实际是 `1786577219`），由测试失败暴露后核对修正——这正是断言写具体值的好处。

**6. 失败通知只说“任务异常结束”，掩盖了真实原因。**
用户用错误米玛提交购买任务，收到的是 `任务失败：任务异常结束，请稍后重试`，
容易误判成程序故障。子进程日志里其实写得很清楚
（`"message": "密码不正确"`、`"type": "LOGIN_FAILED"`），但 Manager 侧在进程退出时
把 `error_message` 填成了 `进程退出码: 1`，真实原因从未被采集。

修法：`TaskExecutor` 新增 `extractFailureReason()`，从子进程 stdout/stderr 中识别
序列化错误对象里的 `"message"` / `"msg"` 字段，以及“登录认证失败: xxx”这类带标签
文案，保留**最早出现**的根因（后续行往往是它引发的连锁报错）；进程失败时优先上报
该原因，退出码仅作兜底。同时 `describeFailure()` 补上 `密码不正确` / `LOGIN_FAILED`
的匹配，否则仍会落到兜底文案。

  这里的关键约束是**不能误伤正常进度日志**。抢购任务在等挂单期间会持续输出
  `❌ 没有符合条件的商品` 和 `⚠️ 执行错误: NO_QUALIFIED_PRODUCTS`，若把它们当成
  失败原因，运行中的任务会被误报为失败。因此提取器只认明确形态，已就此写了断言。

测试增至 Manager 80 条，新增 7 条覆盖提取、误伤防护、退出码兜底与端到端文案翻译。

已于 2026-08-13 19:49 上线（同一 release 原地更新）。线上实测：
`"message": "密码不正确"` → 提取出 `密码不正确` → 用户看到 `任务失败：账号或米玛不正确`；
`❌ 没有符合条件的商品` 不被判为失败原因。

本次重启顺带完整验证了 A 方案的重启善后：运行中的抢购任务被标成 `interrupted`
（区别于 `failed`，可分辨“重启中断”与“真失败”），`task-interrupted` 通知已送达发起人，
子进程收到退出信号后自行清理无残留，启动日志输出 `🧹 已清理 1 个重启残留任务`。

### 2026-08-13 19:55 起的后续增量（同一 release 原地更新）

**7. 新增任务管理指令。**
`获取任务` / `停止任务-N` / `停止任务-全部`。编号是本次列表的临时序号而非任务 ID
（ID 形如 `task_1786616673616_hc_list_845ni`，无法在手机上输入），因此按编号停止
必须先查列表——这同时是一道防手滑的确认。编号 5 分钟过期
（`QQ_BOT_TASK_SELECTION_TTL_MS`），避免用旧列表停到新任务上。仅能查看与停止自己
的任务，复用 `tasks.qq_user_id` 归属。

**8. HC 自适应请求间隔。**
此前列表与快捷实际都跑 800ms —— `CommandParser` 硬编码了 `interval: 800`（三处），
优先级高于配置文件，导致 `config/intervals/hc.js` **从未生效**。清除硬编码后新增
`core/AdaptiveIntervalController`：从安全值起步、连续 20 次成功提速一档（50ms）、
被拦截退 4 档并记住不安全档位。起点 500ms，list/quick 区间 300–1000ms。

  Review 阶段抓到三个实质缺陷，均已修复：

  - **`blockedInterval` 原本是永久墙。** 撞过一次 300ms 就再也回不去，只能靠重启
    或状态过期——与"平台放松了应当能受益"的设计意图自相矛盾。加
    `blockedRetryMs`（30 分钟）后清墙重探；`blockedAt` 必须一并落盘，否则重启后
    墙会被当成"无时间戳"而永久有效，旧格式缺该字段时按已过期处理。
  - **batch 会被压到 300ms。** 控制器原本不分模式，批量下单一次提交多单、请求更
    重，不该与列表同频。改为按模式隔离，batch 单独用 600–1500ms。
  - **并发进程会集体误判。** 购买任务各自是独立子进程（默认可并发 10 个），只看
    自己的话会一起探到下限——各自都不被拦截，但平台侧合计流量早已超标，最终集体
    撞墙、集体退避形成震荡。查历史数据确认并发是常态（**31 对任务曾时间重叠**），
    因此用 `.hc-active-procs.json` 登记进程心跳（30 秒 TTL），把总预算
    `maxRequestsPerSecond=4` 按活跃进程数分摊。实测单进程探到 300ms，5 个并发时
    被压到 500–1000ms。

  状态文件按模式落盘、1 小时过期，写入采用临时文件 + rename（并发进程可能同时写，
  需保证读到的永远是完整 JSON）。这些文件与出口 IP 相关，已加入 `.gitignore`。

测试增至 209 条（Framework 107、Manager 102）。

**待办（不属本次范围）**：`platforms/hc/HcAdapter.js:585` 硬编码了验证码识别服务
（ttshitu）的默认密码 `qwer1234`。它不是平台账号凭据，且 HEAD 中本就存在，但仍属
硬编码凭据，建议改为只从 `TTSHITU_PASSWORD` 读取。

### 本次发布踩过的坑（供后续发布参考）

**远程 Jest 必须在切换 `current` 之后跑，或显式指定 `FRAMEWORK_PATH`。**
`.env` 里 `FRAMEWORK_PATH=<项目根>/current/SmartBuyFramework` 指向软链。在切换前
跑测试，`current` 仍解析到旧 release，于是 Manager 加载了旧的 `CommandParser`
（没有中文别名），13 条测试红。这不是代码缺陷。已在“发布步骤”第 4 步注明。

**`cp -al` 硬链接复制基线时必须验证 inode 已分离。**
新旧 release 共享 inode，若同步工具原地写入会连带改坏回滚版本。rsync 采用
临时文件 + rename，不会原地改写，实测确认旧 release 的 `main.js` 仍为旧版、
无新增文件。**换用别的同步方式（如 `sed -i`、`cat >`）前务必重新验证这一点。**

**清空 PM2 正在写的日志要用 `truncate` 而不是 `rm`。**
PM2 持有文件句柄，`rm` 后进程继续向已释放的 inode 写入，磁盘空间不会回收，
且新日志无处可见。`truncate -s 0` 保留句柄有效。

**`node --check` 不解析 JSX。**
`frontend/src/components/*.jsx` 会报 SyntaxError，属预期，不代表文件有问题。
校验前端文件请用构建或 ESLint。

**容器内配置写 `0.0.0.0` 不等于对公网开放。**
`onebot11.json` 中 `"host": "0.0.0.0"` 是容器内部监听所需，真正的边界在宿主机
Docker 映射层（当前为 `127.0.0.1:3002->3001`）。判断暴露面要看 `docker ps` 的
Ports 与 `ss -tlnp`，不能只看应用配置。

遗留事项：无。

## 2026-08-13 NewBee 公告正文推送发布

### 部署目标

- 服务器：`tool-124`（`root@124.221.245.146:22`）
- 项目目录：`/www/wwwroot/top-box-v2`
- 当前 release：`/www/wwwroot/top-box-v2/releases/20260812233243`
- 运行软链：`/www/wwwroot/top-box-v2/current`
- 服务：PM2 `smartbuy-manager`、Docker `topbox-napcat`

### 项目与改动分析

- 类型：Node.js Express Manager + PM2，NapCat/OneBot 由 Docker 独立运行。
- 入口：`SmartBuyManager/backend/server.js`。
- 本次只改 NewBee 公告链路：
  - 列表发现新公告后调用匿名接口 `/api/news/content?id=<id>` 获取完整正文。
  - 将富文本 HTML 转成保留段落的纯文本。
  - 消息包含标题、发布时间和公告正文，不再发送详情页链接，并移除正文中的 URL。
  - 正文获取失败或 QQ 发送失败时不推进公告游标，下一轮继续重试。
- 不新增 npm 依赖，不修改数据库结构，不构建前端。
- 本地验证：Manager 全部测试 `20/20` 通过；最近 20 条真实公告均可转换且结果不含 URL。

### 环境、数据库和端口

- 沿用现有环境变量，仅使用既有 `NEWBEE_ANNOUNCEMENT_*`、`QQ_BOT_*` 等变量，不改值、不记录密钥。
- SQLite 和公告游标继续使用 `/www/wwwroot/top-box-v2/shared/storage`。
- 不执行数据库迁移。
- Manager 继续监听 `127.0.0.1:3001`；NapCat OneBot 继续通过宿主机 `127.0.0.1:3002` 连接。

### 发布步骤

1. 再次确认 Manager `runningCount=0`，并确认 QQ Bot 已连接。
2. 从当前 release 复制一个新的时间戳 release。
3. 仅覆盖本次相关的 Manager 源码、测试和 QQ 文档；不上传 `.env`、数据库、日志或本地 QQ 数据。
4. 在新 release 中运行语法检查和 Jest 测试。
5. 保持 `SmartBuyManager/storage` 指向 shared storage，原子切换 `current` 软链。
6. 使用项目本地 PM2 重启 `smartbuy-manager --update-env`；不重启 NapCat，保留当前 QQ 登录态。

### 验证

- `curl -fsS http://127.0.0.1:3001/api/health`
- `curl -fsS http://127.0.0.1:3001/api/status`，确认 `qqBot.connected=true`。
- 检查 PM2 最近日志没有启动、正文接口或 OneBot 错误。
- 在服务器上调用真实公告正文接口并运行新格式化器，断言结果包含 `公告详情：`，且不含 HTML、`http://`、`https://` 或 `www.`。
- 核对公告游标文件仍为原值；本次发布不补发历史公告。

### 回滚

- 将 `current` 软链切回 `/www/wwwroot/top-box-v2/releases/20260812233243`。
- 重启 PM2 `smartbuy-manager --update-env`。
- shared storage 和 NapCat 登录态不回滚、不删除。

### 风险与假设

- 公告正文若只有图片而没有文字，将显示“暂无正文内容”；不会退回发送详情链接。
- PM2 重启期间会有数秒 Manager 断连，NapCat 和 QQ 登录保持在线。
- 发布前服务器状态为 `runningCount=0`、`qqBot.connected=true`。

状态：已于 2026-08-13 执行成功。新 release 为 `20260813122348`，远程测试 `19/19` 通过，健康检查、QQ 连接和真实公告正文格式验证均通过。旧 release `20260812233243` 保留用于回滚。由于旧 release 只安装了生产依赖，为执行已确认的 Jest 验证，新 release 按现有 lockfile 补齐了开发依赖；运行配置和依赖版本未改变。
