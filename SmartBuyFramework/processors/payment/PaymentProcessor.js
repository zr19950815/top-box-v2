/**
 * SmartBuy Framework - 支付处理器
 * 
 * 抽象化支付流程处理，提供统一的支付逻辑
 */

class PaymentProcessor {
  /**
   * 构造函数
   * @param {PlatformAdapter} platformAdapter - 平台适配器
   * @param {Object} [options] - 处理器选项
   */
  constructor(platformAdapter, options = {}) {
    this.adapter = platformAdapter;
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      validatePayment: true,
      ...options
    };
    
    // 统计信息
    this.totalPayments = 0;
    this.successfulPayments = 0;
    this.failedPayments = 0;
    this.totalProcessTime = 0;
  }

  /**
   * 处理支付流程
   * @param {string} orderInfo - 订单信息（通常是订单ID）
   * @param {string} payPassword - 支付密码
   * @returns {Promise<PaymentResult>} 支付结果
   */
  async process(orderInfo, payPassword) {
    const startTime = Date.now();
    this.totalPayments++;
    
    console.log(`[支付处理器] 💳 开始支付流程: 订单=${orderInfo}`);
    
    try {
      // Step 1: 获取支付链接
      const paymentUrl = await this.getPaymentUrl(orderInfo);
      
      // Step 2: 执行支付
      const paymentResult = await this.executePaymentWithRetry(paymentUrl, payPassword);
      
      // Step 3: 验证支付结果
      const validatedResult = await this.validatePaymentResult(paymentResult, orderInfo);
      
      // 记录成功支付
      this.recordSuccess(startTime);
      
      return validatedResult;
      
    } catch (error) {
      // 记录失败支付
      this.recordFailure(startTime);
      
      console.error(`[支付处理器] ❌ 支付失败: ${error.message}`);
      
      return {
        success: false,
        orderId: orderInfo,
        error: this.formatError(error)
      };
    }
  }

  /**
   * 获取支付链接
   * @private
   * @param {string} orderInfo - 订单信息
   * @returns {Promise<string>} 支付链接
   */
  async getPaymentUrl(orderInfo) {
    console.log(`[支付处理器] 🔗 获取支付链接...`);
    
    try {
      const paymentUrl = await this.adapter.getPaymentUrl(orderInfo);
      
      if (!paymentUrl || typeof paymentUrl !== 'string') {
        throw new Error('Invalid payment URL received');
      }
      
      console.log(`[支付处理器] ✅ 支付链接获取成功`);
      return paymentUrl;
      
    } catch (error) {
      throw new Error(`获取支付链接失败: ${error.message}`);
    }
  }

  /**
   * 执行支付（带重试机制）
   * @private
   * @param {string} paymentUrl - 支付链接
   * @param {string} payPassword - 支付密码
   * @returns {Promise<PaymentResult>} 支付结果
   */
  async executePaymentWithRetry(paymentUrl, payPassword) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        console.log(`[支付处理器] 💰 执行支付 (尝试 ${attempt}/${this.options.maxRetries})...`);
        
        const result = await this.executePayment(paymentUrl, payPassword);
        
        if (result.success) {
          console.log(`[支付处理器] ✅ 支付成功！`);
          return result;
        } else {
          throw new Error(result.error || 'Payment failed without error message');
        }
        
      } catch (error) {
        lastError = error;
        
        console.warn(`[支付处理器] ⚠️  支付尝试 ${attempt} 失败: ${error.message}`);
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.options.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          console.log(`[支付处理器] ⏳ 等待 ${delay}ms 后重试...`);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 执行支付
   * @private
   * @param {string} paymentUrl - 支付链接
   * @param {string} payPassword - 支付密码
   * @returns {Promise<PaymentResult>} 支付结果
   */
  async executePayment(paymentUrl, payPassword) {
    // 设置超时
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Payment timeout')), this.options.timeout);
    });
    
    const paymentPromise = this.adapter.executePayment(paymentUrl, payPassword);
    
    return await Promise.race([paymentPromise, timeoutPromise]);
  }

  /**
   * 验证支付结果
   * @private
   * @param {PaymentResult} paymentResult - 支付结果
   * @param {string} orderInfo - 订单信息
   * @returns {Promise<PaymentResult>} 验证后的支付结果
   */
  async validatePaymentResult(paymentResult, orderInfo) {
    if (!this.options.validatePayment) {
      return paymentResult;
    }
    
    // 基础验证
    if (!paymentResult || typeof paymentResult !== 'object') {
      throw new Error('Invalid payment result format');
    }
    
    if (!paymentResult.hasOwnProperty('success')) {
      throw new Error('Payment result missing success field');
    }
    
    // 成功支付的额外验证
    if (paymentResult.success) {
      // 可以添加更多验证逻辑，比如：
      // - 验证订单ID是否匹配
      // - 验证支付金额
      // - 调用平台API确认支付状态等
      
      if (paymentResult.orderId && paymentResult.orderId !== orderInfo) {
        console.warn(`[支付处理器] ⚠️  订单ID不匹配: 期望=${orderInfo}, 实际=${paymentResult.orderId}`);
      }
    }
    
    return paymentResult;
  }

  /**
   * 计算重试延迟时间
   * @private
   * @param {number} attempt - 当前尝试次数
   * @returns {number} 延迟时间（毫秒）
   */
  calculateRetryDelay(attempt) {
    // 指数退避：1秒、2秒、4秒...
    return this.options.retryDelay * Math.pow(2, attempt - 1);
  }

  /**
   * 延时函数
   * @private
   * @param {number} ms - 延时毫秒数
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 格式化错误信息
   * @private
   * @param {Error} error - 错误对象
   * @returns {string} 格式化的错误信息
   */
  formatError(error) {
    // 提取有用的错误信息，隐藏敏感信息
    let errorMsg = error.message || 'Unknown payment error';
    
    // 移除可能包含敏感信息的内容
    errorMsg = errorMsg.replace(/token[=:]\s*[^\s&]*/gi, 'token=***');
    errorMsg = errorMsg.replace(/password[=:]\s*[^\s&]*/gi, 'password=***');
    errorMsg = errorMsg.replace(/key[=:]\s*[^\s&]*/gi, 'key=***');
    
    return errorMsg;
  }

  /**
   * 记录成功支付
   * @private
   * @param {number} startTime - 开始时间
   */
  recordSuccess(startTime) {
    this.successfulPayments++;
    this.totalProcessTime += Date.now() - startTime;
    
    console.log(`[支付处理器] 📊 成功率: ${this.getSuccessRate().toFixed(1)}%`);
  }

  /**
   * 记录失败支付
   * @private
   * @param {number} startTime - 开始时间
   */
  recordFailure(startTime) {
    this.failedPayments++;
    this.totalProcessTime += Date.now() - startTime;
    
    console.log(`[支付处理器] 📊 失败率: ${this.getFailureRate().toFixed(1)}%`);
  }

  /**
   * 获取成功率
   * @returns {number} 成功率（百分比）
   */
  getSuccessRate() {
    return this.totalPayments > 0 ? (this.successfulPayments / this.totalPayments * 100) : 0;
  }

  /**
   * 获取失败率
   * @returns {number} 失败率（百分比）
   */
  getFailureRate() {
    return this.totalPayments > 0 ? (this.failedPayments / this.totalPayments * 100) : 0;
  }

  /**
   * 获取平均处理时间
   * @returns {number} 平均处理时间（毫秒）
   */
  getAverageProcessTime() {
    return this.totalPayments > 0 ? (this.totalProcessTime / this.totalPayments) : 0;
  }

  /**
   * 获取处理器统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      totalPayments: this.totalPayments,
      successfulPayments: this.successfulPayments,
      failedPayments: this.failedPayments,
      successRate: parseFloat(this.getSuccessRate().toFixed(1)),
      failureRate: parseFloat(this.getFailureRate().toFixed(1)),
      averageProcessTime: parseFloat(this.getAverageProcessTime().toFixed(0)),
      totalProcessTime: this.totalProcessTime
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.totalPayments = 0;
    this.successfulPayments = 0;
    this.failedPayments = 0;
    this.totalProcessTime = 0;
  }

  /**
   * 设置处理器选项
   * @param {Object} options - 新的选项
   */
  setOptions(options) {
    this.options = { ...this.options, ...options };
  }
}

module.exports = PaymentProcessor;