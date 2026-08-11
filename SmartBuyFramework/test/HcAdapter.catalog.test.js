const HcAdapter = require('../platforms/hc/HcAdapter');
const PurchaseStrategy = require('../core/strategies/PurchaseStrategy');
const axios = require('axios');
const cryptJs = require('crypto-js');

jest.mock('axios');

describe('HcAdapter catalog', () => {
  test('uses the browser-compatible transport by default', () => {
    const adapter = new HcAdapter();
    expect(adapter.useBrowserTransport).toBe(true);
  });

  test('jitters the 300ms HC interval between about 200ms and 400ms', () => {
    const adapter = new HcAdapter();
    const strategy = new PurchaseStrategy(adapter);
    const random = jest.spyOn(Math, 'random');

    random.mockReturnValueOnce(0);
    expect(strategy.applyIntervalJitter(300)).toBe(200);
    random.mockReturnValueOnce(1);
    expect(strategy.applyIntervalJitter(300)).toBe(400);
    random.mockRestore();
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
