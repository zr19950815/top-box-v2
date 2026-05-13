/**
 * SmartBuy Framework - 批量模式抢购策略
 * 
 * 调用批量下单接口，一次性购买多个商品
 */

const PurchaseStrategy = require('./PurchaseStrategy');

class BatchModeStrategy extends PurchaseStrategy {
  /**
   * 构造函数
   * @param {PlatformAdapter} adapter - 平台适配器
   * @param {PaymentProcessor} paymentProcessor - 支付处理器
   * @param {OrderProcessor} orderProcessor - 订单处理器
   */
  constructor(adapter, paymentProcessor, orderProcessor) {
    super(adapter, paymentProcessor, orderProcessor);
    this.defaultBatchSize = 5;
    this.maxBatchSize = 20;
    this.minBatchSize = 2;
  }

  /**
   * 获取商品并下单 - 批量模式实现
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<string>} 订单结果
   */
  async acquireAndOrder(config) {
    // 计算本次批量大小
    const batchSize = this.calculateBatchSize(config);
    
    try {
      console.log(`[批量模式] 📦 批量下单: 商品ID=${config.productId}, 批量大小=${batchSize}`);
      
      // 传递完整的配置对象，确保productConfig被正确传递
      const batchOptions = {
        quantity: batchSize,
        maxPrice: config.maxPrice,
        productConfig: config.productConfig,
        payPassword: config.payPassword,
        batchSize: batchSize
      };
      
      const orderResult = await this.adapter.batchOrder(config.productId, batchOptions);
      
      // 批量下单成功，更新剩余数量
      // 注意：这里需要根据实际下单成功的数量来更新
      // 暂时假设批量下单全部成功，实际应该根据订单结果解析
      this.handleBatchSuccess(batchSize, orderResult);
      
      return orderResult;
      
    } catch (error) {
      // 如果平台不支持批量下单，尝试fallback
      if (this.shouldFallbackToSingleOrder(error)) {
        console.log(`[批量模式] 🔄 批量下单不可用，fallback到单个下单...`);
        return await this.fallbackToSingleOrder(config);
      }
      
      throw error;
    }
  }

  /**
   * 计算当前批量大小
   * @private
   * @param {TaskConfig} config - 任务配置
   * @returns {number} 批量大小
   */
  calculateBatchSize(config) {
    // 优先使用配置中的批量大小
    let batchSize = config.batchSize || this.defaultBatchSize;
    
    // 不能超过剩余数量
    batchSize = Math.min(batchSize, this.remainingQuantity);
    
    // 不能超过最大批量限制
    batchSize = Math.min(batchSize, this.maxBatchSize);
    
    // 不能小于最小批量限制
    batchSize = Math.max(batchSize, this.minBatchSize);
    
    // 如果剩余数量小于最小批量，直接使用剩余数量
    if (this.remainingQuantity < this.minBatchSize) {
      batchSize = this.remainingQuantity;
    }
    
    return batchSize;
  }

  /**
   * 处理批量下单成功的情况
   * @private
   * @param {number} requestedBatchSize - 请求的批量大小
   * @param {*} orderResult - 下单结果
   */
  handleBatchSuccess(requestedBatchSize, orderResult) {
    // 这里需要根据订单结果解析实际成功的数量
    // 不同平台的返回格式可能不同，这里做简化处理
    
    let actualSuccessCount = requestedBatchSize;
    
    // 如果订单结果中包含成功数量信息，使用实际数量
    if (orderResult && typeof orderResult === 'object') {
      if (orderResult.successCount !== undefined) {
        actualSuccessCount = orderResult.successCount;
      } else if (orderResult.quantity !== undefined) {
        actualSuccessCount = orderResult.quantity;
      }
    }
    
    console.log(`[批量模式] ✅ 批量下单成功: 请求${requestedBatchSize}个, 实际成功${actualSuccessCount}个`);
    
    // 更新成功计数（这里会在updateProgress中被重复计算，需要注意）
    // 由于父类的updateProgress只会加1，我们需要手动调整
    this.batchSuccessCount = actualSuccessCount - 1; // -1 因为父类会+1
  }

  /**
   * 判断是否应该fallback到单个下单
   * @private
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该fallback
   */
  shouldFallbackToSingleOrder(error) {
    const fallbackErrors = [
      'BATCH_ORDER_NOT_SUPPORTED',
      'METHOD_NOT_FOUND',
      'FUNCTION_NOT_AVAILABLE',
      'BATCH_SIZE_TOO_LARGE',
      '批量下单不支持',
      '方法不存在',
      '批量大小超出限制'
    ];
    
    return fallbackErrors.some(errorPattern => 
      error.message.includes(errorPattern) || 
      error.type === errorPattern
    );
  }

  /**
   * Fallback到单个下单流程
   * @private
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<string>} 订单结果
   */
  async fallbackToSingleOrder(config) {
    // 获取商品列表
    const products = await this.adapter.getProductList(config.productId, {
      page: 1,
      pageSize: 20,
      sortBy: 'price',
      order: 'asc'
    });
    
    // 筛选符合条件的商品
    const availableProduct = products.find(product => 
      product.available && product.price <= config.maxPrice
    );
    
    if (!availableProduct) {
      throw new Error('NO_QUALIFIED_PRODUCTS');
    }
    
    // 单个下单
    console.log(`[批量模式] 📦 Fallback单个下单: 商品ID=${availableProduct.id}, 价格=${availableProduct.price}`);
    return await this.adapter.placeOrder(availableProduct);
  }

  /**
   * 更新执行进度 - 批量模式需要特殊处理
   * @protected
   * @param {PaymentResult} paymentResult - 支付结果
   */
  updateProgress(paymentResult) {
    this.totalRequests++;
    this.lastRequestTime = Date.now();
    
    if (paymentResult.success) {
      this.successfulRequests++;
      
      // 批量模式可能一次成功多个
      const actualSuccessCount = this.batchSuccessCount || 1;
      this.completedQuantity += actualSuccessCount;
      this.remainingQuantity -= actualSuccessCount;
      
      // 清空批量成功计数
      this.batchSuccessCount = 0;
      
      const elapsed = this.lastRequestTime - this.startTime;
      const avgInterval = elapsed / this.totalRequests;
      
      console.log(`[${this.getStrategyName()}] 🎉 批量购买成功! ` + 
                 `本次成功: ${actualSuccessCount}个, ` +
                 `总进度: ${this.completedQuantity}/${this.completedQuantity + this.remainingQuantity} ` +
                 `成功率: ${((this.successfulRequests / this.totalRequests) * 100).toFixed(1)}% ` +
                 `平均间隔: ${avgInterval.toFixed(0)}ms`);
      
      if (this.remainingQuantity <= 0) {
        console.log(`[${this.getStrategyName()}] ✅ 任务完成！总共成功购买 ${this.completedQuantity} 个商品`);
      }
    } else {
      console.log(`[${this.getStrategyName()}] ❌ 批量购买失败: ${paymentResult.error}`);
    }
  }

  /**
   * 获取策略名称
   * @returns {string} 策略名称
   */
  getStrategyName() {
    return '批量模式';
  }

  /**
   * 获取策略特定的状态信息
   * @returns {Object} 状态信息
   */
  getStatus() {
    const baseStatus = super.getStatus();
    
    return {
      ...baseStatus,
      strategy: 'batch',
      defaultBatchSize: this.defaultBatchSize,
      maxBatchSize: this.maxBatchSize,
      minBatchSize: this.minBatchSize,
      avgBatchSize: this.totalRequests > 0 ? 
        (this.completedQuantity / this.successfulRequests).toFixed(1) : 0
    };
  }

  /**
   * 获取策略模式名称
   * @protected
   * @returns {string} 模式名称
   */
  getStrategyMode() {
    return 'batch';
  }

  /**
   * 验证任务配置 - 批量模式特有的验证
   * @protected
   * @param {TaskConfig} config - 任务配置
   */
  validateConfig(config) {
    // 调用父类验证
    super.validateConfig(config);
    
    // 批量模式特有验证
    if (config.batchSize && config.batchSize < 1) {
      throw new Error('Invalid batchSize: must be at least 1');
    }
    
    if (config.batchSize && config.batchSize > this.maxBatchSize) {
      throw new Error(`Invalid batchSize: cannot exceed ${this.maxBatchSize}`);
    }
  }
}

module.exports = BatchModeStrategy;