/**
 * SmartBuy Framework - 商品配置管理器
 * 
 * 统一管理各平台的商品配置，支持商品名称到参数的转换
 */

const path = require('path');

class ProductConfigManager {
  constructor() {
    this.configs = {};
    this.initialized = false;
  }

  /**
   * 初始化配置管理器
   */
  async initialize() {
    try {
      // 动态加载各平台配置
      this.configs.kyart = require('./products/kyart');
      this.configs.hzmiss = require('./products/hzmiss');
      this.configs.julianbaby = require('./products/julianbaby');
      this.configs.hc = require('./products/hc');
      
      this.initialized = true;
      console.log(`[商品配置] ✅ 配置管理器初始化完成`);
      
      // 打印统计信息
      this.printStats();
    } catch (error) {
      console.error(`[商品配置] ❌ 初始化失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 根据平台和商品名称获取商品配置
   * @param {string} platform - 平台名称 (kyart, hzmiss等)
   * @param {string} productName - 商品名称或ID
   * @returns {Object|null} 商品配置对象
   */
  getProductConfig(platform, productName) {
    this.ensureInitialized();
    
    const platformConfig = this.configs[platform];
    if (!platformConfig) {
      console.warn(`[商品配置] ⚠️  未找到平台配置: ${platform}`);
      return null;
    }

    // 优先按商品名称查找
    if (platformConfig[productName]) {
      console.log(`[商品配置] ✅ 找到商品配置: ${platform}:${productName}`);
      return {
        name: productName,
        platform: platform,
        ...platformConfig[productName]
      };
    }

    // 向下兼容：如果是数字ID，查找对应的商品
    if (/^\d+$/.test(productName)) {
      for (const [name, config] of Object.entries(platformConfig)) {
        if (String(config.id) === productName) {
          console.log(`[商品配置] ✅ 通过ID找到商品: ${platform}:${name} (ID:${productName})`);
          return {
            name: name,
            platform: platform,
            ...config
          };
        }
      }
    }

    console.warn(`[商品配置] ⚠️  未找到商品: ${platform}:${productName}`);
    return null;
  }

  /**
   * 验证商品是否存在
   * @param {string} platform - 平台名称
   * @param {string} productName - 商品名称或ID
   * @returns {boolean} 是否存在
   */
  validateProduct(platform, productName) {
    return this.getProductConfig(platform, productName) !== null;
  }

  /**
   * 获取平台所有商品列表
   * @param {string} platform - 平台名称
   * @returns {Array} 商品列表
   */
  getPlatformProducts(platform) {
    this.ensureInitialized();
    
    const platformConfig = this.configs[platform];
    if (!platformConfig) {
      return [];
    }

    return Object.keys(platformConfig);
  }

  /**
   * 获取所有支持的平台
   * @returns {Array} 平台列表
   */
  getSupportedPlatforms() {
    this.ensureInitialized();
    return Object.keys(this.configs);
  }

  /**
   * 打印配置统计信息
   */
  printStats() {
    console.log('\n=== 商品配置统计 ===');
    for (const [platform, config] of Object.entries(this.configs)) {
      const productCount = Object.keys(config).length;
      console.log(`📦 ${platform}: ${productCount} 个商品`);
    }
    console.log('====================\n');
  }

  /**
   * 确保管理器已初始化
   * @private
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('ProductConfigManager 尚未初始化，请先调用 initialize() 方法');
    }
  }

  /**
   * 获取商品配置示例
   * @param {string} platform - 平台名称
   * @returns {string} 示例商品名称
   */
  getExampleProduct(platform) {
    const products = this.getPlatformProducts(platform);
    return products.length > 0 ? products[0] : 'unknown';
  }
}

// 创建单例实例
const productConfigManager = new ProductConfigManager();

module.exports = productConfigManager;
