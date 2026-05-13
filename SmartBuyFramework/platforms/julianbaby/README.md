# JulianBaby / Bull Box 平台接入说明

当前已接入能力：

- 登录 `POST /api/user/login`
- Token 校验 `POST /api/user/getUserInfo`
- 市场/盲盒基础商品发现

当前未完成能力：

- 普通下单
- 快捷下单
- 批量下单
- 支付链路
- 合成确认
- 取消寄售

推荐调试顺序：

1. 先验证登录和 token
2. 再确认市场详情页、下单页真实提交接口
3. 最后补支付和其他任务接口
