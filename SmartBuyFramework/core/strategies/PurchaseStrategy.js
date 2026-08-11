/**
 * SmartBuy Framework - 购买策略抽象基类
 * 
 * 使用模板方法模式实现统一的抢购流程控制
 * 子类只需实现 acquireAndOrder() 方法来定义具体的获取下单逻辑
 */

const IntervalConfigManager = require('../../config/IntervalConfigManager');

class PurchaseStrategy {
  /**
   * 构造函数
   * @param {PlatformAdapter} adapter - 平台适配器
   * @param {PaymentProcessor} paymentProcessor - 支付处理器
   * @param {OrderProcessor} orderProcessor - 订单处理器
   */
  constructor(adapter, paymentProcessor, orderProcessor) {
    this.adapter = adapter;
    this.paymentProcessor = paymentProcessor;
    this.orderProcessor = orderProcessor;
    
    // 执行状态
    this.isRunning = false;
    this.remainingQuantity = 0;
    this.completedQuantity = 0;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.startTime = null;
    this.lastRequestTime = null;
  }

  /**
   * 主执行方法 - 模板方法
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<void>}
   */
  async execute(config) {
    this.validateConfig(config);
    this.initializeExecution(config);
    
    console.log(`[${this.getStrategyName()}] 开始执行任务 - 目标数量: ${config.quantity}, 最高价格: ${config.maxPrice}`);
    
    try {
      while (this.remainingQuantity > 0 && this.isRunning) {
        const cycleStartTime = Date.now();
        
        try {
          // Step 1: 获取并下单（抽象方法，子类实现）
          const orderResult = await this.acquireAndOrder(config);
          
          // Step 2: 检查订单状态（统一逻辑）
          const orderInfo = await this.checkOrderStatus(orderResult);
          
          // Step 3: 执行支付（统一逻辑）
          const paymentResult = await this.processPayment(orderInfo, config.payPassword);
          
          // Step 4: 更新进度（统一逻辑）
          this.updateProgress(paymentResult);
          
        } catch (error) {
          this.handleError(error, config);
        }
        
        // 控制执行间隔 - 使用平台配置的间隔
        const platformInterval = this.applyIntervalJitter(
          this.getPlatformInterval(config)
        );
        await this.controlInterval(cycleStartTime, platformInterval);
      }
      
    } finally {
      this.finalizeExecution();
    }
  }

  /**
   * 抽象方法：获取商品并下单
   * 子类必须实现此方法来定义具体的获取下单逻辑
   * @abstract
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<string>} 订单结果
   */
  async acquireAndOrder(config) {
    throw new Error('PurchaseStrategy.acquireAndOrder() must be implemented by subclass');
  }

  /**
   * 检查订单状态
   * @protected
   * @param {*} orderResult - 下单结果
   * @returns {Promise<string>} 标准化的订单信息
   */
  async checkOrderStatus(orderResult) {
    return this.orderProcessor.checkStatus(orderResult);
  }

  /**
   * 处理支付
   * @protected
   * @param {string} orderInfo - 订单信息
   * @param {string} payPassword - 支付密码
   * @returns {Promise<PaymentResult>} 支付结果
   */
  async processPayment(orderInfo, payPassword) {
    return this.paymentProcessor.process(orderInfo, payPassword);
  }

  /**
   * 更新执行进度
   * @protected
   * @param {PaymentResult} paymentResult - 支付结果
   */
  updateProgress(paymentResult) {
    this.totalRequests++;
    this.lastRequestTime = Date.now();
    
    if (paymentResult.success) {
      this.successfulRequests++;
      this.completedQuantity++;
      this.remainingQuantity--;
      
      const elapsed = this.lastRequestTime - this.startTime;
      const avgInterval = elapsed / this.totalRequests;
      
      console.log(`[${this.getStrategyName()}] 🎉 购买成功! ` + 
                 `进度: ${this.completedQuantity}/${this.completedQuantity + this.remainingQuantity} ` +
                 `成功率: ${((this.successfulRequests / this.totalRequests) * 100).toFixed(1)}% ` +
                 `平均间隔: ${avgInterval.toFixed(0)}ms`);
      
      if (this.remainingQuantity === 0) {
        console.log(`[${this.getStrategyName()}] ✅ 任务完成！总共成功购买 ${this.completedQuantity} 个商品`);
      }
    } else {
      console.log(`[${this.getStrategyName()}] ❌ 购买失败: ${paymentResult.error}`);
    }
  }

  /**
   * 处理执行过程中的错误
   * @protected
   * @param {Error} error - 错误对象
   * @param {TaskConfig} config - 任务配置
   */
  handleError(error, config) {
    this.totalRequests++;
    this.lastRequestTime = Date.now();
    
    console.log(`[${this.getStrategyName()}] ⚠️  执行错误: ${error.message}`);
    
    // 根据错误类型决定是否继续
    if (this.shouldStopOnError(error)) {
      console.log(`[${this.getStrategyName()}] 🛑 遇到严重错误，停止执行`);
      this.isRunning = false;
    }
  }

  /**
   * 判断是否应该因为错误而停止执行
   * @protected
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该停止
   */
  shouldStopOnError(error) {
    const stopErrors = [
      'PAYMENT_FAILED',
      'INSUFFICIENT_BALANCE', 
      'ACCOUNT_LOCKED',
      'INVALID_CREDENTIALS',
      '用户未登录',
      'TOKEN_EXPIRED',
      'AUTH_ERROR',
      'LOGIN_FAILED'
    ];
    
    return stopErrors.some(stopError => 
      error.message.includes(stopError) || error.type === stopError
    );
  }

  /**
   * 控制执行间隔
   * @protected
   * @param {number} cycleStartTime - 周期开始时间
   * @param {number} targetInterval - 目标间隔（毫秒）
   * @returns {Promise<void>}
   */
  async controlInterval(cycleStartTime, targetInterval) {
    const cycleTime = Date.now() - cycleStartTime;
    const waitTime = Math.max(0, targetInterval - cycleTime);
    
    if (waitTime > 0) {
      await this.delay(waitTime);
    }
  }

  /**
   * Apply adapter-specific random jitter while preserving the configured
   * average interval. HC uses 1/3, so a 300ms target becomes roughly 200-400ms.
   */
  applyIntervalJitter(interval) {
    const ratio = Number(this.adapter?.intervalJitterRatio || 0);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return interval;
    }

    const boundedRatio = Math.min(ratio, 0.9);
    const factor = 1 + ((Math.random() * 2) - 1) * boundedRatio;
    return Math.max(1, Math.round(interval * factor));
  }

  /**
   * 延时函数
   * @protected
   * @param {number} ms - 延时毫秒数
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取平台配置的间隔时间
   * @protected
   * @param {TaskConfig} config - 任务配置
   * @returns {number} 间隔时间（毫秒）
   */
  getPlatformInterval(config) {
    try {
      // 获取平台名称
      const platform = this.adapter.platformName || 'unknown';
      const task = 'smart-buy';
      const mode = this.getStrategyMode();
      
      // 从间隔配置管理器获取平台特定的间隔
      const interval = IntervalConfigManager.getInterval(platform, task, mode, {
        slowNetwork: config.slowNetwork,
        highFrequency: config.highFrequency,
        batchRetry: config.batchRetry
      });
      
      return interval;
    } catch (error) {
      console.warn(`[策略] ⚠️  获取平台间隔失败，使用默认值: ${error.message}`);
      return config.interval || 800;
    }
  }

  /**
   * 获取策略模式名称 - 子类需要重写
   * @protected
   * @returns {string} 模式名称
   */
  getStrategyMode() {
    return 'quick'; // 默认快捷模式
  }

  /**
   * 验证任务配置
   * @protected
   * @param {TaskConfig} config - 任务配置
   */
  validateConfig(config) {
    if (!config.productId) {
      throw new Error('Missing required field: productId');
    }
    
    if (!config.quantity || config.quantity <= 0) {
      throw new Error('Invalid quantity: must be a positive number');
    }
    
    if (!config.maxPrice || config.maxPrice <= 0) {
      throw new Error('Invalid maxPrice: must be a positive number');
    }
    
    if (!config.payPassword) {
      throw new Error('Missing required field: payPassword');
    }
  }

  /**
   * 初始化执行状态
   * @protected
   * @param {TaskConfig} config - 任务配置
   */
  initializeExecution(config) {
    this.isRunning = true;
    this.remainingQuantity = config.quantity;
    this.completedQuantity = 0;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.startTime = Date.now();
    this.lastRequestTime = this.startTime;
  }

  /**
   * 完成执行，输出统计信息
   * @protected
   */
  finalizeExecution() {
    this.isRunning = false;
    const totalTime = this.lastRequestTime - this.startTime;
    const successRate = this.totalRequests > 0 ? (this.successfulRequests / this.totalRequests * 100) : 0;
    const avgInterval = this.totalRequests > 0 ? (totalTime / this.totalRequests) : 0;
    
    console.log(`\n[${this.getStrategyName()}] 📊 执行统计:`);
    console.log(`  ✅ 成功购买: ${this.completedQuantity} 个`);
    console.log(`  📊 总请求数: ${this.totalRequests}`);
    console.log(`  🎯 成功率: ${successRate.toFixed(1)}%`);
    console.log(`  ⏱️  总耗时: ${(totalTime / 1000).toFixed(1)}秒`);
    console.log(`  📈 平均间隔: ${avgInterval.toFixed(0)}ms`);
  }

  /**
   * 停止执行
   */
  stop() {
    this.isRunning = false;
    console.log(`[${this.getStrategyName()}] 收到停止信号，正在停止...`);
  }

  /**
   * 获取策略名称（子类应该覆盖）
   * @returns {string} 策略名称
   */
  getStrategyName() {
    return 'PurchaseStrategy';
  }

  /**
   * 获取当前执行状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    const totalTime = (this.lastRequestTime || Date.now()) - this.startTime;
    const successRate = this.totalRequests > 0 ? (this.successfulRequests / this.totalRequests * 100) : 0;
    
    return {
      isRunning: this.isRunning,
      completedQuantity: this.completedQuantity,
      remainingQuantity: this.remainingQuantity,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      successRate: parseFloat(successRate.toFixed(1)),
      totalTime,
      startTime: this.startTime
    };
  }
}

module.exports = PurchaseStrategy;
