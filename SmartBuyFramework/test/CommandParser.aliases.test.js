const CommandParser = require('../core/CommandParser');
const ProductConfigManager = require('../config/ProductConfigManager');

// 这些用例只验证解析结果，不发起任何真实请求。
const ACCOUNT = '13800001111';
const MIMA = 'mima8888';
const PAY_MIMA = 'pay6666';

// 与线上启动顺序一致：Manager 在受理任务前会先初始化商品配置。
beforeAll(async () => {
  await ProductConfigManager.initialize();
});

describe('CommandParser 中文别名', () => {
  test.each([
    ['幻藏指定', 'smart-buy', 'list'],
    ['幻藏自助', 'smart-buy', 'quick'],
    ['幻藏批量', 'smart-buy', 'batch'],
  ])('%s 转换为 %s/%s', (alias, task, mode) => {
    const result = CommandParser.parse(
      `${alias}-${ACCOUNT}-${MIMA}-${PAY_MIMA}-测试藏品*1*100`
    );
    expect(result).toMatchObject({ platform: 'hc', task, mode });
  });

  test('幻藏合成 转换为 combination，且不需要支付米玛', () => {
    const result = CommandParser.parse(`幻藏合成-${ACCOUNT}-${MIMA}-测试合成`);
    expect(result).toMatchObject({ platform: 'hc', task: 'combination' });
    expect(result.params.combinationName).toBe('测试合成');
    expect(result.params.payPassword).toBeNull();
    expect(CommandParser.validate(result)).toBe(true);
  });

  test('幻藏成交 转换为 trade-history', () => {
    const result = CommandParser.parse(`幻藏成交-${ACCOUNT}-${MIMA}-测试藏品`);
    expect(result).toMatchObject({ platform: 'hc', task: 'trade-history' });
    expect(result.params.productId).toBe('测试藏品');
  });

  test('幻藏取消 转换为 cancel-resale，并按藏品名称传递', () => {
    const result = CommandParser.parse(
      `幻藏取消-${ACCOUNT}-${MIMA}-${PAY_MIMA}-测试藏品`
    );
    expect(result).toMatchObject({ platform: 'hc', task: 'cancel-resale' });
    // 名称原样透传，由适配器解析成 product_id，菜单不要求用户输入 ID。
    expect(result.params.productId).toBe('测试藏品');
    expect(CommandParser.validate(result)).toBe(true);
  });

  test('幻藏上架 转换为 listing/on-sale', () => {
    const result = CommandParser.parse(
      `幻藏上架-${ACCOUNT}-${MIMA}-${PAY_MIMA}-测试藏品*2*50`
    );
    expect(result).toMatchObject({ platform: 'hc', task: 'listing', mode: 'on-sale' });
    expect(CommandParser.validate(result)).toBe(true);
  });

  test('保留原有 hc 前缀写法', () => {
    const result = CommandParser.parse(
      `hc列表-${ACCOUNT}-${MIMA}-${PAY_MIMA}-测试藏品*1*100`
    );
    expect(result).toMatchObject({ platform: 'hc', task: 'smart-buy', mode: 'list' });
  });

  test('未知别名报错', () => {
    expect(() => CommandParser.parse(`幻藏未知-${ACCOUNT}-${MIMA}-${PAY_MIMA}-x`))
      .toThrow(/Unknown command/);
  });
});

describe('CommandParser 上架参数', () => {
  const parseListing = (spec) => CommandParser.parse(
    `幻藏上架-${ACCOUNT}-${MIMA}-${PAY_MIMA}-${spec}`
  );

  test('解析藏品名称、数量与挂单价', () => {
    const { params } = parseListing('测试藏品*3*128.5');
    expect(params).toMatchObject({
      productId: '测试藏品',
      quantity: 3,
      amount: 128.5,
      payPassword: PAY_MIMA,
    });
  });

  test('不再借用买入的 maxPrice 与 batchSize 字段', () => {
    // 买入的第三段是「最高价」（上限），上架是「挂单价」（精确值），语义不同。
    const { params } = parseListing('测试藏品*1*100');
    expect(params).not.toHaveProperty('maxPrice');
    expect(params).not.toHaveProperty('batchSize');
  });

  test('拒绝非法数量与挂单价', () => {
    expect(() => parseListing('测试藏品*0*100')).toThrow(/数量必须为正整数/);
    expect(() => parseListing('测试藏品*abc*100')).toThrow(/数量必须为正整数/);
    expect(() => parseListing('测试藏品*1*0')).toThrow(/挂单价必须大于 0/);
    expect(() => parseListing('测试藏品*1')).toThrow(/藏品名称\*数量\*挂单价/);
    expect(() => parseListing('*1*100')).toThrow(/藏品名称不能为空/);
  });
});

describe('CommandParser 日志安全', () => {
  test('解析日志不打印米玛与支付米玛', () => {
    const logs = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });

    CommandParser.parse(`幻藏上架-${ACCOUNT}-${MIMA}-${PAY_MIMA}-测试藏品*1*100`);

    spy.mockRestore();
    warn.mockRestore();

    const combined = logs.join('\n');
    expect(combined).not.toContain(MIMA);
    expect(combined).not.toContain(PAY_MIMA);
    expect(combined).not.toContain(ACCOUNT);
  });
});
