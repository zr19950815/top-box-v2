# SmartBuy Framework - 平台扩展指南

## 概述

SmartBuy Framework 提供了灵活的平台扩展机制，允许开发者轻松地为新的购物平台添加支持。本指南详细说明了如何扩展框架以支持新平台。

## 扩展架构

### 核心组件

1. **PlatformAdapter** - 平台适配器接口
2. **PlatformRegistry** - 平台注册管理器
3. **PurchaseStrategy** - 抢购策略基类
4. **AuthManager** - 认证管理器

### 扩展点

- 平台适配器实现
- 自定义抢购策略
- 支付处理器
- 订单处理器
- 指令映射定义

## 步骤1：创建平台适配器

### 1.1 实现PlatformAdapter接口

创建新的适配器类继承自`PlatformAdapter`：

```javascript
// platforms/MyPlatformAdapter.js
const PlatformAdapter = require('../interfaces/adapters/PlatformAdapter');
const { ErrorFactory } = require('../utils/ErrorTypes');
const Logger = require('../utils/Logger');

class MyPlatformAdapter extends PlatformAdapter {
  /**
   * 构造函数
   * @param {string} authToken - 认证令牌
   * @param {Object} config - 配置选项
   */
  constructor(authToken, config) {
    super(authToken, config);
    
    // 平台特定配置
    this.baseURL = config.baseURL || 'https://api.myplatform.com';
    this.apiVersion = config.apiVersion || 'v1';
    
    // 初始化HTTP客户端
    this.initializeHttpClient();
  }

  /**
   * 登录到平台
   * @param {LoginCredentials} credentials - 登录凭据
   * @returns {Promise<AuthResult>} 认证结果
   */
  async login(credentials) {
    try {
      const response = await this.httpClient.post('/auth/login', {
        username: credentials.account,
        password: credentials.password
      });

      if (response.data.success) {
        return {
          success: true,
          token: response.data.token,
          refreshToken: response.data.refreshToken,
          expiresIn: response.data.expiresIn,
          userInfo: response.data.user
        };
      }

      throw ErrorFactory.createAuthError('登录失败');
    } catch (error) {
      Logger.error('[MyPlatformAdapter] 登录失败', error);
      throw error;
    }
  }

  /**
   * 获取商品列表
   * @param {ProductQuery} query - 查询参数
   * @returns {Promise<Product[]>} 商品列表
   */
  async getProductList(query) {
    try {
      const response = await this.httpClient.get('/products', {
        params: query
      });

      return response.data.products.map(this.transformProduct);
    } catch (error) {
      Logger.error('[MyPlatformAdapter] 获取商品列表失败', error);
      throw ErrorFactory.createAPIError(`获取商品列表失败: ${error.message}`);
    }
  }

  /**
   * 执行抢购
   * @param {PurchaseConfig} config - 抢购配置
   * @returns {Promise<PurchaseResult>} 抢购结果
   */
  async executePurchase(config) {
    try {
      const response = await this.httpClient.post('/purchase', {
        productId: config.productId,
        quantity: config.quantity,
        payPassword: config.payPassword
      });

      return {
        success: response.data.success,
        orderId: response.data.orderId,
        message: response.data.message
      };
    } catch (error) {
      Logger.error('[MyPlatformAdapter] 抢购执行失败', error);
      throw ErrorFactory.createPurchaseError(`抢购失败: ${error.message}`);
    }
  }

  /**
   * 获取订单状态
   * @param {string} orderId - 订单ID
   * @returns {Promise<OrderStatus>} 订单状态
   */
  async getOrderStatus(orderId) {
    try {
      const response = await this.httpClient.get(`/orders/${orderId}`);
      
      return {
        orderId: response.data.orderId,
        status: response.data.status,
        amount: response.data.amount,
        createTime: response.data.createTime
      };
    } catch (error) {
      Logger.error('[MyPlatformAdapter] 获取订单状态失败', error);
      throw ErrorFactory.createAPIError(`获取订单状态失败: ${error.message}`);
    }
  }

  /**
   * 处理支付
   * @param {PaymentConfig} config - 支付配置
   * @returns {Promise<PaymentResult>} 支付结果
   */
  async processPayment(config) {
    try {
      const response = await this.httpClient.post('/payment', {
        orderId: config.orderId,
        payPassword: config.payPassword,
        paymentMethod: config.paymentMethod
      });

      return {
        success: response.data.success,
        paymentId: response.data.paymentId,
        message: response.data.message
      };
    } catch (error) {
      Logger.error('[MyPlatformAdapter] 支付处理失败', error);
      throw ErrorFactory.createPaymentError(`支付失败: ${error.message}`);
    }
  }

  /**
   * 取消订单
   * @param {string} orderId - 订单ID
   * @returns {Promise<boolean>} 是否成功
   */
  async cancelOrder(orderId) {
    try {
      const response = await this.httpClient.post(`/orders/${orderId}/cancel`);
      return response.data.success;
    } catch (error) {
      Logger.error('[MyPlatformAdapter] 取消订单失败', error);
      throw ErrorFactory.createAPIError(`取消订单失败: ${error.message}`);
    }
  }

  /**
   * 刷新认证Token
   * @param {string} refreshToken - 刷新令牌
   * @returns {Promise<AuthResult>} 认证结果
   */
  async refreshToken(refreshToken) {
    try {
      const response = await this.httpClient.post('/auth/refresh', {
        refreshToken
      });

      return {
        success: true,
        token: response.data.token,
        refreshToken: response.data.refreshToken,
        expiresIn: response.data.expiresIn
      };
    } catch (error) {
      Logger.error('[MyPlatformAdapter] Token刷新失败', error);
      throw ErrorFactory.createAuthError(`Token刷新失败: ${error.message}`);
    }
  }

  /**
   * 验证配置
   * @param {Object} config - 配置对象
   * @returns {ValidationResult} 验证结果
   */
  validateConfig(config) {
    const errors = [];

    if (!config.account) {
      errors.push('账号不能为空');
    }

    if (!config.password) {
      errors.push('密码不能为空');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // =============== 私有方法 ===============

  /**
   * 初始化HTTP客户端
   * @private
   */
  initializeHttpClient() {
    const axios = require('axios');
    
    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SmartBuy-Framework/1.0'
      }
    });

    // 请求拦截器
    this.httpClient.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          throw ErrorFactory.createAuthError('认证失败，Token可能已过期');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * 转换商品数据格式
   * @private
   * @param {Object} rawProduct - 原始商品数据
   * @returns {Product} 标准化商品数据
   */
  transformProduct(rawProduct) {
    return {
      id: rawProduct.id,
      name: rawProduct.title,
      price: rawProduct.price,
      originalPrice: rawProduct.originalPrice,
      stock: rawProduct.stock,
      category: rawProduct.category,
      imageUrl: rawProduct.image,
      description: rawProduct.desc
    };
  }
}

module.exports = MyPlatformAdapter;
```

### 1.2 注册平台适配器

在`main.js`中注册新平台：

```javascript
// main.js
const PlatformRegistry = require('./core/PlatformRegistry');
const MyPlatformAdapter = require('./platforms/MyPlatformAdapter');

// 注册平台
PlatformRegistry.register('myplatform', MyPlatformAdapter);
```

## 步骤2：创建指令映射

### 2.1 定义指令映射文件

```javascript
// config/commands/myplatform.js
module.exports = {
  // 抢购相关指令
  purchase: {
    // 列表抢购
    list: {
      strategy: 'list',
      description: '列表模式抢购',
      examples: [
        'myplatform purchase list productId=123 quantity=2',
        'myplatform purchase list productId=123 quantity=2 payPassword=123456'
      ]
    },
    
    // 快捷抢购
    quick: {
      strategy: 'quick',
      description: '快捷模式抢购',
      examples: [
        'myplatform purchase quick productId=123',
        'myplatform purchase quick productId=123 quantity=3'
      ]
    },
    
    // 批量抢购
    batch: {
      strategy: 'batch',
      description: '批量模式抢购',
      examples: [
        'myplatform purchase batch productIds=123,456,789',
        'myplatform purchase batch productIds=123,456 quantities=2,1'
      ]
    }
  },
  
  // 查询相关指令
  query: {
    products: {
      action: 'getProductList',
      description: '获取商品列表',
      examples: [
        'myplatform query products category=electronics',
        'myplatform query products keyword=手机 limit=20'
      ]
    },
    
    orders: {
      action: 'getOrderStatus',
      description: '查询订单状态',
      examples: [
        'myplatform query orders orderId=ORDER123456',
        'myplatform query orders status=pending'
      ]
    }
  },
  
  // 管理相关指令
  manage: {
    cancel: {
      action: 'cancelOrder',
      description: '取消订单',
      examples: [
        'myplatform manage cancel orderId=ORDER123456'
      ]
    }
  }
};
```

### 2.2 注册指令映射

```javascript
// core/CommandRegistry.js
const CommandParser = require('./CommandParser');
const myPlatformCommands = require('../config/commands/myplatform');

// 注册指令映射
CommandParser.registerCommands('myplatform', myPlatformCommands);
```

## 步骤3：自定义抢购策略（可选）

### 3.1 创建自定义策略

```javascript
// strategies/purchase/CustomPurchaseStrategy.js
const PurchaseStrategy = require('../../interfaces/strategies/PurchaseStrategy');
const Logger = require('../../utils/Logger');

class CustomPurchaseStrategy extends PurchaseStrategy {
  /**
   * 执行自定义抢购策略
   * @param {PlatformAdapter} adapter - 平台适配器
   * @param {PurchaseConfig} config - 抢购配置
   * @returns {Promise<PurchaseResult>} 抢购结果
   */
  async executePurchase(adapter, config) {
    Logger.info(`[CustomPurchaseStrategy] 开始执行自定义抢购`);
    
    try {
      // 预处理
      await this.preProcess(adapter, config);
      
      // 自定义抢购逻辑
      const result = await this.performCustomPurchase(adapter, config);
      
      // 后处理
      await this.postProcess(adapter, config, result);
      
      return result;
    } catch (error) {
      Logger.error(`[CustomPurchaseStrategy] 抢购失败`, error);
      throw error;
    }
  }

  /**
   * 执行自定义抢购逻辑
   * @private
   * @param {PlatformAdapter} adapter - 平台适配器
   * @param {PurchaseConfig} config - 抢购配置
   * @returns {Promise<PurchaseResult>} 抢购结果
   */
  async performCustomPurchase(adapter, config) {
    // 实现自定义抢购逻辑
    // 例如：多轮抢购、条件触发等
    
    for (let round = 1; round <= config.maxRounds; round++) {
      Logger.info(`[CustomPurchaseStrategy] 第${round}轮抢购开始`);
      
      try {
        const result = await adapter.executePurchase({
          productId: config.productId,
          quantity: config.quantity,
          payPassword: config.payPassword
        });
        
        if (result.success) {
          Logger.info(`[CustomPurchaseStrategy] 第${round}轮抢购成功`);
          return result;
        }
        
        // 等待下一轮
        if (round < config.maxRounds) {
          await this.sleep(config.roundInterval || 1000);
        }
      } catch (error) {
        Logger.warn(`[CustomPurchaseStrategy] 第${round}轮抢购失败`, error);
        
        if (round === config.maxRounds) {
          throw error;
        }
      }
    }
    
    throw new Error('所有轮次抢购都失败');
  }
}

module.exports = CustomPurchaseStrategy;
```

### 3.2 注册自定义策略

```javascript
// core/StrategyRegistry.js
const CustomPurchaseStrategy = require('../strategies/purchase/CustomPurchaseStrategy');

// 注册策略
const strategyRegistry = new Map();
strategyRegistry.set('custom', CustomPurchaseStrategy);

module.exports = {
  getStrategy: (name) => strategyRegistry.get(name),
  registerStrategy: (name, strategy) => strategyRegistry.set(name, strategy)
};
```

## 步骤4：配置和测试

### 4.1 创建配置文件

```javascript
// config/platforms/myplatform.json
{
  "name": "MyPlatform",
  "displayName": "我的平台",
  "version": "1.0.0",
  "baseURL": "https://api.myplatform.com",
  "apiVersion": "v1",
  "features": {
    "purchase": true,
    "payment": true,
    "orderQuery": true,
    "productQuery": true,
    "orderCancel": true
  },
  "authentication": {
    "type": "token",
    "refreshSupported": true,
    "tokenExpiry": 3600
  },
  "limits": {
    "requestPerSecond": 10,
    "maxRetries": 3,
    "timeout": 30000
  }
}
```

### 4.2 编写测试

```javascript
// tests/platforms/MyPlatformAdapter.test.js
const MyPlatformAdapter = require('../../platforms/MyPlatformAdapter');
const { expect } = require('chai');

describe('MyPlatformAdapter', () => {
  let adapter;
  
  beforeEach(() => {
    adapter = new MyPlatformAdapter('test-token', {
      baseURL: 'https://test-api.myplatform.com'
    });
  });

  describe('login', () => {
    it('应该成功登录', async () => {
      const credentials = {
        account: 'testuser',
        password: 'testpass'
      };

      const result = await adapter.login(credentials);
      
      expect(result.success).to.be.true;
      expect(result.token).to.be.a('string');
    });
  });

  describe('getProductList', () => {
    it('应该返回商品列表', async () => {
      const query = {
        category: 'electronics',
        limit: 10
      };

      const products = await adapter.getProductList(query);
      
      expect(products).to.be.an('array');
      expect(products[0]).to.have.property('id');
      expect(products[0]).to.have.property('name');
    });
  });

  describe('executePurchase', () => {
    it('应该执行抢购', async () => {
      const config = {
        productId: 'PROD123',
        quantity: 1,
        payPassword: '123456'
      };

      const result = await adapter.executePurchase(config);
      
      expect(result).to.have.property('success');
      expect(result).to.have.property('orderId');
    });
  });
});
```

### 4.3 运行测试

```bash
# 运行特定平台测试
npm test -- --grep "MyPlatformAdapter"

# 运行所有测试
npm test

# 生成覆盖率报告
npm run test:coverage
```

## 步骤5：集成和部署

### 5.1 更新主配置

```javascript
// config/platforms.js
module.exports = {
  kyart: require('./platforms/kyart'),
  hzmiss: require('./platforms/hzmiss'),
  myplatform: require('./platforms/myplatform'), // 新增平台
};
```

### 5.2 更新CLI帮助

```javascript
// cli.js
const platforms = {
  'kyart': 'KY平台 - 支持列表、快捷、批量抢购',
  'hzmiss': 'HZ平台 - 支持多种抢购模式',
  'myplatform': '我的平台 - 自定义抢购策略', // 新增
};
```

### 5.3 文档更新

在`README.md`中添加新平台的使用说明：

```markdown
## 支持的平台

- **KyArt**: 支持列表、快捷、批量抢购
- **HzMiss**: 支持多种抢购模式和合成功能  
- **MyPlatform**: 支持自定义抢购策略 ← 新增

## MyPlatform 使用示例

```bash
# 列表抢购
node cli.js "myplatform purchase list productId=123 quantity=2"

# 快捷抢购
node cli.js "myplatform purchase quick productId=456"

# 查询商品
node cli.js "myplatform query products category=electronics limit=10"
```
```

## 最佳实践

### 1. 错误处理

- 使用统一的错误类型和工厂方法
- 提供详细的错误信息和上下文
- 实现重试机制和降级策略

### 2. 日志记录

- 使用统一的日志格式和级别
- 记录关键操作和性能指标
- 避免记录敏感信息

### 3. 配置管理

- 使用环境变量管理敏感配置
- 提供合理的默认值
- 支持配置验证和热更新

### 4. 性能优化

- 实现请求缓存和批处理
- 使用连接池和请求限流
- 监控和优化关键路径

### 5. 安全考虑

- 验证所有用户输入
- 使用HTTPS和证书验证
- 实现Token刷新和失效机制

## 调试和排错

### 常见问题

1. **适配器加载失败**
   - 检查文件路径和模块导出
   - 验证依赖项安装
   - 查看控制台错误信息

2. **API调用失败**
   - 检查网络连接和代理设置
   - 验证API端点和参数格式
   - 查看HTTP状态码和响应内容

3. **认证问题**
   - 检查Token格式和有效期
   - 验证刷新机制实现
   - 查看认证相关日志

### 调试工具

```javascript
// 启用调试日志
process.env.DEBUG = 'smartbuy:*';

// 使用调试适配器
const adapter = new MyPlatformAdapter(token, {
  debug: true,
  logLevel: 'debug'
});
```

## 总结

通过以上步骤，你已经成功为SmartBuy Framework添加了新平台支持。框架的模块化设计确保了扩展的简单性和一致性，同时提供了足够的灵活性来适应不同平台的特殊需求。

记住在开发过程中：
- 遵循既定的接口规范
- 编写充分的测试用例
- 提供清晰的文档说明
- 考虑错误处理和边界情况

这样可以确保新平台与框架的无缝集成，为用户提供一致的体验。