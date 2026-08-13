const fs = require('fs');
const os = require('os');
const path = require('path');

// 必须在 require config 之前指向临时库，避免测试写到真实数据库。
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'topbox-taskmanager-'));
process.env.DB_PATH = path.join(tempDir, 'test.db');

const DatabaseInitializer = require('../../database/init');
const database = require('../../database/Database');
const TaskManager = require('./TaskManager');
const ProductConfigManager = require(`${require('../../config/config').framework.path}/config/ProductConfigManager`);

const ACCOUNT = '13800001111';
const MIMA = 'mima8888';
const PAY_MIMA = 'pay6666';
const BUY_COMMAND = `幻藏指定-${ACCOUNT}-${MIMA}-${PAY_MIMA}-测试藏品*2*100`;
const OWNER_QQ = '10001';
const OTHER_QQ = '20002';

let manager;

beforeAll(async () => {
  await new DatabaseInitializer().initialize();
  await database.connect();
  await database.ensureTaskOwnershipSchema();
  // 与线上启动顺序一致。
  await ProductConfigManager.initialize();
});

afterAll(async () => {
  await database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await database.run('DELETE FROM task_notifications');
  await database.run('DELETE FROM tasks');
  manager = new TaskManager();
  // 不真的 spawn 子进程。
  manager.taskExecutor.executeTask = jest.fn().mockResolvedValue(undefined);
  manager.taskExecutor.stopTask = jest.fn().mockResolvedValue(undefined);
});

describe('任务与发起人绑定', () => {
  test('私聊任务保存发送者 QQ', async () => {
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });

    const row = await database.queryOne('SELECT qq_user_id FROM tasks WHERE id = ?', [task.id]);
    expect(row.qq_user_id).toBe(OWNER_QQ);
  });

  test('归属关系落库，重启后仍可查到', async () => {
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });

    // 新实例代表新进程：内存缓存为空，仍应从库里读到归属。
    const freshManager = new TaskManager();
    const reloaded = await freshManager.getTask(task.id);
    expect(reloaded.qq_user_id).toBe(OWNER_QQ);
  });

  test('不能查询别人的任务', async () => {
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });

    await expect(manager.getOwnedTask(task.id, OWNER_QQ)).resolves.toMatchObject({ id: task.id });
    await expect(manager.getOwnedTask(task.id, OTHER_QQ)).resolves.toBeUndefined();
  });
});

describe('敏感信息不落库', () => {
  test('command_string 只保留指令类型', async () => {
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });

    const row = await database.queryOne(
      'SELECT command_string, config FROM tasks WHERE id = ?', [task.id]
    );
    expect(row.command_string).toBe('幻藏指定-[已脱敏]');
    expect(row.command_string).not.toContain(MIMA);
    expect(row.command_string).not.toContain(PAY_MIMA);
  });

  test('config 不含米玛、支付米玛与 token，手机号脱敏', async () => {
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });

    const row = await database.queryOne('SELECT config FROM tasks WHERE id = ?', [task.id]);
    const config = JSON.parse(row.config);

    expect(config).not.toHaveProperty('password');
    expect(config).not.toHaveProperty('payPassword');
    expect(config).not.toHaveProperty('token');
    expect(config).not.toHaveProperty('auth');
    expect(config.account).toBe('138****1111');
  });

  test('整库扫描不出现任何明文凭据', async () => {
    await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });
    await manager.createTask({
      commandString: `幻藏上架-${ACCOUNT}-${MIMA}-${PAY_MIMA}-测试藏品*1*50`,
      qqUserId: OWNER_QQ
    });

    const rows = await database.query('SELECT * FROM tasks');
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(MIMA);
    expect(dump).not.toContain(PAY_MIMA);
    expect(dump).not.toContain(ACCOUNT);
  });

  test('执行凭据只在内存中，不写入数据库', async () => {
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });

    // 内存里保留完整指令供子进程执行。
    expect(manager.executionCommands.get(task.id)).toBe(BUY_COMMAND);
    const columns = await database.query('PRAGMA table_info(tasks)');
    expect(columns.map((column) => column.name)).not.toContain('command_string_plain');
  });
});

describe('通知去重', () => {
  test('同一任务同一事件只能预约一次', async () => {
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });

    await expect(manager.reserveNotification(task.id, 'login-success')).resolves.toBe(true);
    await expect(manager.reserveNotification(task.id, 'login-success')).resolves.toBe(false);
    // 不同事件互不影响。
    await expect(manager.reserveNotification(task.id, 'purchase-progress:1')).resolves.toBe(true);
  });

  test('删除任务时一并清理去重记录', async () => {
    // sqlite3 默认不开外键，ON DELETE CASCADE 不生效，需要显式清理。
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });
    await manager.reserveNotification(task.id, 'login-success');

    await manager.deleteTask(task.id);

    const left = await database.query(
      'SELECT * FROM task_notifications WHERE task_id = ?', [task.id]
    );
    expect(left).toHaveLength(0);
  });
});

describe('并发计数', () => {
  test('重复释放同一任务不会让计数变负', async () => {
    // 收尾路径有多条（进程退出事件、executeTask 的 reject、手动停止），
    // 早期用裸计数器会重复减一，导致部署门禁看到的 runningCount 失真。
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });
    expect(manager.runningTaskIds.has(task.id)).toBe(true);

    await manager.handleTaskStatusChange(task.id, 'failed', { error_message: 'boom' });
    await manager.handleTaskError(task.id, new Error('boom'));
    manager.releaseSlot(task.id);

    const stats = await manager.getTaskStats();
    expect(stats.runningCount).toBe(0);
    expect(stats.runningCount).toBeGreaterThanOrEqual(0);
  });

  test('任务失败不会因字段名而抛错', async () => {
    // handleTaskError 传的是 camelCase；早期实现直接拿 key 拼列名，会抛
    // SQLITE_ERROR 并冒泡成 unhandledRejection，进而杀掉整个 Manager 进程。
    const task = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });

    await expect(manager.handleTaskError(task.id, new Error('执行失败')))
      .resolves.toBeUndefined();

    const row = await database.queryOne(
      'SELECT status, error_message, completed_at FROM tasks WHERE id = ?', [task.id]
    );
    expect(row.status).toBe('failed');
    expect(row.error_message).toBe('执行失败');
    expect(row.completed_at).toBeTruthy();
  });

  test('丢弃未知字段而不是拼进 SQL', () => {
    expect(manager.normalizeTaskFields({ errorMessage: 'x', bogusField: 1 }))
      .toEqual({ error_message: 'x' });
  });
});

describe('重启善后', () => {
  test('running 与 pending 任务统一标成 interrupted', async () => {
    const running = await manager.createTask({ commandString: BUY_COMMAND, qqUserId: OWNER_QQ });
    // 直接造一条 pending，模拟排队中未启动的任务。
    await database.run(
      `INSERT INTO tasks (id, command_string, platform, task_type, status, qq_user_id, created_at, updated_at)
       VALUES (?, ?, 'hc', 'smart-buy', 'pending', ?, ?, ?)`,
      ['task-pending', '幻藏指定-[已脱敏]', OTHER_QQ, new Date().toISOString(), new Date().toISOString()]
    );

    const freshManager = new TaskManager();
    const notifiable = await freshManager.recoverInterruptedTasks();

    const rows = await database.query('SELECT id, status, error_message FROM tasks ORDER BY id');
    expect(rows.every((row) => row.status === 'interrupted')).toBe(true);
    expect(rows[0].error_message).toBe('服务重启，任务已中断');

    const ids = notifiable.map((task) => task.id).sort();
    expect(ids).toEqual([running.id, 'task-pending'].sort());
  });

  test('只返回绑定了 QQ 的任务用于通知', async () => {
    await database.run(
      `INSERT INTO tasks (id, command_string, platform, task_type, status, qq_user_id, created_at, updated_at)
       VALUES (?, ?, 'hc', 'smart-buy', 'running', NULL, ?, ?)`,
      ['task-no-qq', '幻藏指定-[已脱敏]', new Date().toISOString(), new Date().toISOString()]
    );

    const notifiable = await new TaskManager().recoverInterruptedTasks();
    expect(notifiable).toHaveLength(0);

    // 状态仍然要被清理，避免库里留下永久 running 的僵尸任务。
    const row = await database.queryOne('SELECT status FROM tasks WHERE id = ?', ['task-no-qq']);
    expect(row.status).toBe('interrupted');
  });

  test('内存态从零开始，不沿用上个进程的计数', async () => {
    const freshManager = new TaskManager();
    await freshManager.recoverInterruptedTasks();

    expect(freshManager.runningTaskIds.size).toBe(0);
    expect(freshManager.executionCommands.size).toBe(0);
    const stats = await freshManager.getTaskStats();
    expect(stats.runningCount).toBe(0);
  });

  test('没有残留任务时不报错', async () => {
    await expect(new TaskManager().recoverInterruptedTasks()).resolves.toEqual([]);
  });
});

describe('群聊任务', () => {
  test('Manager 不关心来源，群聊拦截由 QQ 桥接负责', async () => {
    // 这里只确认不带 qqUserId 时归属为 null，桥接层已在群聊消息上直接返回。
    const task = await manager.createTask({ commandString: BUY_COMMAND });
    const row = await database.queryOne('SELECT qq_user_id FROM tasks WHERE id = ?', [task.id]);
    expect(row.qq_user_id).toBeNull();
  });
});
