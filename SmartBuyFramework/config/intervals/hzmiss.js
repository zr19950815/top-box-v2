/**
 * HzMiss平台间隔时间配置
 * 
 * 不同功能模式的间隔时间设置（毫秒）
 */

module.exports = {
  // 基础间隔配置
  base: {
    list: 1000,   // 列表模式间隔（HzMiss可能需要更长间隔）
    quick: 800,   // 快捷模式间隔
    batch: 2000,  // 批量模式间隔
  },
  
  // 任务类型的间隔配置
  tasks: {
    'smart-buy': {
      list: 1000,
      quick: 800, 
      batch: 2000
    },
    combination: 1200,      // 合成确认间隔
    'cancel-resale': 1000   // 取消寄售间隔
  },
  
  // 特殊情况的间隔调整
  adjustments: {
    slowNetwork: 1.8,     // HzMiss网络条件可能需要更大倍数
    highFrequency: 2.5,
    batchRetry: 2.0       // 批量重试间隔更长
  },
  
  // 平台特有的限制
  limits: {
    minInterval: 500,     // HzMiss最小间隔更长
    maxInterval: 15000,
    
    apiCallsPerMinute: 40,  // HzMiss限制更严格
    burstLimit: 5
  }
};