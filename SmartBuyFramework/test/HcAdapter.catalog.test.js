const HcAdapter = require('../platforms/hc/HcAdapter');
const ListModeStrategy = require('../core/strategies/ListModeStrategy');
const QuickModeStrategy = require('../core/strategies/QuickModeStrategy');
const hcIntervals = require('../config/intervals/hc');
const axios = require('axios');
const cryptJs = require('crypto-js');

jest.mock('axios');

describe('HcAdapter catalog', () => {
  test('uses the browser-compatible transport by default', () => {
    const adapter = new HcAdapter();
    expect(adapter.useBrowserTransport).toBe(true);
  });

  test('jitters the 450ms HC list interval between 400ms and 500ms', () => {
    const adapter = new HcAdapter();
    const strategy = new ListModeStrategy(adapter);
    const random = jest.spyOn(Math, 'random');

    random.mockReturnValueOnce(0);
    expect(strategy.applyIntervalJitter(450)).toBe(400);
    random.mockReturnValueOnce(1);
    expect(strategy.applyIntervalJitter(450)).toBe(500);
    random.mockRestore();
  });

  test('jitters the 450ms HC quick interval between 400ms and 500ms', () => {
    const adapter = new HcAdapter();
    const strategy = new QuickModeStrategy(adapter);
    const random = jest.spyOn(Math, 'random');

    random.mockReturnValueOnce(0);
    expect(strategy.applyIntervalJitter(450)).toBe(400);
    random.mockReturnValueOnce(1);
    expect(strategy.applyIntervalJitter(450)).toBe(500);
    random.mockRestore();
  });

  test('keeps HC quick mode no faster than list mode', () => {
    // 断言两者的关系而非具体数值：起始间隔会随自适应调频的基线调整，
    // 焊死数字会让每次调参都要改测试。
    const { list, quick } = hcIntervals.tasks['smart-buy'];
    expect(quick).toBeGreaterThanOrEqual(list);
  });

  test('keeps the adaptive range inside the platform limits', () => {
    const { adaptive, limits } = hcIntervals;
    expect(adaptive.minInterval).toBeGreaterThanOrEqual(limits.minInterval);
    expect(adaptive.maxInterval).toBeLessThanOrEqual(limits.maxInterval);
    // 起始值必须落在自适应区间内，否则一启动就会被夹紧。
    expect(hcIntervals.base.list).toBeGreaterThanOrEqual(adaptive.minInterval);
    expect(hcIntervals.base.list).toBeLessThanOrEqual(adaptive.maxInterval);
  });

  test('passes the task maximum price into list requests', async () => {
    const adapter = {
      getProductList: jest.fn().mockResolvedValue([]),
    };
    const strategy = new ListModeStrategy(adapter);

    await strategy.getProductList('18041', { maxPrice: 4, pageSize: 50 });

    expect(adapter.getProductList).toHaveBeenCalledWith(
      '18041',
      expect.objectContaining({ maxPrice: 4, pageSize: 50 })
    );
  });

  test('normalizes HC pay_types and selects listings supporting Huifu 140', () => {
    const adapter = new HcAdapter();
    const strategy = new ListModeStrategy(adapter);
    const unsupported = adapter.normalizeProduct({
      id: 1,
      product_id: 18298,
      amount: 20,
      status: 1,
      pay_types: '[121]',
    }, '18298');
    const supported = adapter.normalizeProduct({
      id: 2,
      product_id: 18298,
      amount: 21,
      status: 1,
      pay_types: [121, '140'],
    }, '18298');

    expect(unsupported.payTypes).toEqual([121]);
    expect(supported.payTypes).toEqual([121, 140]);
    expect(strategy.filterBestProduct(
      [unsupported, supported],
      24,
      {}
    )).toBe(supported);
  });

  test('does not count a failed payment and excludes that listing afterward', () => {
    const adapter = new HcAdapter();
    const strategy = new ListModeStrategy(adapter);
    const listing = adapter.normalizeProduct({
      id: 2,
      product_id: 18298,
      amount: 21,
      status: 1,
      pay_types: [140],
    }, '18298');
    strategy.completedQuantity = 0;
    strategy.remainingQuantity = 14;
    strategy.startTime = Date.now();
    strategy.lastAttemptedProduct = listing;

    strategy.updateProgress({ success: false, error: 'balancepay failed' });

    expect(strategy.completedQuantity).toBe(0);
    expect(strategy.remainingQuantity).toBe(14);
    expect(strategy.failedProductIds).toContain('2');
    expect(strategy.filterBestProduct([listing], 24, {})).toBeNull();
  });

  test('uses an explicit task interval before the platform default', () => {
    const strategy = new ListModeStrategy(new HcAdapter());

    expect(strategy.getPlatformInterval({ interval: 800 })).toBe(800);
  });

  test('clears the list cache after an order attempt fails', async () => {
    const adapter = {
      getProductList: jest.fn().mockResolvedValue([
        { id: 'listing-1', price: 21, available: true },
      ]),
      placeOrder: jest.fn().mockRejectedValue(new Error('商品已售罄')),
    };
    const strategy = new ListModeStrategy(adapter);

    await expect(strategy.acquireAndOrder({
      productId: '18298',
      maxPrice: 21,
    })).rejects.toThrow('商品已售罄');

    expect(strategy.cachedProductList).toEqual([]);
    expect(strategy.lastProductListTime).toBe(0);
  });

  test('opens an escalating EdgeOne circuit breaker without retaining HTML', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const adapter = new HcAdapter(null, {
      edgeOneCooldownSchedule: [1000, 2000, 3000],
      sleep,
    });
    adapter.sendHttpRequest = jest.fn().mockResolvedValue({
      status: 405,
      data: '<html>Protected by Tencent Cloud EdgeOne</html>',
    });

    await expect(
      adapter.request('get', 'https://api.newbee.net.cn/api/v2/market/productList', {
        timestamp: 1,
      })
    ).rejects.toMatchObject({
      code: 405,
      data: { edgeOneBlocked: true, cooldownMs: 1000 },
    });

    expect(adapter.edgeOneBlockCount).toBe(1);
    expect(adapter.edgeOneBlockedUntil).toBeGreaterThan(Date.now());
    expect(JSON.stringify(adapter.edgeOneBlockedUntil)).not.toContain('EdgeOne');

    await adapter.waitForEdgeOneCooldown();
    expect(sleep).toHaveBeenCalledWith(expect.any(Number));
  });

  test('does not open the global circuit for an order-submit 405', async () => {
    const adapter = new HcAdapter(null, { edgeOneCooldownSchedule: [1000] });
    adapter.sendHttpRequest = jest.fn().mockResolvedValue({
      status: 405,
      data: '<html>EdgeOne Access Restricted</html>',
    });

    await expect(adapter.request(
      'post',
      'https://api.newbee.net.cn/api/market/buy',
      { id: 1 }
    )).rejects.toMatchObject({ code: 405 });

    expect(adapter.edgeOneBlockedUntil).toBe(0);
    expect(adapter.edgeOneBlockCount).toBe(0);
  });

  test('can explicitly fall back to axios transport', async () => {
    axios.create.mockReturnValueOnce({
      request: jest.fn().mockResolvedValue({ status: 200, data: { code: 1 } }),
    });
    const adapter = new HcAdapter(null, { useBrowserTransport: false });

    const response = await adapter.sendHttpRequest(
      'get',
      'https://api.newbee.net.cn/api/common/init',
      { timestamp: 1 },
      {},
      1000
    );

    expect(response.data.code).toBe(1);
    expect(adapter.http.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'get', params: { timestamp: 1 } })
    );
  });

  test('removes null headers and stringifies values for impit requests', async () => {
    const adapter = new HcAdapter();
    adapter.browserTransport = {
      fetch: jest.fn().mockResolvedValue({
        status: 200,
        text: jest.fn().mockResolvedValue('{"code":1}'),
      }),
    };

    await adapter.sendHttpRequest(
      'post',
      'https://hfpay.cloudpnr.com/api/hfpwalleth5/transpasswordcheck',
      { password: 'encrypted' },
      {
        Token: 'null',
        signature: null,
        Hide_head: 0,
        platformn: undefined,
      },
      1000
    );

    expect(adapter.browserTransport.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Token: 'null',
          Hide_head: '0',
        },
      })
    );
  });

  test('uses the current numeric market parameters and omits empty filters', async () => {
    const adapter = new HcAdapter(null, {
      catalogPageSize: 20,
      catalogProductTypes: [19, 25],
    });
    adapter.request = jest.fn().mockResolvedValue({ code: 1, data: { data: [] } });

    await adapter.fetchCatalogPage(2, '', 19);

    expect(adapter.request).toHaveBeenCalledWith(
      'get',
      'https://api.newbee.net.cn/api/v2/market/search',
      expect.objectContaining({
        hasmarket: -1,
        hot: 0,
        market_type: 0,
        order: 'weigh',
        page: 2,
        per_page: 20,
        product_type: 19,
        sort: 'DESC',
        time_type: 1,
      })
    );

    const payload = adapter.request.mock.calls[0][2];
    expect(payload).not.toHaveProperty('keywords');
    expect(payload).not.toHaveProperty('collection_id');
    expect(payload).not.toHaveProperty('album_id');
    expect(payload).not.toHaveProperty('product_id');
  });

  test('sorts request fields before generating x-token', () => {
    const adapter = new HcAdapter();
    const url = 'https://api.newbee.net.cn/api/v2/market/search';
    const payload = {
      timestamp: 1786371127181,
      keywords: 'NEWBEE门票',
      hasmarket: -1,
      page: 1,
    };
    const canonical =
      'api/v2/market/search?hasmarket=-1&keywords=newbee门票&page=1&timestamp=1786371127181' +
      '&key=6rnrdpjjv6wz2sspxqeibesov1itxddc';

    expect(adapter.getXToken(url, payload)).toBe(
      cryptJs.MD5(canonical).toString()
    );
  });

  test('keeps empty string fields in x-token canonical params', () => {
    const adapter = new HcAdapter();
    const url = 'https://api.newbee.net.cn/api/product_merge';
    const payload = {
      page: 1,
      per_page: 20,
      subject: '',
      bf_type: 0,
      merge_type: 2,
      timestamp: 1786451309000,
    };
    const canonical =
      'api/product_merge?bf_type=0&merge_type=2&page=1&per_page=20&subject=&timestamp=1786451309000' +
      '&key=6rnrdpjjv6wz2sspxqeibesov1itxddc';

    expect(adapter.getXToken(url, payload)).toBe(
      cryptJs.MD5(canonical).toString()
    );
  });

  test('reads id and subject from the current market response shape', () => {
    const adapter = new HcAdapter();

    expect(
      adapter.normalizeCatalogProduct({
        id: 18287,
        subject: 'ZED',
        amount: '997.00',
      })
    ).toEqual({ id: '18287', name: 'ZED', price: 997 });
  });

  test('reads recent trade prices through the official trade-history endpoint', async () => {
    const adapter = new HcAdapter();
    adapter.request = jest.fn().mockResolvedValue({
      code: 1,
      data: [
        { no: '04110001', price: '5.00', time: 1786442758 },
        { no: '04110002', price: '4.50', time: 1786442757 },
      ],
    });

    const result = await adapter.getRecentTrades('18041');

    expect(adapter.request).toHaveBeenCalledWith(
      'get',
      'https://api.newbee.net.cn/api/market/getTradeList',
      expect.objectContaining({ id: '18041', page: 1, per_page: 50 })
    );
    expect(result).toEqual(expect.objectContaining({
      productId: '18041',
      trades: [
        expect.objectContaining({ serialNumber: '04110001', price: 5 }),
        expect.objectContaining({ serialNumber: '04110002', price: 4.5 }),
      ],
    }));
  });

  test('caps HC listing page size at the API maximum of 20', async () => {
    const adapter = new HcAdapter();
    adapter.request = jest.fn().mockResolvedValue({
      code: 1,
      data: { data: [] },
    });

    await adapter.getProductList('18041', { pageSize: 50 });

    expect(adapter.request.mock.calls[0][2]).toEqual(
      expect.objectContaining({ product_id: '18041', per_page: 20 })
    );
  });

  // 曾有两个用例要求 getProductList 在一次调用内连翻三页（末条价格 ≤ maxPrice
  // 且满 20 条时继续翻）。该规则已由 ListModeStrategy 在策略层跨轮次实现，
  // 见 handleNoQualifiedProducts / handleSuccessfulOrder。若适配器内部再翻一次，
  // 两套翻页会叠加导致页码跳跃，且单轮请求数与延迟都变成三倍，对抢购与 EdgeOne
  // 风控都不利。因此不在适配器内翻页，用例已移除。

  test('does not request page two when page one ends above the maximum price', async () => {
    const adapter = new HcAdapter();
    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      product_id: 18041,
      amount: index === 19 ? 5 : 4,
      status: 1,
    }));
    adapter.request = jest.fn().mockResolvedValue({ code: 1, data: { data: rows } });

    await adapter.getProductList('18041', { pageSize: 50, maxPrice: 4 });

    expect(adapter.request).toHaveBeenCalledTimes(1);
  });

  test('does not request more pages when page one has fewer than 20 rows', async () => {
    const adapter = new HcAdapter();
    adapter.request = jest.fn().mockResolvedValue({
      code: 1,
      data: {
        data: [{ id: 1, product_id: 18041, amount: 5, status: 1 }],
      },
    });

    const products = await adapter.getProductList('18041', { pageSize: 50 });

    expect(adapter.request).toHaveBeenCalledTimes(1);
    expect(products).toHaveLength(1);
  });

  test('collects every configured product type and removes duplicate ids', async () => {
    const adapter = new HcAdapter(null, {
      catalogProductTypes: [19, 25],
      catalogMaxPages: 1,
    });
    adapter.writeProductConfig = jest.fn();
    adapter.loadProductConfig = jest.fn().mockReturnValue({});
    adapter.fetchCatalogPage = jest
      .fn()
      .mockResolvedValueOnce({
        code: 1,
        data: { has_more: false, data: [{ id: 18287, subject: 'ZED', amount: 997 }] },
      })
      .mockResolvedValueOnce({
        code: 1,
        data: {
          has_more: false,
          data: [
            { id: 18287, subject: 'ZED', amount: 997 },
            { id: 18239, subject: '晴窗绘海', amount: 100 },
          ],
        },
      });

    const products = await adapter.syncProductCatalog();

    expect(adapter.fetchCatalogPage).toHaveBeenNthCalledWith(1, 1, '', 19);
    expect(adapter.fetchCatalogPage).toHaveBeenNthCalledWith(2, 1, '', 25);
    expect(products).toEqual({
      ZED: { id: '18287', price: 997 },
      晴窗绘海: { id: '18239', price: 100 },
    });
  });

  test('fetches a fresh captcha and retries recognition failures', async () => {
    const adapter = new HcAdapter(null, { captchaMaxAttempts: 3 });
    adapter.request = jest
      .fn()
      .mockResolvedValueOnce({
        code: 1,
        data: { id: 'captcha-1', base64: 'data:image/png;base64,Zmlyc3Q=' },
      })
      .mockResolvedValueOnce({
        code: 1,
        data: { id: 'captcha-2', base64: 'data:image/png;base64,c2Vjb25k' },
      });
    axios.post
      .mockResolvedValueOnce({ data: { success: false, message: '临时识别失败' } })
      .mockResolvedValueOnce({
        data: { success: true, data: { result: '7dni' } },
      });

    await expect(adapter.getCaptchaResult()).resolves.toEqual({
      captcha: '7dni',
      id: 'captcha-2',
    });
    expect(adapter.request).toHaveBeenCalledTimes(2);
    expect(axios.post).toHaveBeenCalledTimes(2);
  });
});
