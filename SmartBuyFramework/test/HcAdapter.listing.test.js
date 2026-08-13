const HcAdapter = require('../platforms/hc/HcAdapter');
const { ErrorFactory, ErrorTypes } = require('../utils/ErrorTypes');

// sleep 注入成空实现，避免测试真的等 2400ms 的上架间隔。
const makeAdapter = () => {
  const adapter = new HcAdapter(null, { sleep: () => Promise.resolve() });
  adapter.resolveProductId = jest.fn().mockResolvedValue('6267');
  return adapter;
};

const inventoryRow = (id, status = '2') => ({
  id,
  item_id: `item-${id}`,
  product_id: '6267',
  status,
  item: { sn: `sn-${id}` },
});

const inventoryPage = (rows, extra = {}) => ({
  code: 1,
  data: { data: rows, ...extra },
});

describe('HcAdapter 上架库存', () => {
  test('只收可上架资产（status === "2"）', async () => {
    const adapter = makeAdapter();
    adapter.request = jest.fn().mockResolvedValue(inventoryPage([
      inventoryRow(1),
      inventoryRow(2, '3'), // 已寄售
      inventoryRow(3),
    ]));

    const { collectibles } = await adapter.getListableCollectibles('测试藏品');

    expect(collectibles).toHaveLength(2);
    expect(collectibles.map((item) => item.cid)).toEqual(['1', '3']);
    expect(collectibles[0]).toEqual({
      cid: '1', item_id: 'item-1', product_id: '6267', sn: 'sn-1',
    });
  });

  test('按 has_more 翻页', async () => {
    const adapter = makeAdapter();
    adapter.request = jest.fn()
      .mockResolvedValueOnce(inventoryPage([inventoryRow(1)], { has_more: true }))
      .mockResolvedValueOnce(inventoryPage([inventoryRow(2)], { has_more: false }));

    const { collectibles } = await adapter.getListableCollectibles('测试藏品');

    expect(adapter.request).toHaveBeenCalledTimes(2);
    expect(collectibles).toHaveLength(2);
  });

  test('缺少 has_more 时退回页码比较，避免只取到第一页', async () => {
    // 该接口并非总返回 has_more；只认这个字段会让超过 50 个的库存被截断。
    const adapter = makeAdapter();
    adapter.request = jest.fn()
      .mockResolvedValueOnce(inventoryPage([inventoryRow(1)], { current_page: 1, last_page: 2 }))
      .mockResolvedValueOnce(inventoryPage([inventoryRow(2)], { current_page: 2, last_page: 2 }));

    const { collectibles } = await adapter.getListableCollectibles('测试藏品');

    expect(adapter.request).toHaveBeenCalledTimes(2);
    expect(collectibles.map((item) => item.cid)).toEqual(['1', '2']);
  });
});

describe('HcAdapter 上架执行', () => {
  test('库存不足时有几个上几个，不整批失败', async () => {
    const adapter = makeAdapter();
    adapter.getListableCollectibles = jest.fn().mockResolvedValue({
      productId: '6267',
      collectibles: [inventoryRow(1), inventoryRow(2)].map((row) => ({
        cid: String(row.id), item_id: row.item_id, product_id: '6267', sn: row.item.sn,
      })),
    });
    adapter.listCollectible = jest.fn().mockResolvedValue(true);

    const result = await adapter.listCollectibles({
      productId: '测试藏品', quantity: 5, amount: 100, payPassword: 'x',
    });

    expect(result).toMatchObject({
      requestedCount: 5,
      availableCount: 2,
      attemptedCount: 2,
      successCount: 2,
      failureCount: 0,
      aborted: false,
    });
    expect(adapter.listCollectible).toHaveBeenCalledTimes(2);
  });

  test('不超过请求数量', async () => {
    const adapter = makeAdapter();
    adapter.getListableCollectibles = jest.fn().mockResolvedValue({
      productId: '6267',
      collectibles: Array.from({ length: 5 }, (_, index) => ({
        cid: String(index), item_id: `item-${index}`, product_id: '6267', sn: `sn-${index}`,
      })),
    });
    adapter.listCollectible = jest.fn().mockResolvedValue(true);

    const result = await adapter.listCollectibles({
      productId: '测试藏品', quantity: 2, amount: 100, payPassword: 'x',
    });

    expect(result.successCount).toBe(2);
    expect(adapter.listCollectible).toHaveBeenCalledTimes(2);
  });

  test('支付米玛错误立即整批中止，不重试', async () => {
    // 连撞错误米玛可能触发平台锁定，这类错误必须一次就停。
    const adapter = makeAdapter();
    adapter.getListableCollectibles = jest.fn().mockResolvedValue({
      productId: '6267',
      collectibles: Array.from({ length: 3 }, (_, index) => ({
        cid: String(index), item_id: `item-${index}`, product_id: '6267', sn: `sn-${index}`,
      })),
    });
    adapter.listCollectible = jest.fn().mockRejectedValue(
      ErrorFactory.createBusinessError('支付密码错误', ErrorTypes.REQUEST_FAILED)
    );

    const result = await adapter.listCollectibles({
      productId: '测试藏品', quantity: 3, amount: 100, payPassword: 'wrong',
    });

    expect(adapter.listCollectible).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      aborted: true, successCount: 0, failureCount: 1, attemptedCount: 1,
    });
    expect(result.abortedReason).toContain('支付密码错误');
  });

  test('风控拦截同样立即中止', async () => {
    const adapter = makeAdapter();
    adapter.getListableCollectibles = jest.fn().mockResolvedValue({
      productId: '6267',
      collectibles: [{ cid: '1', item_id: 'i1', product_id: '6267', sn: 's1' }],
    });
    adapter.listCollectible = jest.fn().mockRejectedValue(
      ErrorFactory.createBusinessError('账号被风控限制', ErrorTypes.REQUEST_FAILED)
    );

    const result = await adapter.listCollectibles({
      productId: '测试藏品', quantity: 1, amount: 100, payPassword: 'x',
    });

    expect(adapter.listCollectible).toHaveBeenCalledTimes(1);
    expect(result.aborted).toBe(true);
  });

  test('网络错误按上限重试后仍失败则记为失败', async () => {
    const adapter = makeAdapter();
    adapter.getListableCollectibles = jest.fn().mockResolvedValue({
      productId: '6267',
      collectibles: [{ cid: '1', item_id: 'i1', product_id: '6267', sn: 's1' }],
    });
    adapter.listCollectible = jest.fn().mockRejectedValue(
      ErrorFactory.createNetworkError('socket hang up')
    );

    const result = await adapter.listCollectibles({
      productId: '测试藏品', quantity: 1, amount: 100, payPassword: 'x', maxAttempts: 3,
    });

    expect(adapter.listCollectible).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ successCount: 0, failureCount: 1, aborted: false });
  });

  test('网络错误重试后成功则记为成功', async () => {
    const adapter = makeAdapter();
    adapter.getListableCollectibles = jest.fn().mockResolvedValue({
      productId: '6267',
      collectibles: [{ cid: '1', item_id: 'i1', product_id: '6267', sn: 's1' }],
    });
    adapter.listCollectible = jest.fn()
      .mockRejectedValueOnce(ErrorFactory.createNetworkError('ETIMEDOUT'))
      .mockResolvedValueOnce(true);

    const result = await adapter.listCollectibles({
      productId: '测试藏品', quantity: 1, amount: 100, payPassword: 'x',
    });

    expect(adapter.listCollectible).toHaveBeenCalledTimes(2);
    expect(result.successCount).toBe(1);
  });

  test('单件资产自身问题只跳过它，继续上架其余资产', async () => {
    const adapter = makeAdapter();
    adapter.getListableCollectibles = jest.fn().mockResolvedValue({
      productId: '6267',
      collectibles: Array.from({ length: 3 }, (_, index) => ({
        cid: String(index), item_id: `item-${index}`, product_id: '6267', sn: `sn-${index}`,
      })),
    });
    adapter.listCollectible = jest.fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(ErrorFactory.createBusinessError('该藏品已寄售', ErrorTypes.REQUEST_FAILED))
      .mockResolvedValueOnce(true);

    const result = await adapter.listCollectibles({
      productId: '测试藏品', quantity: 3, amount: 100, payPassword: 'x',
    });

    expect(adapter.listCollectible).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      successCount: 2, failureCount: 1, aborted: false, attemptedCount: 3,
    });
  });

  test('拒绝非法数量与价格，且要求支付米玛', async () => {
    const adapter = makeAdapter();
    adapter.getListableCollectibles = jest.fn();

    await expect(adapter.listCollectibles({
      productId: 'x', quantity: 0, amount: 100, payPassword: 'p',
    })).rejects.toThrow('上架数量必须为正整数');

    await expect(adapter.listCollectibles({
      productId: 'x', quantity: 1, amount: 0, payPassword: 'p',
    })).rejects.toThrow('上架价格必须大于 0');

    await expect(adapter.listCollectibles({
      productId: 'x', quantity: 1, amount: 100,
    })).rejects.toThrow('缺少支付米玛');

    // 参数不合法时不应发起任何库存请求。
    expect(adapter.getListableCollectibles).not.toHaveBeenCalled();
  });
});

describe('HcAdapter 上架错误分类', () => {
  const adapter = makeAdapter();

  test.each([
    ['支付密码错误', 'abort'],
    ['支付米玛不正确', 'abort'],
    ['账号已被冻结', 'abort'],
    ['请求已被站点的安全策略拦截', 'abort'],
    ['连接超时 timeout', 'retry'],
    ['socket hang up', 'retry'],
    ['该藏品已寄售', 'skip'],
  ])('「%s」→ %s', (message, expected) => {
    expect(adapter.classifyListingError(new Error(message))).toBe(expected);
  });

  test('按错误类型判定致命错误', () => {
    expect(adapter.classifyListingError(
      ErrorFactory.createBusinessError('余额不足', ErrorTypes.INSUFFICIENT_BALANCE)
    )).toBe('abort');
    expect(adapter.classifyListingError(
      ErrorFactory.createNetworkError('boom')
    )).toBe('retry');
  });
});

describe('HcAdapter 成交记录时间', () => {
  const adapter = makeAdapter();

  test('把 Unix 秒格式化成上海时间', () => {
    // 1786613482 = 2026-08-13T09:31:22Z，上海时间应为当日 17:31:22。
    expect(adapter.formatShanghaiTime(1786613482)).toBe('2026-08-13 17:31:22');
  });

  test('跨日时也按上海时区计算', () => {
    // 1786577219 = 2026-08-12T23:26:59Z → 上海 2026-08-13 07:26:59（日期进一天）。
    expect(adapter.formatShanghaiTime(1786577219)).toBe('2026-08-13 07:26:59');
  });

  test('非法时间戳返回 null', () => {
    expect(adapter.formatShanghaiTime(undefined)).toBeNull();
    expect(adapter.formatShanghaiTime('abc')).toBeNull();
  });

  test('成交记录同时给出 UTC 与上海时间', async () => {
    const adapter = makeAdapter();
    adapter.request = jest.fn().mockResolvedValue({
      code: 1,
      data: [{ no: 29206960, price: 300, time: 1786613482 }],
    });

    const { trades } = await adapter.getRecentTrades('福仔：墨镜蓝蓝');

    expect(trades[0]).toMatchObject({
      serialNumber: '29206960',
      price: 300,
      time: '2026-08-13T09:31:22.000Z',
      localTime: '2026-08-13 17:31:22',
    });
  });
});

describe('HcAdapter 取消寄售', () => {
  test('按藏品名称解析成 product_id 后再调用取消接口', async () => {
    const adapter = makeAdapter();
    adapter.resolveProductId = jest.fn().mockResolvedValue('6267');
    adapter.request = jest.fn().mockResolvedValue({ code: 1 });

    await adapter.cancelResale('测试藏品');

    expect(adapter.resolveProductId).toHaveBeenCalledWith('测试藏品');
    const [method, url, payload] = adapter.request.mock.calls[0];
    expect(method).toBe('post');
    expect(url).toContain('/api/user_collect/batchCancelSale');
    expect(payload.product_id).toBe('6267');
  });
});
