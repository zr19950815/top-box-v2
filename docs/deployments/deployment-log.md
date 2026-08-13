# Deployment Log

## 2026-05-13T11:37:42+08:00 - failure

- Summary: Deployment script aborted locally before sync because it was sourced by zsh instead of bash
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `unknown`
- Git commit: `unknown`
- Working tree dirty: `None`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-05-13T11:37:42+08:00`
- Verification status: `not_run`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- First attempt did not reach remote deployment steps
- rerunning with bash

Notes: none

## 2026-05-13T11:38:48+08:00 - failure

- Summary: Deployment aborted while composing nginx config because nginx variables were not escaped in local bash script
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `unknown`
- Git commit: `unknown`
- Working tree dirty: `None`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-05-13T11:38:48+08:00`
- Verification status: `not_run`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- Release files may have synced, but current service was not switched
- rerunning with escaped nginx variables

Notes: none

## 2026-05-13T11:42:31+08:00 - failure

- Summary: Deployment synced release and initialized SQLite, but PM2 command was not found after global install in non-login shell
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `unknown`
- Git commit: `unknown`
- Working tree dirty: `None`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-05-13T11:42:31+08:00`
- Verification status: `not_run`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- Switch to project-local SmartBuyManager/node_modules/.bin/pm2 and redeploy

Notes: none

## 2026-05-13T11:45:43+08:00 - success

- Summary: Deployed top-box-v2 SmartBuyManager with SmartBuyFramework to tool-124 using PM2 and Nginx
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `unknown`
- Git commit: `unknown`
- Working tree dirty: `None`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-05-13T11:45:43+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- nginx

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health
- http://127.0.0.1:3001/api/health

Known issues:
- PM2 is invoked from project-local SmartBuyManager/node_modules/.bin/pm2 instead of relying on global npm PATH

Notes: Current release: /www/wwwroot/top-box-v2/releases/20260513114255; public URL: http://124.221.245.146:3000; SQLite and logs persist under /www/wwwroot/top-box-v2/shared/storage

## 2026-08-11T11:29:00+08:00 - success

- Summary: 发布 HC 接口修复并更新 SmartBuy Manager 长任务执行逻辑
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `0431b8b`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-11T11:29:00+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- nginx

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health
- http://127.0.0.1:3001/api/health

Known issues:
- none

Notes: Current release: /www/wwwroot/top-box-v2/releases/20260811112400; rollback release: /www/wwwroot/top-box-v2/releases/20260513114255; NewBee impit common/init returned code 1; remote task count was 0 before restart

## 2026-08-11T11:30:21+08:00 - success

- Summary: 更正目标记录：已将 HC 修复版本成功发布到 tool-124
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `0431b8b`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-11T11:30:21+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- nginx

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health
- http://127.0.0.1:3001/api/health

Known issues:
- none

Notes: Correct target: root@124.221.245.146; current release: /www/wwwroot/top-box-v2/releases/20260811112400; rollback release: /www/wwwroot/top-box-v2/releases/20260513114255; previous entry inherited stale global host 141 and is superseded by this record

## 2026-08-11T18:23:26+08:00 - success

- Summary: 已发布 HC 按名称合成与最近成交查询能力
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `36d6407`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-11T18:23:26+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- nginx

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health
- http://127.0.0.1:3001/api/health

Known issues:
- none

Notes: Release 20260811181303；远程 npm ci --omit=dev、SQLite 初始化、PM2 重启及 Nginx reload 均成功；HC 成交指令解析与适配器能力已在远端验证。

## 2026-08-12T00:08:49+08:00 - success

- Summary: 已发布 Manager 商品配置初始化修复并启动福仔购买任务
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `36d6407`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-12T00:08:49+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- nginx

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health
- http://127.0.0.1:3001/api/health

Known issues:
- 福仔当前无不高于300的可用挂单，购买任务持续运行

Notes: Current release: /www/wwwroot/top-box-v2/releases/20260812000147; rollback release: /www/wwwroot/top-box-v2/releases/20260811235823; task: task_1786464209560_hc_list_1n705

## 2026-08-12T14:38:42+08:00 - success

- Summary: 发布HC列表分页间隔并在124完成奔马图购买验证
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2/releases/20260812143003`
- Auth method: `key`
- Git branch: `main`
- Git commit: `36d6407`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-12T14:38:42+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- none

Notes: 仅替换4个SmartBuyFramework文件并切换current；列表页间等待450ms；远端任务成功购买2个奔马图，单价22元，未出现405。

## 2026-08-12T14:54:55+08:00 - success

- Summary: 更新124 HC熔断为30/60/120秒并重启奔马图任务
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2/releases/20260812145336`
- Auth method: `key`
- Git branch: `main`
- Git commit: `36d6407`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-12T14:54:55+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- none

Notes: 仅更新HcAdapter默认EdgeOne熔断配置；停止旧任务并创建奔马图不超过21元购买87个的新任务 task_1786517639678_hc_list_yjm7h。

## 2026-08-12T18:02:15+08:00 - success

- Summary: 发布HC钱包筛选与任务进度修复
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2/releases/20260812175950`
- Auth method: `key`
- Git branch: `main`
- Git commit: `3c73a92`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-12T18:02:15+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- 远端仅有生产依赖，未运行Jest；PM2重启时记录一次既有SQLite重复关闭警告

Notes: 部署main@3c73a92；从线上release 20260812164728复制并应用提交补丁；Node语法检查和运行时断言通过；running=0、pending=0；未创建或启动购买任务；回滚点20260812164728

## 2026-08-12T18:02:37+08:00 - success

- Summary: 更正记录：发布HC钱包筛选与任务进度修复到tool-124
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2/releases/20260812175950`
- Auth method: `key`
- Git branch: `main`
- Git commit: `3c73a92`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-12T18:02:37+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- 远端仅有生产依赖，未运行Jest；PM2重启时记录一次既有SQLite重复关闭警告；上一条18:02:15记录的host被默认profile误写为141，本条更正为124

Notes: 实际部署目标为root@124.221.245.146；部署main@3c73a92；从线上release 20260812164728复制并应用提交补丁；Node语法检查和运行时断言通过；running=0、pending=0；未创建或启动购买任务；回滚点20260812164728

## 2026-08-13T00:01:00+08:00 - success

- Summary: 部署 TopBox QQ 机器人、NewBee 全部公告监控和开放私聊任务
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2/releases/20260812233243`
- Auth method: `key`
- Git branch: `main`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-13T00:01:00+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- topbox-napcat

Ports:
- 3000 (public Nginx)
- 3001 (localhost Manager)
- 3002 (localhost OneBot WebSocket)
- 6099 (localhost NapCat WebUI)

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- 服务器仅 1.7GiB 内存且 Swap 接近满载；NapCat 已限制为 384MiB

Notes: 基于线上 release 20260812175950 创建新 release；切换前 runningCount=0；QQ 1824945914 已在服务器扫码登录；OneBot 和 WebUI 仅监听 127.0.0.1；任意 QQ 私聊可提交合法任务格式；00:02:09 已用 QQ 396541997 完成普通私聊真人入站与自动回复验证；NewBee 公告基线为 32601；本机 Manager 和 NapCat 已停止；回滚点 20260812175950。
## 2026-08-13T12:27:01+08:00 - success

- Summary: 发布 NewBee 公告正文纯文本推送，移除详情页链接和正文 URL
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `3c73a92`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-13T12:27:01+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- topbox-napcat

Ports:
- 3001
- 3002

Health URLs:
- http://127.0.0.1:3001/api/health
- http://127.0.0.1:3001/api/status

Known issues:
- none

Notes: release 20260813122348；本地测试 20/20、远程测试 19/19；真实公告 32605 格式化验证无 HTML 和 URL；NapCat 未重启，公告游标保持 32605

## 2026-08-13T12:27:56+08:00 - success

- Summary: 发布 NewBee 公告正文纯文本推送，移除详情页链接和正文 URL
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `3c73a92`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-13T12:27:56+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- topbox-napcat

Ports:
- 3001
- 3002

Health URLs:
- http://127.0.0.1:3001/api/health
- http://127.0.0.1:3001/api/status

Known issues:
- none

Notes: 实际目标 root@124.221.245.146；release 20260813122348；本地测试 20/20、远程测试 19/19；真实公告 32605 格式化验证无 HTML 和 URL；NapCat 未重启，公告游标保持 32605；本条更正上一条被全局默认配置覆盖的主机字段


## 2026-08-13T17:48:00+08:00 - success

- Summary: QQ 私聊任务控制发布：中文菜单、任务绑定发起人、通知去重、幻藏上架、按名称取消、凭据改用环境变量下发
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `3c73a92`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-13T17:48:00+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager

Ports:
- 3001
- 3002

Health URLs:
- http://127.0.0.1:3001/api/health
- http://127.0.0.1:3001/api/status

Known issues:
- none（NapCat 日志已于发布后确认：fileLog=false、容器内 logs 目录为空、stdout 无明文，见 Notes）

Notes: release 20260813174244，回滚版本 20260813122348。同步 26 个文件（5 新增 / 21 更新）。本地测试 Manager 67/67、Framework 64/64；远程 Manager 67/67。安全修复三项：凭据改用 TOPBOX_COMMAND 环境变量下发（此前作为 argv 会经 /proc/<pid>/cmdline 全用户可读）、main.js 不再把完整指令写入 PM2 日志、修复 handleTaskError 传 camelCase 字段导致 SQLITE_ERROR 冒泡成 unhandledRejection 进而 process.exit 的链路（此前单任务失败会杀掉整个 Manager）。正确性修复两项：并发占用改为任务 ID 集合（此前重复减一会让 runningCount 变负，而它正是发布门禁）、stdout 按行缓冲（此前 chunk 边界会切断关键字致登录回执丢失）。发布前按用户要求清理日志：清理前 575M 含 34 处明文指令，用 truncate 清空（PM2 持有句柄，rm 不释放磁盘），清理后明文残留 0。远程 Jest 首跑 13 failed 系 FRAMEWORK_PATH 指向 current 而测试在切换前执行所致，指定新 release 路径后 67/67 通过；后续发布应在切 current 之后再测。NapCat 未重启，公告游标保持 32606。未执行任何真实购买、合成、取消或上架。

## 2026-08-13T18:20:00+08:00 - success

- Summary: 成交记录改上海时间并加表头；成交查询不再发登录回执（失败仍通知）；修复查询类任务缺失登录日志；清理数据库中 9 条历史任务的明文凭据
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `3c73a92`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-13T18:20:00+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager

Ports:
- 3001
- 3002

Health URLs:
- http://127.0.0.1:3001/api/health
- http://127.0.0.1:3001/api/status

Known issues:
- none

Notes: 同一 release 20260813174244 原地更新，未新建 release；回滚目标仍为 20260813122348。触发原因是用户首次真实使用 幻藏成交 后反馈的三个问题。修复内容：(1) 成交时间此前显示 UTC（2026-08-13T09:31:22.000Z）比本地早 8 小时，新增 HcAdapter.formatShanghaiTime() 用 Intl.DateTimeFormat 固定按 Asia/Shanghai 输出，不依赖服务器时区；UTC 值保留在 trades[].time 供程序用。(2) 三列无表头，首列 trade.no 是藏品编号／流水号而非订单号或价格，现加表头「编号｜价格｜成交时间」，并修正标题此前称 50 条却只列 20 行的问题。(3) 查询类任务收不到登录回执，根因是 core/TaskExecutor.executeTradeHistory 自写登录逻辑且完全不打印日志（购买、上架走的 authenticate() 会打印），QQ 侧依赖该日志判断，已改为复用 authenticate()。(4) 按用户要求，成交查询不再发登录回执（只读查询紧接着返回结果，回执属噪音），在 QQ 侧按 task_type 判断，失败通知保留，未改动框架日志。(5) 数据库 9 条历史任务存有明文米玛与支付米玛（脱敏仅对发布后新任务生效），新增一次性脚本 scripts/redact-existing-tasks.js（支持 --dry-run，幂等），先 .backup 备份为 smartbuy.db.bak-20260813181048，试运行确认后执行，独立复查确认手机号 0 处、凭据字段 0 个、command_string 全脱敏。脚本初版自检用 config.includes('"password"') 判断残留，把 authMode: "password" 误判成明文而报「仍有 10 条未清理」，已改为 JSON.parse 后按键名判断——数据当时已干净，属自检误报。测试 Framework 68/68、Manager 73/73 共 141 条，新增 10 条覆盖时间格式化、跨日转换、表头、截断提示、成交不发回执、成交失败仍通知、其他任务回执不变。发布后核查 NapCat：fileLog=false、onebot11.json debug=false、容器内 logs 目录为空、stdout 无明文；端口 3002/6099 仅绑 127.0.0.1 且公网实测不可连通。未执行任何真实购买、合成、取消或上架。

## 2026-08-13T19:49:00+08:00 - success

- Summary: 失败通知改为上报子进程的真实原因（米玛错误不再显示为"任务异常结束"）
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `3c73a92`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-13T19:49:00+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager

Ports:
- 3001
- 3002

Health URLs:
- http://127.0.0.1:3001/api/health
- http://127.0.0.1:3001/api/status

Known issues:
- none

Notes: 同一 release 20260813174244 原地更新，回滚目标仍为 20260813122348。触发原因：用户用错误米玛提交购买任务后只收到"任务失败：任务异常结束，请稍后重试"，易误判为程序故障。根因是 Manager 在子进程退出时把 error_message 填成"进程退出码: 1"，而真实原因（"message": "密码不正确"、"type": "LOGIN_FAILED"）只存在于子进程日志中，从未被采集。修复：TaskExecutor 新增 extractFailureReason()，从 stdout/stderr 识别序列化错误对象的 message/msg 字段及"登录认证失败: xxx"类带标签文案，保留最早出现的根因；进程失败时优先上报该原因，退出码仅兜底。QQBotBridge.describeFailure() 补充 密码不正确 / LOGIN_FAILED 匹配。关键约束是不能误伤正常进度日志——抢购任务等挂单期间持续输出"❌ 没有符合条件的商品"与"⚠️ 执行错误: NO_QUALIFIED_PRODUCTS"，若误判会把运行中的任务报成失败，已写断言守住。测试 Manager 80/80（远程同样 80/80）、Framework 68/68。本次重启完整验证了 A 方案重启善后：运行中的抢购任务标为 interrupted（区别于 failed）、task-interrupted 通知送达、子进程无残留、日志输出"已清理 1 个重启残留任务"。线上实测米玛错误现显示"任务失败：账号或米玛不正确"。NapCat 未重启（已持续 8 小时）。用户此前运行的福仔任务（上限 300）因重启中断，需重新提交。

## 2026-08-13T20:05:00+08:00 - success

- Summary: 新增 QQ 任务管理指令（获取任务／停止任务）与 HC 自适应请求间隔，含跨进程并发分摊
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `feat/qq-task-control`
- Git commit: `dff59f4`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-13T20:05:00+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager

Ports:
- 3001
- 3002

Health URLs:
- http://127.0.0.1:3001/api/health
- http://127.0.0.1:3001/api/status

Known issues:
- platforms/hc/HcAdapter.js:585 硬编码验证码识别服务（ttshitu）默认密码 qwer1234。非平台账号凭据且 HEAD 中本就存在，建议改为只从 TTSHITU_PASSWORD 读取（不属本次范围）

Notes: 同一 release 20260813174244 原地更新，回滚目标仍为 20260813122348。代码已提交到分支 feat/qq-task-control（commit dff59f4，47 文件 +6355 行），main 保持 3c73a92 作为回退点。新增任务管理：获取任务／停止任务-N／停止任务-全部，编号为列表临时序号（任务 ID 形如 task_1786616673616_hc_list_845ni 无法在手机输入），按编号停止须先查列表兼作防手滑确认，编号 5 分钟过期，仅能操作自己的任务。自适应调频：此前列表与快捷实际都跑 800ms，因 CommandParser 硬编码 interval: 800 使 config/intervals/hc.js 从未生效，清除后新增 AdaptiveIntervalController，起点 500ms、连续 20 次成功提速 50ms、被拦截退 4 档并记住不安全档位。Review 抓到三个实质缺陷并修复：(1) blockedInterval 原为永久墙，撞过一次就再回不去，与"平台放松应能受益"矛盾，加 blockedRetryMs 30 分钟后重探，blockedAt 一并落盘否则重启后墙永久有效；(2) batch 会被压到 300ms，批量下单请求更重不该与列表同频，改按模式隔离用 600-1500ms；(3) 并发进程集体误判——购买任务各自独立子进程仅看自己，会一起探到下限而平台侧合计流量超标，最终集体撞墙退避形成震荡，查历史确认并发是常态（31 对任务曾时间重叠），故用 .hc-active-procs.json 登记心跳（30 秒 TTL）按活跃进程数分摊 maxRequestsPerSecond=4，实测单进程 300ms、5 并发被压到 500-1000ms。状态按模式落盘、1 小时过期、临时文件+rename 写入，已加 gitignore（与出口 IP 相关，发布时不可同步）。文档核对：hc/README.md 中 12 项数值与代码逐一比对一致。测试 209 条（Framework 107、Manager 102）。未执行任何真实购买、合成、取消或上架。
