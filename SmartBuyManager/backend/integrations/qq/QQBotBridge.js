const EventEmitter = require('events');
const WebSocket = require('ws');
const { redactSensitive } = require('../../utils/redact');

class QQBotBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = options.config || {};
    this.taskManager = options.taskManager;
    this.WebSocket = options.WebSocket || WebSocket;
    this.socket = null;
    this.reconnectTimer = null;
    this.stopped = true;
    this.sequence = 0;
    this.pendingActions = new Map();
    // 重启善后的通知在 WebSocket 连上之前就产生了，此时 callAction 会直接
    // reject。先排队，等 connected 再补发；去重仍由 reserveNotification 保证，
    // 所以重连多次也不会重复发送。
    this.queuedNotifications = [];
    // QQ 号 -> 最近一次「获取任务」的编号映射。编号是临时序号，不是任务 ID
    // （任务 ID 太长，无法在手机上输入）。设时效，避免用旧列表停到新任务。
    this.taskSelections = new Map();
    this.taskSelectionTtlMs = Number(this.config.taskSelectionTtlMs ?? 5 * 60 * 1000);
    this.bindTaskEvents();
  }

  start() {
    if (!this.config.enabled || !this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  connect() {
    if (this.stopped) return;

    const headers = {};
    if (this.config.accessToken) {
      headers.Authorization = `Bearer ${this.config.accessToken}`;
    }

    this.socket = new this.WebSocket(this.config.websocketUrl, { headers });
    this.socket.on('open', () => {
      console.log(`QQ Bot 已连接 NapCat: ${this.config.websocketUrl}`);
      this.emit('connected');
      this.flushQueuedNotifications().catch(() => {});
    });
    this.socket.on('message', data => this.handleSocketMessage(data));
    this.socket.on('error', error => {
      console.error(`QQ Bot 连接错误: ${error.message}`);
    });
    this.socket.on('close', () => {
      this.socket = null;
      this.rejectPendingActions(new Error('NapCat WebSocket connection closed'));
      this.emit('disconnected');
      if (!this.stopped) {
        this.reconnectTimer = setTimeout(
          () => this.connect(),
          this.config.reconnectInterval || 5000
        );
      }
    });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.rejectPendingActions(new Error('QQ Bot bridge stopped'));

    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.removeAllListeners('close');
    socket.close();
  }

  getStatus() {
    return {
      enabled: Boolean(this.config.enabled),
      connected: this.socket?.readyState === this.WebSocket.OPEN,
      websocketUrl: this.config.websocketUrl,
      directCommandsEnabled: Boolean(this.config.directCommandsEnabled)
    };
  }

  async handleSocketMessage(data) {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch (error) {
      console.warn('QQ Bot 忽略无效 JSON 消息');
      return;
    }

    if (payload.echo && this.pendingActions.has(payload.echo)) {
      const pending = this.pendingActions.get(payload.echo);
      this.pendingActions.delete(payload.echo);
      clearTimeout(pending.timer);
      if (payload.status === 'failed') {
        pending.reject(new Error(payload.message || payload.wording || 'OneBot action failed'));
      } else {
        pending.resolve(payload.data);
      }
      return;
    }

    if (!['message', 'message_sent'].includes(payload.post_type) || payload.message_type === 'guild') {
      return;
    }
    await this.handleMessageEvent(payload);
  }

  // 群聊只用于单向发送公告（见 sendGroupMessage），不提供任何交互功能：
  // 群消息一律不解析、不建任务、不回复。机器人自己发出的消息（message_sent）
  // 同样忽略，否则公告和回执会触发自我循环。
  async handleMessageEvent(event) {
    if (event.post_type === 'message_sent' || event.message_type === 'group') return;
    const text = this.extractText(event).trim();
    const prefix = this.config.commandPrefix || '/topbox';
    const isPrefixedCommand = text === prefix || text.startsWith(`${prefix} `);

    if (!isPrefixedCommand) {
      await this.handleDirectTaskCommand(event, text);
      return;
    }

    const command = text.slice(prefix.length).trim();
    try {
      const reply = await this.executeCommand(event, command);
      await this.reply(event, reply);
    } catch (error) {
      console.error(`QQ Bot 指令处理失败: ${error.message}`);
      try {
        await this.reply(event, `执行失败：${error.message}`);
      } catch (replyError) {
        console.error(`QQ Bot 错误回复发送失败: ${replyError.message}`);
      }
    }
  }

  async handleDirectTaskCommand(event, commandString) {
    if (!this.config.directCommandsEnabled || event.message_type !== 'private') return;
    if (!commandString) return;
    if (commandString === '菜单') {
      await this.reply(event, this.getMenuText());
      return;
    }

    const userId = String(event.user_id || event.sender?.user_id || '');
    if (commandString === '获取任务') {
      await this.reply(event, await this.listRunningTasks(userId));
      return;
    }
    if (commandString.startsWith('停止任务-')) {
      await this.reply(
        event,
        await this.stopTaskBySelector(userId, commandString.slice('停止任务-'.length).trim())
      );
      return;
    }

    try {
      // Validate first so ordinary private messages are ignored instead of
      // creating failed tasks or receiving noisy error replies.
      this.taskManager.parseCommandString(commandString);
    } catch (error) {
      if (event.post_type === 'message' && this.config.privateTestReply) {
        await this.reply(event, this.config.privateTestReply);
      }
      return;
    }

    try {
      await this.taskManager.createTask({
        commandString,
        qqUserId: String(event.user_id || event.sender?.user_id || '')
      });
    } catch (error) {
      console.error('QQ Bot 任务创建失败（详情已隐藏）');
      await this.reply(event, '任务创建失败，请发送“菜单”检查格式');
    }
  }

  /**
   * 列出发起人自己的运行中任务，并记住本次编号。
   *
   * 编号是本次列表的临时序号而非数据库 ID——任务 ID 形如
   * `task_1786616673616_hc_list_845ni`，让用户在手机上打出来不现实。
   */
  async listRunningTasks(userId) {
    const tasks = await this.taskManager.getRunningTasksByOwner(userId);
    if (!tasks.length) {
      this.taskSelections.delete(userId);
      return '你当前没有运行中的任务';
    }

    // 记住编号到任务 ID 的映射，供随后的「停止任务-N」使用。
    this.taskSelections.set(userId, {
      ids: tasks.map((task) => task.id),
      createdAt: Date.now(),
    });

    const lines = tasks.map(
      (task, index) => `${index + 1}. ${this.describeTask(task)}`
    );
    return [
      `你的运行中任务（${tasks.length} 个）：`,
      ...lines,
      '',
      '停止：停止任务-1',
      '全部停止：停止任务-全部',
    ].join('\n');
  }

  /**
   * 按编号或「全部」停止任务。
   *
   * 必须先发「获取任务」拿到编号：这既是编号的来源，也相当于一道确认，
   * 避免手滑停错。编号有时效，防止用旧列表停到新任务上。
   */
  async stopTaskBySelector(userId, selector) {
    if (!selector) {
      return '请发送「停止任务-1」或「停止任务-全部」';
    }

    if (selector === '全部') {
      const tasks = await this.taskManager.getRunningTasksByOwner(userId);
      if (!tasks.length) return '你当前没有运行中的任务';

      const stopped = [];
      const failed = [];
      for (const task of tasks) {
        try {
          await this.taskManager.stopTask(task.id);
          stopped.push(this.describeTask(task));
        } catch (error) {
          failed.push(this.describeTask(task));
        }
      }
      this.taskSelections.delete(userId);

      const lines = [`已停止 ${stopped.length} 个任务：`, ...stopped];
      if (failed.length) lines.push(`${failed.length} 个停止失败，可稍后重试`);
      return lines.join('\n');
    }

    const index = Number(selector);
    if (!Number.isInteger(index) || index <= 0) {
      return '编号必须是正整数，例如「停止任务-1」';
    }

    const selection = this.taskSelections.get(userId);
    if (!selection) {
      return '请先发送「获取任务」查看当前列表';
    }
    if (Date.now() - selection.createdAt > this.taskSelectionTtlMs) {
      this.taskSelections.delete(userId);
      return '编号已过期，请重新发送「获取任务」';
    }

    const taskId = selection.ids[index - 1];
    if (!taskId) {
      return `编号 ${index} 不存在，请发送「获取任务」查看当前列表`;
    }

    // 再次校验归属：列表是之前生成的，期间任务可能已结束或易主。
    const task = await this.taskManager.getOwnedTask(taskId, userId);
    if (!task) {
      return '该任务已不存在，请重新发送「获取任务」';
    }
    if (task.status !== 'running') {
      return `该任务已${task.status === 'completed' ? '完成' : '结束'}，无需停止`;
    }

    try {
      await this.taskManager.stopTask(taskId);
      return `已停止：${this.describeTask(task)}`;
    } catch (error) {
      console.error(`QQ Bot 停止任务失败: task=${taskId}`);
      return '停止失败，请稍后重试';
    }
  }

  /**
   * 生成任务的一行描述。数据取自已脱敏的 config，不含米玛与完整手机号。
   * @private
   */
  describeTask(task) {
    const config = this.parseTaskConfig(task.config);
    const label = this.getTaskLabel(task);
    const product = config.productConfig?.name || config.productId || '';

    const parts = [label, product].filter(Boolean);

    if (task.task_type === 'smart-buy') {
      if (config.maxPrice) parts.push(`≤${config.maxPrice}`);
      const progress = this.parseTaskConfig(task.progress);
      const completed = Number(progress.completed || 0);
      const total = Number(progress.total || config.quantity || 0);
      if (total) parts.push(`已购 ${completed}/${total}`);
    } else if (task.task_type === 'listing') {
      if (config.quantity) parts.push(`×${config.quantity}`);
      if (config.amount) parts.push(`@${config.amount}`);
    }

    return parts.join(' ');
  }

  /** 把内部任务类型译成菜单里的中文别名。 @private */
  getTaskLabel(task) {
    const labels = {
      'smart-buy': { list: '幻藏指定', quick: '幻藏自助', batch: '幻藏批量' },
      combination: '幻藏合成',
      'trade-history': '幻藏成交',
      'cancel-resale': '幻藏取消',
      listing: '幻藏上架',
    };
    const entry = labels[task.task_type];
    if (!entry) return task.task_type || '任务';
    return typeof entry === 'string' ? entry : (entry[task.mode] || '幻藏任务');
  }

  /** config/progress 在库里是 JSON 字符串，内存缓存里可能已是对象。 @private */
  parseTaskConfig(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch (_) {
      return {};
    }
  }

  extractText(event) {
    if (typeof event.raw_message === 'string') return event.raw_message;
    if (typeof event.message === 'string') return event.message;
    if (!Array.isArray(event.message)) return '';
    return event.message
      .filter(segment => segment.type === 'text')
      .map(segment => segment.data?.text || '')
      .join('');
  }

  async executeCommand(event, command) {
    if (!command || command === 'help') {
      return '可用指令：/topbox ping、/topbox status。提交任务请直接私聊发送任务格式，发送“菜单”查看格式。';
    }
    if (command === 'ping') return 'pong';
    if (command === 'status') {
      const stats = await this.taskManager.getTaskStats();
      return `TopBox 正常｜运行中 ${stats.runningCount}/${stats.maxConcurrent}｜近7天任务 ${stats.total}`;
    }
    // 建任务只保留“私聊直接发中文格式”一条入口。原先的 /topbox run 是第二条
    // 入口，且挂着一套白名单校验（与当前完全开放的策略矛盾），一并移除，
    // 避免两条入口的校验规则各自演化后出现漏检。
    throw new Error('未知指令，请发送 /topbox help');
  }

  getMenuText() {
    return [
      '当前支持的任务格式：',
      '',
      '幻藏指定-账号-米玛-支付米玛-藏品*数量*价格',
      '幻藏自助-账号-米玛-支付米玛-藏品*数量*价格',
      '幻藏批量-账号-米玛-支付米玛-藏品*数量*价格',
      '幻藏合成-账号-米玛-合成名称',
      '幻藏成交-账号-米玛-藏品名称',
      '幻藏取消-账号-米玛-支付米玛-藏品名称',
      '幻藏上架-账号-米玛-支付米玛-藏品*数量*价格',
      '',
      '查看运行中任务：获取任务',
      '停止指定任务：停止任务-1',
      '停止全部任务：停止任务-全部',
      '',
      '仅支持 QQ 私聊提交任务。'
    ].join('\n');
  }

  bindTaskEvents() {
    if (!this.taskManager?.on) return;
    this.taskManager.on('taskLog', (event) => {
      this.handleTaskLog(event).catch(() => {});
    });
    this.taskManager.on('taskProgress', (event) => {
      this.handleTaskProgress(event).catch(() => {});
    });
    this.taskManager.on('taskStatusUpdated', (event) => {
      this.handleTaskStatusUpdated(event).catch(() => {});
    });
  }

  /**
   * 任务失败时通知发起人。
   *
   * 受理阶段刻意不回执（登录可能失败，提前说“已受理”会给出错误结论），
   * 因此失败必须有出口，否则用户发完指令会一直等一条永不到来的成功回执。
   */
  async handleTaskStatusUpdated(event) {
    if (event?.status !== 'failed') return;
    const task = await this.taskManager.getTask(event.id);
    if (!task?.qq_user_id) return;
    const reason = this.describeFailure(event.error_message || task.error_message);
    await this.sendTaskNotification(task, 'task-failed', `任务失败：${reason}`);
  }

  /**
   * 把内部错误转成用户能看懂的原因，并确保绝不回显凭据。
   * @private
   */
  describeFailure(errorMessage) {
    const raw = String(errorMessage || '');
    if (!raw) return '未知原因，请稍后重试';

    const knownReasons = [
      [/支付米玛|支付密码|pay.?password/i, '支付米玛不正确'],
      // “密码不正确”是平台登录接口的原文，必须能识别，否则会落到兜底文案。
      [/登录失败|认证失败|密码不正确|密码错误|账号或密码|LOGIN_FAILED/i, '账号或米玛不正确'],
      [/Token验证失败|token.*(过期|失效)/i, '登录凭据已失效，请重新提交'],
      [/库存不足|可上架库存/, '可用库存不足'],
      [/风控|拦截|forbidden|blocked/i, '平台风控拦截，请稍后再试'],
      [/timeout|超时/i, '请求超时，请稍后重试'],
      [/进程退出码/, '任务异常结束，请稍后重试'],
    ];
    for (const [pattern, text] of knownReasons) {
      if (pattern.test(raw)) return text;
    }
    // 兜底也要过脱敏，原始错误可能带手机号或凭据片段。
    return redactSensitive(raw).slice(0, 120);
  }

  /**
   * 告知发起人任务因服务重启而中断。执行凭据从不落盘，无法自动恢复，
   * 只能请用户重新提交。
   * @param {Array<{id: string, qq_user_id: string}>} tasks
   */
  async notifyInterruptedTasks(tasks = []) {
    // 未启用 QQ 集成时直接跳过：否则 reserveNotification 会把事件记为已发送，
    // 之后真正启用也不会再补发。
    if (!this.config.enabled) return;
    for (const task of tasks) {
      await this.sendTaskNotification(
        task,
        'task-interrupted',
        '服务重启，任务已中断，请重新提交'
      );
    }
  }

  /** 一条日志可能同时命中多个分类，任一命中即视为该事件发生。 */
  hasCategory(event, name) {
    if (Array.isArray(event.categories) && event.categories.includes(name)) return true;
    return event.category === name;
  }

  async handleTaskLog(event) {
    const task = await this.taskManager.getTask(event.taskId);
    if (!task?.qq_user_id) return;
    let eventKey;
    let message;
    if (this.hasCategory(event, 'LOGIN_SUCCESS')) {
      // 成交查询是只读的，紧接着就会返回记录本身，再发一条登录回执只是噪音。
      // 失败通知仍然保留（见 handleTaskStatusUpdated），否则查询失败就没有出口。
      if (task.task_type === 'trade-history') return;
      eventKey = 'login-success';
      message = '登录成功，任务已启动';
    } else if (this.hasCategory(event, 'TASK_RESULT')) {
      const result = event.data?.result;
      if (task.task_type === 'combination' && result) {
        eventKey = 'combination-success'; message = '合成成功';
      } else if (task.task_type === 'cancel-resale' && result) {
        eventKey = 'cancel-success'; message = '取消成功';
      } else if (task.task_type === 'listing' && result) {
        eventKey = 'listing-result';
        message = this.formatListingResult(result);
      } else if (task.task_type === 'trade-history' && Array.isArray(result?.trades)) {
        eventKey = 'trade-history-result';
        message = this.formatTradeHistory(result);
      }
    }
    if (!eventKey || !message) return;
    await this.sendTaskNotification(task, eventKey, message);
  }

  /**
   * 组织成交记录文案。加表头说明每列含义（首列是藏品编号，不是订单号或价格），
   * 时间用上海本地时间，平台返回的 UTC 时间不直接展示。
   * @private
   */
  formatTradeHistory(result) {
    const trades = Array.isArray(result.trades) ? result.trades : [];
    if (!trades.length) return '最近成交记录：暂无记录';

    const shown = trades.slice(0, 20);
    const rows = shown.map((trade) =>
      `${trade.serialNumber || '-'}｜${trade.price}｜${trade.localTime || trade.time || '-'}`
    );
    const header = `最近成交记录（${trades.length} 条`
      + `${trades.length > shown.length ? `，显示前 ${shown.length} 条` : ''}）：`;
    return [header, '编号｜价格｜成交时间', ...rows].join('\n');
  }

  /**
   * 组织上架结果文案。库存不足时按“有几个上几个”执行，因此需要明确告知实际
   * 上架了多少、少上的原因是库存不够还是中途中止。
   * @private
   */
  formatListingResult(result) {
    const requested = Number(result.requestedCount || 0);
    const available = Number(result.availableCount ?? requested);
    const success = Number(result.successCount || 0);
    const failure = Number(result.failureCount || 0);

    const lines = [`上架完成：成功 ${success}，失败 ${failure}`];
    if (available < requested) {
      lines.push(`可上架库存 ${available}，少于请求的 ${requested}`);
    }
    if (result.aborted) {
      lines.push('已提前中止，剩余未尝试');
    }
    return lines.join('\n');
  }

  async handleTaskProgress(event) {
    const completed = Number(event.progress?.completed || 0);
    if (completed <= 0) return;
    const task = await this.taskManager.getTask(event.taskId);
    if (!task?.qq_user_id || task.task_type !== 'smart-buy') return;
    const total = Number(event.progress?.total || 0);
    await this.sendTaskNotification(
      task,
      `purchase-progress:${completed}`,
      `支付成功，已购数量：${completed}${total ? `/${total}` : ''}`
    );
  }

  /**
   * 发送任务通知。reserveNotification 保证同一任务的同一事件只发一次，
   * 重连或重复日志都不会造成重复通知。
   *
   * 通知失败一律只记日志，绝不向上抛：购买、合成、取消、上架都不能因为一条
   * QQ 消息发不出去而中断。
   */
  async sendTaskNotification(task, eventKey, message) {
    if (!await this.taskManager.reserveNotification(task.id, eventKey)) return;

    // 尚未连上 NapCat（典型场景：启动时的重启善后通知）时先入队，
    // connected 后统一补发。
    if (this.socket?.readyState !== this.WebSocket.OPEN) {
      this.queuedNotifications.push({ userId: task.qq_user_id, message });
      return;
    }

    try {
      await this.sendPrivateMessage(task.qq_user_id, message);
    } catch (error) {
      console.error(`QQ Bot 任务通知发送失败: task=${task.id}, event=${eventKey}`);
    }
  }

  /** 连接就绪后补发排队的通知。 */
  async flushQueuedNotifications() {
    const queued = this.queuedNotifications;
    this.queuedNotifications = [];
    for (const item of queued) {
      try {
        await this.sendPrivateMessage(item.userId, item.message);
      } catch (error) {
        console.error('QQ Bot 排队通知发送失败');
      }
    }
  }

  // 只回私聊。群聊没有任何交互入口，公告走单向的 sendGroupMessage。
  reply(event, message) {
    return this.callAction('send_private_msg', {
      user_id: event.user_id,
      message
    });
  }

  sendGroupMessage(groupId, message) {
    return this.callAction('send_group_msg', {
      group_id: Number(groupId),
      message
    });
  }

  sendPrivateMessage(userId, message) {
    return this.callAction('send_private_msg', {
      user_id: Number(userId),
      message
    });
  }

  callAction(action, params = {}) {
    if (!this.socket || this.socket.readyState !== this.WebSocket.OPEN) {
      return Promise.reject(new Error('NapCat 尚未连接'));
    }

    const echo = `topbox-${Date.now()}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingActions.delete(echo);
        reject(new Error(`OneBot action timeout: ${action}`));
      }, this.config.actionTimeout || 10000);

      this.pendingActions.set(echo, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ action, params, echo }), error => {
        if (!error) return;
        clearTimeout(timer);
        this.pendingActions.delete(echo);
        reject(error);
      });
    });
  }

  rejectPendingActions(error) {
    for (const pending of this.pendingActions.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingActions.clear();
  }
}

module.exports = QQBotBridge;
