# SmartBuy Framework API参考文档

## 📋 概述

本文档详细描述SmartBuy Framework的所有API接口、数据格式和使用方法。

## 🏗️ 核心接口

### PlatformAdapter 抽象基类

所有平台适配器必须继承此类并实现以下抽象方法（包括🆕认证方法）：

#### 构造函数
```javascript
constructor(token, options = {})
```
**参数:**
- `token` (string): 平台认证Token
- `options` (object): 平台特有配置选项

**示例:**
```javascript
const adapter = new KyArtAdapter('your-token', {
  timeout: 10000,
  retryCount: 3
});
```

---

### 🆕 认证相关接口

#### login()
```javascript
async login(credentials)
```
**功能:** 用户登录获取访问Token  
**参数:**
- `credentials` (LoginCredentials): 登录凭据对象
  - `account` (string): 账号（手机号/邮箱）
  - `password` (string): 登录密码
  - `payPassword` (string, 可选): 支付密码
  - `captcha` (string, 可选): 验证码
  - `deviceId` (string, 可选): 设备ID

**返回值:** `Promise<AuthResult>` 认证结果对象

**AuthResult对象格式:**
```javascript
{
  success: boolean,         // 认证是否成功
  token: string,           // 访问Token
  refreshToken?: string,   // 刷新Token（可选）
  expiresAt?: Date,        // Token过期时间
  account: string,         // 关联账号
  message?: string,        // 成功消息
  error?: string          // 错误信息
}
```

**异常:**
- `Error`: 登录失败

**示例:**
```javascript
const credentials = {
  account: '18812345678',
  password: 'mypassword',
  payPassword: '123456'
};
const authResult = await adapter.login(credentials);
if (authResult.success) {
  console.log('登录成功，Token:', authResult.token);
}
```

---

#### refreshToken()
```javascript
async refreshToken(oldToken)
```
**功能:** 刷新访问Token  
**参数:**
- `oldToken` (string): 旧的访问Token

**返回值:** `Promise<string>` 新的访问Token

**异常:**
- `Error`: Token刷新失败

**示例:**
```javascript
const newToken = await adapter.refreshToken(oldToken);
console.log('Token已刷新:', newToken);
```

---

#### validateToken()
```javascript
async validateToken(token)
```
**功能:** 验证Token是否有效  
**参数:**
- `token` (string): 要验证的Token

**返回值:** `Promise<boolean>` Token是否有效

**示例:**
```javascript
const isValid = await adapter.validateToken(myToken);
if (!isValid) {
  console.log('Token已失效，需要重新登录');
}
```

---

#### logout()
```javascript
async logout(token)
```
**功能:** 用户登出，使Token失效  
**参数:**
- `token` (string): 要失效的Token

**返回值:** `Promise<boolean>` 是否成功登出

**示例:**
```javascript
const success = await adapter.logout(token);
if (success) {
  console.log('已成功登出');
}
```

---

### 抢购相关接口

#### getProductList()
```javascript
async getProductList(productId, options)
```
**功能:** 获取指定商品的可购买列表  
**参数:**
- `productId` (string): 商品ID
- `options` (object): 可选参数
  - `page` (number): 页码，默认1
  - `pageSize` (number): 每页数量，默认20
  - `sortBy` (string): 排序方式，默认'price'
  - `order` (string): 排序顺序，默认'asc'

**返回值:** `Promise<Product[]>` 标准化的商品数组

**Product对象格式:**
```javascript
{
  id: string,          // 商品唯一ID
  name?: string,       // 商品名称（可选）
  price: number,       // 商品价格
  available: boolean,  // 是否可购买
  meta?: object       // 平台特有数据（可选）
}
```

**异常:**
- `Error`: 获取商品列表失败

**示例:**
```javascript
const products = await adapter.getProductList('12345');
console.log(products[0]);
// 输出: { id: 'abc', price: 100, available: true }
```

---

#### placeOrder()
```javascript
async placeOrder(product)
```
**功能:** 对指定商品进行普通下单  
**参数:**
- `product` (Product): 商品对象

**返回值:** `Promise<string>` 订单ID

**异常:**
- `Error`: 下单失败

**示例:**
```javascript
const product = { id: 'abc', price: 100, available: true };
const orderId = await adapter.placeOrder(product);
console.log(orderId); // 输出: "order_123456"
```

---

#### quickOrder()
```javascript
async quickOrder(productId, quantity)
```
**功能:** 快捷下单模式，跳过商品列表获取步骤  
**参数:**
- `productId` (string): 商品ID
- `quantity` (number): 购买数量

**返回值:** `Promise<string>` 订单ID

**异常:**
- `Error`: 快捷下单失败

**注意:** 如果平台不支持快捷下单，可以内部fallback到普通下单流程

**示例:**
```javascript
const orderId = await adapter.quickOrder('12345', 1);
```

---

#### batchOrder()
```javascript
async batchOrder(productId, batchSize)
```
**功能:** 批量下单模式  
**参数:**
- `productId` (string): 商品ID
- `batchSize` (number): 批量大小

**返回值:** `Promise<string>` 批量订单ID

**异常:**
- `Error`: 批量下单失败

**注意:** 如果平台不支持批量下单，可以抛出错误或循环调用普通下单

**示例:**
```javascript
const orderId = await adapter.batchOrder('12345', 5);
```

---

### 支付相关接口

#### getPaymentUrl()
```javascript
async getPaymentUrl(orderInfo)
```
**功能:** 获取订单的支付链接  
**参数:**
- `orderInfo` (string): 订单信息（通常是订单ID）

**返回值:** `Promise<string>` 支付链接URL

**异常:**
- `Error`: 获取支付链接失败

**示例:**
```javascript
const paymentUrl = await adapter.getPaymentUrl('order_123456');
console.log(paymentUrl); // 输出: "https://pay.platform.com/xyz"
```

---

#### executePayment()
```javascript
async executePayment(paymentUrl, password)
```
**功能:** 执行支付流程  
**参数:**
- `paymentUrl` (string): 支付链接
- `password` (string): 支付密码

**返回值:** `Promise<PaymentResult>` 支付结果对象

**PaymentResult对象格式:**
```javascript
{
  success: boolean,    // 支付是否成功
  orderId?: string,    // 订单ID（可选）
  message?: string,    // 成功消息（可选）
  error?: string       // 错误消息（可选）
}
```

**示例:**
```javascript
const result = await adapter.executePayment(paymentUrl, '123456');
if (result.success) {
  console.log('支付成功:', result.message);
} else {
  console.error('支付失败:', result.error);
}
```

---

### 简单任务接口

#### confirmCombination()
```javascript
async confirmCombination(combinationId)
```
**功能:** 确认合成操作  
**参数:**
- `combinationId` (string): 合成ID

**返回值:** `Promise<boolean>` 是否成功

**异常:**
- `Error`: 合成确认失败

**示例:**
```javascript
const success = await adapter.confirmCombination('combo_123');
```

---

#### cancelResale()
```javascript
async cancelResale(resaleId)
```
**功能:** 取消寄售操作  
**参数:**
- `resaleId` (string): 寄售ID

**返回值:** `Promise<boolean>` 是否成功

**异常:**
- `Error`: 取消寄售失败

**示例:**
```javascript
const success = await adapter.cancelResale('resale_123');
```

---

## 🎯 策略接口

### PurchaseStrategy 抽象基类

#### execute()
```javascript
async execute(config)
```
**功能:** 执行购买策略（模板方法）  
**参数:**
- `config` (object): 执行配置
  - `productId` (string): 商品ID
  - `maxPrice` (number): 最高价格
  - `quantity` (number): 目标数量
  - `interval` (number): 执行间隔（毫秒）
  - `payPassword` (string): 支付密码
  - `mode` (string): 策略模式

**返回值:** `Promise<void>`

**示例:**
```javascript
const strategy = new ListModeStrategy(adapter, paymentProcessor, orderProcessor);
await strategy.execute({
  productId: '12345',
  maxPrice: 100,
  quantity: 2,
  interval: 800,
  payPassword: '123456'
});
```

#### acquireAndOrder() (抽象方法)
```javascript
async acquireAndOrder(config)
```
**功能:** 获取商品并下单（子类必须实现）  
**参数:**
- `config` (object): 执行配置

**返回值:** `Promise<string>` 订单ID

---

## 🔧 处理器接口

### PaymentProcessor

#### constructor()
```javascript
constructor(platformAdapter)
```
**参数:**
- `platformAdapter` (PlatformAdapter): 平台适配器实例

#### process()
```javascript
async process(orderInfo, payPassword)
```
**功能:** 处理支付流程  
**参数:**
- `orderInfo` (string): 订单信息
- `payPassword` (string): 支付密码

**返回值:** `Promise<PaymentResult>` 支付结果

**示例:**
```javascript
const processor = new PaymentProcessor(adapter);
const result = await processor.process('order_123', '123456');
```

---

### OrderProcessor

#### constructor()
```javascript
constructor(platformAdapter)
```

#### checkStatus()
```javascript
async checkStatus(orderResult)
```
**功能:** 检查订单状态并标准化  
**参数:**
- `orderResult` (any): 平台返回的订单结果

**返回值:** `Promise<string>` 标准化的订单信息

---

## 🎮 管理器接口

### TaskExecutor

#### constructor()
```javascript
constructor()
```

#### init()
```javascript
init(platformAdapter)
```
**功能:** 初始化执行器，自动创建策略和处理器  
**参数:**
- `platformAdapter` (PlatformAdapter): 平台适配器

#### executeTask()
```javascript
async executeTask(taskType, config)
```
**功能:** 执行指定类型的任务  
**参数:**
- `taskType` (string): 任务类型
  - `'smart-buy'`: 智能抢购
  - `'combination'`: 合成确认
  - `'cancel-resale'`: 取消寄售
- `config` (object): 任务配置

**返回值:** `Promise<any>` 执行结果

**示例:**
```javascript
const executor = new TaskExecutor();
executor.init(adapter);

await executor.executeTask('smart-buy', {
  productId: '12345',
  maxPrice: 100,
  quantity: 1,
  mode: 'list',
  payPassword: '123456'
});
```

---

### CommandParser

#### parse()
```javascript
static parse(commandString)
```
**功能:** 解析字符串指令  
**参数:**
- `commandString` (string): 指令字符串

**返回值:** `object` 解析结果
```javascript
{
  platform: string,    // 平台名称
  task: string,        // 任务类型
  mode?: string,       // 抢购模式（可选）
  params: {            // 解析的参数
    account: string,
    password: string,
    payPassword: string,
    productId: string,
    quantity: number,
    price: number
  }
}
```

**支持的指令格式:**
```
<平台><任务>-<账号>-<密码>-<支付密码>-<商品ID>*<数量>*<价格>
```

**示例:**
```javascript
const result = CommandParser.parse('ky列表-18812345678-pwd123-pay123-12345*2*100');
console.log(result);
// 输出:
// {
//   platform: 'kyart',
//   task: 'smart-buy', 
//   mode: 'list',
//   params: {
//     account: '18812345678',
//     password: 'pwd123',
//     payPassword: 'pay123',
//     productId: '12345',
//     quantity: 2,
//     price: 100
//   }
// }
```

---

### 🆕 AuthManager 认证管理器

#### authenticate()
```javascript
async authenticate(platform, credentials)
```
**功能:** 统一认证入口，自动处理Token获取和缓存  
**参数:**
- `platform` (string): 平台名称
- `credentials` (LoginCredentials): 登录凭据

**返回值:** `Promise<AuthResult>` 认证结果

**示例:**
```javascript
const authManager = new AuthManager();
const result = await authManager.authenticate('kyart', {
  account: '18812345678',
  password: 'pwd123',
  payPassword: 'pay123'
});
if (result.success) {
  console.log('认证成功');
}
```

---

#### getValidToken()
```javascript
async getValidToken(platform, account)
```
**功能:** 获取有效的Token，如果不存在或过期会自动刷新  
**参数:**
- `platform` (string): 平台名称
- `account` (string): 账号

**返回值:** `Promise<string | null>` 有效的Token或null

**示例:**
```javascript
const token = await authManager.getValidToken('kyart', '18812345678');
if (token) {
  console.log('获取到有效Token:', token);
}
```

---

#### withAuthRetry()
```javascript
async withAuthRetry<T>(fn, maxRetries = 3)
```
**功能:** 自动重试装饰器，API调用失败时自动刷新Token重试  
**参数:**
- `fn` (Function): 要执行的API调用函数
- `maxRetries` (number): 最大重试次数，默认3次

**返回值:** `Promise<T>` API调用结果

**示例:**
```javascript
const result = await authManager.withAuthRetry(async () => {
  return await adapter.getProductList('12345');
});
```

---

### 🆕 TokenStore Token存储管理器

#### saveToken()
```javascript
async saveToken(platform, account, tokenData)
```
**功能:** 保存Token数据到本地存储  
**参数:**
- `platform` (string): 平台名称
- `account` (string): 账号
- `tokenData` (TokenData): Token数据对象

**返回值:** `Promise<void>`

**示例:**
```javascript
const tokenStore = new TokenStore();
await tokenStore.saveToken('kyart', '18812345678', {
  token: 'abc123',
  expiresAt: new Date(Date.now() + 24*60*60*1000) // 24小时后过期
});
```

---

#### getToken()
```javascript
async getToken(platform, account)
```
**功能:** 从本地存储获取Token数据  
**参数:**
- `platform` (string): 平台名称
- `account` (string): 账号

**返回值:** `Promise<TokenData | null>` Token数据或null

---

#### isTokenValid()
```javascript
async isTokenValid(platform, account)
```
**功能:** 检查Token是否有效（未过期）  
**参数:**
- `platform` (string): 平台名称
- `account` (string): 账号

**返回值:** `Promise<boolean>` 是否有效

---

#### cleanExpiredTokens()
```javascript
async cleanExpiredTokens()
```
**功能:** 清理所有过期的Token  

**返回值:** `Promise<number>` 清理的Token数量

**示例:**
```javascript
const cleaned = await tokenStore.cleanExpiredTokens();
console.log(`清理了 ${cleaned} 个过期Token`);
```

---

### PlatformRegistry

#### register()
```javascript
static register(platformName, AdapterClass, commands)
```
**功能:** 注册平台到框架  
**参数:**
- `platformName` (string): 平台名称
- `AdapterClass` (class): 适配器类
- `commands` (object): 指令映射对象

**示例:**
```javascript
PlatformRegistry.register('kyart', KyArtAdapter, {
  'ky列表': { platform: 'kyart', task: 'smart-buy', mode: 'list' }
});
```

#### getAdapter()
```javascript
static getAdapter(platformName)
```
**功能:** 获取平台适配器类  
**参数:**
- `platformName` (string): 平台名称

**返回值:** `class` 适配器类

#### getCommandInfo()
```javascript
static getCommandInfo(command)
```
**功能:** 获取指令信息  
**参数:**
- `command` (string): 指令名称

**返回值:** `object` 指令信息

---

## 🛠️ 工具接口

### Logger

#### log()
```javascript
static log(level, message, data)
```
**功能:** 记录日志  
**参数:**
- `level` (string): 日志级别 ('info', 'warn', 'error', 'debug')
- `message` (string): 日志消息
- `data` (any): 附加数据（可选）

**示例:**
```javascript
Logger.log('info', '开始执行任务', { taskId: 'task_123' });
Logger.log('error', '支付失败', { orderId: 'order_123', error: 'timeout' });
```

---

### Validator

#### validateConfig()
```javascript
static validateConfig(config, schema)
```
**功能:** 验证配置对象  
**参数:**
- `config` (object): 待验证的配置
- `schema` (object): 验证规则

**返回值:** `object` 验证结果
```javascript
{
  valid: boolean,      // 是否有效
  errors: string[]     // 错误列表
}
```

**示例:**
```javascript
const result = Validator.validateConfig(
  { productId: '123', price: 100 },
  { productId: 'required|string', price: 'required|number|min:0' }
);

if (!result.valid) {
  console.error('配置错误:', result.errors);
}
```

---

## 📊 数据格式规范

### 标准配置对象
```javascript
interface TaskConfig {
  // 基础参数
  productId: string;        // 商品ID
  quantity: number;         // 目标数量
  maxPrice: number;         // 最高价格
  interval?: number;        // 执行间隔，默认800ms
  
  // 认证参数  
  account: string;          // 账号
  password?: string;        // 登录密码
  token?: string;           // 直接使用的Token
  payPassword: string;      // 支付密码
  
  // 策略参数
  mode?: string;           // 抢购模式 ('list'|'quick'|'batch')
  batchSize?: number;      // 批量大小（批量模式）
  
  // 任务参数（非抢购任务）
  combinationId?: string;  // 合成ID
  resaleId?: string;       // 寄售ID
}
```

### 错误处理规范
```javascript
// 标准错误类型
const ErrorTypes = {
  NETWORK_ERROR: '网络错误',
  API_ERROR: 'API错误', 
  AUTH_ERROR: '认证错误',
  PAYMENT_ERROR: '支付错误',
  NO_QUALIFIED_PRODUCTS: '无符合条件商品',
  INSUFFICIENT_BALANCE: '余额不足',
  PRODUCT_UNAVAILABLE: '商品不可用',
  ORDER_FAILED: '下单失败',
  TIMEOUT_ERROR: '请求超时'
};

// 错误对象格式
interface SmartBuyError extends Error {
  type: string;           // 错误类型
  code?: string|number;   // 平台错误码
  data?: any;            // 附加数据
}
```

### 统计数据格式
```javascript
interface TaskStats {
  startTime: Date;          // 开始时间
  endTime?: Date;           // 结束时间
  requestCount: number;     // 请求总数
  successCount: number;     // 成功次数
  errorCount: number;       // 错误次数
  completedQuantity: number; // 完成数量
  targetQuantity: number;   // 目标数量
  averageInterval: number;  // 平均间隔
  successRate: number;      // 成功率（百分比）
}
```

---

## 🎯 使用示例

### 完整使用流程
```javascript
// 1. 导入必要模块
const { TaskExecutor, CommandParser, PlatformRegistry } = require('./core');
const KyArtAdapter = require('./platforms/kyart/KyArtAdapter');

// 2. 注册平台（通常在main.js中完成）
PlatformRegistry.register('kyart', KyArtAdapter, kyartCommands);

// 3. 解析用户指令
const commandString = 'ky列表-18812345678-pwd123-pay123-12345*2*100';
const { platform, task, mode, params } = CommandParser.parse(commandString);

// 4. 创建适配器实例
const AdapterClass = PlatformRegistry.getAdapter(platform);
const adapter = new AdapterClass(params.token || params.password, {
  timeout: 10000,
  payPassword: params.payPassword
});

// 5. 执行任务
const executor = new TaskExecutor();
executor.init(adapter);

await executor.executeTask(task, {
  ...params,
  mode,
  productId: params.productId,
  maxPrice: params.price,
  quantity: params.quantity
});
```

### 直接使用适配器
```javascript
// 直接使用平台适配器进行操作
const adapter = new KyArtAdapter('your-token');

// 获取商品列表
const products = await adapter.getProductList('12345');
console.log(`找到 ${products.length} 个商品`);

// 筛选可购买的商品
const availableProducts = products.filter(p => p.available && p.price <= 100);

// 下单
if (availableProducts.length > 0) {
  const orderId = await adapter.placeOrder(availableProducts[0]);
  console.log(`下单成功，订单ID: ${orderId}`);
  
  // 支付
  const paymentUrl = await adapter.getPaymentUrl(orderId);
  const paymentResult = await adapter.executePayment(paymentUrl, '123456');
  
  if (paymentResult.success) {
    console.log('支付成功！');
  }
}
```

---

*这个API参考文档涵盖了SmartBuy Framework的所有公开接口，为开发者提供了完整的技术参考。*