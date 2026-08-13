/**
 * HC / Huancang interval configuration.
 */

module.exports = {
  // 500ms 是自适应调频的起点，取中位值：向下有提速空间，向上有退避余地。
  // 注意实际请求节奏比该数字慢——间隔从循环开始计时，包含请求自身耗时
  // （200~400ms）；list/quick 另叠加 ±1/9 抖动（固定频率最容易被识别）。
  base: {
    list: 500,
    quick: 500,
    batch: 800,
  },
  tasks: {
    'smart-buy': {
      list: 500,
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
    // No verified official NewBee/HC rate limit is currently known.
    apiCallsPerMinute: null,
    burstLimit: 10,
  },
  // 自适应调频：连续成功则逐档提速，被拦截则退避。
  // 下限 300 而非 limits.minInterval(180)——再快收益已很平（瓶颈是挂单出现的
  // 时机，不是轮询密度），而风控概率是超线性上升的。
  adaptive: {
    enabled: true,
    minInterval: 300,
    maxInterval: 1000,
    step: 50,
    // 按模式覆盖区间。batch 一次提交多单、请求本身更重，不应被压到与列表
    // 同样的频率，因此单独给更保守的下限。
    modes: {
      batch: { minInterval: 600, maxInterval: 1500 },
    },
    // 连续多少次请求无异常后提速一档。
    successThreshold: 20,
    // EdgeOne/405 拦截时一次退避的档数（比提速更果断）。
    blockBackoffSteps: 4,
    // 超时或一般异常退避的档数。
    errorBackoffSteps: 1,
    // 探到的安全值持久化后的有效期，超时重新探测：
    // 临界值随时段、出口 IP 与平台策略变化，不是常数。
    stateTtlMs: 60 * 60 * 1000,
    // 被拦截的档位多久后允许重新试探。这道墙不能是永久的，否则一次偶发拦截
    // 会永久压低上限，平台放松限制后也无法受益。
    blockedRetryMs: 30 * 60 * 1000,
    // 平台侧的总请求预算（次/秒）。购买任务各自是独立进程、可并发多个
    // （默认上限 10），若每个进程都只看自己，就会一起探到下限——各自都没被
    // 拦截，但合计流量早已超标，最终集体撞墙、集体退避，形成震荡。
    // 因此下限按当前活跃进程数分摊：进程越多，每个进程的最快间隔越保守。
    maxRequestsPerSecond: 4,
    // 活跃进程的心跳有效期。超过该时长未更新即视为已退出。
    activeProcessTtlMs: 30 * 1000,
  },
};
