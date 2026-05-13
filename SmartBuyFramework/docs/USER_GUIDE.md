# SmartBuy Framework - 用户使用指南

## 概述

SmartBuy Framework 是一个多平台智能购物自动化框架，支持多种抢购策略和平台。本指南将帮助您快速上手使用框架的各种功能。

## 快速开始

### 安装和启动

1. **克隆项目**
```bash
git clone <repository-url>
cd SmartBuyFramework
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
nano .env
```

4. **启动框架**
```bash
# 交互式CLI模式
node cli.js

# 直接执行命令
node cli.js "kyart purchase list productId=123 quantity=2"

# 程序化调用
node main.js
```

### 基本配置

创建用户配置文件 `config/user.json`:

```json
{
  "platforms": {
    "kyart": {
      "account": "your-account",
      "password": "your-password",
      "payPassword": "your-pay-password"
    },
    "hzmiss": {
      "account": "your-account", 
      "password": "your-password",
      "payPassword": "your-pay-password"
    }
  },
  "preferences": {
    "defaultStrategy": "list",
    "maxRetries": 3,
    "logLevel": "info"
  }
}
```

## 支持的平台

### KyArt 平台

**功能特性:**
- ✅ 列表抢购
- ✅ 快捷抢购  
- ✅ 批量抢购
- ✅ 商品合成
- ✅ 订单取消
- ✅ 订单查询

**认证要求:**
- 账号 (手机号/邮箱)
- 登录密码
- 支付密码 (可选)

### HzMiss 平台

**功能特性:**
- ✅ 列表抢购
- ✅ 快捷抢购
- ✅ 批量抢购
- ✅ 商品查询
- ✅ 订单查询

**认证要求:**
- 账号 (手机号/邮箱)
- 登录密码
- 支付密码 (可选)

## 命令使用说明

### 命令格式

```
<platform> <action> [subAction] [参数1=值1] [参数2=值2] ...
```

### 1. 抢购相关命令

#### 列表抢购
从商品列表中选择商品进行抢购，适用于需要浏览和筛选商品的场景。

```bash
# KyArt 列表抢购
node cli.js "kyart purchase list productId=123456"
node cli.js "kyart purchase list productId=123456 quantity=2"
node cli.js "kyart purchase list productId=123456 quantity=2 payPassword=123456"

# HzMiss 列表抢购
node cli.js "hzmiss purchase list productId=789012"
node cli.js "hzmiss purchase list productId=789012 quantity=1 payPassword=654321"
```

**参数说明:**
- `productId`: 商品ID (必需)
- `quantity`: 购买数量，默认为1
- `payPassword`: 支付密码 (可选，优先使用配置文件中的密码)

#### 快捷抢购
已知商品ID的快速抢购，最小化请求次数，提高抢购成功率。

```bash
# KyArt 快捷抢购  
node cli.js "kyart purchase quick productId=123456"
node cli.js "kyart purchase quick productId=123456 quantity=3"

# HzMiss 快捷抢购
node cli.js "hzmiss purchase quick productId=789012"
node cli.js "hzmiss purchase quick productId=789012 quantity=2"
```

**参数说明:**
- `productId`: 商品ID (必需)
- `quantity`: 购买数量，默认为1

#### 批量抢购
同时抢购多个商品，支持不同数量配置。

```bash
# 抢购多个商品，数量相同
node cli.js "kyart purchase batch productIds=123,456,789 quantity=2"

# 抢购多个商品，数量不同
node cli.js "kyart purchase batch productIds=123,456,789 quantities=1,2,3"

# HzMiss 批量抢购
node cli.js "hzmiss purchase batch productIds=111,222,333 quantities=2,1,4"
```

**参数说明:**
- `productIds`: 商品ID列表，用逗号分隔 (必需)
- `quantity`: 统一购买数量 (与quantities二选一)
- `quantities`: 各商品购买数量，用逗号分隔 (与quantity二选一)

### 2. 查询相关命令

#### 商品查询
搜索和查询商品信息。

```bash
# 关键词搜索
node cli.js "kyart query products keyword=手机 limit=20"
node cli.js "hzmiss query products keyword=笔记本 category=电子产品"

# 分类筛选
node cli.js "kyart query products category=数码 minPrice=1000 maxPrice=5000"

# 价格范围查询
node cli.js "hzmiss query products minPrice=500 maxPrice=2000 limit=10"
```

**参数说明:**
- `keyword`: 搜索关键词 (可选)
- `category`: 商品分类 (可选)
- `minPrice`: 最低价格 (可选)
- `maxPrice`: 最高价格 (可选)  
- `limit`: 返回数量限制，默认10
- `offset`: 分页偏移量，默认0

#### 订单查询
查询订单状态和详细信息。

```bash
# 查询特定订单
node cli.js "kyart query orders orderId=ORDER123456789"
node cli.js "hzmiss query orders orderId=HZ987654321"

# 查询订单列表
node cli.js "kyart query orders status=pending limit=5"
node cli.js "hzmiss query orders status=completed limit=10"
```

**参数说明:**
- `orderId`: 订单ID (可选)
- `status`: 订单状态筛选 (可选)
  - `pending`: 待付款
  - `paid`: 已付款
  - `shipped`: 已发货
  - `completed`: 已完成
  - `cancelled`: 已取消
- `limit`: 返回数量限制，默认10
- `offset`: 分页偏移量，默认0

### 3. 管理相关命令

#### 订单取消
取消未付款或可取消的订单。

```bash
# 取消特定订单
node cli.js "kyart manage cancel orderId=ORDER123456789"
node cli.js "hzmiss manage cancel orderId=HZ987654321"

# 批量取消订单
node cli.js "kyart manage cancel orderIds=ORDER123,ORDER456,ORDER789"
```

**参数说明:**
- `orderId`: 要取消的订单ID (与orderIds二选一)
- `orderIds`: 要取消的订单ID列表，用逗号分隔 (与orderId二选一)

#### 商品合成 (KyArt专用)
将多个低等级商品合成为高等级商品。

```bash
# 合成指定商品
node cli.js "kyart manage merge productId=123456 targetLevel=5"
node cli.js "kyart manage merge productId=123456 quantity=10 targetLevel=3"

# 自动合成策略
node cli.js "kyart manage merge productId=123456 strategy=auto maxLevel=10"
```

**参数说明:**
- `productId`: 要合成的商品ID (必需)
- `quantity`: 合成数量，默认自动计算
- `targetLevel`: 目标等级 (必需)
- `strategy`: 合成策略
  - `manual`: 手动合成
  - `auto`: 自动合成
- `maxLevel`: 最大合成等级 (auto策略时使用)

### 4. 系统相关命令

#### 认证管理

```bash
# 登录到平台
node cli.js "kyart auth login account=user@example.com password=123456"
node cli.js "hzmiss auth login account=13800138000 password=abcdef"

# 登出
node cli.js "kyart auth logout"
node cli.js "hzmiss auth logout"

# 检查认证状态
node cli.js "kyart auth status"
node cli.js "hzmiss auth status"

# 刷新Token
node cli.js "kyart auth refresh"
```

#### 配置管理

```bash
# 查看当前配置
node cli.js "system config show"

# 更新配置
node cli.js "system config set key=value"
node cli.js "system config set logLevel=debug maxRetries=5"

# 重置配置
node cli.js "system config reset"
```

#### 日志和调试

```bash
# 查看日志
node cli.js "system logs show"
node cli.js "system logs show level=error limit=50"

# 清理日志
node cli.js "system logs clear"

# 开启调试模式
DEBUG=smartbuy:* node cli.js "kyart purchase list productId=123"
```

## 交互式模式

启动交互式CLI：

```bash
node cli.js
```

进入交互式模式后，您可以：

1. **直接输入命令**
```
> kyart purchase list productId=123456 quantity=2
抢购任务已提交...
抢购成功！订单号: ORDER123456789
```

2. **查看帮助**
```
> help
显示所有可用命令和使用方法

> help kyart
显示KyArt平台特定命令

> help purchase
显示抢购相关命令
```

3. **查看历史**
```
> history
显示命令执行历史

> history 10
显示最近10条命令历史
```

4. **设置别名**
```
> alias quick-buy="kyart purchase quick"
> quick-buy productId=123456
```

5. **退出**
```
> exit
或者 Ctrl+C
```

## 配置文件详解

### 用户配置 (config/user.json)

```json
{
  "platforms": {
    "kyart": {
      "account": "user@example.com",
      "password": "your-password",
      "payPassword": "your-pay-password",
      "preferences": {
        "defaultStrategy": "list",
        "autoPayment": true,
        "maxConcurrent": 3
      }
    },
    "hzmiss": {
      "account": "13800138000", 
      "password": "your-password",
      "payPassword": "your-pay-password",
      "preferences": {
        "defaultStrategy": "quick",
        "autoPayment": false,
        "maxConcurrent": 2
      }
    }
  },
  "global": {
    "logLevel": "info",
    "maxRetries": 3,
    "retryDelay": 1000,
    "timeout": 30000,
    "saveLogs": true,
    "encryptCredentials": true
  }
}
```

### 策略配置 (config/strategies.json)

```json
{
  "list": {
    "name": "列表抢购",
    "description": "从商品列表中选择抢购",
    "options": {
      "sortBy": "price",
      "sortOrder": "asc",
      "filterInStock": true,
      "maxPrice": null
    }
  },
  "quick": {
    "name": "快捷抢购", 
    "description": "直接抢购指定商品",
    "options": {
      "skipValidation": false,
      "useCache": true,
      "maxWaitTime": 5000
    }
  },
  "batch": {
    "name": "批量抢购",
    "description": "同时抢购多个商品",
    "options": {
      "maxConcurrent": 5,
      "failFast": false,
      "partialSuccess": true
    }
  }
}
```

## 最佳实践

### 1. 抢购成功率优化

**选择合适的策略:**
- **快捷抢购**: 已知商品ID且确定要购买时使用
- **列表抢购**: 需要从多个商品中选择时使用  
- **批量抢购**: 需要抢购多个商品时使用

**优化网络环境:**
- 使用稳定的网络连接
- 考虑使用代理服务器
- 避免网络高峰期执行

**合理设置重试:**
```json
{
  "maxRetries": 3,
  "retryDelay": 1000,
  "backoffMultiplier": 1.5
}
```

### 2. 安全使用建议

**凭据安全:**
- 使用环境变量存储敏感信息
- 启用凭据加密存储
- 定期更换密码

**访问控制:**
- 不要在公共环境中使用
- 及时清理Token缓存
- 监控异常登录活动

**合规使用:**
- 遵守平台使用条款
- 避免过度频繁的API调用
- 尊重平台的反爬虫机制

### 3. 错误处理

**常见错误及解决方案:**

1. **认证失败**
```
错误: AUTH_ERROR - 认证失败，Token已过期
解决: 重新登录或检查凭据配置
命令: node cli.js "kyart auth login account=user password=pass"
```

2. **商品不存在**  
```
错误: API_ERROR - 商品不存在或已下架
解决: 检查商品ID是否正确，确认商品状态
```

3. **库存不足**
```
错误: PURCHASE_ERROR - 商品库存不足
解决: 减少购买数量或选择其他商品
```

4. **网络超时**
```
错误: TIMEOUT_ERROR - 请求超时
解决: 检查网络连接，增加超时时间配置
```

### 4. 性能优化

**减少API调用:**
- 启用结果缓存
- 批量操作替代单次操作
- 合理设置查询参数

**并发控制:**
```json
{
  "maxConcurrent": 3,
  "rateLimit": 100,
  "requestDelay": 100
}
```

**资源管理:**
- 及时清理临时文件
- 定期清理过期Token
- 监控内存使用情况

## 故障排除

### 调试模式

启用详细日志输出：

```bash
# 启用所有调试日志
DEBUG=smartbuy:* node cli.js "command"

# 启用特定组件日志
DEBUG=smartbuy:auth,smartbuy:purchase node cli.js "command"

# 保存调试日志到文件
DEBUG=smartbuy:* node cli.js "command" > debug.log 2>&1
```

### 常见问题

**Q: 命令执行后没有响应？**
A: 检查命令格式是否正确，启用调试模式查看详细信息。

**Q: 抢购总是失败？**
A: 检查商品库存状态、网络连接、账户余额和支付密码。

**Q: Token频繁过期？**
A: 检查系统时间是否正确，考虑调整Token刷新阈值。

**Q: 配置文件找不到？**
A: 确保配置文件路径正确，可以使用绝对路径指定。

### 日志分析

日志格式说明：
```
[时间戳] [级别] [组件] 消息内容
[2024-01-01 12:00:00] [INFO] [TaskExecutor] 任务执行开始: kyart purchase list
```

关键日志信息：
- **AUTH_ERROR**: 认证相关问题
- **PURCHASE_SUCCESS**: 抢购成功
- **TOKEN_REFRESH**: Token刷新
- **API_CALL**: API调用详情

### 性能监控

查看框架性能统计：

```bash
# 查看执行统计
node cli.js "system stats show"

# 查看缓存状态  
node cli.js "system cache status"

# 查看Token状态
node cli.js "system tokens status"
```

## 高级功能

### 1. 批处理模式

创建批处理脚本 `batch.txt`：
```
kyart purchase list productId=123 quantity=2
hzmiss purchase quick productId=456 quantity=1
kyart query orders status=pending
```

执行批处理：
```bash
node cli.js --batch batch.txt
```

### 2. 定时任务

使用cron表达式设置定时任务：

```bash
# 每天12:00执行抢购
node cli.js --schedule "0 12 * * *" "kyart purchase quick productId=123"

# 每5分钟检查订单状态
node cli.js --schedule "*/5 * * * *" "kyart query orders status=pending"
```

### 3. Webhook通知

配置Webhook接收任务执行通知：

```json
{
  "webhooks": {
    "success": "https://api.example.com/webhook/success",
    "failure": "https://api.example.com/webhook/failure",
    "headers": {
      "Authorization": "Bearer your-token"
    }
  }
}
```

### 4. 插件系统

安装和使用插件：

```bash
# 安装插件
node cli.js "system plugin install price-monitor"

# 启用插件
node cli.js "system plugin enable price-monitor"

# 使用插件功能
node cli.js "price-monitor track productId=123 targetPrice=100"
```

## 技术支持

### 获取帮助

1. **内置帮助系统**
```bash
node cli.js --help
node cli.js help [command]
```

2. **查看文档**
- API文档: `docs/API_REFERENCE.md`
- 架构文档: `docs/ARCHITECTURE.md`  
- 扩展指南: `docs/PLATFORM_EXTENSION_GUIDE.md`

3. **社区支持**
- GitHub Issues: 报告bug和功能请求
- 讨论区: 技术讨论和经验分享
- Wiki: 更多使用技巧和FAQ

### 贡献代码

欢迎贡献代码和改进建议：

1. Fork项目仓库
2. 创建功能分支
3. 提交代码变更
4. 创建Pull Request

详见 `CONTRIBUTING.md` 文件。

## 总结

SmartBuy Framework 提供了功能丰富的多平台抢购解决方案。通过本指南，您应该能够：

- 快速配置和启动框架
- 熟练使用各种抢购策略
- 理解命令格式和参数配置
- 掌握故障排除和性能优化方法
- 使用高级功能满足特殊需求

如有任何问题或建议，欢迎通过GitHub Issues联系我们。祝您使用愉快！