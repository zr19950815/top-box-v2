# HC Platform Adapter

This adapter ports the HC / Huancang API flow from `hc-node` into the
SmartBuy framework shape.

Supported first-pass commands:

```bash
node cli.js "hc列表-手机号-登录密码-支付密码-商品ID*数量*最高价格"
node cli.js "hc批量-手机号-登录密码-支付密码-商品ID*数量*最高价格"
node cli.js "hc快捷-手机号-登录密码-支付密码-藏品名称*数量*最高价格"
node cli.js "hc列表-[token]-支付密码-商品ID*数量*最高价格"
node cli.js "hc合成-手机号-登录密码-支付密码-合成ID:素材ID1,素材ID2"
node cli.js "hc取消-手机号-登录密码-支付密码-商品ID"
```

The product field may be either a numeric product ID or a collection name. When a
name is not found in `config/products/hc.js`, the adapter calls the marketplace
search API for the current product types (`19` and `25`) and updates that config
file automatically. These defaults can be overridden with the adapter option
`catalogProductTypes` when HC adds another market category.

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
TTSHITU_USERNAME=xxx TTSHITU_PASSWORD=yyy node cli.js "hc列表-手机号-登录密码-支付密码-商品ID*1*最高价格"
```
