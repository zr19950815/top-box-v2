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
