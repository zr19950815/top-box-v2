/**
 * SmartBuy Framework - 快捷模式抢购策略
 *
 * 直接调用快捷下单接口，跳过商品列表获取步骤
 */

const PurchaseStrategy = require('./PurchaseStrategy');

class QuickModeStrategy extends PurchaseStrategy {
  /**
   * 构造函数
   * @param {PlatformAdapter} adapter - 平台适配器
   * @param {PaymentProcessor} paymentProcessor - 支付处理器
   * @param {OrderProcessor} orderProcessor - 订单处理器
   */
  constructor(adapter, paymentProcessor, orderProcessor) {
    super(adapter, paymentProcessor, orderProcessor);
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 10; // 连续失败10次后暂停一段时间
  }

  /**
   * 获取商品并下单 - 快捷模式实现
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<string>} 订单结果
   */
  async acquireAndOrder(config) {
    try {
      // 直接调用快捷下单接口
      console.log(`[快捷模式] ⚡ 快捷下单: 商品ID=${config.productId}, 数量=1`);

      const orderResult = await this.adapter.quickOrder(config.productId, {
        maxPrice: config.maxPrice,
        quantity: config.quantity || 1,
        productConfig: config.productConfig || {}
      });

      // 成功后重置失败计数
      this.consecutiveFailures = 0;

      return orderResult;
    } catch (error) {
      this.consecutiveFailures++;

      // 如果是平台不支持快捷下单的错误，尝试fallback到普通下单
      if (this.shouldFallbackToNormalOrder(error)) {
        console.log(`[快捷模式] 🔄 快捷下单不可用，尝试普通下单...`);
        return await this.fallbackToNormalOrder(config);
      }

      // 如果连续失败太多次，暂停一段时间
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        console.log(
          `[快捷模式] ⏸️  连续失败 ${this.consecutiveFailures} 次，暂停 5 秒...`
        );
        await this.delay(5000);
        this.consecutiveFailures = 0; // 重置计数
      }

      throw error;
    }
  }

  /**
   * 判断是否应该fallback到普通下单
   * @private
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该fallback
   */
  shouldFallbackToNormalOrder(error) {
    const fallbackErrors = [
      'QUICK_ORDER_NOT_SUPPORTED',
      'METHOD_NOT_FOUND',
      'FUNCTION_NOT_AVAILABLE',
      '快捷下单不支持',
      '方法不存在',
      'Not Found',
    ];

    return fallbackErrors.some(
      (errorPattern) =>
        error.message.includes(errorPattern) || error.type === errorPattern
    );
  }

  /**
   * Fallback到普通下单流程
   * @private
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<string>} 订单结果
   */
  async fallbackToNormalOrder(config) {
    // 1. 获取商品列表
    const products = await this.adapter.getProductList(config.productId, {
      page: 1,
      pageSize: 10, // 快捷模式只取少量商品
      sortBy: 'price',
      order: 'asc',
    });

    // 2. 快速筛选第一个符合条件的商品
    const availableProduct = products.find(
      (product) => product.available && product.price <= config.maxPrice
    );

    if (!availableProduct) {
      throw new Error('NO_QUALIFIED_PRODUCTS');
    }

    // 3. 普通下单
    console.log(
      `[快捷模式] 📦 Fallback下单: 商品ID=${availableProduct.id}, 价格=${availableProduct.price}`
    );
    return await this.adapter.placeOrder(availableProduct);
  }

  /**
   * 获取策略名称
   * @returns {string} 策略名称
   */
  getStrategyName() {
    return '快捷模式';
  }

  /**
   * 快捷模式特有的错误处理
   * @protected
   * @param {Error} error - 错误对象
   * @param {TaskConfig} config - 任务配置
   */
  handleError(error, config) {
    // 快捷模式对某些错误更宽容，不轻易停止
    const isTemporaryError = this.isTemporaryError(error);

    if (isTemporaryError) {
      console.log(
        `[快捷模式] ⚠️  临时错误 (${this.consecutiveFailures}/${this.maxConsecutiveFailures}): ${error.message}`
      );
      // 临时错误不调用父类的停止逻辑
      this.totalRequests++;
      this.lastRequestTime = Date.now();
      return;
    }

    // 其他错误调用父类处理
    super.handleError(error, config);
  }

  /**
   * 判断是否为临时错误
   * @private
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否为临时错误
   */
  isTemporaryError(error) {
    const temporaryErrors = [
      'NO_QUALIFIED_PRODUCTS',
      'PRODUCT_UNAVAILABLE',
      'SERVER_BUSY',
      'NETWORK_ERROR',
      'TIMEOUT',
      '商品暂时不可用',
      '服务器繁忙',
      '网络错误',
    ];

    return temporaryErrors.some(
      (errorPattern) =>
        error.message.includes(errorPattern) || error.type === errorPattern
    );
  }

  /**
   * 获取策略特定的状态信息
   * @returns {Object} 状态信息
   */
  getStatus() {
    const baseStatus = super.getStatus();

    return {
      ...baseStatus,
      strategy: 'quick',
      consecutiveFailures: this.consecutiveFailures,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      failureRate:
        this.totalRequests > 0
          ? (
              ((this.totalRequests - this.successfulRequests) /
                this.totalRequests) *
              100
            ).toFixed(1)
          : 0,
    };
  }

  /**
   * 控制执行间隔 - 快捷模式可能需要更短的间隔
   * @protected
   * @param {number} cycleStartTime - 周期开始时间
   * @param {number} targetInterval - 目标间隔（毫秒）
   * @returns {Promise<void>}
   */
  async controlInterval(cycleStartTime, targetInterval) {
    // 如果连续失败，适当增加间隔
    let adjustedInterval = targetInterval;

    if (this.consecutiveFailures > 3) {
      adjustedInterval = targetInterval * (1 + this.consecutiveFailures * 0.2);
      adjustedInterval = Math.min(adjustedInterval, targetInterval * 3); // 最多3倍间隔
    }

    const cycleTime = Date.now() - cycleStartTime;
    const waitTime = Math.max(0, adjustedInterval - cycleTime);

    if (waitTime > 0) {
      await this.delay(waitTime);
    }
  }
}

module.exports = QuickModeStrategy;
