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
      status: 'ok',
      retcode: 0,
      data: { message_id: 1 },
      echo: request.echo
    }))));
  }

  close() {
    this.readyState = 3;
  }
}

const makeBridge = (overrides = {}) => {
  const taskManager = {
    getTaskStats: jest.fn().mockResolvedValue({ runningCount: 1, maxConcurrent: 10, total: 7 }),
    createTask: jest.fn().mockResolvedValue({
      id: 'task-1', platform: 'hc', status: 'running'
    })
  };
  const bridge = new QQBotBridge({
    WebSocket: FakeWebSocket,
    taskManager,
    config: {
      enabled: true,
      websocketUrl: 'ws://127.0.0.1:3002',
      commandPrefix: '/topbox',
      directCommandsEnabled: false,
      privateTestReply: '',
      actionTimeout: 1000,
      ...overrides
    }
  });
  bridge.start();
  return { bridge, taskManager };
};

describe('QQBotBridge', () => {
  test('replies pong to a private ping', async () => {
    const { bridge } = makeBridge();
    await bridge.handleMessageEvent({
      post_type: 'message', message_type: 'private', user_id: 10001,
      raw_message: '/topbox ping'
    });
    expect(bridge.socket.sent[0]).toMatchObject({
      action: 'send_private_msg',
      params: { user_id: 10001, message: 'pong' }
    });
  });

  test('ignores its own messages echoed back by NapCat', async () => {
    // 机器人自己发出的消息会以 message_sent 回流。响应它等于自我循环，
    // 公告和任务回执都会被当成新指令。
    const { bridge } = makeBridge();
    await bridge.handleSocketMessage(Buffer.from(JSON.stringify({
      post_type: 'message_sent', message_sent_type: 'self',
      message_type: 'private', user_id: 10001,
      raw_message: '/topbox ping'
    })));
    expect(bridge.socket.sent).toHaveLength(0);
  });

  test('never creates a task from a group message', async () => {
    // 群聊只用于单向公告，不提供任何交互功能。
    const { bridge, taskManager } = makeBridge({ directCommandsEnabled: true });
    taskManager.parseCommandString = jest.fn().mockReturnValue({ platform: 'hc' });

    await bridge.handleMessageEvent({
      post_type: 'message', message_type: 'group', user_id: 10001, group_id: 20001,
      raw_message: '幻藏指定-13800000000-mima-paymima-藏品*1*100'
    });

    expect(taskManager.createTask).not.toHaveBeenCalled();
    expect(bridge.socket.sent).toHaveLength(0);
  });

  test('binds a private task to the sender QQ and stays silent until login', async () => {
    const { bridge, taskManager } = makeBridge({ directCommandsEnabled: true });
    taskManager.parseCommandString = jest.fn().mockReturnValue({ platform: 'hc' });
    await bridge.handleMessageEvent({
      post_type: 'message', message_type: 'private', user_id: 10001,
      raw_message: '幻藏指定-13800000000-mima-paymima-藏品*1*100'
    });
    expect(taskManager.createTask).toHaveBeenCalledWith({
      commandString: '幻藏指定-13800000000-mima-paymima-藏品*1*100',
      qqUserId: '10001'
    });
    // 受理阶段不回执：登录可能失败，提前说“已受理”会给出错误结论。
    expect(bridge.socket.sent).toHaveLength(0);
  });

  test('replies to a non-command private message when the test reply is enabled', async () => {
    const { bridge, taskManager } = makeBridge({
      directCommandsEnabled: true,
      privateTestReply: '连接正常'
    });
    taskManager.parseCommandString = jest.fn(() => { throw new Error('invalid'); });

    await bridge.handleMessageEvent({
      post_type: 'message', message_type: 'private', user_id: 99999,
      raw_message: '普通聊天消息'
    });

    expect(taskManager.createTask).not.toHaveBeenCalled();
    expect(bridge.socket.sent[0].params.message).toBe('连接正常');
  });

  test('does not auto-reply to its own non-command message event', async () => {
    const { bridge, taskManager } = makeBridge({
      directCommandsEnabled: true,
      privateTestReply: '连接正常'
    });
    taskManager.parseCommandString = jest.fn(() => { throw new Error('invalid'); });
    await bridge.handleMessageEvent({
      post_type: 'message_sent', message_sent_type: 'self',
      message_type: 'private', user_id: 10001, raw_message: '连接正常'
    });
    expect(bridge.socket.sent).toHaveLength(0);
  });

  test('accepts a task from any private sender without an allowlist', async () => {
    // 不设 QQ 白名单：谁提交合法任务，任务就绑定给谁。
    const { bridge, taskManager } = makeBridge({ directCommandsEnabled: true });
    taskManager.parseCommandString = jest.fn().mockReturnValue({ platform: 'hc' });
    await bridge.handleMessageEvent({
      post_type: 'message', message_type: 'private', user_id: 99999,
      raw_message: '幻藏指定-13800000000-mima-paymima-藏品*1*100'
    });

    expect(taskManager.createTask).toHaveBeenCalledWith({
      commandString: '幻藏指定-13800000000-mima-paymima-藏品*1*100',
      qqUserId: '99999'
    });
  });

  test('no longer exposes /topbox run as a second task entry point', async () => {
    // 建任务只保留“私聊直接发中文格式”一条入口。
    const { bridge, taskManager } = makeBridge();
    await bridge.handleMessageEvent({
      post_type: 'message', message_type: 'private', user_id: 99999,
      raw_message: '/topbox run 幻藏指定-13800000000-mima-paymima-藏品*1*100'
    });
    expect(taskManager.createTask).not.toHaveBeenCalled();
    expect(bridge.socket.sent[0].params.message).toContain('未知指令');
  });

  test('does not react to messages without the command prefix', async () => {
    const { bridge } = makeBridge();
    await bridge.handleSocketMessage(Buffer.from(JSON.stringify({
      post_type: 'message', message_type: 'private', user_id: 10001,
      raw_message: 'hello'
    })));
    expect(bridge.socket.sent).toHaveLength(0);
  });

  test('does not respond to any group message, including prefixed commands', async () => {
    const { bridge } = makeBridge();
    await bridge.handleMessageEvent({
      post_type: 'message', message_type: 'group', user_id: 10001, group_id: 20001,
      raw_message: '/topbox ping'
    });
    expect(bridge.socket.sent).toHaveLength(0);
  });
});
