const EventEmitter = require('events');
const QQBotBridge = require('./QQBotBridge');

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;

  constructor() {
    super();
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
  }

  send(data, callback) {
    const request = JSON.parse(data);
    this.sent.push(request);
    callback?.();
    queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({
      status: 'ok', retcode: 0, data: { message_id: 1 }, echo: request.echo
    }))));
  }

  close() {
    this.readyState = 3;
  }
}

const OWNER = '10001';
const OTHER = '20002';

const buyTask = (overrides = {}) => ({
  id: 'task-buy-1',
  qq_user_id: OWNER,
  task_type: 'smart-buy',
  mode: 'list',
  status: 'running',
  config: JSON.stringify({
    account: '158****9094',
    productId: '福仔：墨镜蓝蓝',
    productConfig: { name: '福仔：墨镜蓝蓝' },
    quantity: 1,
    maxPrice: 300,
  }),
  progress: JSON.stringify({ completed: 0, total: 1 }),
  ...overrides,
});

const listingTask = (overrides = {}) => ({
  id: 'task-listing-1',
  qq_user_id: OWNER,
  task_type: 'listing',
  mode: 'on-sale',
  status: 'running',
  config: JSON.stringify({
    productConfig: { name: '奔马图' },
    quantity: 2,
    amount: 50,
  }),
  ...overrides,
});

const makeHarness = ({ tasks = [], overrides = {} } = {}) => {
  const store = new Map(tasks.map((task) => [task.id, task]));

  const taskManager = new EventEmitter();
  taskManager.getRunningTasksByOwner = jest.fn(async (userId) =>
    [...store.values()].filter(
      (task) => task.qq_user_id === String(userId) && task.status === 'running'
    ));
  taskManager.getOwnedTask = jest.fn(async (taskId, userId) => {
    const task = store.get(taskId);
    return task && task.qq_user_id === String(userId) ? task : undefined;
  });
  taskManager.stopTask = jest.fn(async (taskId) => {
    const task = store.get(taskId);
    if (task) task.status = 'stopped';
  });
  taskManager.getTask = jest.fn(async (taskId) => store.get(taskId));
  taskManager.reserveNotification = jest.fn().mockResolvedValue(true);
  taskManager.parseCommandString = jest.fn().mockReturnValue({ platform: 'hc' });
  taskManager.createTask = jest.fn().mockResolvedValue({ id: 'new-task' });

  const bridge = new QQBotBridge({
    WebSocket: FakeWebSocket,
    taskManager,
    config: {
      enabled: true,
      websocketUrl: 'ws://127.0.0.1:3002',
      commandPrefix: '/topbox',
      directCommandsEnabled: true,
      actionTimeout: 1000,
      ...overrides,
    },
  });
  bridge.start();
  return { bridge, taskManager, store };
};

/** 模拟一条私聊消息，返回机器人的回复文本。 */
const send = async (bridge, text, userId = OWNER) => {
  const before = bridge.socket.sent.length;
  await bridge.handleMessageEvent({
    post_type: 'message',
    message_type: 'private',
    user_id: Number(userId),
    raw_message: text,
  });
  return bridge.socket.sent.slice(before).map((item) => item.params.message).join('\n');
};

describe('获取任务', () => {
  test('列出运行中任务并带编号', async () => {
    const { bridge } = makeHarness({ tasks: [buyTask(), listingTask()] });

    const reply = await send(bridge, '获取任务');

    expect(reply).toContain('你的运行中任务（2 个）');
    expect(reply).toContain('1. 幻藏指定 福仔：墨镜蓝蓝 ≤300 已购 0/1');
    expect(reply).toContain('2. 幻藏上架 奔马图 ×2 @50');
    expect(reply).toContain('停止任务-1');
    expect(reply).toContain('停止任务-全部');
  });

  test('没有任务时给出明确提示', async () => {
    const { bridge } = makeHarness();
    expect(await send(bridge, '获取任务')).toBe('你当前没有运行中的任务');
  });

  test('不列出别人的任务', async () => {
    // 任务归属在创建时绑定，不能让人看到别人的任务。
    const { bridge } = makeHarness({
      tasks: [buyTask({ qq_user_id: OTHER })],
    });
    expect(await send(bridge, '获取任务', OWNER)).toBe('你当前没有运行中的任务');
  });

  test('不列出已结束的任务', async () => {
    const { bridge } = makeHarness({
      tasks: [buyTask({ status: 'completed' })],
    });
    expect(await send(bridge, '获取任务')).toBe('你当前没有运行中的任务');
  });

  test('描述中不出现米玛与完整手机号', async () => {
    const { bridge } = makeHarness({ tasks: [buyTask()] });
    const reply = await send(bridge, '获取任务');

    expect(reply).not.toMatch(/\b1[3-9]\d{9}\b/);
    expect(reply).not.toContain('mima');
    expect(reply).not.toMatch(/密码/);
  });
});

describe('停止任务-N', () => {
  test('按编号停止并回显任务描述', async () => {
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask(), listingTask()] });

    await send(bridge, '获取任务');
    const reply = await send(bridge, '停止任务-1');

    expect(taskManager.stopTask).toHaveBeenCalledWith('task-buy-1');
    expect(reply).toBe('已停止：幻藏指定 福仔：墨镜蓝蓝 ≤300 已购 0/1');
  });

  test('编号对应列表顺序', async () => {
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask(), listingTask()] });

    await send(bridge, '获取任务');
    await send(bridge, '停止任务-2');

    expect(taskManager.stopTask).toHaveBeenCalledWith('task-listing-1');
  });

  test('未先获取列表时提示先查询', async () => {
    // 编号来自列表，这道流程同时也是一次确认，避免手滑停错。
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask()] });

    expect(await send(bridge, '停止任务-1')).toBe('请先发送「获取任务」查看当前列表');
    expect(taskManager.stopTask).not.toHaveBeenCalled();
  });

  test('编号不存在时提示重新查询', async () => {
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask()] });

    await send(bridge, '获取任务');
    expect(await send(bridge, '停止任务-5'))
      .toBe('编号 5 不存在，请发送「获取任务」查看当前列表');
    expect(taskManager.stopTask).not.toHaveBeenCalled();
  });

  test('编号非正整数时给出格式提示', async () => {
    const { bridge } = makeHarness({ tasks: [buyTask()] });
    await send(bridge, '获取任务');

    expect(await send(bridge, '停止任务-0')).toContain('正整数');
    expect(await send(bridge, '停止任务-abc')).toContain('正整数');
  });

  test('缺少编号时提示用法', async () => {
    const { bridge } = makeHarness({ tasks: [buyTask()] });
    expect(await send(bridge, '停止任务-')).toContain('停止任务-1');
  });

  test('编号过期后要求重新查询', async () => {
    // 防止用半小时前的列表停到新任务上。
    const { bridge, taskManager } = makeHarness({
      tasks: [buyTask()],
      overrides: { taskSelectionTtlMs: 1000 },
    });

    await send(bridge, '获取任务');
    bridge.taskSelections.get(OWNER).createdAt -= 2000;

    expect(await send(bridge, '停止任务-1')).toBe('编号已过期，请重新发送「获取任务」');
    expect(taskManager.stopTask).not.toHaveBeenCalled();
  });

  test('不能停止别人的任务', async () => {
    // 即使猜到编号，归属校验也会拦住。
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask()] });

    await send(bridge, '获取任务', OWNER);
    // 换成另一个 QQ 用同样的编号，它没有自己的列表。
    expect(await send(bridge, '停止任务-1', OTHER))
      .toBe('请先发送「获取任务」查看当前列表');
    expect(taskManager.stopTask).not.toHaveBeenCalled();
  });

  test('任务已结束时不重复停止', async () => {
    const { bridge, taskManager, store } = makeHarness({ tasks: [buyTask()] });

    await send(bridge, '获取任务');
    store.get('task-buy-1').status = 'completed';

    expect(await send(bridge, '停止任务-1')).toContain('已完成');
    expect(taskManager.stopTask).not.toHaveBeenCalled();
  });

  test('停止失败时不谎报成功', async () => {
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask()] });
    taskManager.stopTask.mockRejectedValue(new Error('进程不存在'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await send(bridge, '获取任务');
    expect(await send(bridge, '停止任务-1')).toBe('停止失败，请稍后重试');
  });
});

describe('停止任务-全部', () => {
  test('停止自己的全部任务', async () => {
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask(), listingTask()] });

    const reply = await send(bridge, '停止任务-全部');

    expect(taskManager.stopTask).toHaveBeenCalledTimes(2);
    expect(reply).toContain('已停止 2 个任务');
    expect(reply).toContain('幻藏指定 福仔：墨镜蓝蓝');
    expect(reply).toContain('幻藏上架 奔马图');
  });

  test('无需先获取列表', async () => {
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask()] });
    await send(bridge, '停止任务-全部');
    expect(taskManager.stopTask).toHaveBeenCalledTimes(1);
  });

  test('不影响别人的任务', async () => {
    const { bridge, taskManager } = makeHarness({
      tasks: [buyTask(), listingTask({ qq_user_id: OTHER })],
    });

    await send(bridge, '停止任务-全部', OWNER);

    expect(taskManager.stopTask).toHaveBeenCalledTimes(1);
    expect(taskManager.stopTask).toHaveBeenCalledWith('task-buy-1');
  });

  test('没有任务时给出提示', async () => {
    const { bridge } = makeHarness();
    expect(await send(bridge, '停止任务-全部')).toBe('你当前没有运行中的任务');
  });

  test('部分失败时如实报告', async () => {
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask(), listingTask()] });
    taskManager.stopTask.mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => { throw new Error('进程不存在'); });

    const reply = await send(bridge, '停止任务-全部');

    expect(reply).toContain('已停止 1 个任务');
    expect(reply).toContain('1 个停止失败');
  });
});

describe('菜单与群聊', () => {
  test('菜单包含任务管理指令', async () => {
    const { bridge } = makeHarness();
    const reply = await send(bridge, '菜单');

    expect(reply).toContain('获取任务');
    expect(reply).toContain('停止任务-1');
    expect(reply).toContain('停止任务-全部');
  });

  test('群聊中的任务管理指令被忽略', async () => {
    const { bridge, taskManager } = makeHarness({ tasks: [buyTask()] });

    await bridge.handleMessageEvent({
      post_type: 'message', message_type: 'group',
      user_id: Number(OWNER), group_id: 20001, raw_message: '停止任务-全部',
    });

    expect(taskManager.stopTask).not.toHaveBeenCalled();
    expect(bridge.socket.sent).toHaveLength(0);
  });
});
