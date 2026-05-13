/**
 * HC / Huancang interval configuration.
 */

module.exports = {
  base: {
    list: 300,
    quick: 500,
    batch: 800,
  },
  tasks: {
    'smart-buy': {
      list: 300,
      quick: 500,
      batch: 800,
    },
    combination: 1000,
    'cancel-resale': 1000,
  },
  adjustments: {
    slowNetwork: 1.8,
    highFrequency: 2.0,
    batchRetry: 1.5,
  },
  limits: {
    minInterval: 180,
    maxInterval: 10000,
    apiCallsPerMinute: 120,
    burstLimit: 10,
  },
};
