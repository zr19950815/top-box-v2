// TaskExecutor 在模块加载时就解构了 spawn（const { spawn } = require(...)），
// 解构出的引用无法被 jest.spyOn 拦截。必须在模块层替换，否则测试会真的启动
// 子进程去跑任务。
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}));

const childProcess = require('child_process');
const EventEmitter = require('events');
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

  test('records every category a single line matches', () => {
    // “上架完成: 成功 3，失败 0” 同时含成功与“失败”二字；单值 category 会被
    // 后面的判断覆盖，导致成功事件丢失。
    const executor = new TaskExecutor();

    const result = executor.parseLogMessage('[任务执行器] ✅ 上架完成: 成功 3，失败 0');

    expect(result.categories).toContain('LISTING_SUCCESS');
    expect(result.category).toBe('LISTING_SUCCESS');
  });

  test('keeps login success even when the same line reports a purchase', () => {
    const executor = new TaskExecutor();

    const result = executor.parseLogMessage('登录认证成功 后续 购买成功! 进度: 1/2');

    expect(result.categories).toEqual(
      expect.arrayContaining(['LOGIN_SUCCESS', 'PURCHASE_SUCCESS'])
    );
  });

  test('redacts credentials but leaves the result payload parseable', () => {
    const executor = new TaskExecutor();

    expect(executor.redactSensitive('登录 13800001111 支付密码: pay6666'))
      .toBe('登录 138****1111 支付密码: [已脱敏]');

    // TOPBOX_RESULT 要参与结果解析，脱敏不能破坏其中的 JSON。
    const line = executor.redactSensitive(
      'TOPBOX_RESULT:{"successCount":3,"time":"2026-08-13T12:23:48Z"}'
    );
    expect(JSON.parse(line.match(/TOPBOX_RESULT:(.+)/)[1]).successCount).toBe(3);
  });
});

describe('TaskExecutor stdout 分行', () => {
  const collect = (executor, chunks, { flush = true } = {}) => {
    const lines = [];
    const buffer = executor.createLineBuffer((line) => lines.push(line));
    for (const chunk of chunks) buffer.push(Buffer.from(chunk));
    if (flush) buffer.flush();
    return lines;
  };

  test('拼接被切在 chunk 边界上的关键字', () => {
    // stdout 不保证按行送达；“登录认证成功”被切开时，早期实现会永久漏掉回执。
    const executor = new TaskExecutor();

    expect(collect(executor, ['[任务执行器] 登录认', '证成功\n'])).toEqual([
      '[任务执行器] 登录认证成功'
    ]);
  });

  test('一个 chunk 内的多行分别派发', () => {
    const executor = new TaskExecutor();

    expect(collect(executor, ['登录认证成功\n购买成功! 进度: 1/2\n'])).toEqual([
      '登录认证成功',
      '购买成功! 进度: 1/2'
    ]);
  });

  test('未换行的尾行先留在缓冲区，进程退出时补发', () => {
    const executor = new TaskExecutor();

    expect(collect(executor, ['完整行\n未完成尾行'], { flush: false }))
      .toEqual(['完整行']);
    expect(collect(executor, ['完整行\n未完成尾行'])).toEqual(['完整行', '未完成尾行']);
  });

  test('忽略空行并兼容 CRLF', () => {
    const executor = new TaskExecutor();

    expect(collect(executor, ['一行\r\n\n  \n二行\n'])).toEqual(['一行', '二行']);
  });

  test('每整行只触发一次日志事件', () => {
    const executor = new TaskExecutor();
    const emitted = [];
    executor.on('taskLog', (taskId, payload) => emitted.push(payload.message));

    const buffer = executor.createLineBuffer((line) => {
      executor.parseAndEmitLog('task-1', 'info', line);
    });
    buffer.push(Buffer.from('登录认'));
    buffer.push(Buffer.from('证成功\n'));
    buffer.flush();

    expect(emitted).toEqual(['登录认证成功']);
  });
});

describe('TaskExecutor 失败原因提取', () => {
  const executor = new TaskExecutor();

  test('从序列化错误对象中提取原因', () => {
    // 框架逐行打印错误对象，真实原因单独占一行。
    expect(executor.extractFailureReason('错误: "message": "密码不正确",')).toBe('密码不正确');
    expect(executor.extractFailureReason('"msg": "支付密码错误",')).toBe('支付密码错误');
  });

  test('从带标签的文案中提取原因', () => {
    expect(executor.extractFailureReason('[任务执行器] ❌ 登录认证失败: 密码不正确'))
      .toBe('密码不正确');
    expect(executor.extractFailureReason('❌ 上架失败：可用库存不足'))
      .toBe('可用库存不足');
  });

  test('不把正常进度日志误当成失败原因', () => {
    // 抢购任务在等挂单时会持续输出这类行，误判会让运行中的任务被报成失败。
    for (const line of [
      '[列表模式] ❌ 没有符合条件的商品 (最高价格: 300)',
      '[列表模式] ⚠️  执行错误: NO_QUALIFIED_PRODUCTS',
      '[任务执行器] ✅ 登录认证成功',
      '"type": "LOGIN_FAILED",',
      '',
    ]) {
      expect(executor.extractFailureReason(line)).toBeNull();
    }
  });

  test('进程失败时上报真实原因而非退出码', async () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    childProcess.spawn.mockReturnValue(child);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const executor = new TaskExecutor();
    const failures = [];
    executor.on('taskStatusChanged', (taskId, status, data) => {
      if (status === 'failed') failures.push(data.error_message);
    });

    await executor.executeTask('task-1', '幻藏指定-13800001111-mima-pay-藏品*1*100');
    child.stderr.emit('data', Buffer.from('[HC] 登录失败\n"message": "密码不正确",\n"type": "LOGIN_FAILED",\n'));
    child.emit('close', 1, null);

    // “进程退出码: 1”对用户没有指导意义，会被误读成程序故障。
    expect(failures).toEqual(['密码不正确']);
  });

  test('无法识别原因时退回退出码', async () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();
    childProcess.spawn.mockReturnValue(child);

    const executor = new TaskExecutor();
    const failures = [];
    executor.on('taskStatusChanged', (taskId, status, data) => {
      if (status === 'failed') failures.push(data.error_message);
    });

    await executor.executeTask('task-1', '幻藏指定-13800001111-mima-pay-藏品*1*100');
    child.emit('close', 1, null);

    expect(failures).toEqual(['进程退出码: 1']);
  });
});

describe('TaskExecutor 凭据传递', () => {
  const COMMAND = '幻藏指定-13800001111-mima8888-pay6666-测试藏品*1*100';

  const makeFakeChild = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 4242;
    child.kill = jest.fn();
    return child;
  };

  beforeEach(() => childProcess.spawn.mockReset());
  afterEach(() => jest.restoreAllMocks());

  test('指令通过环境变量下发，不出现在命令行参数里', async () => {
    // argv 会落在 /proc/<pid>/cmdline，该文件对所有用户可读：ps aux 就能看到
    // 米玛。环境变量落在 /proc/<pid>/environ，仅同 UID 与 root 可读。
    childProcess.spawn.mockReturnValue(makeFakeChild());
    const executor = new TaskExecutor();

    await executor.executeTask('task-1', COMMAND);

    const [command, args, options] = childProcess.spawn.mock.calls[0];
    expect(command).toBe('node');
    expect(args.join(' ')).not.toContain('mima8888');
    expect(args.join(' ')).not.toContain('pay6666');
    expect(args.join(' ')).not.toContain('13800001111');
    expect(options.env.TOPBOX_COMMAND).toBe(COMMAND);
  });

  test('启动日志只打印指令类型', async () => {
    childProcess.spawn.mockReturnValue(makeFakeChild());
    const logs = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    const executor = new TaskExecutor();

    await executor.executeTask('task-1', COMMAND);

    const combined = logs.join('\n');
    expect(combined).toContain('幻藏指定');
    expect(combined).not.toContain('mima8888');
    expect(combined).not.toContain('pay6666');
    expect(combined).not.toContain('13800001111');
  });

  test('子进程输出中的凭据在写日志前被脱敏', async () => {
    const child = makeFakeChild();
    childProcess.spawn.mockReturnValue(child);
    const errors = [];
    jest.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));
    const executor = new TaskExecutor();
    const emitted = [];
    executor.on('taskLog', (taskId, payload) => emitted.push(payload.message));

    await executor.executeTask('task-1', COMMAND);
    child.stderr.emit('data', Buffer.from('登录失败 账号 13800001111 支付密码: pay6666\n'));

    const combined = [...errors, ...emitted].join('\n');
    expect(combined).not.toContain('pay6666');
    expect(combined).not.toContain('13800001111');
    expect(combined).toContain('138****1111');
  });
});
