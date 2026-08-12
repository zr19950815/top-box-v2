/**
 * SmartBuy Framework - 列表模式抢购策略
 * 
 * 刷新列表 → 筛选最优商品 → 下单
 */

const PurchaseStrategy = require('./PurchaseStrategy');

class ListModeStrategy extends PurchaseStrategy {
  /**
   * 构造函数
   * @param {PlatformAdapter} adapter - 平台适配器
   * @param {PaymentProcessor} paymentProcessor - 支付处理器
   * @param {OrderProcessor} orderProcessor - 订单处理器
   */
  constructor(adapter, paymentProcessor, orderProcessor) {
    super(adapter, paymentProcessor, orderProcessor);
    this.lastProductListTime = 0;
    this.cachedProductList = [];
    this.cacheValidDuration = 2000; // 缓存有效期2秒
    this.currentPage = 1; // 维护当前页码状态
  }

  /**
   * 获取商品并下单 - 列表模式实现
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<string>} 订单结果
   */
  async acquireAndOrder(config) {
    // 1. 获取商品列表（可能使用缓存）
    const products = await this.getProductList(config.productId, config);

    // 2. 筛选最优商品
    const bestProduct = this.filterBestProduct(products, config.maxPrice, config);

    if (!bestProduct) {
      // 没有符合条件的商品，需要判断是否翻页
      this.handleNoQualifiedProducts(products, config.maxPrice);
      throw new Error('NO_QUALIFIED_PRODUCTS');
    }

    // 3. 下单。只有下单成功才清除缓存，失败时保留缓存让下一轮继续尝试其他商品
    try {
      const orderResult = await this.adapter.placeOrder(bestProduct);

      // 下单成功，根据缓存中剩余的符合条件商品数量决定页码
      this.handleSuccessfulOrder(products, config.maxPrice);

      return orderResult;
    } catch (error) {
      // 下单失败，不清除缓存，保持当前页码，让下一轮继续尝试缓存中的其他商品
      throw error;
    }
  }

  /**
   * 获取商品列表（带缓存机制）
   * @private
   * @param {string} productId - 商品ID
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<Product[]>} 商品列表
   */
  async getProductList(productId, config) {
    const now = Date.now();

    // 如果缓存仍然有效，使用缓存
    if (this.cachedProductList.length > 0 &&
        (now - this.lastProductListTime) < this.cacheValidDuration) {
      return this.cachedProductList;
    }

    // 获取新的商品列表，使用当前页码
    console.log(`[列表模式] 🔄 刷新商品列表 (第${this.currentPage}页)...`);

    const options = {
      page: this.currentPage,
      pageSize: config.pageSize || 50,
      sortBy: 'price',
      order: 'asc', // 按价格升序，优先便宜的
      maxPrice: config.maxPrice
    };

    const products = await this.adapter.getProductList(productId, options);

    // 更新缓存
    this.cachedProductList = products;
    this.lastProductListTime = now;

    console.log(`[列表模式] 📋 获取到 ${products.length} 个商品`);
    return products;
  }

  /**
   * 筛选最优商品
   * @private
   * @param {Product[]} products - 商品列表
   * @param {number} maxPrice - 最高价格
   * @param {TaskConfig} config - 任务配置
   * @returns {Product|null} 最优商品或null
   */
  filterBestProduct(products, maxPrice, config) {
    // 基础过滤：可购买 + 价格符合要求
    const availableProducts = products.filter(product => 
      product.available && 
      product.price <= maxPrice
    );
    
    if (availableProducts.length === 0) {
      console.log(`[列表模式] ❌ 没有符合条件的商品 (最高价格: ${maxPrice})`);
      return null;
    }
    
    // 智能筛选策略
    const bestProduct = this.applySelectionStrategy(availableProducts, config);
    
    if (bestProduct) {
      console.log(`[列表模式] 🎯 选中商品: ID=${bestProduct.id}, 价格=${bestProduct.price}, 名称=${bestProduct.name || 'N/A'}`);
    }
    
    return bestProduct;
  }

  /**
   * 应用选择策略
   * @private
   * @param {Product[]} availableProducts - 可购买的商品列表
   * @param {TaskConfig} config - 任务配置
   * @returns {Product} 选中的商品
   */
  applySelectionStrategy(availableProducts, config) {
    // 策略1: 价格最低优先
    if (config.selectionStrategy === 'lowest_price' || !config.selectionStrategy) {
      return availableProducts.sort((a, b) => a.price - b.price)[0];
    }
    
    // 策略2: 价格最高优先（在预算内）
    if (config.selectionStrategy === 'highest_price') {
      return availableProducts.sort((a, b) => b.price - a.price)[0];
    }
    
    // 策略3: 随机选择（避免竞争）
    if (config.selectionStrategy === 'random') {
      const randomIndex = Math.floor(Math.random() * availableProducts.length);
      return availableProducts[randomIndex];
    }
    
    // 策略4: 智能选择（综合价格和可用性）
    if (config.selectionStrategy === 'smart') {
      return this.smartSelection(availableProducts, config);
    }
    
    // 默认：价格最低
    return availableProducts.sort((a, b) => a.price - b.price)[0];
  }

  /**
   * 智能选择算法
   * @private
   * @param {Product[]} products - 商品列表
   * @param {TaskConfig} config - 任务配置
   * @returns {Product} 选中的商品
   */
  smartSelection(products, config) {
    // 计算每个商品的分数
    const scoredProducts = products.map(product => {
      let score = 0;
      
      // 价格分数：价格越低分数越高
      const priceRatio = (config.maxPrice - product.price) / config.maxPrice;
      score += priceRatio * 50;
      
      // 随机分数：避免所有人都选同一个
      score += Math.random() * 30;
      
      // 平台特有分数（如果存在）
      if (product.meta && product.meta.priority) {
        score += product.meta.priority * 20;
      }
      
      return {
        product,
        score
      };
    });
    
    // 选择分数最高的商品
    scoredProducts.sort((a, b) => b.score - a.score);
    return scoredProducts[0].product;
  }

  /**
   * 清除商品列表缓存
   */
  clearCache() {
    this.cachedProductList = [];
    this.lastProductListTime = 0;
  }

  /**
   * 获取策略名称
   * @returns {string} 策略名称
   */
  getStrategyName() {
    return '列表模式';
  }

  /**
   * 获取策略模式名称
   * @protected
   * @returns {string} 模式名称
   */
  getStrategyMode() {
    return 'list';
  }

  /**
   * 获取策略特定的状态信息
   * @returns {Object} 状态信息
   */
  getStatus() {
    const baseStatus = super.getStatus();
    
    return {
      ...baseStatus,
      strategy: 'list',
      cachedProductCount: this.cachedProductList.length,
      lastProductListTime: this.lastProductListTime,
      cacheAge: this.lastProductListTime > 0 ? Date.now() - this.lastProductListTime : 0
    };
  }

  /**
   * 处理列表模式特有的错误
   * @protected
   * @param {Error} error - 错误对象
   * @param {TaskConfig} config - 任务配置
   */
  handleError(error, config) {
    // 如果是无符合条件商品的错误，清除缓存重试
    if (error.message === 'NO_QUALIFIED_PRODUCTS') {
      this.clearCache();
      console.log(`[列表模式] 🔄 已清除商品缓存，下次将重新获取`);
    }

    // 调用父类错误处理
    super.handleError(error, config);
  }

  /**
   * 处理没有符合条件商品的情况，决定是否翻页
   * @private
   * @param {Product[]} products - 当前页的商品列表
   * @param {number} maxPrice - 最高价格
   */
  handleNoQualifiedProducts(products, maxPrice) {
    if (products.length === 0) {
      // 当前页没有任何商品，重置到第1页
      console.log(`[列表模式] ⚠️  当前页无商品，重置到第1页`);
      this.clearCache();
      this.currentPage = 1;
      return;
    }

    // 检查最后一条商品的价格
    const lastProduct = products[products.length - 1];
    const lastPrice = lastProduct.price;

    if (lastPrice <= maxPrice && products.length >= 20) {
      // 最后一条价格满足 且 当前页满20条，翻到下一页
      console.log(`[列表模式] ➡️  最后一条价格${lastPrice} ≤ ${maxPrice}，翻到第${this.currentPage + 1}页`);
      this.clearCache();
      this.currentPage++;
    } else {
      // 最后一条价格不满足 或 当前页不足20条（没有下一页），重置到第1页
      console.log(`[列表模式] 🔄 最后一条价格${lastPrice} > ${maxPrice} 或页面不满，重置到第1页`);
      this.clearCache();
      this.currentPage = 1;
    }
  }

  /**
   * 处理下单成功后的页码逻辑
   * @private
   * @param {Product[]} products - 当前页的商品列表
   * @param {number} maxPrice - 最高价格
   */
  handleSuccessfulOrder(products, maxPrice) {
    // 统计当前页还有多少个符合条件的商品（排除刚刚下单的那个，因为缓存里还包含它）
    const qualifiedProducts = products.filter(product =>
      product.available && product.price <= maxPrice
    );

    if (qualifiedProducts.length > 1) {
      // 还有多个符合条件的商品，重置到第1页（可能有新的低价挂单）
      console.log(`[列表模式] 🔄 当前页还有${qualifiedProducts.length}个符合条件的商品，重置到第1页`);
      this.clearCache();
      this.currentPage = 1;
    } else if (qualifiedProducts.length === 1) {
      // 只有1个符合条件的（就是刚下单的），检查是否需要翻页
      const lastProduct = products[products.length - 1];
      const lastPrice = lastProduct.price;

      if (lastPrice <= maxPrice && products.length >= 20) {
        // 最后一条价格满足 且 当前页满20条，翻到下一页
        console.log(`[列表模式] ➡️  最后一条价格${lastPrice} ≤ ${maxPrice}，翻到第${this.currentPage + 1}页`);
        this.clearCache();
        this.currentPage++;
      } else {
        // 最后一条价格不满足 或 当前页不足20条，重置到第1页
        console.log(`[列表模式] 🔄 最后一条价格${lastPrice} > ${maxPrice} 或页面不满，重置到第1页`);
        this.clearCache();
        this.currentPage = 1;
      }
    } else {
      // 没有符合条件的商品了（理论上不应该走到这里），重置到第1页
      console.log(`[列表模式] 🔄 无符合条件商品，重置到第1页`);
      this.clearCache();
      this.currentPage = 1;
    }
  }
}

module.exports = ListModeStrategy;
