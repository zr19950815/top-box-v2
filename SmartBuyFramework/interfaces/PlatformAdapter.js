/**
 * SmartBuy Framework - 平台适配器抽象基类
 * 
 * 所有平台适配器必须继承此类并实现8个抽象方法：
 * - 4个抢购相关方法
 * - 2个支付相关方法  
 * - 2个简单任务方法
 */

class PlatformAdapter {
  /**
   * 构造函数
   * @param {string} [token] - 平台认证Token（可选，如果没有会通过登录获取）
   * @param {Object} [options] - 平台特有配置选项
   */
  constructor(token = null, options = {}) {
    this.token = token;
    this.options = options;
    this.credentials = null; // 用户凭据，登录后保存
  }

  // ========== 认证相关接口 ==========

  /**
   * 用户登录
   * @param {LoginCredentials} credentials - 登录凭据
   * @returns {Promise<AuthResult>} 认证结果
   */
  async login(credentials) {
    throw new Error('PlatformAdapter.login() must be implemented by subclass');
  }

  /**
   * 刷新Token
   * @param {string} oldToken - 旧的访问Token
   * @returns {Promise<string>} 新的访问Token
   */
  async refreshToken(oldToken) {
    throw new Error('PlatformAdapter.refreshToken() must be implemented by subclass');
  }

  /**
   * 验证Token有效性
   * @param {string} token - 要验证的Token
   * @returns {Promise<boolean>} Token是否有效
   */
  async validateToken(token) {
    throw new Error('PlatformAdapter.validateToken() must be implemented by subclass');
  }

  /**
   * 用户登出
   * @param {string} token - 要失效的Token
   * @returns {Promise<boolean>} 是否成功登出
   */
  async logout(token) {
    throw new Error('PlatformAdapter.logout() must be implemented by subclass');
  }

  // ========== 抢购相关接口 ==========

  /**
   * 获取商品列表
   * @param {string} productId - 商品ID
   * @param {Object} [options] - 可选参数
   * @param {number} [options.page] - 页码，默认1
   * @param {number} [options.pageSize] - 每页数量，默认20
   * @param {string} [options.sortBy] - 排序方式，默认'price'
   * @param {string} [options.order] - 排序顺序，默认'asc'
   * @returns {Promise<Product[]>} 标准化的商品数组
   */
  async getProductList(productId, options = {}) {
    throw new Error('PlatformAdapter.getProductList() must be implemented by subclass');
  }

  /**
   * 普通下单
   * @param {Product} product - 商品对象
   * @returns {Promise<string>} 订单ID
   */
  async placeOrder(product) {
    throw new Error('PlatformAdapter.placeOrder() must be implemented by subclass');
  }

  /**
   * 快捷下单
   * @param {string} productId - 商品ID
   * @param {number} quantity - 购买数量
   * @returns {Promise<string>} 订单ID
   */
  async quickOrder(productId, quantity) {
    throw new Error('PlatformAdapter.quickOrder() must be implemented by subclass');
  }

  /**
   * 批量下单
   * @param {string} productId - 商品ID
   * @param {number} batchSize - 批量大小
   * @returns {Promise<string>} 批量订单ID
   */
  async batchOrder(productId, batchSize) {
    throw new Error('PlatformAdapter.batchOrder() must be implemented by subclass');
  }

  // ========== 支付相关接口 ==========

  /**
   * 获取支付链接
   * @param {string} orderInfo - 订单信息（通常是订单ID）
   * @returns {Promise<string>} 支付链接URL
   */
  async getPaymentUrl(orderInfo) {
    throw new Error('PlatformAdapter.getPaymentUrl() must be implemented by subclass');
  }

  /**
   * 执行支付流程
   * @param {string} paymentUrl - 支付链接
   * @param {string} password - 支付密码
   * @returns {Promise<PaymentResult>} 支付结果对象
   */
  async executePayment(paymentUrl, password) {
    throw new Error('PlatformAdapter.executePayment() must be implemented by subclass');
  }

  // ========== 简单任务接口 ==========

  /**
   * 确认合成操作
   * @param {string} combinationId - 合成ID
   * @returns {Promise<boolean>} 是否成功
   */
  async confirmCombination(combinationId) {
    throw new Error('PlatformAdapter.confirmCombination() must be implemented by subclass');
  }

  /**
   * 取消寄售操作
   * @param {string} resaleId - 寄售ID
   * @returns {Promise<boolean>} 是否成功
   */
  async cancelResale(resaleId) {
    throw new Error('PlatformAdapter.cancelResale() must be implemented by subclass');
  }

  // ========== 辅助方法 ==========

  /**
   * 确保已认证，如果Token无效则重新登录
   * @protected
   */
  async ensureAuthenticated() {
    if (!this.token || !(await this.validateToken(this.token))) {
      if (!this.credentials) {
        throw new Error('No credentials available for authentication');
      }
      
      const authResult = await this.login(this.credentials);
      if (!authResult.success) {
        throw new Error(`Authentication failed: ${authResult.error}`);
      }
      
      this.token = authResult.token;
    }
  }

  /**
   * 带认证重试的API调用装饰器
   * @protected
   * @param {Function} apiCall - API调用函数
   * @param {number} [maxRetries] - 最大重试次数，默认3次
   * @returns {Promise<*>} API调用结果
   */
  async withAuthRetry(apiCall, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.ensureAuthenticated();
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        // 如果是认证错误，清除Token并重试
        if (error.code === 401 || error.message.includes('unauthorized')) {
          this.token = null;
          if (attempt < maxRetries) {
            console.warn(`Authentication error, retrying... (${attempt}/${maxRetries})`);
            continue;
          }
        }
        
        // 非认证错误或达到最大重试次数，直接抛出
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * 设置用户凭据（用于自动登录）
   * @param {LoginCredentials} credentials - 用户凭据
   */
  setCredentials(credentials) {
    this.credentials = credentials;
  }

  /**
   * 获取平台名称（子类应该覆盖此方法）
   * @returns {string} 平台名称
   */
  getPlatformName() {
    return 'unknown';
  }
}

module.exports = PlatformAdapter;