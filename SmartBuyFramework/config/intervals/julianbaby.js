/**
 * JulianBaby / Bull Box 平台间隔配置
 */

module.exports = {
  base: {
    list: 1600,
    quick: 1200,
    batch: 2500,
  },
  tasks: {
    'smart-buy': {
      list: 1600,
      quick: 1200,
      batch: 2500,
    },
    combination: 1200,
    'cancel-resale': 1000,
  },
  adjustments: {
    slowNetwork: 1.8,
    highFrequency: 2.0,
    batchRetry: 1.8,
  },
  limits: {
    minInterval: 500,
    maxInterval: 15000,
    apiCallsPerMinute: 40,
    burstLimit: 5,
  },
};
