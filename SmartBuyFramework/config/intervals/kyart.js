/**
 * KyArt平台间隔时间配置
 *
 * 不同功能模式的间隔时间设置（毫秒）
 */

module.exports = {
  // 基础间隔配置
  base: {
    list: 800, // 列表模式间隔
    quick: 1200, // 快捷模式间隔
    batch: 3000, // 批量模式间隔
  },

  // 任务类型的间隔配置
  tasks: {
    'smart-buy': {
      list: 800,
      quick: 3000,
      batch: 3000,
    },
    combination: 1000, // 合成确认间隔
    'cancel-resale': 800, // 取消寄售间隔
  },

  // 特殊情况的间隔调整
  adjustments: {
    // 网络条件不好时的倍数
    slowNetwork: 1.5,

    // 高频操作时的倍数
    highFrequency: 2.0,

    // 批量操作重试间隔倍数
    batchRetry: 1.5,
  },

  // 平台特有的限制
  limits: {
    minInterval: 300, // 最小间隔
    maxInterval: 10000, // 最大间隔

    // API限制相关
    apiCallsPerMinute: 60, // 每分钟最大API调用数
    burstLimit: 10, // 突发请求限制
  },
};
