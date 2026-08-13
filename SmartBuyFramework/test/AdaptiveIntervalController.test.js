const AdaptiveIntervalController = require('../core/AdaptiveIntervalController');
const { ErrorFactory, ErrorTypes } = require('../utils/ErrorTypes');

const make = (overrides = {}) => new AdaptiveIntervalController({
  baseInterval: 500,
  minInterval: 300,
  maxInterval: 1000,
  step: 50,
  successThreshold: 20,
  blockBackoffSteps: 4,
  errorBackoffSteps: 1,
  ...overrides,
});

/** 连续记录 n 次成功。 */
const succeed = (controller, times) => {
  for (let i = 0; i < times; i++) controller.recordSuccess();
};

describe('自适应间隔：起点与边界', () => {
  test('从配置的起始值开始', () => {
    expect(make().getInterval()).toBe(500);
  });

  test('起始值超出区间时被夹紧', () => {
    expect(make({ baseInterval: 100 }).getInterval()).toBe(300);
    expect(make({ baseInterval: 5000 }).getInterval()).toBe(1000);
  });
});

describe('自适应间隔：提速', () => {
  test('未达阈值不提速', () => {
    const c = make();
    succeed(c, 19);
    expect(c.getInterval()).toBe(500);
  });

  test('达到阈值后提速一档', () => {
    const c = make();
    succeed(c, 20);
    expect(c.getInterval()).toBe(450);
  });

  test('计数在提速后重置，需再次累积', () => {
    const c = make();
    succeed(c, 20);
    succeed(c, 19);
    expect(c.getInterval()).toBe(450);
    succeed(c, 1);
    expect(c.getInterval()).toBe(400);
  });

  test('逐档下探但不越过下限', () => {
    const c = make();
    // 500 → 300 需要 4 档，多给几轮确认不会突破下限。
    succeed(c, 20 * 10);
    expect(c.getInterval()).toBe(300);
  });
});

describe('自适应间隔：退避', () => {
  test('被拦截时按配置档数大步退避', () => {
    const c = make();
    c.recordBlocked();
    // 4 档 × 50ms
    expect(c.getInterval()).toBe(700);
  });

  test('一般异常只退一档', () => {
    const c = make();
    c.recordError();
    expect(c.getInterval()).toBe(550);
  });

  test('退避不超过上限', () => {
    const c = make({ baseInterval: 950 });
    c.recordBlocked();
    expect(c.getInterval()).toBe(1000);
  });

  test('退避会清空成功计数，避免立刻反弹', () => {
    const c = make();
    succeed(c, 19);
    c.recordError();
    succeed(c, 19);
    // 若计数未清空，这里会已经提速。
    expect(c.getInterval()).toBe(550);
  });
});

describe('自适应间隔：记住不安全档位', () => {
  test('提速不会越过已知被拦截的档位', () => {
    const c = make();
    c.recordBlocked();            // 记住 500 会被拦截，退到 700
    expect(c.getInterval()).toBe(700);

    // 反复成功也只能停在 550，不再回到 500 去撞同一面墙。
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(550);
  });

  test('一般异常不封死档位', () => {
    // 超时多半是网络抖动而非风控，不应据此永久限制探测范围。
    const c = make();
    c.recordError();
    expect(c.getInterval()).toBe(550);
    succeed(c, 20 * 10);
    expect(c.getInterval()).toBe(300);
  });

  test('拦截记录过期后允许重新试探', () => {
    // 这道墙不能是永久的：一次偶发拦截若永久压低上限，平台放松限制后也无法
    // 受益，与自适应的目的相反。
    let clock = 1_000_000;
    const c = make({ blockedRetryMs: 30 * 60 * 1000, now: () => clock });

    c.recordBlocked();                    // blocked=500，退到 700
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(550);    // 停在墙前

    clock += 31 * 60 * 1000;              // 31 分钟后
    succeed(c, 20);
    expect(c.getInterval()).toBe(500);    // 墙已过期，可以再试
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(300);    // 一路探到下限
  });

  test('未到期时墙依然有效', () => {
    let clock = 1_000_000;
    const c = make({ blockedRetryMs: 30 * 60 * 1000, now: () => clock });
    c.recordBlocked();
    clock += 10 * 60 * 1000;              // 只过了 10 分钟
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(550);
  });

  test('blockedRetryMs 为 0 时墙永久有效', () => {
    const c = make({ blockedRetryMs: 0 });
    c.recordBlocked();
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(550);
  });

  test('多次被拦截时取更保守的档位', () => {
    const c = make({ baseInterval: 400 });
    c.recordBlocked();            // blocked=400 → 600
    c.recordBlocked();            // blocked=600 → 800
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(650);
  });
});

describe('自适应间隔：状态持久化', () => {
  test('导出并恢复探到的值', () => {
    const c = make();
    succeed(c, 20 * 3);
    const state = c.toState();
    expect(state.interval).toBe(350);

    const restored = make();
    expect(restored.restoreState(state, 60 * 60 * 1000)).toBe(true);
    expect(restored.getInterval()).toBe(350);
  });

  test('超过有效期则忽略，重新从起点试探', () => {
    // 临界值随时段、出口 IP 与平台策略变化，不是常数。
    const stale = { interval: 300, blockedInterval: null, updatedAt: Date.now() - 7200_000 };
    const c = make();
    expect(c.restoreState(stale, 60 * 60 * 1000)).toBe(false);
    expect(c.getInterval()).toBe(500);
  });

  test('恢复时一并沿用不安全档位', () => {
    const now = Date.now();
    const c = make({ now: () => now });
    c.restoreState(
      { interval: 700, blockedInterval: 500, blockedAt: now, updatedAt: now },
      60 * 60 * 1000
    );
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(550);
  });

  test('旧格式缺 blockedAt 时视为已过期，不永久压低上限', () => {
    // 宁可多试探一次，也不要让一条无时间戳的记录永久生效。
    const now = Date.now();
    const c = make({ now: () => now });
    c.restoreState({ interval: 700, blockedInterval: 500, updatedAt: now }, 0);
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(300);
  });

  test('blockedAt 一并落盘', () => {
    const now = Date.now();
    const c = make({ now: () => now });
    c.recordBlocked();
    expect(c.toState()).toMatchObject({ blockedInterval: 500, blockedAt: now });
  });

  test('空状态或非法状态不影响当前值', () => {
    const c = make();
    expect(c.restoreState(null)).toBe(false);
    expect(c.restoreState({})).toBe(false);
    expect(c.getInterval()).toBe(500);
  });
});

describe('自适应间隔：调整日志', () => {
  test('提速与退避都会回调', () => {
    const messages = [];
    const c = make({ onAdjust: (message) => messages.push(message) });
    succeed(c, 20);
    c.recordBlocked();
    expect(messages).toEqual([
      '[自适应间隔] 提速 500ms → 450ms',
      '[自适应间隔] 被拦截，降速 450ms → 650ms',
    ]);
  });
});

describe('策略层信号分流', () => {
  // 只验证分流逻辑，不跑真实请求。
  const PurchaseStrategy = require('../core/strategies/PurchaseStrategy');

  const makeStrategy = (controller, mode = 'list') => {
    const strategy = Object.create(PurchaseStrategy.prototype);
    strategy.getStrategyMode = () => mode;
    strategy.adapter = {
      getIntervalController: () => controller,
      persistIntervalState: jest.fn(),
    };
    return strategy;
  };

  test('成功记为成功', () => {
    const c = make();
    const s = makeStrategy(c);
    for (let i = 0; i < 20; i++) s.recordCycleOutcome(null);
    expect(c.getInterval()).toBe(450);
  });

  test('无符合条件的商品视为成功，不降速', () => {
    // 抢购任务等挂单时会持续产生该错误。若据此降速，会越等越慢，与目的相反。
    const c = make();
    const s = makeStrategy(c);
    const error = ErrorFactory.createBusinessError(
      '没有符合条件的商品',
      ErrorTypes.NO_QUALIFIED_PRODUCTS
    );
    for (let i = 0; i < 20; i++) s.recordCycleOutcome(error);
    expect(c.getInterval()).toBe(450);
  });

  test('未触发熔断的 405 触发大步退避', () => {
    const c = make();
    const s = makeStrategy(c);
    s.recordCycleOutcome(ErrorFactory.createApiError('EdgeOne 安全拦截', 405, {
      edgeOneBlocked: true,
      cooldownMs: 0,
    }));
    expect(c.getInterval()).toBe(700);
  });

  test('已走熔断路径的拦截不再重复退避', () => {
    // registerEdgeOneBlock 已在适配器内记过一次；此处再记会变成双倍退避。
    const c = make();
    const s = makeStrategy(c);
    c.recordBlocked();                    // 模拟熔断路径already记录
    expect(c.getInterval()).toBe(700);

    s.recordCycleOutcome(ErrorFactory.createApiError('EdgeOne 安全拦截', 405, {
      edgeOneBlocked: true,
      cooldownMs: 30000,                  // 有冷却时间 = 已触发熔断
    }));
    expect(c.getInterval()).toBe(700);    // 不再叠加
  });

  test('网络类错误只退一档', () => {
    const c = make();
    const s = makeStrategy(c);
    s.recordCycleOutcome(ErrorFactory.createNetworkError('socket hang up'));
    expect(c.getInterval()).toBe(550);
  });

  test('与频率无关的错误不调整间隔', () => {
    // 支付米玛错误、库存不足等，加快或放慢都无济于事。
    const c = make();
    const s = makeStrategy(c);
    s.recordCycleOutcome(ErrorFactory.createBusinessError(
      '支付密码错误',
      ErrorTypes.PAYMENT_FAILED
    ));
    expect(c.getInterval()).toBe(500);
  });

  test('没有控制器时不报错', () => {
    const s = makeStrategy(null);
    expect(() => s.recordCycleOutcome(null)).not.toThrow();
    expect(() => s.recordCycleOutcome(new Error('boom'))).not.toThrow();
  });

  test('档位变化时才落盘', () => {
    const c = make();
    const s = makeStrategy(c);
    for (let i = 0; i < 19; i++) s.recordCycleOutcome(null);
    expect(s.adapter.persistIntervalState).not.toHaveBeenCalled();

    s.recordCycleOutcome(null);   // 第 20 次触发提速
    expect(s.adapter.persistIntervalState).toHaveBeenCalledWith('list');
  });
});

describe('并发分摊', () => {
  test('分摊下限收紧后立刻拉回当前间隔', () => {
    const c = make();
    succeed(c, 20 * 10);
    expect(c.getInterval()).toBe(300);

    // 10 个并发进程共享 4 req/s → 每进程最快 2500ms
    expect(c.setSharedMinInterval(2500)).toBe(true);
    expect(c.getInterval()).toBe(1000);   // 仍受 maxInterval 约束
  });

  test('分摊下限生效时不再往下探', () => {
    // 每个进程只看自己都不会被拦截，但平台侧是合计流量。
    const c = make();
    c.setSharedMinInterval(600);
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(600);
  });

  test('并发减少后放宽下限，可继续提速', () => {
    const c = make();
    c.setSharedMinInterval(600);
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(600);

    c.setSharedMinInterval(0);            // 其他进程已退出
    succeed(c, 20 * 20);
    expect(c.getInterval()).toBe(300);
  });

  test('下限不变时不谎报调整', () => {
    const c = make();
    expect(c.setSharedMinInterval(300)).toBe(false);
    expect(c.getInterval()).toBe(500);
  });
});

describe('模式隔离', () => {
  const HcAdapter = require('../platforms/hc/HcAdapter');

  test('batch 与 list 各自独立，互不影响', () => {
    // 批量下单一次提交多单、请求更重，不该被压到与列表同样的频率。
    const adapter = new HcAdapter(null, { intervalStatePath: false });
    const list = adapter.getIntervalController('list');
    const batch = adapter.getIntervalController('batch');

    expect(list).not.toBe(batch);
    expect(list.getInterval()).toBe(500);
    expect(batch.getInterval()).toBe(800);

    // 各自的下限不同。
    for (let i = 0; i < 20 * 30; i++) {
      list.recordSuccess();
      batch.recordSuccess();
    }
    expect(list.getInterval()).toBe(300);
    expect(batch.getInterval()).toBe(600);
  });

  test('同一模式重复取用返回同一实例', () => {
    const adapter = new HcAdapter(null, { intervalStatePath: false });
    expect(adapter.getIntervalController('list')).toBe(adapter.getIntervalController('list'));
  });

  test('熔断通知所有已激活的模式', () => {
    // 拦截是账号/IP 级的，与具体模式无关。
    const adapter = new HcAdapter(null, { intervalStatePath: false });
    const list = adapter.getIntervalController('list');
    const batch = adapter.getIntervalController('batch');

    adapter.registerEdgeOneBlock();

    expect(list.getInterval()).toBe(700);
    expect(batch.getInterval()).toBe(1000);
  });
});
