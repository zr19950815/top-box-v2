# SmartBuy Framework - 故障排除指南

## 概述

本文档提供SmartBuy Framework使用过程中可能遇到的常见问题解决方案，包括错误诊断、性能优化和最佳实践建议。

## 快速诊断

### 检查系统状态

```bash
# 检查框架版本和状态
node cli.js "system status"

# 检查平台连接状态
node cli.js "system check platforms"

# 检查认证状态
node cli.js "system check auth"

# 检查配置文件
node cli.js "system check config"
```

### 启用调试模式

```bash
# 启用所有调试日志
DEBUG=smartbuy:* node cli.js "your-command"

# 启用特定组件调试
DEBUG=smartbuy:auth node cli.js "auth-command"
DEBUG=smartbuy:purchase node cli.js "purchase-command"
DEBUG=smartbuy:adapter:kyart node cli.js "kyart-command"

# 保存调试日志到文件
DEBUG=smartbuy:* node cli.js "command" 2> debug.log
```

## 认证相关问题

### 1. 登录失败

**症状:**
```
错误: AUTH_ERROR - 登录失败，用户名或密码错误
```

**可能原因:**
- 用户名或密码错误
- 账号被锁定或冻结
- 平台更改了登录接口
- 网络连接问题

**解决方案:**

1. **验证凭据**
```bash
# 手动登录测试
node cli.js "kyart auth login account=your-account password=your-password"

# 检查保存的凭据
node cli.js "system credentials show kyart"
```

2. **重置认证状态**
```bash
# 清理认证缓存
node cli.js "kyart auth logout"

# 删除Token缓存
node cli.js "system cache clear tokens"

# 重新登录
node cli.js "kyart auth login account=new-account password=new-password"
```

3. **检查账号状态**
- 登录平台官网确认账号正常
- 检查是否需要验证码或二步验证
- 确认账号没有被封禁

### 2. Token过期频繁

**症状:**
```
错误: TOKEN_EXPIRED - Token已过期，请重新登录
```

**可能原因:**
- 系统时间不准确
- Token刷新机制失效
- 平台更改了Token有效期
- 并发请求导致Token冲突

**解决方案:**

1. **检查系统时间**
```bash
# 检查系统时间
date

# 同步系统时间 (Linux/Mac)
sudo ntpdate -s time.nist.gov

# Windows时间同步
w32tm /resync
```

2. **调整Token配置**
```json
{
  "auth": {
    "tokenRefreshThreshold": 10 * 60 * 1000,
    "autoRefreshEnabled": true,
    "maxRefreshRetries": 3
  }
}
```

3. **手动刷新Token**
```bash
# 刷新Token
node cli.js "kyart auth refresh"

# 检查Token状态
node cli.js "kyart auth status"
```

### 3. 刷新Token失败

**症状:**
```
错误: AUTH_ERROR - Token刷新失败，请重新登录
```

**解决方案:**

1. **清理并重新登录**
```bash
# 清理所有认证数据
node cli.js "system auth cleanup"

# 重新登录
node cli.js "kyart auth login"
```

2. **检查刷新Token**
```bash
# 查看Token详情
DEBUG=smartbuy:auth node cli.js "kyart auth status"
```

## 抢购相关问题

### 1. 抢购总是失败

**症状:**
```
错误: PURCHASE_ERROR - 抢购失败，商品可能已售完
```

**可能原因:**
- 商品已售完或下架
- 库存不足
- 账户余额不足
- 支付密码错误
- 网络延迟过高
- 抢购策略不合适

**解决方案:**

1. **验证商品状态**
```bash
# 查询商品信息
node cli.js "kyart query products productId=123456"

# 检查库存状态
node cli.js "kyart query stock productId=123456"
```

2. **检查账户状态**
```bash
# 查看账户信息
node cli.js "kyart query account"

# 检查余额
node cli.js "kyart query balance"
```

3. **优化抢购配置**
```json
{
  "purchase": {
    "strategy": "quick",
    "maxRetries": 5,
    "retryDelay": 500,
    "timeout": 15000,
    "concurrency": 1
  }
}
```

4. **调整抢购策略**
```bash
# 使用快捷抢购
node cli.js "kyart purchase quick productId=123456"

# 使用批量抢购提高成功率
node cli.js "kyart purchase batch productIds=123456,123457"
```

### 2. 支付失败

**症状:**
```
错误: PAYMENT_ERROR - 支付失败，请检查支付密码
```

**解决方案:**

1. **验证支付密码**
```bash
# 更新支付密码
node cli.js "kyart auth update-pay-password"

# 测试支付密码
node cli.js "kyart auth test-pay-password"
```

2. **检查支付方式**
```bash
# 查看可用支付方式
node cli.js "kyart query payment-methods"

# 设置默认支付方式
node cli.js "kyart config set defaultPaymentMethod=alipay"
```

### 3. 批量抢购部分失败

**症状:**
```
警告: 批量抢购完成，3个成功，2个失败
```

**解决方案:**

1. **查看详细结果**
```bash
# 启用详细日志
DEBUG=smartbuy:purchase node cli.js "kyart purchase batch productIds=1,2,3,4,5"
```

2. **调整并发设置**
```json
{
  "batch": {
    "maxConcurrent": 2,
    "failFast": false,
    "retryFailed": true
  }
}
```

3. **重试失败项目**
```bash
# 查看失败的商品ID
node cli.js "system logs show level=error"

# 单独重试失败商品
node cli.js "kyart purchase quick productId=failed-product-id"
```

## 网络相关问题

### 1. 连接超时

**症状:**
```
错误: TIMEOUT_ERROR - 请求超时，请检查网络连接
```

**解决方案:**

1. **检查网络连接**
```bash
# 测试网络连接
ping api.kyart.com
ping api.hzmiss.com

# 测试DNS解析
nslookup api.kyart.com
```

2. **调整超时设置**
```json
{
  "network": {
    "timeout": 60000,
    "retries": 5,
    "retryDelay": 2000
  }
}
```

3. **使用代理服务器**
```bash
# 设置HTTP代理
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=https://proxy.example.com:8080

# 或在配置文件中设置
```

```json
{
  "network": {
    "proxy": {
      "host": "proxy.example.com",
      "port": 8080,
      "auth": {
        "username": "user",
        "password": "pass"
      }
    }
  }
}
```

### 2. SSL/TLS错误

**症状:**
```
错误: NETWORK_ERROR - SSL证书验证失败
```

**解决方案:**

1. **更新CA证书**
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install ca-certificates

# CentOS/RHEL
sudo yum update ca-certificates

# macOS
brew install ca-certificates
```

2. **忽略SSL验证（仅开发环境）**
```bash
# 临时忽略SSL验证
NODE_TLS_REJECT_UNAUTHORIZED=0 node cli.js "command"
```

3. **配置自定义CA**
```json
{
  "network": {
    "ssl": {
      "rejectUnauthorized": true,
      "ca": "/path/to/custom-ca.pem"
    }
  }
}
```

### 3. 频率限制

**症状:**
```
错误: API_ERROR - 请求过于频繁，请稍后重试 (429)
```

**解决方案:**

1. **调整请求频率**
```json
{
  "rateLimit": {
    "maxRequests": 10,
    "perSeconds": 60,
    "burst": 5
  }
}
```

2. **启用请求缓存**
```json
{
  "cache": {
    "enabled": true,
    "ttl": 300000,
    "maxSize": 1000
  }
}
```

3. **使用指数退避**
```json
{
  "retry": {
    "maxRetries": 5,
    "baseDelay": 1000,
    "backoffMultiplier": 2.0,
    "maxDelay": 30000
  }
}
```

## 配置相关问题

### 1. 配置文件找不到

**症状:**
```
错误: SYSTEM_ERROR - 配置文件不存在: config/user.json
```

**解决方案:**

1. **检查文件路径**
```bash
# 查看当前目录
pwd

# 列出配置文件
ls -la config/

# 创建默认配置
node cli.js "system config init"
```

2. **使用绝对路径**
```bash
# 指定配置文件路径
node cli.js --config /absolute/path/to/config.json "command"
```

3. **创建配置文件**
```bash
# 创建配置目录
mkdir -p config

# 复制示例配置
cp config/user.example.json config/user.json
```

### 2. 配置格式错误

**症状:**
```
错误: VALIDATION_ERROR - 配置文件格式错误，JSON解析失败
```

**解决方案:**

1. **验证JSON格式**
```bash
# 使用jsonlint验证
npx jsonlint config/user.json

# 或使用Python验证
python -m json.tool config/user.json
```

2. **查看详细错误**
```bash
DEBUG=smartbuy:config node cli.js "system config validate"
```

3. **重建配置文件**
```bash
# 备份错误配置
cp config/user.json config/user.json.backup

# 重新创建
node cli.js "system config init"
```

### 3. 权限问题

**症状:**
```
错误: SYSTEM_ERROR - 没有权限访问配置文件
```

**解决方案:**

1. **检查文件权限**
```bash
# 查看文件权限
ls -la config/

# 修改权限
chmod 600 config/user.json
```

2. **检查目录权限**
```bash
# 检查目录权限
ls -ld config/

# 修改目录权限
chmod 755 config/
```

## 性能相关问题

### 1. 响应缓慢

**症状:**
- 命令执行时间过长
- 抢购响应慢导致失败

**解决方案:**

1. **启用性能监控**
```bash
# 查看性能统计
node cli.js "system stats show"

# 启用性能分析
DEBUG=smartbuy:perf node cli.js "command"
```

2. **优化配置**
```json
{
  "performance": {
    "cacheEnabled": true,
    "maxConcurrency": 3,
    "connectionPoolSize": 10,
    "keepAlive": true
  }
}
```

3. **清理缓存**
```bash
# 清理所有缓存
node cli.js "system cache clear"

# 清理特定缓存
node cli.js "system cache clear tokens"
node cli.js "system cache clear products"
```

### 2. 内存使用过高

**症状:**
- 系统内存占用持续增长
- 出现内存不足错误

**解决方案:**

1. **监控内存使用**
```bash
# 查看内存使用
node --inspect cli.js "command"

# 使用内存分析工具
node --inspect-brk=0.0.0.0:9229 cli.js "command"
```

2. **调整内存限制**
```bash
# 增加内存限制
node --max-old-space-size=4096 cli.js "command"
```

3. **优化缓存设置**
```json
{
  "cache": {
    "maxSize": 500,
    "ttl": 600000,
    "cleanupInterval": 300000
  }
}
```

### 3. CPU使用率过高

**症状:**
- CPU使用率持续100%
- 系统响应迟缓

**解决方案:**

1. **分析CPU使用**
```bash
# 使用性能分析工具
node --prof cli.js "command"

# 分析性能日志
node --prof-process isolate-0x*.log > perf.txt
```

2. **减少并发**
```json
{
  "concurrency": {
    "maxConcurrent": 1,
    "queueSize": 10,
    "processInterval": 1000
  }
}
```

## 数据相关问题

### 1. 数据损坏

**症状:**
```
错误: SYSTEM_ERROR - Token数据解密失败，可能是密钥错误或数据损坏
```

**解决方案:**

1. **备份和恢复**
```bash
# 创建数据备份
node cli.js "system backup create"

# 恢复数据
node cli.js "system backup restore backup-file.tar.gz"
```

2. **清理损坏数据**
```bash
# 清理Token存储
node cli.js "system storage clear tokens"

# 清理凭据存储
node cli.js "system storage clear credentials"

# 重新初始化
node cli.js "system init"
```

3. **检查加密密钥**
```bash
# 检查环境变量
echo $SMARTBUY_ENCRYPTION_KEY

# 重新生成密钥
node cli.js "system keys generate"
```

### 2. 存储空间不足

**症状:**
```
错误: SYSTEM_ERROR - 磁盘空间不足，无法保存数据
```

**解决方案:**

1. **清理日志文件**
```bash
# 清理旧日志
node cli.js "system logs cleanup --days 7"

# 限制日志大小
node cli.js "system logs rotate --max-size 10MB"
```

2. **清理缓存数据**
```bash
# 清理过期缓存
node cli.js "system cache cleanup"

# 压缩存储数据
node cli.js "system storage compress"
```

3. **更改存储位置**
```json
{
  "storage": {
    "baseDir": "/path/to/larger/disk/.smartbuy",
    "tempDir": "/tmp/smartbuy"
  }
}
```

## 平台特定问题

### KyArt平台问题

**1. 合成功能失败**
```
错误: MERGE_ERROR - 合成失败，材料不足
```

解决方案:
```bash
# 检查材料库存
node cli.js "kyart query inventory productId=123456"

# 检查合成配方
node cli.js "kyart query recipes productId=123456"

# 调整合成数量
node cli.js "kyart manage merge productId=123456 quantity=5"
```

**2. 订单状态异常**
```
错误: ORDER_ERROR - 订单状态查询失败
```

解决方案:
```bash
# 手动同步订单状态
node cli.js "kyart sync orders"

# 查看订单详情
node cli.js "kyart query orders orderId=ORDER123 detailed=true"
```

### HzMiss平台问题

**1. 商品查询限制**
```
错误: QUERY_ERROR - 查询频率过高，请稍后重试
```

解决方案:
```bash
# 增加查询间隔
node cli.js "hzmiss query products keyword=手机 delay=2000"

# 使用缓存结果
node cli.js "hzmiss query products keyword=手机 useCache=true"
```

**2. 抢购验证码**
```
错误: CAPTCHA_REQUIRED - 需要验证码验证
```

解决方案:
```json
{
  "hzmiss": {
    "captcha": {
      "autoSolve": true,
      "service": "2captcha",
      "apiKey": "your-api-key"
    }
  }
}
```

## 日志分析工具

### 日志级别说明

```
ERROR   - 错误信息，需要立即处理
WARN    - 警告信息，可能影响功能
INFO    - 一般信息，正常运行日志
DEBUG   - 调试信息，详细执行过程
```

### 常用日志查看命令

```bash
# 查看最新日志
node cli.js "system logs tail"

# 过滤错误日志
node cli.js "system logs show level=error"

# 按时间范围查看
node cli.js "system logs show start=2024-01-01 end=2024-01-02"

# 搜索特定内容
node cli.js "system logs search keyword=purchase"
```

### 日志文件位置

```
logs/
├── error.log          # 错误日志
├── combined.log       # 综合日志
├── debug.log          # 调试日志
└── performance.log    # 性能日志
```

## 监控和告警

### 健康检查

```bash
# 全面健康检查
node cli.js "system health check"

# 检查特定组件
node cli.js "system health check auth"
node cli.js "system health check network"
node cli.js "system health check storage"
```

### 性能监控

```bash
# 实时性能监控
node cli.js "system monitor start"

# 生成性能报告
node cli.js "system report performance"

# 导出监控数据
node cli.js "system export metrics --format json"
```

### 告警配置

```json
{
  "alerts": {
    "enabled": true,
    "thresholds": {
      "errorRate": 0.1,
      "responseTime": 30000,
      "memoryUsage": 0.8
    },
    "notifications": {
      "email": "admin@example.com",
      "webhook": "https://hooks.slack.com/webhook-url"
    }
  }
}
```

## 常见错误码对照表

| 错误码 | 错误类型 | 描述 | 解决方案 |
|--------|---------|------|----------|
| AUTH_001 | 认证失败 | 用户名或密码错误 | 检查凭据配置 |
| AUTH_002 | Token过期 | 访问令牌已过期 | 刷新或重新登录 |
| AUTH_003 | Token无效 | 访问令牌格式错误 | 重新获取Token |
| PURCHASE_001 | 抢购失败 | 商品已售完 | 选择其他商品 |
| PURCHASE_002 | 库存不足 | 商品库存不足 | 减少购买数量 |
| PURCHASE_003 | 支付失败 | 支付密码错误 | 检查支付密码 |
| API_001 | API错误 | 接口调用失败 | 检查网络连接 |
| API_002 | 频率限制 | 请求过于频繁 | 降低请求频率 |
| API_003 | 服务不可用 | 平台服务异常 | 稍后重试 |
| NETWORK_001 | 连接超时 | 网络连接超时 | 检查网络设置 |
| NETWORK_002 | DNS解析失败 | 域名解析错误 | 检查DNS设置 |
| NETWORK_003 | SSL错误 | SSL证书验证失败 | 更新CA证书 |
| SYSTEM_001 | 配置错误 | 配置文件格式错误 | 检查JSON格式 |
| SYSTEM_002 | 权限不足 | 文件访问权限不足 | 修改文件权限 |
| SYSTEM_003 | 磁盘空间不足 | 存储空间不足 | 清理磁盘空间 |

## 获取帮助

### 内置帮助

```bash
# 查看帮助信息
node cli.js --help

# 查看特定命令帮助
node cli.js help purchase
node cli.js help "kyart purchase list"
```

### 社区资源

- **GitHub Issues**: 报告bug和功能请求
- **Wiki页面**: 详细的使用技巧和FAQ
- **讨论区**: 技术讨论和经验分享

### 联系支持

如果遇到无法解决的问题，请提供以下信息：

1. **系统环境**
   - 操作系统版本
   - Node.js版本
   - 框架版本

2. **错误信息**
   - 完整的错误消息
   - 错误发生的具体步骤
   - 相关的日志文件

3. **配置信息**
   - 去除敏感信息的配置文件
   - 使用的命令和参数

4. **调试日志**
   - 启用DEBUG模式的完整日志
   - 网络请求和响应详情

通过GitHub Issues提交问题报告时，请使用问题模板，这样能帮助我们更快地定位和解决问题。