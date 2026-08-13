# HC Platform Adapter

This adapter ports the HC / Huancang API flow from `hc-node` into the
SmartBuy framework shape.

Supported first-pass commands:

```bash
node cli.js "hc列表-手机号-米玛-支付米玛-藏品名称或ID*数量*最高价格"
node cli.js "hc批量-手机号-米玛-支付米玛-藏品名称或ID*数量*最高价格"
node cli.js "hc快捷-手机号-米玛-支付米玛-藏品名称*数量*最高价格"
node cli.js "hc列表-[token]-支付米玛-藏品名称或ID*数量*最高价格"
node cli.js "hc合成-手机号-米玛-合成名称"
# 旧格式仍兼容：node cli.js "hc合成-手机号-米玛-支付米玛-合成ID:素材实例ID1,素材实例ID2"
node cli.js "hc成交-手机号-米玛-藏品名称或ID"
node cli.js "hc取消-手机号-米玛-支付米玛-藏品名称"
node cli.js "hc上架-手机号-米玛-支付米玛-藏品名称*数量*挂单价"
```

QQ 机器人使用的中文别名依次对应：`幻藏指定`、`幻藏批量`、`幻藏自助`、`幻藏合成`、
`幻藏成交`、`幻藏取消`、`幻藏上架`。

The product field may be either a numeric product ID or a collection name. When a
name is not found in `config/products/hc.js`, the adapter calls the marketplace
search API for the current product types (`19` and `25`) and updates that config
file automatically. These defaults can be overridden with the adapter option
`catalogProductTypes` when HC adds another market category.

For `hc合成`, the adapter first loads `config/combinations/hc.js`. If the named
activity is absent, it fetches the official activity catalog and each activity's
material recipe, then writes the resulting name → activity code/material mapping
to that file. Before submitting, it queries the current account's inventory for
each recipe material (`/api/user_collect?type=confirm`) and submits the usable
material instance IDs. It never stores account credentials or instance IDs in the
config file, and it stops before submission when any material group is short.

## 最近成交查询

使用 `hc成交-手机号-米玛-藏品名称或ID` 查询最近最多 50 笔成交。该命令
会登录后调用 NewBee 的 `/api/market/getTradeList`，仅返回成交编号、价格和成交
时间，不会创建订单、合成或修改账号资产。例如：

```bash
node cli.js "hc成交-手机号-米玛-NEWBEE门票"
```

## 取消寄售

`hc取消-手机号-米玛-支付米玛-藏品名称` 接收藏品名称而不是 ID。适配器先用
`resolveProductId` 解析名称（静态 `config/products/hc.js` 未命中时走动态目录
同步），再调用 `/api/user_collect/batchCancelSale` 取消该藏品的全部寄售。

## 批量上架

`hc上架-手机号-米玛-支付米玛-藏品名称*数量*挂单价`。第三段是精确的挂单价，
与买入指令里作为上限的“最高价格”语义不同，因此上架有独立的参数解析。

执行流程：

1. 用 `resolveProductId` 解析藏品名称。
2. 分页读取 `/api/user_collect`（`product_type=virtual`、`type=own_valid`、
   `per_page=50`），筛选 `status === "2"` 的可上架资产。缺少 `has_more` 字段时
   退回 `current_page` / `last_page` 比较，避免库存超过 50 个时只取到第一页。
3. 逐个调用 `/api/user_collect/onSaleNew`，提交 `cid`、`item_id`、`product_id`、
   `sn`、`amount`、`pay_password`、`paytypes=140`，默认间隔 2400ms。

数量与失败处理：

- 请求数量超过实际库存时不整批失败，改为“有几个上几个”。返回值中
  `requestedCount` 与 `availableCount` 的差值即为缺口。
- 重试是有限的，且按错误类型分流。支付米玛错误、风控拦截、账号状态异常会
  **立即中止整批**，不做重试——连撞错误米玛可能触发平台锁定。只有网络类错误
  才重试（默认 3 次）。单件资产自身的问题（如已寄售）只跳过它，继续处理其余。
- 返回结构化结果供上层生成通知：`requestedCount`、`availableCount`、
  `attemptedCount`、`successCount`、`failureCount`、`aborted`、`abortedReason`
  以及逐件的 `results`。

## 自适应请求间隔

抢购任务的轮询间隔由 `core/AdaptiveIntervalController` 动态调整，配置见
`config/intervals/hc.js` 的 `adaptive` 段。

设计取向是**从已验证安全的间隔起步、小步提速，被拦截则大步退避**，而不是先撞墙
再回退：EdgeOne 拦截的代价是分钟级冷却，期间完全无法抢单，远高于平时快几十毫秒
的收益。因此退避（默认 4 档）比提速（1 档）果断。

| 项 | 值 | 说明 |
| --- | --- | --- |
| 起始间隔 | list/quick 500ms，batch 800ms | 取 `base.<mode>` |
| 区间 | list/quick 300–1000ms，batch 600–1500ms | batch 一次提交多单、请求更重，不与列表同频 |
| 步长 | 50ms | |
| 提速条件 | 连续 20 次无异常 | 从 500 探到 300 约需 80 次请求 |
| 拦截退避 | 4 档（200ms） | 并记住该档不安全 |
| 异常退避 | 1 档（50ms） | 网络类错误，不封死档位 |

几个关键行为：

- **`NO_QUALIFIED_PRODUCTS` 记为成功。** 市场上暂无符合价格的挂单是正常业务状态，
  不是限流信号。抢购任务等挂单期间会持续产生它，若据此降速，任务会越等越慢。
- **被拦截的档位会被记住**，提速时不再越过，避免反复撞同一面墙。但这道墙不是
  永久的——`blockedRetryMs`（默认 30 分钟）后允许重新试探，因为平台限制随时段与
  策略变化，放松了应当能受益。
- **EdgeOne 熔断直接作为负反馈信号**，不另造检测。注意熔断路径内部已记录一次，
  策略层用 `cooldownMs > 0` 区分，避免双倍退避。
- **跨进程分摊总预算。** 购买任务各自是独立子进程（默认可并发 10 个），只看自己
  的话会一起探到下限——各自都不被拦截，但平台侧合计流量早已超标，最终集体撞墙、
  集体退避形成震荡。因此用 `.hc-active-procs.json` 登记进程心跳（30 秒 TTL），
  把 `maxRequestsPerSecond`（默认 4）按活跃进程数分摊。

探到的值按模式落盘到 `config/intervals/.hc-adaptive-<mode>.json`，避免每次重启
都从头试探（每档需累积 20 次成功）。状态 1 小时过期。这些文件属运行期状态且与
出口 IP 相关，已在 `.gitignore` 中排除。

实际请求节奏比配置值慢：间隔从循环开始计时、包含请求自身耗时（200–400ms），
list/quick 另叠加 ±1/9 抖动（固定频率最容易被识别）。

关闭自适应：把 `adaptive.enabled` 设为 `false`，或构造适配器时传
`adaptiveInterval: false`，策略层会退回静态配置。

HC protects its API with Tencent EdgeOne and rejects the default Node.js TLS
fingerprint. The adapter therefore uses an `impit` Chrome-compatible transport
for the complete HC request chain by default. It honors `HTTPS_PROXY`,
`HTTP_PROXY`, or `ALL_PROXY`; adapter option `proxyUrl` takes precedence. Set
`useBrowserTransport: false` only when the deployment network accepts ordinary
Node.js HTTPS requests.

The browser-compatible transport requires Node.js 20 or newer.

Password login uses the legacy `hc-node` captcha solving credentials by default.
You can override them with environment variables or adapter options:

```bash
TTSHITU_USERNAME=xxx TTSHITU_PASSWORD=yyy node cli.js "hc列表-手机号-米玛-支付米玛-藏品名称或ID*1*最高价格"
```
