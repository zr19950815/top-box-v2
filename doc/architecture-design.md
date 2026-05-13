# SmartBuy Framework 架构设计文档

## 🎯 设计目标

创建一个高度抽象、易扩展的多平台智能购买框架，实现：
- **平台无关性**：框架层完全抽象，不依赖任何具体平台
- **策略可扩展**：支持多种购买策略，易于添加新策略
- **平台易接入**：新平台只需实现8个标准方法即可接入
- **统一用户体验**：所有平台使用相同的指令格式和调用方式

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   cli.js    │    │  main.js    │    │ Legacy CLI  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                     Core Framework                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │TaskExecutor │    │CommandParser│    │PlatformReg..│     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                 🆕 Authentication Layer                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ AuthManager │    │ TokenStore  │    │CredentialMgr│     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                   Strategy Layer                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ ListMode    │    │ QuickMode   │    │ BatchMode   │     │
│  │ Strategy    │    │ Strategy    │    │ Strategy    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                  Processor Layer                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Payment     │    │ Order       │    │ Stats       │     │
│  │ Processor   │    │ Processor   │    │ Collector   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                 Platform Adapter Layer                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  KyArt      │    │  HzMiss     │    │ New Platform│     │
│  │  Adapter    │    │  Adapter    │    │  Adapter    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 数据流设计

### 指令处理流程
```
用户指令 → CommandParser → PlatformRegistry → 🆕 AuthManager → TaskExecutor
    ↓
认证检查 → Token获取/验证 → Strategy选择 → PurchaseStrategy.execute()
    ↓
Platform Adapter → API调用 → 数据处理 → 结果返回 → 统计收集
```

### 🆕 认证流程设计
```
开始任务
    ↓
┌─────────────────┐
│ 解析用户凭据    │ ← CommandParser提取账号密码
│ (账号/密码/Token)│
└─────────────────┘
    ↓
┌─────────────────┐
│ AuthManager检查 │ ← 检查是否存在有效Token
│ Token是否存在   │
└─────────────────┘
    ↓
    Token存在且有效?
         ├─ 是 → 直接执行业务逻辑
         └─ 否 ↓
┌─────────────────┐
│ 调用平台登录API  │ ← PlatformAdapter.login()
│ 获取新Token     │
└─────────────────┘
    ↓
┌─────────────────┐
│ TokenStore保存  │ ← 缓存Token和过期时间
│ Token到本地     │
└─────────────────┘
    ↓
┌─────────────────┐
│ 执行业务API调用  │ ← 使用Token调用业务接口
│ (抢购/合成等)   │
└─────────────────┘
    ↓
    API调用成功?
         ├─ 是 → 任务完成
         └─ 否 (401认证失败) ↓
┌─────────────────┐
│ Token刷新重试   │ ← 自动刷新Token并重试
│ (最多3次)       │
└─────────────────┘
```

### 抢购流程设计
```
开始执行
    ↓
┌─────────────────┐
│ Strategy.execute│ ← 模板方法（统一流程）
│ while循环控制    │
└─────────────────┘
    ↓
┌─────────────────┐
│acquireAndOrder  │ ← 抽象方法（各策略差异化实现）
│（策略差异化）    │
└─────────────────┘
    ↓
┌─────────────────┐
│checkOrderStatus │ ← 统一逻辑（OrderProcessor）
│（统一处理）      │
└─────────────────┘
    ↓
┌─────────────────┐
│processPayment   │ ← 统一逻辑（PaymentProcessor）  
│（统一处理）      │
└─────────────────┘
    ↓
┌─────────────────┐
│updateProgress   │ ← 统一逻辑（进度管理）
│（统一处理）      │
└─────────────────┘
    ↓
检查是否完成 → 完成/继续循环
```

## 🎭 设计模式应用

### 1. 模板方法模式 (Template Method)
**应用场景**: PurchaseStrategy基类
```javascript
// 抽象基类定义算法骨架
class PurchaseStrategy {
  async execute(config) {           // 模板方法
    while (this.remainingQuantity > 0) {
      const orderResult = await this.acquireAndOrder(config);  // 抽象步骤
      const orderInfo = await this.checkOrderStatus(orderResult);  // 具体步骤
      const paymentResult = await this.processPayment(orderInfo);  // 具体步骤
      this.updateProgress(paymentResult);  // 具体步骤
    }
  }
  
  abstract async acquireAndOrder(config);  // 抽象方法，子类实现
}
```

### 2. 策略模式 (Strategy)
**应用场景**: 三种抢购模式
```javascript
// 策略接口统一，实现各异
ListModeStrategy   → 刷新列表 + 筛选最优
QuickModeStrategy  → 直接快捷下单
BatchModeStrategy  → 批量下单
```

### 3. 注册表模式 (Registry)
**应用场景**: 平台管理
```javascript
class PlatformRegistry {
  static platforms = new Map();
  static register(name, adapter, commands) {
    this.platforms.set(name, adapter);
    this.registerCommands(commands);
  }
}
```

### 4. 适配器模式 (Adapter)
**应用场景**: 平台接入
```javascript
// 不同平台的API适配到统一接口
class KyArtAdapter extends PlatformAdapter {
  async getProductList(productId) {
    // 调用KyArt特有的API，返回标准格式
    const response = await this.getMarketGoodsList(productId);
    return this.normalizeProducts(response);
  }
}
```

### 5. 工厂方法模式 (Factory Method)
**应用场景**: 策略创建
```javascript
class StrategyFactory {
  static create(mode, adapter, processors) {
    switch(mode) {
      case 'list': return new ListModeStrategy(adapter, processors);
      case 'quick': return new QuickModeStrategy(adapter, processors);
      case 'batch': return new BatchModeStrategy(adapter, processors);
    }
  }
}
```

## 🔌 接口设计

### PlatformAdapter 标准接口
```javascript
interface PlatformAdapter {
  // 🆕 认证相关接口
  async login(credentials: LoginCredentials): Promise<AuthResult>
  async refreshToken(oldToken: string): Promise<string>
  async validateToken(token: string): Promise<boolean>
  async logout(token: string): Promise<boolean>
  
  // 抢购相关接口
  async getProductList(productId: string, options?: object): Promise<Product[]>
  async placeOrder(product: Product): Promise<string>
  async quickOrder(productId: string, quantity: number): Promise<string>  
  async batchOrder(productId: string, batchSize: number): Promise<string>
  
  // 支付相关接口
  async getPaymentUrl(orderInfo: string): Promise<string>
  async executePayment(paymentUrl: string, password: string): Promise<PaymentResult>
  
  // 简单任务接口
  async confirmCombination(combinationId: string): Promise<boolean>
  async cancelResale(resaleId: string): Promise<boolean>
}
```

### 🆕 认证层接口设计

#### AuthManager 认证管理器
```javascript
interface AuthManager {
  // 统一认证入口
  async authenticate(platform: string, credentials: LoginCredentials): Promise<AuthResult>
  
  // Token管理
  async getValidToken(platform: string, account: string): Promise<string | null>
  async refreshToken(platform: string, account: string, oldToken: string): Promise<string>
  async invalidateToken(platform: string, account: string): Promise<void>
  
  // 认证状态检查
  isAuthenticated(platform: string, account: string): boolean
  getAuthStatus(platform: string, account: string): AuthStatus
  
  // 自动重试机制
  async withAuthRetry<T>(fn: () => Promise<T>, maxRetries?: number): Promise<T>
}
```

#### TokenStore Token存储管理
```javascript
interface TokenStore {
  // Token存储
  async saveToken(platform: string, account: string, tokenData: TokenData): Promise<void>
  async getToken(platform: string, account: string): Promise<TokenData | null>
  async removeToken(platform: string, account: string): Promise<void>
  
  // 批量管理
  async getAllTokens(platform?: string): Promise<TokenData[]>
  async cleanExpiredTokens(): Promise<number>
  
  // Token验证
  async isTokenValid(platform: string, account: string): Promise<boolean>
  async getTokenExpireTime(platform: string, account: string): Promise<Date | null>
}
```

#### CredentialManager 凭据管理器
```javascript
interface CredentialManager {
  // 凭据存储（加密）
  async saveCredentials(platform: string, account: string, credentials: LoginCredentials): Promise<void>
  async getCredentials(platform: string, account: string): Promise<LoginCredentials | null>
  async removeCredentials(platform: string, account: string): Promise<void>
  
  // 凭据验证
  validateCredentials(credentials: LoginCredentials): ValidationResult
  
  // 安全管理
  async encryptPassword(password: string): Promise<string>
  async decryptPassword(encryptedPassword: string): Promise<string>
}
```

### 标准数据格式

#### 🆕 认证相关数据格式
```javascript
// 登录凭据
interface LoginCredentials {
  account: string;        // 账号（手机号/邮箱）
  password: string;       // 登录密码
  payPassword?: string;   // 支付密码（可选）
  captcha?: string;       // 验证码（可选）
  deviceId?: string;      // 设备ID（可选）
}

// 认证结果
interface AuthResult {
  success: boolean;       // 认证是否成功
  token: string;         // 访问Token
  refreshToken?: string; // 刷新Token（可选）
  expiresAt?: Date;      // Token过期时间
  account: string;       // 关联账号
  message?: string;      // 成功消息
  error?: string;        // 错误信息
}

// Token数据
interface TokenData {
  token: string;         // 访问Token
  refreshToken?: string; // 刷新Token
  expiresAt: Date;      // 过期时间
  createdAt: Date;      // 创建时间
  lastUsedAt?: Date;    // 最后使用时间
  platform: string;    // 所属平台
  account: string;      // 关联账号
}

// 认证状态
enum AuthStatus {
  NOT_AUTHENTICATED = 'not_authenticated',
  AUTHENTICATED = 'authenticated', 
  TOKEN_EXPIRED = 'token_expired',
  TOKEN_INVALID = 'token_invalid',
  REFRESH_NEEDED = 'refresh_needed'
}

// 验证结果
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}
```

#### 业务数据格式
```javascript
// 商品对象
interface Product {
  id: string;
  name?: string;
  price: number;
  available: boolean;
  // 平台特有字段保留在 meta 中
  meta?: object;
}

// 支付结果对象  
interface PaymentResult {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
}
```

## 🎮 控制流设计

### 任务执行控制流
```
CLI Input → Command Parse → Platform Load → Strategy Select → Task Execute
    ↓
Task Type Router:
├── smart-buy → Strategy Execute → Loop Control
├── combination → Direct API Call
└── cancel-resale → Direct API Call
```

### 错误处理控制流
```
Error Occurred
    ↓
Error Type Classification:
├── NO_QUALIFIED_PRODUCTS → Continue Loop
├── PAYMENT_FAILED → Stop Task  
├── NETWORK_ERROR → Retry
├── API_ERROR → Retry
└── UNKNOWN_ERROR → Log & Retry
```

### 进度控制流
```
Task Start → Initialize Progress → Execute Loop
    ↓
Each Success → Update Progress → Check Target → Continue/Complete
    ↓
Task Complete → Final Statistics → Cleanup
```

## 📦 模块依赖关系

### 依赖层次图
```
┌─────────────────┐
│   CLI Layer     │ (依赖所有下层)
├─────────────────┤
│  Core Framework │ (依赖Strategy、Processor、Interface)
├─────────────────┤  
│ Strategy Layer  │ (依赖Processor、Interface)
├─────────────────┤
│Processor Layer  │ (依赖Interface)
├─────────────────┤
│Interface Layer  │ (无依赖，纯定义)
├─────────────────┤
│ Platform Layer  │ (依赖Interface，被其他层调用)
├─────────────────┤
│  Utils Layer    │ (被所有层使用)
└─────────────────┘
```

### 关键依赖规则
1. **严格分层**：上层可以依赖下层，下层不能依赖上层
2. **接口隔离**：只能通过Interface层进行跨层调用
3. **平台无关**：除Platform层外，任何层都不能包含平台特定代码
4. **循环依赖禁止**：任何模块间不能形成循环依赖

## 🔧 扩展点设计

### 1. 新平台扩展点
```javascript
// 实现PlatformAdapter接口 → 定义Commands映射 → 注册到Registry
const newPlatform = {
  adapter: NewPlatformAdapter,  
  commands: newPlatformCommands
};
PlatformRegistry.register('newplatform', newPlatform);
```

### 2. 新策略扩展点
```javascript  
// 继承PurchaseStrategy → 实现acquireAndOrder → 注册到StrategyFactory
class CustomStrategy extends PurchaseStrategy {
  async acquireAndOrder(config) {
    // 自定义获取下单逻辑
  }
}
```

### 3. 新处理器扩展点
```javascript
// 实现标准接口 → 注入到TaskExecutor
class CustomProcessor {
  async process(data, config) {
    // 自定义处理逻辑
  }
}
```

### 4. 新任务类型扩展点
```javascript
// TaskExecutor中添加新的case分支
case 'custom-task':
  return await this.executeCustomTask(config);
```

## 🎯 性能设计考虑

### 1. 异步处理
- 所有API调用都是异步的
- 支持并发请求（在合理范围内）
- 避免阻塞主线程

### 2. 资源管理
- 适配器实例复用
- 连接池管理（如需要）
- 内存使用优化

### 3. 容错设计
- 重试机制
- 超时控制
- 优雅降级

### 4. 监控设计
- 请求统计
- 性能监控
- 错误追踪

---

*这个架构设计确保了框架的高度可扩展性和maintainability，同时保持了清晰的职责分离和优雅的代码结构。*