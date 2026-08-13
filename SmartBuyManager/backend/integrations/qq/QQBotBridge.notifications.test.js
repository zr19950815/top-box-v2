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

const OWNER_QQ = '10001';
const OTHER_QQ = '20002';

/**
 * 用真实的 EventEmitter 充当 TaskManager，以便验证事件订阅链路。
 * reserveNotification 用内存 Set 模拟数据库唯一键的去重语义。
 */
const makeHarness = ({ task, autoStart = true } = {}) => {
  const reserved = new Set();
  const taskManager = new EventEmitter();
  taskManager.getTask = jest.fn().mockResolvedValue(task);
  taskManager.getTaskStats = jest.fn().mockResolvedValue({
    runningCount: 0, maxConcurrent: 10, total: 3
  });
  taskManager.createTask = jest.fn().mockResolvedValue({ id: 'task-1' });
  taskManager.parseCommandString = jest.fn().mockReturnValue({ platform: 'hc' });
  taskManager.reserveNotification = jest.fn(async (taskId, eventKey) => {
    const key = `${taskId}:${eventKey}`;
    if (reserved.has(key)) return false;
    reserved.add(key);
    return true;
  });

  const bridge = new QQBotBridge({
    WebSocket: FakeWebSocket,
    taskManager,
    config: {
      enabled: true,
      websocketUrl: 'ws://127.0.0.1:3002',
      commandPrefix: '/topbox',
      directCommandsEnabled: true,
      actionTimeout: 1000
    }
  });
  if (autoStart) bridge.start();
  return { bridge, taskManager };
};

const buyTask = {
  id: 'task-1', qq_user_id: OWNER_QQ, task_type: 'smart-buy', status: 'running'
};

const privateMessages = (bridge) => bridge.socket.sent
  .filter((item) => item.action === 'send_private_msg');

describe('QQ 菜单', () => {
  test('发送“菜单”回复全部支持的格式，且使用脱敏用词', async () => {
    const { bridge } = makeHarness({ task: buyTask });
    await bridge.handleMessageEvent({
      post_type: 'message', message_type: 'private', user_id: 10001,
      raw_message: '菜单'
    });

    const reply = bridge.socket.sent[0].params.message;
    for (const alias of [
      '幻藏指定', '幻藏自助', '幻藏批量', '幻藏合成', '幻藏成交', '幻藏取消', '幻藏上架'
    ]) {
      expect(reply).toContain(alias);
    }
    // 统一使用「米玛 / 支付米玛」，不出现敏感词。
    expect(reply).toContain('米玛');
    expect(reply).toContain('支付米玛');
    expect(reply).not.toMatch(/密码/);
    expect(reply).toContain('仅支持 QQ 私聊提交任务');
  });
});

describe('登录回执', () => {
  test('登录成功只通知一次，重复日志不再发送', async () => {
    const { bridge, taskManager } = makeHarness({ task: buyTask });

    for (let i = 0; i < 3; i++) {
      await bridge.handleTaskLog({
        taskId: 'task-1', category: 'LOGIN_SUCCESS', categories: ['LOGIN_SUCCESS']
      });
    }

    const sent = privateMessages(bridge);
    expect(sent).toHaveLength(1);
    expect(sent[0].params).toMatchObject({
      user_id: Number(OWNER_QQ), message: '登录成功，任务已启动'
    });
    expect(taskManager.reserveNotification).toHaveBeenCalledWith('task-1', 'login-success');
  });

  test('一个 chunk 同时含登录成功与购买成功时，登录回执不被覆盖', async () => {
    // stdout 分块不保证按行对齐，早期实现用单值 category 会让后面的分类覆盖前面。
    const { bridge } = makeHarness({ task: buyTask });
    await bridge.handleTaskLog({
      taskId: 'task-1',
      category: 'PURCHASE_SUCCESS',
      categories: ['LOGIN_SUCCESS', 'PURCHASE_SUCCESS']
    });

    expect(privateMessages(bridge)[0].params.message).toBe('登录成功，任务已启动');
  });
});

describe('购买进度通知', () => {
  test('同一数量只通知一次，数量变化时再通知', async () => {
    const { bridge } = makeHarness({ task: buyTask });

    await bridge.handleTaskProgress({ taskId: 'task-1', progress: { completed: 1, total: 3 } });
    await bridge.handleTaskProgress({ taskId: 'task-1', progress: { completed: 1, total: 3 } });
    await bridge.handleTaskProgress({ taskId: 'task-1', progress: { completed: 2, total: 3 } });

    const messages = privateMessages(bridge).map((item) => item.params.message);
    expect(messages).toEqual([
      '支付成功，已购数量：1/3',
      '支付成功，已购数量：2/3'
    ]);
  });

  test('completed 为 0 时不通知', async () => {
    const { bridge } = makeHarness({ task: buyTask });
    await bridge.handleTaskProgress({ taskId: 'task-1', progress: { completed: 0, total: 3 } });
    expect(privateMessages(bridge)).toHaveLength(0);
  });
});

describe('结果通知', () => {
  test('合成成功通知', async () => {
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'combination' }
    });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'TASK_RESULT', categories: ['TASK_RESULT'],
      data: { result: true }
    });
    expect(privateMessages(bridge)[0].params.message).toBe('合成成功');
  });

  test('取消寄售成功通知', async () => {
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'cancel-resale' }
    });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'TASK_RESULT', categories: ['TASK_RESULT'],
      data: { result: true }
    });
    expect(privateMessages(bridge)[0].params.message).toBe('取消成功');
  });

  test('上架全部成功时报告成功与失败数量', async () => {
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'listing' }
    });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'TASK_RESULT', categories: ['TASK_RESULT'],
      data: { result: { requestedCount: 2, availableCount: 5, successCount: 2, failureCount: 0 } }
    });
    expect(privateMessages(bridge)[0].params.message).toBe('上架完成：成功 2，失败 0');
  });

  test('库存不足时说明实际可上架数量', async () => {
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'listing' }
    });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'TASK_RESULT', categories: ['TASK_RESULT'],
      data: { result: { requestedCount: 10, availableCount: 3, successCount: 3, failureCount: 0 } }
    });
    const message = privateMessages(bridge)[0].params.message;
    expect(message).toContain('成功 3');
    expect(message).toContain('可上架库存 3，少于请求的 10');
  });

  test('成交查询不发登录回执', async () => {
    // 只读查询紧接着就返回记录本身，登录回执属于噪音。
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'trade-history' }
    });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'LOGIN_SUCCESS', categories: ['LOGIN_SUCCESS']
    });
    expect(privateMessages(bridge)).toHaveLength(0);
  });

  test('成交查询失败仍然通知', async () => {
    // 不发成功回执不等于静默：失败必须有出口。
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'trade-history', status: 'failed' }
    });
    await bridge.handleTaskStatusUpdated({
      id: 'task-1', status: 'failed', error_message: '登录失败: 认证失败'
    });
    expect(privateMessages(bridge)[0].params.message).toBe('任务失败：账号或米玛不正确');
  });

  test('购买等任务仍然发送登录回执', async () => {
    const { bridge } = makeHarness({ task: buyTask });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'LOGIN_SUCCESS', categories: ['LOGIN_SUCCESS']
    });
    expect(privateMessages(bridge)[0].params.message).toBe('登录成功，任务已启动');
  });

  test('成交记录带表头并使用上海时间', async () => {
    // 首列是藏品编号，不加表头会被误读成订单号或价格；平台返回的 UTC 时间
    // 比本地早 8 小时，直接展示对不上。
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'trade-history' }
    });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'TASK_RESULT', categories: ['TASK_RESULT'],
      data: {
        result: {
          trades: [
            {
              serialNumber: '29206960', price: 300,
              time: '2026-08-13T09:31:22.000Z', localTime: '2026-08-13 17:31:22'
            }
          ]
        }
      }
    });

    const message = privateMessages(bridge)[0].params.message;
    expect(message).toContain('编号｜价格｜成交时间');
    expect(message).toContain('29206960｜300｜2026-08-13 17:31:22');
    // 不再展示 UTC 的 ISO 格式。
    expect(message).not.toContain('2026-08-13T09:31:22.000Z');
  });

  test('成交记录超过 20 条时说明只显示前 20 条', async () => {
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'trade-history' }
    });
    const trades = Array.from({ length: 50 }, (_, index) => ({
      serialNumber: String(index), price: 300, localTime: '2026-08-13 17:31:22'
    }));
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'TASK_RESULT', categories: ['TASK_RESULT'],
      data: { result: { trades } }
    });

    const message = privateMessages(bridge)[0].params.message;
    expect(message).toContain('50 条');
    expect(message).toContain('显示前 20 条');
    expect(message.split('\n')).toHaveLength(22); // 标题 + 表头 + 20 行
  });

  test('没有成交记录时给出明确提示', async () => {
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'trade-history' }
    });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'TASK_RESULT', categories: ['TASK_RESULT'],
      data: { result: { trades: [] } }
    });
    expect(privateMessages(bridge)[0].params.message).toBe('最近成交记录：暂无记录');
  });

  test('提前中止时告知剩余未尝试', async () => {
    const { bridge } = makeHarness({
      task: { ...buyTask, task_type: 'listing' }
    });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'TASK_RESULT', categories: ['TASK_RESULT'],
      data: {
        result: {
          requestedCount: 5, availableCount: 5, successCount: 1, failureCount: 1,
          aborted: true, abortedReason: '支付密码错误'
        }
      }
    });
    const message = privateMessages(bridge)[0].params.message;
    expect(message).toContain('已提前中止');
    // 中止原因可能含凭据线索，不回显原文。
    expect(message).not.toContain('支付密码错误');
  });
});

describe('失败通知', () => {
  test('任务失败时通知发起人，并给出可读原因', async () => {
    const { bridge } = makeHarness({ task: { ...buyTask, status: 'failed' } });
    await bridge.handleTaskStatusUpdated({
      id: 'task-1', status: 'failed', error_message: '登录失败: 认证失败'
    });
    expect(privateMessages(bridge)[0].params.message).toBe('任务失败：账号或米玛不正确');
  });

  test('平台原文「密码不正确」翻译成可读原因', async () => {
    // 这是 HC 登录接口的原文。此前它没被识别，用户看到的是“任务异常结束”，
    // 会误以为程序故障而不是自己输错了米玛。
    const { bridge } = makeHarness({ task: { ...buyTask, status: 'failed' } });
    await bridge.handleTaskStatusUpdated({
      id: 'task-1', status: 'failed', error_message: '密码不正确'
    });
    expect(privateMessages(bridge)[0].params.message).toBe('任务失败：账号或米玛不正确');
  });

  test('退出码兜底文案仍可读', async () => {
    const { bridge } = makeHarness({ task: { ...buyTask, status: 'failed' } });
    await bridge.handleTaskStatusUpdated({
      id: 'task-1', status: 'failed', error_message: '进程退出码: 1'
    });
    expect(privateMessages(bridge)[0].params.message).toBe('任务失败：任务异常结束，请稍后重试');
  });

  test('失败原因不回显米玛、支付米玛与完整手机号', async () => {
    const { bridge } = makeHarness({ task: { ...buyTask, status: 'failed' } });
    await bridge.handleTaskStatusUpdated({
      id: 'task-1',
      status: 'failed',
      error_message: '请求异常 account=13800001111 token: abcdef123456'
    });

    const message = privateMessages(bridge)[0].params.message;
    expect(message).not.toContain('13800001111');
    expect(message).not.toContain('abcdef123456');
    expect(message).toContain('138****1111');
  });

  test('非 failed 状态不发送失败通知', async () => {
    const { bridge } = makeHarness({ task: buyTask });
    await bridge.handleTaskStatusUpdated({ id: 'task-1', status: 'running' });
    expect(privateMessages(bridge)).toHaveLength(0);
  });

  test('失败通知只发一次', async () => {
    const { bridge } = makeHarness({ task: { ...buyTask, status: 'failed' } });
    for (let i = 0; i < 3; i++) {
      await bridge.handleTaskStatusUpdated({
        id: 'task-1', status: 'failed', error_message: '进程退出码: 1'
      });
    }
    expect(privateMessages(bridge)).toHaveLength(1);
  });
});

describe('通知归属', () => {
  test('通知只发给任务发起人，不广播给其他 QQ', async () => {
    const { bridge } = makeHarness({ task: buyTask });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'LOGIN_SUCCESS', categories: ['LOGIN_SUCCESS']
    });

    const recipients = privateMessages(bridge).map((item) => item.params.user_id);
    expect(recipients).toEqual([Number(OWNER_QQ)]);
    expect(recipients).not.toContain(Number(OTHER_QQ));
  });

  test('任务没有绑定 QQ 时不发送任何通知', async () => {
    const { bridge } = makeHarness({ task: { ...buyTask, qq_user_id: null } });
    await bridge.handleTaskLog({
      taskId: 'task-1', category: 'LOGIN_SUCCESS', categories: ['LOGIN_SUCCESS']
    });
    await bridge.handleTaskProgress({ taskId: 'task-1', progress: { completed: 1, total: 2 } });
    expect(privateMessages(bridge)).toHaveLength(0);
  });

  test('通知发送失败不向上抛，不影响任务执行', async () => {
    const { bridge } = makeHarness({ task: buyTask });
    bridge.sendPrivateMessage = jest.fn().mockRejectedValue(new Error('NapCat 掉线'));

    await expect(bridge.handleTaskLog({
      taskId: 'task-1', category: 'LOGIN_SUCCESS', categories: ['LOGIN_SUCCESS']
    })).resolves.toBeUndefined();
  });
});

describe('重启中断通知', () => {
  test('连接就绪前排队，连接后补发', async () => {
    const { bridge } = makeHarness({ task: buyTask, autoStart: false });

    // 此时尚未连接 NapCat，通知应入队而不是丢弃。
    await bridge.notifyInterruptedTasks([{ id: 'task-1', qq_user_id: OWNER_QQ }]);
    expect(bridge.queuedNotifications).toHaveLength(1);

    bridge.start();
    bridge.socket.emit('open');
    await new Promise((resolve) => setImmediate(resolve));

    const sent = privateMessages(bridge);
    expect(sent).toHaveLength(1);
    expect(sent[0].params.message).toBe('服务重启，任务已中断，请重新提交');
    expect(bridge.queuedNotifications).toHaveLength(0);
  });

  test('未启用 QQ 集成时不占用去重记录', async () => {
    // 否则事件会被记成已发送，之后真正启用也不会补发。
    const { bridge, taskManager } = makeHarness({ task: buyTask, autoStart: false });
    bridge.config.enabled = false;

    await bridge.notifyInterruptedTasks([{ id: 'task-1', qq_user_id: OWNER_QQ }]);

    expect(taskManager.reserveNotification).not.toHaveBeenCalled();
    expect(bridge.queuedNotifications).toHaveLength(0);
  });
});
