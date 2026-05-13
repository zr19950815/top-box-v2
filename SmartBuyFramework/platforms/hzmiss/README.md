# HzMiss Platform Adapter

HzMiss平台适配器，负责将HzMiss平台API适配到SmartBuy Framework标准接口。

## 文件说明

- `HzMissAdapter.js` - HzMiss适配器主要实现
- `commands.js` - HzMiss平台指令映射配置
- `test/adapter.test.js` - 适配器测试用例

## 支持功能

- ✅ 列表模式抢购
- ✅ 快捷模式抢购  
- ✅ 批量模式抢购
- ✅ 合成确认
- ✅ 取消寄售
- ✅ 自动登录和Token管理

## 指令格式

```bash
# 抢购指令
node cli hz列表-手机号-登录密码-支付密码-商品ID*数量*最高价格
node cli hz快捷-手机号-登录密码-支付密码-商品ID*数量*最高价格  
node cli hz批量-手机号-登录密码-支付密码-商品ID*数量*最高价格

# 简单任务
node cli hz合成-手机号-登录密码-支付密码-合成ID
node cli hz取消-手机号-登录密码-支付密码-寄售ID
```

## 开发状态

🚧 待迁移...

计划从现有hzmiss-smart-buyer.js迁移核心逻辑。