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
      throw new Error('NO_QUALIFIED_PRODUCTS');
    }
    
    // 3. 下单
    return await this.adapter.placeOrder(bestProduct);
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
    
    // 获取新的商品列表
    console.log(`[列表模式] 🔄 刷新商品列表...`);
    
    const options = {
      page: 1,
      pageSize: config.pageSize || 50,
      sortBy: 'price',
      order: 'asc' // 按价格升序，优先便宜的
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
}

module.exports = ListModeStrategy;
