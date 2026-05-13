# SmartBuy Framework - API 参考文档

## 概述

本文档详细说明了SmartBuy Framework的所有API接口、类、方法和配置选项。

## 核心接口

### PlatformAdapter

平台适配器基类，所有平台适配器都必须继承此类。

```javascript
class PlatformAdapter {
  constructor(authToken, config)
}
```

#### 方法

##### `async login(credentials)`
用户登录认证

**参数:**
- `credentials` (LoginCredentials): 登录凭据
  - `account` (string): 用户账号
  - `password` (string): 登录密码
  - `payPassword` (string, 可选): 支付密码

**返回值:** `Promise<AuthResult>`
- `success` (boolean): 是否成功
- `token` (string): 访问令牌
- `refreshToken` (string, 可选): 刷新令牌
- `expiresIn` (number, 可选): 过期时间(秒)
- `userInfo` (Object, 可选): 用户信息

**示例:**
```javascript
const result = await adapter.login({
  account: 'user@example.com',
  password: 'password123'
});
```

##### `async getProductList(query)`
获取商品列表

**参数:**
- `query` (ProductQuery): 查询参数
  - `keyword` (string, 可选): 关键词
  - `category` (string, 可选): 分类
  - `minPrice` (number, 可选): 最低价格
  - `maxPrice` (number, 可选): 最高价格
  - `limit` (number, 可选): 返回数量限制
  - `offset` (number, 可选): 偏移量

**返回值:** `Promise<Product[]>`
- `id` (string): 商品ID
- `name` (string): 商品名称
- `price` (number): 当前价格
- `originalPrice` (number, 可选): 原价
- `stock` (number): 库存数量
- `category` (string): 分类
- `imageUrl` (string, 可选): 图片URL
- `description` (string, 可选): 商品描述

**示例:**
```javascript
const products = await adapter.getProductList({
  keyword: '手机',
  category: 'electronics',
  limit: 20
});
```

##### `async executePurchase(config)`
执行商品抢购

**参数:**
- `config` (PurchaseConfig): 抢购配置
  - `productId` (string): 商品ID
  - `quantity` (number): 购买数量
  - `payPassword` (string, 可选): 支付密码
  - `strategy` (string, 可选): 抢购策略
  - `maxRetries` (number, 可选): 最大重试次数

**返回值:** `Promise<PurchaseResult>`
- `success` (boolean): 是否成功
- `orderId` (string, 可选): 订单ID
- `message` (string): 结果信息
- `details` (Object, 可选): 详细信息

**示例:**
```javascript
const result = await adapter.executePurchase({
  productId: 'PROD123',
  quantity: 2,
  payPassword: '123456'
});
```

##### `async getOrderStatus(orderId)`
查询订单状态

**参数:**
- `orderId` (string): 订单ID

**返回值:** `Promise<OrderStatus>`
- `orderId` (string): 订单ID
- `status` (string): 订单状态
- `amount` (number): 订单金额
- `createTime` (string): 创建时间
- `products` (Array, 可选): 商品列表

**示例:**
```javascript
const status = await adapter.getOrderStatus('ORDER123456');
```

##### `async processPayment(config)`
处理订单支付

**参数:**
- `config` (PaymentConfig): 支付配置
  - `orderId` (string): 订单ID
  - `payPassword` (string): 支付密码
  - `paymentMethod` (string, 可选): 支付方式

**返回值:** `Promise<PaymentResult>`
- `success` (boolean): 是否成功
- `paymentId` (string, 可选): 支付ID
- `message` (string): 结果信息

**示例:**
```javascript
const result = await adapter.processPayment({
  orderId: 'ORDER123',
  payPassword: '123456',
  paymentMethod: 'alipay'
});
```

##### `async cancelOrder(orderId)`
取消订单

**参数:**
- `orderId` (string): 订单ID

**返回值:** `Promise<boolean>`

**示例:**
```javascript
const cancelled = await adapter.cancelOrder('ORDER123456');
```

##### `async refreshToken(refreshToken)`
刷新访问令牌

**参数:**
- `refreshToken` (string): 刷新令牌

**返回值:** `Promise<AuthResult>`

**示例:**
```javascript
const result = await adapter.refreshToken('refresh_token_here');
```

##### `validateConfig(config)`
验证配置参数

**参数:**
- `config` (Object): 配置对象

**返回值:** `ValidationResult`
- `valid` (boolean): 是否有效
- `errors` (string[]): 错误信息列表

**示例:**
```javascript
const validation = adapter.validateConfig({
  account: 'user@example.com',
  password: 'password123'
});
```

### PurchaseStrategy

抢购策略基类，定义抢购执行模板。

```javascript
class PurchaseStrategy {
  constructor(options)
}
```

#### 方法

##### `async execute(adapter, config)`
执行抢购策略

**参数:**
- `adapter` (PlatformAdapter): 平台适配器
- `config` (PurchaseConfig): 抢购配置

**返回值:** `Promise<PurchaseResult>`

#### 子类

##### ListPurchaseStrategy
列表模式抢购策略，适用于从商品列表中选择商品进行抢购。

##### QuickPurchaseStrategy
快捷模式抢购策略，适用于已知商品ID的快速抢购。

##### BatchPurchaseStrategy
批量模式抢购策略，适用于同时抢购多个商品。

## 核心管理器

### AuthManager

认证管理器，提供统一的认证和Token管理功能。

```javascript
class AuthManager {
  constructor(tokenStore, credentialManager, options)
}
```

#### 方法

##### `async initialize()`
初始化认证管理器

**返回值:** `Promise<void>`

##### `async authenticate(platform, credentials)`
执行平台认证

**参数:**
- `platform` (string): 平台名称
- `credentials` (LoginCredentials): 登录凭据

**返回值:** `Promise<AuthResult>`

##### `async getValidToken(platform, account)`
获取有效的访问令牌

**参数:**
- `platform` (string): 平台名称
- `account` (string): 账号

**返回值:** `Promise<string|null>`

##### `async invalidateToken(platform, account)`
使令牌失效

**参数:**
- `platform` (string): 平台名称
- `account` (string): 账号

**返回值:** `Promise<void>`

##### `async isAuthenticated(platform, account)`
检查是否已认证

**参数:**
- `platform` (string): 平台名称
- `account` (string): 账号

**返回值:** `Promise<boolean>`

##### `async withAuthRetry(fn, platform, account, maxRetries)`
自动重试装饰器

**参数:**
- `fn` (Function): 要执行的函数
- `platform` (string): 平台名称
- `account` (string): 账号
- `maxRetries` (number, 可选): 最大重试次数

**返回值:** `Promise<any>`

### TokenStore

Token存储接口，管理Token的持久化存储。

```javascript
class TokenStore {
  constructor(options)
}
```

#### 实现类

##### FileTokenStore
基于文件系统的Token存储实现

**构造参数:**
- `options.storageDir` (string): 存储目录路径
- `options.encryptionKey` (string): 加密密钥

#### 方法

##### `async saveToken(platform, account, tokenData)`
保存Token数据

##### `async getToken(platform, account)`
获取Token数据

##### `async removeToken(platform, account)`
删除Token数据

##### `async getAllTokens(platform)`
获取所有Token数据

##### `async cleanExpiredTokens()`
清理过期Token

### CredentialManager

凭据管理接口，管理用户凭据的安全存储。

```javascript
class CredentialManager {
  constructor(options)
}
```

#### 实现类

##### FileCredentialManager
基于文件系统的凭据存储实现

**构造参数:**
- `options.storageDir` (string): 存储目录路径
- `options.encryptionKey` (string): 加密密钥

#### 方法

##### `async saveCredentials(platform, account, credentials)`
保存用户凭据

##### `async getCredentials(platform, account)`
获取用户凭据

##### `async removeCredentials(platform, account)`
删除用户凭据

##### `validateCredentials(credentials)`
验证凭据格式

## 工具类

### Logger

日志记录工具，提供统一的日志输出格式。

#### 方法

##### `Logger.info(message, ...args)`
记录信息日志

##### `Logger.warn(message, ...args)`
记录警告日志

##### `Logger.error(message, ...args)`
记录错误日志

##### `Logger.debug(message, ...args)`
记录调试日志

### ErrorFactory

错误工厂，创建标准化的错误对象。

#### 方法

##### `ErrorFactory.createSystemError(message)`
创建系统错误

##### `ErrorFactory.createAuthError(message)`
创建认证错误

##### `ErrorFactory.createAPIError(message)`
创建API错误

##### `ErrorFactory.createValidationError(message)`
创建验证错误

##### `ErrorFactory.createPurchaseError(message)`
创建抢购错误

##### `ErrorFactory.createPaymentError(message)`
创建支付错误

### Validator

参数验证工具，提供常用的验证方法。

#### 方法

##### `Validator.validateConfig(config, rules)`
验证配置对象

**参数:**
- `config` (Object): 要验证的配置
- `rules` (Object): 验证规则

**返回值:** `ValidationResult`

**验证规则:**
- `required`: 必填字段
- `type`: 数据类型 (string, number, boolean, array, object)
- `min`: 最小值/长度
- `max`: 最大值/长度
- `pattern`: 正则表达式
- `email`: 邮箱格式
- `phone`: 手机号格式
- `url`: URL格式

**示例:**
```javascript
const validation = Validator.validateConfig({
  account: 'user@example.com',
  password: '123456',
  age: 25
}, {
  account: { required: true, type: 'string', email: true },
  password: { required: true, type: 'string', min: 6 },
  age: { type: 'number', min: 18, max: 120 }
});
```

## 配置类

### TaskExecutor

任务执行器，统一的任务执行入口。

```javascript
class TaskExecutor {
  constructor(authManager, platformRegistry)
}
```

#### 方法

##### `async executeTask(config)`
执行任务

**参数:**
- `config` (TaskConfig): 任务配置
  - `platform` (string): 平台名称
  - `action` (string): 操作类型
  - `credentials` (LoginCredentials): 登录凭据
  - `parameters` (Object): 操作参数

**返回值:** `Promise<TaskResult>`
- `success` (boolean): 是否成功
- `data` (any): 结果数据
- `message` (string): 结果信息
- `error` (Error, 可选): 错误对象

### CommandParser

命令解析器，将字符串命令解析为结构化配置。

```javascript
class CommandParser {
  static parse(commandString)
}
```

#### 方法

##### `static parse(commandString)`
解析命令字符串

**参数:**
- `commandString` (string): 命令字符串

**返回值:** `CommandConfig`
- `platform` (string): 平台名称
- `action` (string): 操作类型
- `subAction` (string, 可选): 子操作
- `parameters` (Object): 参数对象

**示例:**
```javascript
const config = CommandParser.parse('kyart purchase list productId=123 quantity=2');
// 结果:
// {
//   platform: 'kyart',
//   action: 'purchase',
//   subAction: 'list',
//   parameters: { productId: '123', quantity: '2' }
// }
```

### PlatformRegistry

平台注册中心，管理所有平台适配器的注册和获取。

```javascript
class PlatformRegistry {
  static register(name, adapterClass)
  static getAdapter(name)
  static isRegistered(name)
  static getRegisteredPlatforms()
}
```

#### 方法

##### `static register(name, adapterClass)`
注册平台适配器

**参数:**
- `name` (string): 平台名称
- `adapterClass` (Class): 适配器类

##### `static getAdapter(name)`
获取平台适配器类

**参数:**
- `name` (string): 平台名称

**返回值:** `Class` 适配器类

##### `static isRegistered(name)`
检查平台是否已注册

**参数:**
- `name` (string): 平台名称

**返回值:** `boolean`

##### `static getRegisteredPlatforms()`
获取所有已注册平台

**返回值:** `string[]` 平台名称列表

## 错误类型

### ErrorTypes

定义了所有标准错误类型常量。

```javascript
const ErrorTypes = {
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  API_ERROR: 'API_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PURCHASE_ERROR: 'PURCHASE_ERROR',
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR'
};
```

## 事件系统

### EventEmitter

框架支持事件驱动的编程模式，可以监听和触发各种事件。

#### 事件类型

##### `auth.login`
用户登录成功事件

**参数:**
- `platform` (string): 平台名称
- `account` (string): 用户账号
- `userInfo` (Object): 用户信息

##### `auth.logout`
用户登出事件

**参数:**
- `platform` (string): 平台名称
- `account` (string): 用户账号

##### `purchase.start`
抢购开始事件

**参数:**
- `platform` (string): 平台名称
- `config` (PurchaseConfig): 抢购配置

##### `purchase.success`
抢购成功事件

**参数:**
- `platform` (string): 平台名称
- `result` (PurchaseResult): 抢购结果

##### `purchase.fail`
抢购失败事件

**参数:**
- `platform` (string): 平台名称
- `error` (Error): 错误信息

##### `order.status.change`
订单状态变更事件

**参数:**
- `platform` (string): 平台名称
- `orderId` (string): 订单ID
- `oldStatus` (string): 原状态
- `newStatus` (string): 新状态

#### 使用示例

```javascript
const { EventEmitter } = require('events');
const eventBus = new EventEmitter();

// 监听抢购成功事件
eventBus.on('purchase.success', (data) => {
  console.log(`抢购成功: ${data.platform} - ${data.result.orderId}`);
});

// 在适配器中触发事件
eventBus.emit('purchase.success', {
  platform: 'kyart',
  result: { success: true, orderId: 'ORDER123' }
});
```

## 性能监控

### MetricsCollector

性能指标收集器，用于监控框架运行性能。

```javascript
class MetricsCollector {
  static startTimer(name)
  static endTimer(name)
  static increment(name, value)
  static gauge(name, value)
  static getMetrics()
}
```

#### 指标类型

- **Timers**: 操作耗时统计
- **Counters**: 计数统计
- **Gauges**: 实时值统计

#### 预定义指标

- `auth.login.duration`: 登录耗时
- `purchase.execution.duration`: 抢购执行耗时
- `api.request.count`: API请求次数
- `api.request.error.count`: API请求错误次数
- `token.refresh.count`: Token刷新次数

## 配置选项

### 全局配置

```javascript
const config = {
  // 认证配置
  auth: {
    tokenRefreshThreshold: 5 * 60 * 1000, // Token刷新阈值
    maxRetries: 3, // 最大重试次数
    retryDelay: 1000, // 重试延迟
    autoSaveCredentials: true // 自动保存凭据
  },
  
  // 日志配置
  logging: {
    level: 'info', // 日志级别
    format: 'json', // 日志格式
    output: 'console' // 输出目标
  },
  
  // 存储配置
  storage: {
    baseDir: '.smartbuy', // 基础存储目录
    encryptionEnabled: true, // 启用加密
    backupEnabled: false // 启用备份
  },
  
  // 网络配置
  network: {
    timeout: 30000, // 请求超时
    retries: 3, // 重试次数
    proxy: null // 代理设置
  }
};
```

### 平台特定配置

```javascript
const platformConfig = {
  kyart: {
    baseURL: 'https://api.kyart.com',
    rateLimit: 100, // 每分钟请求限制
    features: ['purchase', 'merge', 'cancel'],
    defaultStrategy: 'list'
  },
  
  hzmiss: {
    baseURL: 'https://api.hzmiss.com',
    rateLimit: 50,
    features: ['purchase', 'query'],
    defaultStrategy: 'quick'
  }
};
```

## 版本兼容性

### API版本控制

框架支持API版本控制，确保向后兼容性。

- **v1.0**: 初始版本
- **v1.1**: 添加批量抢购支持
- **v1.2**: 添加认证管理器
- **v2.0**: 重构事件系统

### 迁移指南

详见 `MIGRATION.md` 文件。

## 许可证

MIT License - 详见 `LICENSE` 文件。