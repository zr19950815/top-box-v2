# 平台接入指南

## 🎯 概述

本指南详细说明如何为SmartBuy Framework添加新的购买平台。通过实现标准接口，任何电商平台都可以快速接入框架，享受统一的抢购策略和管理功能。

## 📋 接入检查清单

### 开发前准备
- [ ] 了解目标平台的API文档
- [ ] 获取平台测试账号和Token
- [ ] 分析平台的商品、订单、支付流程
- [ ] 确定平台支持的购买模式（列表/快捷/批量）

### 接入步骤
- [ ] 创建平台适配器类
- [ ] 实现8个标准接口方法
- [ ] 创建指令定义文件
- [ ] 注册平台到框架
- [ ] 编写单元测试
- [ ] 功能验证测试

## 🏗️ 创建平台适配器

### Step 1: 创建目录结构
```bash
platforms/
└── yourplatform/                   # 你的平台名称
    ├── YourPlatformAdapter.js     # 适配器实现
    ├── commands.js                # 指令定义  
    ├── README.md                  # 平台说明
    └── test/                      # 测试文件
        └── adapter.test.js
```

### Step 2: 实现适配器类
```javascript
// platforms/yourplatform/YourPlatformAdapter.js
const { PlatformAdapter } = require('../../interfaces/PlatformAdapter');

class YourPlatformAdapter extends PlatformAdapter {
  constructor(token, options = {}) {
    super(token, options);
    
    // 🔹 平台特有配置
    this.baseURL = 'https://api.yourplatform.com';
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'SmartBuy Framework/1.0',
      // 其他平台特有请求头
    };
    
    // 🔹 平台特有选项
    this.timeout = options.timeout || 10000;
    this.retryCount = options.retryCount || 3;
  }

  // ========== 抢购相关接口实现 ==========
  
  /**
   * 获取商品列表
   * @param {string} productId - 商品ID  
   * @param {object} options - 可选参数
   * @returns {Promise<Product[]>} 标准化的商品数组
   */
  async getProductList(productId, options = {}) {
    try {
      // 🔹 调用平台API
      const response = await this.makeRequest('GET', `/products/${productId}/list`, {
        page: options.page || 1,
        pageSize: options.pageSize || 20,
        // 其他平台特有参数
      });
      
      // 🔹 转换为标准格式
      return response.data.items.map(item => this.normalizeProduct(item));
      
    } catch (error) {
      throw new Error(`获取商品列表失败: ${error.message}`);
    }
  }

  /**
   * 普通下单
   * @param {Product} product - 商品对象
   * @returns {Promise<string>} 订单ID
   */
  async placeOrder(product) {
    try {
      const response = await this.makeRequest('POST', '/orders', {
        productId: product.id,
        quantity: 1,
        price: product.price,
        // 其他下单参数
      });
      
      return response.data.orderId;
      
    } catch (error) {
      throw new Error(`下单失败: ${error.message}`);
    }
  }

  /**
   * 快捷下单（如果平台支持）
   * @param {string} productId - 商品ID
   * @param {number} quantity - 数量
   * @returns {Promise<string>} 订单ID
   */
  async quickOrder(productId, quantity) {
    try {
      // 🔹 如果平台有快捷下单接口，直接调用
      const response = await this.makeRequest('POST', '/orders/quick', {
        productId,
        quantity
      });
      
      return response.data.orderId;
      
    } catch (error) {
      // 🔹 如果平台不支持快捷下单，可以fallback到普通下单
      console.warn('平台不支持快捷下单，使用普通下单');
      const products = await this.getProductList(productId);
      const bestProduct = products.find(p => p.available);
      if (!bestProduct) throw new Error('没有可用商品');
      return await this.placeOrder(bestProduct);
    }
  }

  /**
   * 批量下单（如果平台支持）
   * @param {string} productId - 商品ID
   * @param {number} batchSize - 批量大小
   * @returns {Promise<string>} 订单ID
   */
  async batchOrder(productId, batchSize) {
    try {
      const response = await this.makeRequest('POST', '/orders/batch', {
        productId,
        quantity: batchSize
      });
      
      return response.data.orderId;
      
    } catch (error) {
      // 🔹 如果不支持批量，可以循环调用普通下单
      throw new Error(`批量下单失败: ${error.message}`);
    }
  }

  // ========== 🆕 认证相关接口实现 ==========

  /**
   * 用户登录
   * @param {LoginCredentials} credentials - 登录凭据
   * @returns {Promise<AuthResult>} 认证结果
   */
  async login(credentials) {
    try {
      // 🔹 调用平台登录API
      const response = await this.makeRequest('POST', '/auth/login', {
        account: credentials.account,
        password: credentials.password,
        deviceId: credentials.deviceId || this.generateDeviceId(),
        captcha: credentials.captcha // 如果需要验证码
      });
      
      // 🔹 解析登录响应，提取Token信息
      const token = response.data.token || response.data.accessToken;
      const refreshToken = response.data.refreshToken;
      
      // 🔹 计算Token过期时间（如果平台提供）
      let expiresAt = null;
      if (response.data.expiresIn) {
        expiresAt = new Date(Date.now() + response.data.expiresIn * 1000);
      } else if (response.data.expiresAt) {
        expiresAt = new Date(response.data.expiresAt);
      }
      
      return {
        success: true,
        token,
        refreshToken,
        expiresAt,
        account: credentials.account,
        message: '登录成功'
      };
      
    } catch (error) {
      return {
        success: false,
        token: '',
        account: credentials.account,
        error: `登录失败: ${error.message}`
      };
    }
  }

  /**
   * 刷新Token
   * @param {string} oldToken - 旧的访问Token
   * @returns {Promise<string>} 新的访问Token
   */
  async refreshToken(oldToken) {
    try {
      // 🔹 如果平台支持refreshToken
      const response = await this.makeRequest('POST', '/auth/refresh', {
        token: oldToken,
        // 或者使用refreshToken
        // refreshToken: this.refreshToken
      });
      
      return response.data.token || response.data.accessToken;
      
    } catch (error) {
      throw new Error(`Token刷新失败: ${error.message}`);
    }
  }

  /**
   * 验证Token有效性
   * @param {string} token - 要验证的Token
   * @returns {Promise<boolean>} Token是否有效
   */
  async validateToken(token) {
    try {
      // 🔹 调用平台Token验证接口
      const response = await this.makeRequest('GET', '/auth/validate', null, {
        ...this.headers,
        Authorization: `Bearer ${token}` // 使用待验证的Token
      });
      
      return response.data.valid === true;
      
    } catch (error) {
      // 🔹 验证失败通常返回false而不是抛出异常
      console.warn('Token验证失败:', error.message);
      return false;
    }
  }

  /**
   * 用户登出
   * @param {string} token - 要失效的Token
   * @returns {Promise<boolean>} 是否成功登出
   */
  async logout(token) {
    try {
      await this.makeRequest('POST', '/auth/logout', {
        token
      });
      
      return true;
      
    } catch (error) {
      console.warn('登出失败:', error.message);
      return false; // 登出失败通常不抛异常，只是返回false
    }
  }

  // ========== 支付相关接口实现 ==========

  /**
   * 获取支付链接
   * @param {string} orderInfo - 订单信息
   * @returns {Promise<string>} 支付链接
   */
  async getPaymentUrl(orderInfo) {
    try {
      const response = await this.makeRequest('GET', `/orders/${orderInfo}/payment`);
      return response.data.paymentUrl;
      
    } catch (error) {
      throw new Error(`获取支付链接失败: ${error.message}`);
    }
  }

  /**
   * 执行支付
   * @param {string} paymentUrl - 支付链接
   * @param {string} password - 支付密码
   * @returns {Promise<PaymentResult>} 支付结果
   */
  async executePayment(paymentUrl, password) {
    try {
      // 🔹 这里实现平台特有的支付流程
      // 可能涉及多步骤的支付确认流程
      
      // 示例：密码加密
      const encryptedPassword = this.encryptPassword(password);
      
      // 示例：支付确认
      const response = await this.makeRequest('POST', '/payment/confirm', {
        paymentUrl,
        password: encryptedPassword
      });
      
      return {
        success: response.data.success,
        orderId: response.data.orderId,
        message: response.data.message
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ========== 简单任务接口实现 ==========

  /**
   * 确认合成
   * @param {string} combinationId - 合成ID
   * @returns {Promise<boolean>} 是否成功
   */
  async confirmCombination(combinationId) {
    try {
      const response = await this.makeRequest('POST', `/combinations/${combinationId}/confirm`);
      return response.data.success;
      
    } catch (error) {
      throw new Error(`合成确认失败: ${error.message}`);
    }
  }

  /**
   * 取消寄售
   * @param {string} resaleId - 寄售ID  
   * @returns {Promise<boolean>} 是否成功
   */
  async cancelResale(resaleId) {
    try {
      const response = await this.makeRequest('DELETE', `/resales/${resaleId}`);
      return response.data.success;
      
    } catch (error) {
      throw new Error(`取消寄售失败: ${error.message}`);
    }
  }

  // ========== 平台特有的辅助方法 ==========

  /**
   * 统一的HTTP请求方法
   * @private
   */
  async makeRequest(method, endpoint, data = null) {
    const axios = require('axios');
    
    const config = {
      method,
      url: `${this.baseURL}${endpoint}`,
      headers: this.headers,
      timeout: this.timeout
    };
    
    if (data) {
      if (method === 'GET') {
        config.params = data;
      } else {
        config.data = data;
      }
    }
    
    const response = await axios(config);
    
    // 🔹 统一处理平台的响应格式
    if (response.data.code !== 200) { // 假设200是成功码
      throw new Error(response.data.message || '请求失败');
    }
    
    return response.data;
  }

  /**
   * 将平台商品格式转换为标准格式
   * @private
   */
  normalizeProduct(platformProduct) {
    return {
      id: platformProduct.id || platformProduct.productId,
      name: platformProduct.name || platformProduct.title,
      price: parseFloat(platformProduct.price || platformProduct.currentPrice || 0),
      available: platformProduct.status === 'available', // 根据平台实际字段调整
      meta: platformProduct // 保留原始数据
    };
  }

  /**
   * 平台特有的密码加密（示例）
   * @private
   */
  encryptPassword(password) {
    // 🔹 根据平台要求实现密码加密
    // 例如：MD5、AES、RSA等
    const crypto = require('crypto');
    return crypto.createHash('md5').update(password).digest('hex');
  }
}

module.exports = YourPlatformAdapter;
```

## 📝 创建指令定义

### Step 3: 定义平台指令
```javascript
// platforms/yourplatform/commands.js
module.exports = {
  // 抢购相关指令
  '你的平台列表': { 
    platform: 'yourplatform', 
    task: 'smart-buy', 
    mode: 'list',
    description: '你的平台列表模式抢购'
  },
  
  '你的平台快捷': { 
    platform: 'yourplatform', 
    task: 'smart-buy', 
    mode: 'quick',
    description: '你的平台快捷模式抢购' 
  },
  
  '你的平台批量': { 
    platform: 'yourplatform', 
    task: 'smart-buy', 
    mode: 'batch',
    description: '你的平台批量模式抢购'
  },
  
  // 简单任务指令
  '你的平台合成': { 
    platform: 'yourplatform', 
    task: 'combination',
    description: '你的平台合成确认'
  },
  
  '你的平台取消': { 
    platform: 'yourplatform', 
    task: 'cancel-resale',
    description: '你的平台取消寄售'
  }
};
```

## 🔌 注册平台到框架

### Step 4: 平台注册
```javascript
// main.js 中添加你的平台
const YourPlatformAdapter = require('./platforms/yourplatform/YourPlatformAdapter');
const yourplatformCommands = require('./platforms/yourplatform/commands');

// 注册平台
PlatformRegistry.register('yourplatform', YourPlatformAdapter, yourplatformCommands);
```

## 🧪 编写测试

### Step 5: 创建测试用例
```javascript
// platforms/yourplatform/test/adapter.test.js
const YourPlatformAdapter = require('../YourPlatformAdapter');

describe('YourPlatformAdapter', () => {
  let adapter;
  
  beforeEach(() => {
    adapter = new YourPlatformAdapter('test-token');
  });

  describe('getProductList', () => {
    it('should return standardized product list', async () => {
      const products = await adapter.getProductList('test-product-id');
      
      expect(Array.isArray(products)).toBe(true);
      if (products.length > 0) {
        expect(products[0]).toHaveProperty('id');
        expect(products[0]).toHaveProperty('price');
        expect(products[0]).toHaveProperty('available');
      }
    });
  });

  describe('placeOrder', () => {
    it('should place order and return order id', async () => {
      const mockProduct = {
        id: 'test-product',
        price: 100,
        available: true
      };
      
      const orderId = await adapter.placeOrder(mockProduct);
      expect(typeof orderId).toBe('string');
      expect(orderId.length).toBeGreaterThan(0);
    });
  });

  // 测试其他方法...
});
```

## 📚 平台文档编写

### Step 6: 创建平台说明
```markdown
// platforms/yourplatform/README.md
# YourPlatform 适配器

## 平台特性

- **支持的购买模式**: 列表模式、快捷模式、批量模式
- **支持的功能**: 抢购、合成、取消寄售
- **API版本**: v2.0
- **认证方式**: Bearer Token

## 配置选项

```javascript
const options = {
  timeout: 15000,        // 请求超时时间
  retryCount: 3,         // 重试次数
  baseURL: 'custom-url'  // 自定义API地址（可选）
};
```

## 使用示例

```bash
# 列表模式抢购
node cli 你的平台列表-账号-密码-支付密码-商品ID*数量*价格

# 快捷模式抢购
node cli 你的平台快捷-账号-密码-支付密码-商品ID*数量*价格

# 合成确认
node cli 你的平台合成-账号-密码-支付密码-合成ID
```

## 注意事项

1. 该平台的支付密码需要进行MD5加密
2. 商品ID需要使用平台内部ID，不是显示ID
3. 批量下单单次最大支持10个商品

## 错误码对照

| 平台错误码 | 含义 | 处理方式 |
|-----------|------|---------|
| 40001 | Token无效 | 重新获取Token |
| 40002 | 商品不存在 | 检查商品ID |
| 40003 | 余额不足 | 充值后重试 |
```

## ✅ 验证和测试

### Step 7: 功能验证检查清单

#### 接口验证
**🆕 认证相关接口**
- [ ] login 能成功登录并返回Token
- [ ] refreshToken 能正确刷新Token
- [ ] validateToken 能准确验证Token状态
- [ ] logout 能成功登出

**抢购相关接口**  
- [ ] getProductList 返回标准格式的商品列表
- [ ] placeOrder 能成功下单并返回订单ID
- [ ] quickOrder 支持快捷下单（或合理fallback）
- [ ] batchOrder 支持批量下单（或合理处理）

**支付相关接口**
- [ ] getPaymentUrl 返回有效的支付链接
- [ ] executePayment 能正确处理支付流程

**简单任务接口**
- [ ] confirmCombination 能成功确认合成
- [ ] cancelResale 能成功取消寄售

#### 错误处理验证
- [ ] 网络错误处理正确
- [ ] API错误响应处理正确  
- [ ] 参数验证和错误提示清晰
- [ ] 超时处理机制有效

#### 🆕 认证流程验证
- [ ] 自动登录功能正常
- [ ] Token过期自动刷新
- [ ] 登录失败重试机制
- [ ] 认证状态管理准确

#### 集成验证
- [ ] 指令解析正确
- [ ] 三种抢购模式都能正常工作
- [ ] 与现有框架无冲突
- [ ] 统计和监控数据准确

### Step 8: 性能测试

```javascript
// 性能测试示例
describe('Performance Tests', () => {
  it('should handle concurrent requests', async () => {
    const promises = Array(10).fill().map(() => 
      adapter.getProductList('test-product')
    );
    
    const results = await Promise.all(promises);
    expect(results.length).toBe(10);
  });
  
  it('should respect timeout settings', async () => {
    const start = Date.now();
    
    try {
      await adapter.makeRequest('GET', '/slow-endpoint');
    } catch (error) {
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(adapter.timeout + 1000);
    }
  });
});
```

## 🚀 发布和维护

### Step 9: 发布准备
1. **代码审查**: 确保代码符合框架规范
2. **文档更新**: 更新主文档，添加新平台说明
3. **版本控制**: 创建feature分支，提交PR
4. **发布说明**: 编写changelog，说明新增平台

### Step 10: 维护指南
1. **监控**：关注平台API变更
2. **更新**：及时更新适配器以适应平台变化
3. **优化**：根据使用情况优化性能
4. **支持**：为用户提供技术支持

---

## 🎯 接入最佳实践

### 1. 安全考虑
- 敏感信息（密码、Token）安全处理
- API调用频率控制，避免被平台限制
- 错误信息不暴露敏感数据

### 2. 性能优化
- 合理使用HTTP连接池
- 实现智能重试策略
- 缓存不变的数据（如商品基本信息）

### 3. 代码质量
- 遵循ESLint规范
- 编写完整的JSDoc注释
- 保持代码简洁清晰

### 4. 用户体验
- 提供清晰的错误信息
- 支持进度显示
- 合理的默认配置

---

*按照这个指南，你可以快速为任何电商平台创建SmartBuy Framework的适配器，享受统一的购买策略和管理功能！*