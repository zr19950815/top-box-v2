# QQ Bot 本地运行

本机使用 NapCat 官方 Docker 镜像运行 Linux ARM64 QQ，规避 macOS QQ 历史版本与 NapCat 不兼容的问题。QQ 和 NapCat 数据持久化在 `storage/napcat/`，该目录不会提交到 Git。

## 本地快速启动

本地已经保留以下运行环境，无需重新安装：

- NapCat `linux/arm64` Docker 镜像
- 已创建的 `topbox-napcat` 容器
- `storage/napcat/` 中的 QQ/NapCat 登录数据和 OneBot 配置
- Manager 的 `dotenv`、`ws` 等 Node.js 依赖

服务器目前也登录了同一个 QQ。切回本地前必须先停止服务器上的 Manager 和 NapCat，否则两个实例会同时接收私聊、创建任务或推送公告。

先在服务器停止服务：

```bash
ssh root@124.221.245.146
cd /www/wwwroot/top-box-v2/current/SmartBuyManager
./node_modules/.bin/pm2 stop smartbuy-manager
docker compose --env-file .env -f docker-compose.qq-bot.yml stop
```

然后在本机启动：

```bash
cd /Users/zhangrui2/Desktop/workSpace/ky/top-box-v2/SmartBuyManager
npm run qq:up
node backend/server.js
```

出现以下日志表示本地链路已经建立：

```text
QQ Bot 已连接 NapCat: ws://127.0.0.1:3002
```

另开终端检查运行状态：

```bash
docker ps --filter name=topbox-napcat
curl -gfsS 'http://[::1]:3001/api/status'
```

状态中的 `qqBot.connected` 应为 `true`。

NapCat WebUI 仅监听本机：`http://127.0.0.1:6099/webui`。首次运行从日志或 WebUI 扫码：

```bash
npm run qq:logs
```

如果日志显示“登录态已失效”，重新执行 `npm run qq:logs`，扫描最新二维码并在手机 QQ 确认。不要复制旧二维码，二维码大约两分钟后失效。

## 配置

复制 `.env.example` 为 `.env`，至少配置：

```dotenv
QQ_BOT_ENABLED=true
QQ_BOT_WS_URL=ws://127.0.0.1:3002
QQ_BOT_ACCESS_TOKEN=<随机 token>
QQ_BOT_WEBUI_TOKEN=<随机 token>
QQ_BOT_ACCOUNT=<机器人 QQ 号，用于重启后快速登录>
QQ_BOT_DIRECT_COMMANDS_ENABLED=true
QQ_BOT_PRIVATE_TEST_REPLY=TopBox 已收到你的私聊消息，连接正常。
NEWBEE_ANNOUNCEMENT_ENABLED=true
NEWBEE_ANNOUNCEMENT_QQ_GROUP=<接收 NewBee 公告的群号>
```

OneBot 服务和 WebUI 端口都通过 Docker 映射限制为 `127.0.0.1`。

没有 QQ 白名单，也没有群白名单：私聊任务对所有好友开放，谁提交任务，任务就绑定给谁；群聊不提供任何交互功能，只用于单向接收公告。控制范围靠控制机器人的好友列表实现。

## 任务格式

私聊发送“菜单”获取当前支持的格式：

```text
幻藏指定-账号-米玛-支付米玛-藏品*数量*价格
幻藏自助-账号-米玛-支付米玛-藏品*数量*价格
幻藏批量-账号-米玛-支付米玛-藏品*数量*价格
幻藏合成-账号-米玛-合成名称
幻藏成交-账号-米玛-藏品名称
幻藏取消-账号-米玛-支付米玛-藏品名称
幻藏上架-账号-米玛-支付米玛-藏品*数量*价格
```

对应的框架指令依次为 `hc列表`、`hc快捷`、`hc批量`、`hc合成`、`hc成交`、`hc取消`、`hc上架`，原有的 `hc` 前缀写法继续可用。

`幻藏成交` 只查询最近成交记录，没有副作用。`幻藏取消` 和 `幻藏上架` 都接收藏品名称，由适配器解析成 `product_id`，不需要输入 ID。

## 任务管理

私聊发送以下指令查看和停止自己的任务：

```text
获取任务          列出运行中的任务并编号
停止任务-1        停止 1 号任务
停止任务-全部     停止自己的全部任务
```

`获取任务` 的回复：

```text
你的运行中任务（2 个）：
1. 幻藏指定 福仔：墨镜蓝蓝 ≤300 已购 0/1
2. 幻藏上架 奔马图 ×2 @50

停止：停止任务-1
全部停止：停止任务-全部
```

三点说明：

- **编号是本次列表的临时序号，不是任务 ID。** 任务 ID 形如
  `task_1786616673616_hc_list_845ni`，无法在手机上输入。因此 `停止任务-N` 必须
  先发 `获取任务` 拿到编号——这同时也是一道确认，避免手滑停错。
  `停止任务-全部` 不需要先查列表。
- **编号 5 分钟过期**，防止用旧列表停到新任务上。过期后重发 `获取任务` 即可。
  可用 `QQ_BOT_TASK_SELECTION_TTL_MS` 调整。
- **只能看到和停止自己的任务。** 复用 `tasks.qq_user_id` 归属，别人的任务不会
  出现在列表里，编号也对不上。

任务描述取自已脱敏的 `config`，不含米玛与完整手机号。

## 指令

- `/topbox ping`：连通性检查
- `/topbox status`：查看任务统计

建任务只有一条入口：私聊直接发送上面的任务格式。此前的 `/topbox run` 已移除，避免两条入口的校验规则各自演化后出现漏检。群消息一律不解析、不建任务、不回复。

启用 `QQ_BOT_DIRECT_COMMANDS_ENABLED` 后，私聊中的合法任务格式会被受理。无法解析的普通消息静默忽略；配置 `QQ_BOT_PRIVATE_TEST_REPLY` 后，普通私聊会收到该测试回复。

## 任务归属与通知

每个任务记录发起人的 QQ 号并落库（`tasks.qq_user_id`），归属关系跨进程重启保留。通知只发给该 QQ，不广播；也无法查询或停止别人的任务。

只在这些节点通知，中间状态不打扰：

| 时机 | 内容 |
| --- | --- |
| 登录成功、任务真正开始运行 | `登录成功，任务已启动`（`幻藏成交` 除外，见下） |
| 购买类任务支付成功、已购数量增加 | `支付成功，已购数量：N/M` |
| 合成成功 | `合成成功` |
| 取消寄售成功 | `取消成功` |
| 上架结束 | `上架完成：成功 N，失败 M`，库存不足或提前中止时补充说明 |
| 成交查询完成 | 成交记录表格，见下文 |
| 任务失败 | `任务失败：<可读原因>` |

受理阶段刻意不回执：登录可能失败，提前回“已受理”会给出错误结论，因此失败必须有出口。

`幻藏成交` 不发登录回执，只在查完后回一条记录、失败时回失败原因。它是只读查询，
紧接着就会返回结果，登录回执属于噪音。其余任务从登录到出结果可能等很久，回执用来
确认任务已经跑起来，因此保留。

### 成交记录格式

```text
最近成交记录（50 条，显示前 20 条）：
编号｜价格｜成交时间
29206960｜300｜2026-08-13 17:31:22
```

首列是藏品编号（平台的 `trade.no`，即每个数字藏品的唯一流水号），**不是订单号，也不是
价格**。时间为上海时间，由 `HcAdapter.formatShanghaiTime()` 固定按 `Asia/Shanghai`
格式化，不依赖服务器时区设置。平台返回的是 Unix 秒，UTC 值仍保留在结果对象的 `time`
字段供程序使用，只是不向用户展示——直接展示会比本地时间早 8 小时。

最多查 50 条，消息里只列前 20 条，标题会说明总数与实际显示数。

去重由 `task_notifications` 表的 `(task_id, event_key)` 主键保证，同一事件只发一次；“支付成功”与“已购数量变化”是同一条通知，不重复发送。通知发送失败只记日志，不会影响购买、合成、取消或上架。

服务重启时，上个进程残留的 `running` / `pending` 任务会被统一标成 `interrupted`，并向发起人发送 `服务重启，任务已中断，请重新提交`。执行凭据只存在内存中、从不落盘，因此无法自动恢复执行。若此时尚未连上 NapCat，通知会先入队，连接就绪后补发。

## 凭据处理

- 任务指令通过 `TOPBOX_COMMAND` 环境变量下发给子进程，不作为命令行参数。argv 会落在 `/proc/<pid>/cmdline`，该文件对所有用户可读（`ps aux` 即可看到米玛）；环境变量落在 `/proc/<pid>/environ`，仅同 UID 与 root 可读。
- 数据库只保存脱敏后的指令类型（如 `幻藏指定-[已脱敏]`），`config` 字段不含米玛、支付米玛与 token，手机号存为 `138****1111`。
- QQ 回复、PM2 日志与错误日志都不回显米玛和支付米玛，手机号统一脱敏。脱敏规则集中在 `backend/utils/redact.js`。
- NapCat 不会把消息内容落盘：配置中 `fileLog: false`、`onebot11.json` 的 `debug: false`，容器内 `/app/napcat/logs` 为空，Docker stdout 中也无明文（2026-08-13 核查）。**若排障时临时开启 `debug`，会打印完整事件 JSON 从而带出原始私聊消息，事后必须关闭。**
- 仍然无法覆盖的是 QQ 聊天记录：用户发送的指令明文留在双方客户端与腾讯服务端，项目无法清理。

### 清理历史任务中的明文凭据

任务脱敏自 2026-08-13 发布起生效，**只对新建任务有效**。该发布之前入库的任务，
`command_string` 保存了完整指令（含登录米玛与支付米玛），`config` 里也留有
password / payPassword / token 字段。用一次性脚本清理：

```bash
cd /www/wwwroot/top-box-v2/current/SmartBuyManager
# 先备份
sqlite3 storage/database/smartbuy.db ".backup storage/database/smartbuy.db.bak-$(date +%Y%m%d%H%M%S)"
# 试运行，只报告不改动
node scripts/redact-existing-tasks.js --dry-run
# 实际执行
node scripts/redact-existing-tasks.js
```

脚本幂等，已脱敏的记录会跳过，可重复运行。执行后自检会复查全库是否仍有残留。

如需自行确认，可直接扫描（应全部为 0）：

```bash
python3 -c "
import sqlite3, re, json
c = sqlite3.connect('storage/database/smartbuy.db')
rows = list(c.execute('SELECT command_string, config FROM tasks'))
print('11 位手机号:', len(re.findall(r'\b1[3-9]\d{9}\b', str(rows))))
print('凭据字段:', sum(1 for _, cfg in rows if cfg and any(k in json.loads(cfg) for k in ('password','payPassword','token','auth'))))
print('未脱敏指令:', sum(1 for cs, _ in rows if cs and '[已脱敏]' not in cs))
"
```

注意判断凭据字段要按解析后的键名，不要用子串匹配：`config` 中的 `authMode` 值就是
`"password"`，子串匹配会误报。

## NewBee 公告

启用 `NEWBEE_ANNOUNCEMENT_ENABLED` 后，Manager 默认每 60 秒读取一次 NewBee “全部”公告列表。首次启动只建立基线，不发送历史公告；之后按发布时间识别新公告，多条公告按从旧到新依次发送到配置群。每条消息包含标题、发布时间和从公告详情接口提取的纯文本正文，不发送详情页链接，正文中的 URL 也会移除。正文获取或 QQ 发送失败时不会推进游标，下一轮会继续重试。发送成功的公告游标保存在 `storage/qq/newbee-announcement.json`，重启不会重复推送。

QQ 服务端可能使容器保存的快速登录态失效。此时 NapCat 会自动回退到二维码登录，重新执行 `npm run qq:logs` 扫码即可。不要为了免扫码把 QQ 密码提交到项目配置中。

## 暂停本地环境

只暂停服务并保留容器、镜像和登录数据：

```bash
# 在运行 Manager 的终端按 Ctrl+C
npm run qq:stop
```

恢复时执行：

```bash
npm run qq:up
node backend/server.js
```

## 删除本地环境

`qq:down` 会删除容器和 Compose 网络，但仍保留镜像及 `storage/napcat/` 登录数据。日常切换请优先使用上面的 `stop`，启动速度更快。

```bash
npm run qq:down
```

## 从本地切回服务器

先按“暂停本地环境”停止本机，再在服务器恢复：

```bash
ssh root@124.221.245.146
cd /www/wwwroot/top-box-v2/current/SmartBuyManager
docker compose --env-file .env -f docker-compose.qq-bot.yml up -d --pull never
./node_modules/.bin/pm2 restart smartbuy-manager --update-env
curl -fsS http://127.0.0.1:3001/api/status
```

确认返回的 `qqBot.connected` 为 `true` 后，才算切换完成。
