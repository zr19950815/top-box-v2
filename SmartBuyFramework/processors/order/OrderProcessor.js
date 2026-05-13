/**
 * SmartBuy Framework - 订单处理器
 * 
 * 抽象化订单状态检查和处理，提供统一的订单处理逻辑
 */

class OrderProcessor {
  /**
   * 构造函数
   * @param {PlatformAdapter} platformAdapter - 平台适配器
   * @param {Object} [options] - 处理器选项
   */
  constructor(platformAdapter, options = {}) {
    this.adapter = platformAdapter;
    this.options = {
      validateOrder: true,
      normalizeData: true,
      timeout: 10000,
      maxStatusChecks: 5,
      statusCheckInterval: 1000,
      ...options
    };
    
    // 统计信息
    this.totalOrders = 0;
    this.successfulOrders = 0;
    this.failedOrders = 0;
    this.totalProcessTime = 0;
  }

  /**
   * 检查订单状态并标准化
   * @param {*} orderResult - 平台返回的订单结果
   * @returns {Promise<string>} 标准化的订单信息
   */
  async checkStatus(orderResult) {
    const startTime = Date.now();
    this.totalOrders++;
    
    console.log(`[订单处理器] 📦 开始处理订单...`);
    
    try {
      // Step 1: 验证订单结果格式
      const validatedResult = this.validateOrderResult(orderResult);
      
      // Step 2: 标准化订单信息
      const normalizedInfo = this.normalizeOrderInfo(validatedResult);
      
      // Step 3: 可选的状态轮询
      const finalInfo = await this.pollOrderStatus(normalizedInfo);
      
      // 记录成功处理
      this.recordSuccess(startTime);
      
      console.log(`[订单处理器] ✅ 订单处理完成: ${finalInfo}`);
      return finalInfo;
      
    } catch (error) {
      // 记录失败处理
      this.recordFailure(startTime);
      
      console.error(`[订单处理器] ❌ 订单处理失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 验证订单结果格式
   * @private
   * @param {*} orderResult - 订单结果
   * @returns {*} 验证后的订单结果
   */
  validateOrderResult(orderResult) {
    if (!this.options.validateOrder) {
      return orderResult;
    }
    
    console.log(`[订单处理器] 🔍 验证订单结果格式...`);
    
    // 检查订单结果是否为空
    if (!orderResult) {
      throw new Error('Order result is null or undefined');
    }
    
    // 如果是字符串，可能是订单ID
    if (typeof orderResult === 'string') {
      if (orderResult.length === 0) {
        throw new Error('Order result is empty string');
      }
      return orderResult;
    }
    
    // 如果是对象，检查关键字段
    if (typeof orderResult === 'object') {
      // 检查是否包含订单ID相关字段
      const orderIdFields = ['orderId', 'id', 'orderNo', 'orderNumber', 'order_id'];
      const hasOrderId = orderIdFields.some(field => orderResult.hasOwnProperty(field));
      
      if (!hasOrderId) {
        console.warn(`[订单处理器] ⚠️  订单结果缺少ID字段，使用整个对象`);
      }
      
      // 检查错误状态
      if (orderResult.error || orderResult.success === false) {
        const errorMsg = orderResult.error || orderResult.message || 'Order creation failed';
        throw new Error(`Order failed: ${errorMsg}`);
      }
      
      return orderResult;
    }
    
    // 其他类型的结果
    console.warn(`[订单处理器] ⚠️  未知的订单结果类型: ${typeof orderResult}`);
    return orderResult;
  }

  /**
   * 标准化订单信息
   * @private
   * @param {*} orderResult - 验证后的订单结果
   * @returns {string} 标准化的订单信息
   */
  normalizeOrderInfo(orderResult) {
    if (!this.options.normalizeData) {
      return orderResult;
    }
    
    console.log(`[订单处理器] 🔄 标准化订单信息...`);
    
    // 如果已经是字符串，直接返回
    if (typeof orderResult === 'string') {
      return orderResult;
    }
    
    // 如果是对象，提取订单ID
    if (typeof orderResult === 'object' && orderResult !== null) {
      // 按优先级顺序提取订单ID
      const orderIdFields = ['orderId', 'id', 'orderNo', 'orderNumber', 'order_id'];
      
      for (const field of orderIdFields) {
        if (orderResult[field]) {
          const orderId = orderResult[field];
          console.log(`[订单处理器] 📝 提取订单ID: ${field}=${orderId}`);
          return String(orderId);
        }
      }
      
      // 如果没有找到标准字段，返回JSON字符串
      console.log(`[订单处理器] 📝 未找到标准订单ID字段，使用JSON格式`);
      return JSON.stringify(orderResult);
    }
    
    // 其他情况，转换为字符串
    return String(orderResult);
  }

  /**
   * 轮询订单状态（可选功能）
   * @private
   * @param {string} orderInfo - 标准化的订单信息
   * @returns {Promise<string>} 最终的订单信息
   */
  async pollOrderStatus(orderInfo) {
    // 如果适配器没有提供状态查询方法，直接返回
    if (!this.adapter.getOrderStatus || typeof this.adapter.getOrderStatus !== 'function') {
      return orderInfo;
    }
    
    // 如果配置不需要状态轮询，直接返回
    if (this.options.maxStatusChecks <= 0) {
      return orderInfo;
    }
    
    console.log(`[订单处理器] 🔄 开始状态轮询...`);
    
    let checkCount = 0;
    let lastStatus = null;
    
    while (checkCount < this.options.maxStatusChecks) {
      try {
        const status = await this.adapter.getOrderStatus(orderInfo);
        
        console.log(`[订单处理器] 📊 状态检查 ${checkCount + 1}: ${status}`);
        
        // 如果状态是最终状态（成功或失败），停止轮询
        if (this.isFinalStatus(status)) {
          if (this.isSuccessStatus(status)) {
            console.log(`[订单处理器] ✅ 订单状态确认成功: ${status}`);
            return orderInfo;
          } else {
            throw new Error(`Order failed with status: ${status}`);
          }
        }
        
        lastStatus = status;
        checkCount++;
        
        // 如果不是最后一次检查，等待一段时间
        if (checkCount < this.options.maxStatusChecks) {
          await this.delay(this.options.statusCheckInterval);
        }
        
      } catch (error) {
        console.warn(`[订单处理器] ⚠️  状态查询失败: ${error.message}`);
        break; // 状态查询失败，不继续轮询
      }
    }
    
    console.log(`[订单处理器] 📊 状态轮询结束，最后状态: ${lastStatus || '未知'}`);
    return orderInfo;
  }

  /**
   * 判断是否为最终状态
   * @private
   * @param {string} status - 订单状态
   * @returns {boolean} 是否为最终状态
   */
  isFinalStatus(status) {
    const finalStatuses = [
      'completed', 'success', 'paid', 'finished', 'done',
      'failed', 'error', 'cancelled', 'timeout',
      '已完成', '成功', '已支付', '失败', '已取消', '超时'
    ];
    
    if (!status) return false;
    
    const lowerStatus = status.toString().toLowerCase();
    return finalStatuses.some(finalStatus => 
      lowerStatus.includes(finalStatus.toLowerCase())
    );
  }

  /**
   * 判断是否为成功状态
   * @private
   * @param {string} status - 订单状态
   * @returns {boolean} 是否为成功状态
   */
  isSuccessStatus(status) {
    const successStatuses = [
      'completed', 'success', 'paid', 'finished', 'done',
      '已完成', '成功', '已支付'
    ];
    
    if (!status) return false;
    
    const lowerStatus = status.toString().toLowerCase();
    return successStatuses.some(successStatus => 
      lowerStatus.includes(successStatus.toLowerCase())
    );
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
   * 记录成功处理
   * @private
   * @param {number} startTime - 开始时间
   */
  recordSuccess(startTime) {
    this.successfulOrders++;
    this.totalProcessTime += Date.now() - startTime;
  }

  /**
   * 记录失败处理
   * @private
   * @param {number} startTime - 开始时间
   */
  recordFailure(startTime) {
    this.failedOrders++;
    this.totalProcessTime += Date.now() - startTime;
  }

  /**
   * 获取成功率
   * @returns {number} 成功率（百分比）
   */
  getSuccessRate() {
    return this.totalOrders > 0 ? (this.successfulOrders / this.totalOrders * 100) : 0;
  }

  /**
   * 获取失败率
   * @returns {number} 失败率（百分比）
   */
  getFailureRate() {
    return this.totalOrders > 0 ? (this.failedOrders / this.totalOrders * 100) : 0;
  }

  /**
   * 获取平均处理时间
   * @returns {number} 平均处理时间（毫秒）
   */
  getAverageProcessTime() {
    return this.totalOrders > 0 ? (this.totalProcessTime / this.totalOrders) : 0;
  }

  /**
   * 获取处理器统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      totalOrders: this.totalOrders,
      successfulOrders: this.successfulOrders,
      failedOrders: this.failedOrders,
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
    this.totalOrders = 0;
    this.successfulOrders = 0;
    this.failedOrders = 0;
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

module.exports = OrderProcessor;