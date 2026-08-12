const TaskExecutor = require('./TaskExecutor');

describe('TaskExecutor log parsing', () => {
  test('extracts progress from a successful paid purchase log', () => {
    const executor = new TaskExecutor();

    expect(executor.parseLogMessage(
      '[列表模式] 购买成功! 进度: 1/14 成功率: 0.5%'
    )).toMatchObject({
      category: 'PURCHASE_SUCCESS',
      progress: { completed: 1, total: 14 },
    });
  });

  test('does not emit progress for a payment failure log', () => {
    const executor = new TaskExecutor();

    expect(executor.parseLogMessage(
      '[列表模式] 购买失败: balancepay failed'
    )).toMatchObject({
      category: 'PURCHASE_FAILED',
      progress: null,
    });
  });

  test('does not treat an order submission as paid progress', () => {
    const executor = new TaskExecutor();

    expect(executor.parseLogMessage(
      '下单成功! 进度: 1/14'
    ).progress).toBeNull();
  });

  test('keeps the latest progress when a stdout chunk contains multiple lines', () => {
    const executor = new TaskExecutor();

    expect(executor.parseLogMessage(
      '购买成功! 进度: 1/14\n购买成功! 进度: 2/14'
    ).progress).toEqual({ completed: 2, total: 14 });
  });
});
