# KyArt Platform Adapter

KyArt 平台适配器，负责将 KyArt 平台 API 适配到 SmartBuy Framework 标准接口。

## 文件说明

- `KyArtAdapter.js` - KyArt 适配器主要实现
- `commands.js` - KyArt 平台指令映射配置
- `test/adapter.test.js` - 适配器测试用例

## 支持功能

- ✅ 列表模式抢购
- ✅ 快捷模式抢购
- ✅ 批量模式抢购
- ✅ 合成确认
- ✅ 取消寄售
- ✅ 自动登录和 Token 管理

## 指令格式

```bash
# 抢购指令
node cli ky列表-手机号-登录密码-支付密码-商品ID*数量*最高价格
node cli ky快捷-手机号-登录密码-支付密码-商品ID*数量*最高价格
node cli ky批量-手机号-登录密码-支付密码-商品ID*数量*最高价格

# 简单任务
node cli ky合成-手机号-登录密码-支付密码-合成ID
node cli ky取消-手机号-登录密码-支付密码-寄售ID
```

## 开发状态

🚧 待迁移...

计划从现有 kyart-smart-buyer.js 迁移核心逻辑。
