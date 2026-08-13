const fs = require('fs');
const os = require('os');
const path = require('path');
const HcAdapter = require('../platforms/hc/HcAdapter');
const CommandParser = require('../core/CommandParser');

const combination = {
  id: 'merge-code-1',
  detailId: 'detail-1',
  name: '测试合成',
  materials: [
    {
      condition: 1,
      quantity: 2,
      products: [
        { productId: '1001', name: '素材 A', type: '' },
        { productId: '1002', name: '素材 B', type: '' },
      ],
    },
    {
      condition: 2,
      quantity: 1,
      products: [{ productId: '2001', name: '数字素材', type: 'digital' }],
    },
  ],
};

describe('HC combination by name', () => {
  let configDirectory;
  let configPath;

  beforeEach(() => {
    configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-combinations-'));
    configPath = path.join(configDirectory, 'hc.js');
  });

  afterEach(() => {
    fs.rmSync(configDirectory, { recursive: true, force: true });
  });

  test('parses the HC name-based command without a payment password', () => {
    const result = CommandParser.parse('hc合成-13800000000-loginpwd-测试合成');
    expect(result).toMatchObject({
      platform: 'hc',
      task: 'combination',
      params: {
        account: '13800000000',
        password: 'loginpwd',
        payPassword: null,
        combinationName: '测试合成',
      },
    });
    expect(CommandParser.validate(result)).toBe(true);
  });

  test('parses the read-only HC trade-history command without a payment password', () => {
    const result = CommandParser.parse('hc成交-13800000000-loginpwd-NEWBEE门票');
    expect(result).toMatchObject({
      platform: 'hc',
      task: 'trade-history',
      mode: 'history',
      params: { productId: 'NEWBEE门票', payPassword: null },
    });
    expect(CommandParser.validate(result)).toBe(true);
  });

  test('keeps the legacy HC manual instance-ID format compatible', () => {
    const result = CommandParser.parse('hc合成-13800000000-login-pay-88:9001,9002');
    expect(result.params).toMatchObject({
      combinationId: '88:9001,9002',
      combinationName: '88:9001,9002',
      payPassword: 'pay',
    });
  });

  test('normalizes the catalog list code and material alternatives', () => {
    const adapter = new HcAdapter(null, { combinationConfigPath: configPath });
    expect(adapter.normalizeCombination(
      { id: 101, code: 'submit-code' },
      {
        subject: '测试合成',
        product_list: [{
          quantity: 2,
          product: [{ id: 1001, subject: '素材 A', type: 'virtual' }],
        }],
      }
    )).toMatchObject({
      id: 'submit-code',
      detailId: '101',
      name: '测试合成',
      materials: [{ quantity: 2, products: [{ productId: '1001', name: '素材 A' }] }],
    });
  });

  test('reports ended activities that no longer expose material recipes', () => {
    const adapter = new HcAdapter(null, { combinationConfigPath: configPath });
    expect(() => adapter.normalizeCombination(
      { id: 20450, code: 'sdbgj20450' },
      {
        subject: '三打白骨精【通道二】',
        product_list: [],
        merge_info: {
          status: '3',
          starttime: '2026-08-11 18:30:00',
          endtime: '2026-08-11 19:00:00',
        },
      }
    )).toThrow('状态: 已结束');
  });

  test('uses local name match, aggregates paged stock, and submits instance IDs', async () => {
    const adapter = new HcAdapter(null, { combinationConfigPath: configPath });
    adapter.writeCombinationConfig({ [combination.name]: combination });
    adapter.request = jest.fn()
      // 1001, page 1
      .mockResolvedValueOnce({
        code: 1,
        data: { has_more: true, data: [{ status: '2', item_id: 'instance-a1' }] },
      })
      // 1001, page 2
      .mockResolvedValueOnce({
        code: 1,
        data: { has_more: false, data: [{ status: '2', item_id: 'instance-a2' }] },
      })
      // 2001 digital
      .mockResolvedValueOnce({
        code: 1,
        data: { has_more: false, data: [{ status: '2', item_id: 'instance-d1' }] },
      })
      // newmerge
      .mockResolvedValueOnce({ code: 1, data: {} });

    await expect(adapter.confirmCombination('测试合成')).resolves.toBe(true);

    expect(adapter.request.mock.calls.slice(0, 3).map((call) => call[2].page)).toEqual([1, 2, 1]);
    expect(adapter.request.mock.calls[2][2]).toEqual(expect.objectContaining({
      product_id: '2001', product_type: 'digital', type: 'confirm',
    }));
    expect(adapter.request).toHaveBeenLastCalledWith(
      'post',
      'https://api.newbee.net.cn/api/product_merge_material/newmerge',
      expect.objectContaining({
        id: 'merge-code-1',
        item_ids: 'instance-a1,instance-a2',
        ys_item_ids: 'instance-d1',
        timestamp: expect.any(Number),
      })
    );
  });

  test('does not submit when a material condition is short', async () => {
    const adapter = new HcAdapter(null, { combinationConfigPath: configPath });
    adapter.writeCombinationConfig({ [combination.name]: combination });
    adapter.request = jest.fn()
      .mockResolvedValueOnce({
        code: 1,
        data: { has_more: false, data: [{ status: '2', item_id: 'only-one' }] },
      })
      .mockResolvedValueOnce({ code: 1, data: { has_more: false, data: [] } });

    await expect(adapter.confirmCombination('测试合成')).rejects.toThrow('素材不足');
    expect(adapter.request.mock.calls.some((call) => call[0] === 'post')).toBe(false);
  });

  test('syncs a missing name from the real catalog shape before resolving it', async () => {
    const adapter = new HcAdapter(null, { combinationConfigPath: configPath });
    adapter.request = jest.fn()
      .mockResolvedValueOnce({
        code: 1,
        data: { current_page: 1, last_page: 1, data: [{ id: 101, code: 'merge-code-1' }] },
      })
      .mockResolvedValueOnce({
        code: 1,
        data: { current_page: 1, last_page: 1, data: [] },
      })
      .mockResolvedValueOnce({
        code: 1,
        data: {
          subject: '测试合成',
          product_list: [{ quantity: 1, product: [{ id: 1001, subject: '素材 A' }] }],
        },
      });

    const result = await adapter.resolveCombinationByName('测试合成');
    expect(result).toMatchObject({ id: 'merge-code-1', detailId: '101' });
    expect(adapter.loadCombinationConfig()['测试合成']).toMatchObject({ id: 'merge-code-1' });
  });
});
