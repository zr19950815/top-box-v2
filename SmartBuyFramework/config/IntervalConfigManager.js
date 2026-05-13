/**
 * SmartBuy Framework - 间隔时间配置管理器
 * 
 * 统一管理各平台的间隔时间配置
 */

class IntervalConfigManager {
  constructor() {
    this.configs = {};
    this.defaultInterval = 800; // 全局默认间隔
    this.initialized = false;
  }

  /**
   * 初始化配置管理器
   */
  async initialize() {
    try {
      // 动态加载各平台间隔配置
      this.configs.kyart = require('./intervals/kyart');
      this.configs.hzmiss = require('./intervals/hzmiss');
      this.configs.julianbaby = require('./intervals/julianbaby');
      this.configs.hc = require('./intervals/hc');
      
      this.initialized = true;
      console.log(`[间隔配置] ✅ 间隔配置管理器初始化完成`);
      
      // 打印配置统计
      this.printIntervalStats();
    } catch (error) {
      console.error(`[间隔配置] ❌ 初始化失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取平台和任务的间隔时间
   * @param {string} platform - 平台名称 (kyart, hzmiss等)
   * @param {string} task - 任务类型 (smart-buy, combination等)
   * @param {string} mode - 模式 (list, quick, batch)
   * @param {Object} options - 额外选项
   * @returns {number} 间隔时间（毫秒）
   */
  getInterval(platform, task = 'smart-buy', mode = 'quick', options = {}) {
    this.ensureInitialized();
    
    const platformConfig = this.configs[platform];
    if (!platformConfig) {
      console.warn(`[间隔配置] ⚠️  未找到平台配置: ${platform}，使用默认间隔`);
      return this.defaultInterval;
    }

    let interval = this.defaultInterval;

    try {
      // 优先级1: 任务类型 + 模式的组合配置
      if (platformConfig.tasks[task] && typeof platformConfig.tasks[task] === 'object') {
        if (platformConfig.tasks[task][mode]) {
          interval = platformConfig.tasks[task][mode];
          console.log(`[间隔配置] 📋 使用任务配置: ${platform}.${task}.${mode} = ${interval}ms`);
        }
      }
      // 优先级2: 基础模式配置
      else if (platformConfig.base[mode]) {
        interval = platformConfig.base[mode];
        console.log(`[间隔配置] 📋 使用基础配置: ${platform}.${mode} = ${interval}ms`);
      }
      // 优先级3: 单一任务配置
      else if (platformConfig.tasks[task] && typeof platformConfig.tasks[task] === 'number') {
        interval = platformConfig.tasks[task];
        console.log(`[间隔配置] 📋 使用任务配置: ${platform}.${task} = ${interval}ms`);
      }

      // 应用调整倍数
      interval = this.applyAdjustments(interval, platformConfig, options);

      // 应用限制
      interval = this.applyLimits(interval, platformConfig);

    } catch (error) {
      console.warn(`[间隔配置] ⚠️  获取间隔时出错: ${error.message}，使用默认值`);
    }

    return interval;
  }

  /**
   * 应用间隔调整
   * @private
   */
  applyAdjustments(baseInterval, platformConfig, options) {
    let adjustedInterval = baseInterval;

    if (options.slowNetwork && platformConfig.adjustments.slowNetwork) {
      adjustedInterval *= platformConfig.adjustments.slowNetwork;
      console.log(`[间隔配置] 🐌 网络慢调整: ${baseInterval} → ${adjustedInterval}ms`);
    }

    if (options.highFrequency && platformConfig.adjustments.highFrequency) {
      adjustedInterval *= platformConfig.adjustments.highFrequency;
      console.log(`[间隔配置] ⚡ 高频调整: ${adjustedInterval}ms`);
    }

    if (options.batchRetry && platformConfig.adjustments.batchRetry) {
      adjustedInterval *= platformConfig.adjustments.batchRetry;
      console.log(`[间隔配置] 🔄 批量重试调整: ${adjustedInterval}ms`);
    }

    return Math.round(adjustedInterval);
  }

  /**
   * 应用间隔限制
   * @private
   */
  applyLimits(interval, platformConfig) {
    const minInterval = platformConfig.limits.minInterval;
    const maxInterval = platformConfig.limits.maxInterval;

    if (interval < minInterval) {
      console.log(`[间隔配置] ⬆️  间隔过小，调整为最小值: ${minInterval}ms`);
      return minInterval;
    }

    if (interval > maxInterval) {
      console.log(`[间隔配置] ⬇️  间隔过大，调整为最大值: ${maxInterval}ms`);
      return maxInterval;
    }

    return interval;
  }

  /**
   * 获取平台的API速率限制
   * @param {string} platform - 平台名称
   * @returns {Object} 速率限制信息
   */
  getRateLimits(platform) {
    this.ensureInitialized();
    
    const platformConfig = this.configs[platform];
    if (!platformConfig || !platformConfig.limits) {
      return {
        apiCallsPerMinute: 60,
        burstLimit: 10
      };
    }

    return {
      apiCallsPerMinute: platformConfig.limits.apiCallsPerMinute,
      burstLimit: platformConfig.limits.burstLimit
    };
  }

  /**
   * 打印间隔配置统计
   */
  printIntervalStats() {
    console.log('\n=== 间隔时间配置统计 ===');
    for (const [platform, config] of Object.entries(this.configs)) {
      console.log(`⏱️  ${platform}:`);
      console.log(`   基础: 列表${config.base.list}ms, 快捷${config.base.quick}ms, 批量${config.base.batch}ms`);
      console.log(`   限制: ${config.limits.minInterval}-${config.limits.maxInterval}ms`);
      console.log(`   API: ${config.limits.apiCallsPerMinute}次/分`);
    }
    console.log('========================\n');
  }

  /**
   * 确保管理器已初始化
   * @private
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('IntervalConfigManager 尚未初始化，请先调用 initialize() 方法');
    }
  }

  /**
   * 获取支持的平台列表
   * @returns {Array} 平台列表
   */
  getSupportedPlatforms() {
    this.ensureInitialized();
    return Object.keys(this.configs);
  }
}

// 创建单例实例
const intervalConfigManager = new IntervalConfigManager();

module.exports = intervalConfigManager;
