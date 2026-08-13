/**
 * 任务管理器 - 核心任务管理功能
 */

const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const EventEmitter = require('events');
const database = require('../../database/Database');
const TaskExecutor = require('./TaskExecutor');
const config = require('../../config/config');
const { sanitizeCommandString, redactSensitive } = require('../../utils/redact');

class TaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map(); // 内存中的任务状态
    this.taskExecutor = new TaskExecutor();
    this.maxConcurrent = config.tasks.maxConcurrent;
    // 并发占用以任务ID集合为准，而不是一个裸计数器。裸计数器会被多条收尾路径
    // 重复减一（executeTask 失败时既 emit taskStatusChanged 又 throw；stopTask
    // 自己减一后子进程退出又会 emit 'stopped'），最终变成负数，让
    // getTaskStats().runningCount 失真——而部署门禁正是看这个数字。
    this.runningTaskIds = new Set();
    this.executionCommands = new Map();
    
    // 绑定事件监听
    this.taskExecutor.on('taskStatusChanged', this.handleTaskStatusChange.bind(this));
    this.taskExecutor.on('taskLog', this.handleTaskLog.bind(this));
    this.taskExecutor.on('taskProgress', this.handleTaskProgress.bind(this));
  }

  /**
   * 创建新任务
   * @param {Object} taskData - 任务数据
   * @param {string} taskData.commandString - 命令字符串
   * @param {string} taskData.description - 任务描述（可选）
   * @param {number} taskData.priority - 任务优先级（可选，默认1）
   */
  async createTask(taskData) {
    try {
      // 解析命令字符串
      const parsedCommand = this.parseCommandString(taskData.commandString);
      
      // 生成任务ID
      const taskId = this.generateTaskId(parsedCommand.platform, parsedCommand.mode);
      
      // 构建任务对象
      const task = {
        id: taskId,
        command_string: this.sanitizeCommandString(taskData.commandString),
        qq_user_id: taskData.qqUserId ? String(taskData.qqUserId) : null,
        platform: parsedCommand.platform,
        task_type: parsedCommand.taskType,
        mode: parsedCommand.mode,
        status: 'pending',
        priority: taskData.priority || 1,
        config: JSON.stringify(this.sanitizeTaskConfig(parsedCommand.config)),
        progress: JSON.stringify({ completed: 0, total: parsedCommand.config.quantity || 1 }),
        error_message: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        updated_at: new Date().toISOString()
      };

      // 保存到数据库
      await database.run(`
        INSERT INTO tasks (
          id, command_string, platform, task_type, mode, status, priority, 
          config, progress, error_message, created_at, updated_at, qq_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        task.id, task.command_string, task.platform, task.task_type, task.mode,
        task.status, task.priority, task.config, task.progress, task.error_message,
        task.created_at, task.updated_at, task.qq_user_id
      ]);

      this.executionCommands.set(taskId, taskData.commandString);

      // 保存到内存
      this.tasks.set(taskId, task);

      console.log(`✅ 任务创建成功: ${taskId} (${task.platform} ${task.mode}模式)`);
      
      // 发送事件
      this.emit('taskCreated', task);

      // 自动启动任务（如果未达到并发限制）
      if (this.runningTaskIds.size < this.maxConcurrent) {
        await this.startTask(taskId);
      }

      return task;
    } catch (error) {
      console.error('❌ 创建任务失败:', error);
      throw error;
    }
  }

  /**
   * 启动任务
   * @param {string} taskId - 任务ID
   */
  async startTask(taskId) {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      if (task.status !== 'pending') {
        throw new Error(`任务状态不允许启动: ${task.status}`);
      }

      if (this.runningTaskIds.size >= this.maxConcurrent) {
        console.log(`⏳ 任务 ${taskId} 等待执行（当前并发: ${this.runningTaskIds.size}/${this.maxConcurrent}）`);
        return;
      }

      // 更新任务状态
      await this.updateTaskStatus(taskId, 'running', {
        started_at: new Date().toISOString()
      });

      this.runningTaskIds.add(taskId);
      console.log(`🚀 启动任务: ${taskId} (${task.platform} ${task.mode}模式)`);

      // 异步执行任务
      const executionCommand = this.executionCommands.get(taskId);
      if (!executionCommand) throw new Error('任务执行凭据已不可用，请重新提交任务');
      this.taskExecutor.executeTask(taskId, executionCommand)
        .catch(error => {
          console.error(`❌ 任务执行失败: ${taskId}`, error);
          this.handleTaskError(taskId, error);
        });

    } catch (error) {
      console.error(`❌ 启动任务失败: ${taskId}`, error);
      await this.updateTaskStatus(taskId, 'failed', {
        error_message: error.message,
        completed_at: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * 停止任务
   * @param {string} taskId - 任务ID
   */
  async stopTask(taskId) {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      if (task.status !== 'running') {
        throw new Error(`任务状态不允许停止: ${task.status}`);
      }

      console.log(`🛑 停止任务: ${taskId}`);
      
      // 停止任务执行
      await this.taskExecutor.stopTask(taskId);
      
      // 更新任务状态
      await this.updateTaskStatus(taskId, 'stopped', {
        completed_at: new Date().toISOString()
      });

      this.releaseSlot(taskId);

      // 尝试启动下一个等待的任务
      await this.startNextPendingTask();

    } catch (error) {
      console.error(`❌ 停止任务失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 获取任务列表
   * @param {Object} filters - 过滤条件
   * @param {number} page - 页码
   * @param {number} limit - 每页数量
   */
  async getTasks(filters = {}, page = 1, limit = 20) {
    try {
      let whereClause = '';
      const params = [];
      
      // 构建WHERE条件
      const conditions = [];
      
      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }
      
      if (filters.platform) {
        conditions.push('platform = ?');
        params.push(filters.platform);
      }
      
      if (filters.taskType) {
        conditions.push('task_type = ?');
        params.push(filters.taskType);
      }
      
      if (filters.dateFrom) {
        conditions.push('created_at >= ?');
        params.push(filters.dateFrom);
      }
      
      if (filters.dateTo) {
        conditions.push('created_at <= ?');
        params.push(filters.dateTo);
      }

      if (conditions.length > 0) {
        whereClause = ' WHERE ' + conditions.join(' AND ');
      }

      // 获取总数
      const totalCount = await database.getCount('tasks', whereClause.replace(' WHERE ', ''), params);
      
      // 获取分页数据
      const offset = (page - 1) * limit;
      const tasks = await database.query(`
        SELECT * FROM tasks 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      return {
        tasks,
        pagination: {
          page,
          limit,
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      };
    } catch (error) {
      console.error('❌ 获取任务列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个任务详情
   * @param {string} taskId - 任务ID
   */
  async getTask(taskId) {
    try {
      // 先从内存获取
      if (this.tasks.has(taskId)) {
        return this.tasks.get(taskId);
      }

      // 从数据库获取
      const task = await database.queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
      
      if (task) {
        // 解析JSON字段
        if (task.config) {
          task.config = JSON.parse(task.config);
        }
        if (task.progress) {
          task.progress = JSON.parse(task.progress);
        }
        
        // 缓存到内存
        this.tasks.set(taskId, task);
      }

      return task;
    } catch (error) {
      console.error(`❌ 获取任务失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 删除任务
   * @param {string} taskId - 任务ID
   */
  async deleteTask(taskId) {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      // 如果任务正在运行，先停止
      if (task.status === 'running') {
        await this.stopTask(taskId);
      }

      // 从数据库删除。sqlite3 默认不开启外键约束，task_notifications 上的
      // ON DELETE CASCADE 不会生效，这里显式清理去重记录。
      await database.run('DELETE FROM task_notifications WHERE task_id = ?', [taskId]);
      await database.run('DELETE FROM tasks WHERE id = ?', [taskId]);
      
      // 从内存删除
      this.tasks.delete(taskId);

      console.log(`🗑️ 任务删除成功: ${taskId}`);
      this.emit('taskDeleted', { id: taskId });

    } catch (error) {
      console.error(`❌ 删除任务失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 获取任务统计信息
   */
  async getTaskStats() {
    try {
      const stats = await database.query(`
        SELECT 
          status,
          platform,
          COUNT(*) as count
        FROM tasks 
        WHERE created_at >= date('now', '-7 days')
        GROUP BY status, platform
      `);

      const summary = {
        total: 0,
        byStatus: {},
        byPlatform: {},
        runningCount: this.runningTaskIds.size,
        maxConcurrent: this.maxConcurrent
      };

      stats.forEach(stat => {
        summary.total += stat.count;
        
        if (!summary.byStatus[stat.status]) {
          summary.byStatus[stat.status] = 0;
        }
        summary.byStatus[stat.status] += stat.count;
        
        if (!summary.byPlatform[stat.platform]) {
          summary.byPlatform[stat.platform] = 0;
        }
        summary.byPlatform[stat.platform] += stat.count;
      });

      return summary;
    } catch (error) {
      console.error('❌ 获取任务统计失败:', error);
      throw error;
    }
  }

  /**
   * 处理任务状态变化
   * @private
   */
  async handleTaskStatusChange(taskId, status, data = {}) {
    try {
      // 字段名归一由 updateTaskStatus 统一处理。
      await this.updateTaskStatus(taskId, status, data);
      
      if (status === 'completed' || status === 'failed' || status === 'stopped') {
        this.executionCommands.delete(taskId);
        this.releaseSlot(taskId);
        // 尝试启动下一个等待的任务
        await this.startNextPendingTask();
      }
    } catch (error) {
      console.error(`❌ 处理任务状态变化失败: ${taskId}`, error);
    }
  }

  /**
   * 处理任务日志
   * @private
   */
  handleTaskLog(taskId, logData) {
    this.emit('taskLog', { taskId, ...logData });
  }

  async handleTaskProgress(taskId, progress) {
    try {
      const serializedProgress = JSON.stringify(progress);
      const updatedAt = new Date().toISOString();
      await database.run(
        'UPDATE tasks SET progress = ?, updated_at = ? WHERE id = ?',
        [serializedProgress, updatedAt, taskId]
      );

      if (this.tasks.has(taskId)) {
        Object.assign(this.tasks.get(taskId), {
          progress,
          updated_at: updatedAt
        });
      }

      this.emit('taskProgress', { taskId, progress });
    } catch (error) {
      console.error(`❌ 更新任务进度失败: ${taskId}`, error);
    }
  }

  /**
   * 处理任务错误
   * @private
   */
  async handleTaskError(taskId, error) {
    await this.updateTaskStatus(taskId, 'failed', {
      errorMessage: error.message,
      completedAt: new Date().toISOString()
    });
    this.releaseSlot(taskId);
    await this.startNextPendingTask();
  }

  /**
   * 更新任务状态
   * @private
   */
  async updateTaskStatus(taskId, status, additionalData = {}) {
    try {
      const updateFields = {
        status,
        updated_at: new Date().toISOString(),
        ...this.normalizeTaskFields(additionalData)
      };

      // 构建SQL更新语句
      const fields = Object.keys(updateFields);
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => updateFields[field]);
      values.push(taskId);

      await database.run(`UPDATE tasks SET ${setClause} WHERE id = ?`, values);

      // 更新内存中的任务
      if (this.tasks.has(taskId)) {
        const task = this.tasks.get(taskId);
        Object.assign(task, updateFields);
      }

      console.log(`📝 任务状态更新: ${taskId} -> ${status}`);
      // 用归一后的字段广播，订阅方（如 QQ 通知）只需认识真实列名。
      this.emit('taskStatusUpdated', { id: taskId, ...updateFields });

    } catch (error) {
      console.error(`❌ 更新任务状态失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 把调用方可能传入的 camelCase 字段名归一成真实列名，并丢弃未知字段。
   *
   * updateTaskStatus 直接用 key 拼 SQL 列名，一个 camelCase 键（如
   * errorMessage）会让语句变成 "SET errorMessage = ?" 而直接抛
   * SQLITE_ERROR；该异常沿 handleTaskError 冒泡成 unhandledRejection，
   * 进而触发 process.exit —— 一个任务失败会连带杀掉整个 Manager。
   * @private
   */
  normalizeTaskFields(data = {}) {
    const columnAliases = {
      errorMessage: 'error_message',
      completedAt: 'completed_at',
      startedAt: 'started_at',
      updatedAt: 'updated_at',
      qqUserId: 'qq_user_id'
    };
    const allowedColumns = new Set([
      'status', 'error_message', 'completed_at', 'started_at',
      'updated_at', 'progress', 'priority', 'qq_user_id'
    ]);

    const normalized = {};
    for (const [key, value] of Object.entries(data)) {
      const column = columnAliases[key] || key;
      if (!allowedColumns.has(column)) {
        console.warn(`⚠️ 忽略未知任务字段: ${key}`);
        continue;
      }
      normalized[column] = value;
    }
    return normalized;
  }

  /**
   * 启动下一个等待中的任务
   * @private
   */
  async startNextPendingTask() {
    if (this.runningTaskIds.size >= this.maxConcurrent) {
      return;
    }

    try {
      const pendingTask = await database.queryOne(`
        SELECT id FROM tasks 
        WHERE status = 'pending' 
        ORDER BY priority DESC, created_at ASC 
        LIMIT 1
      `);

      if (pendingTask) {
        await this.startTask(pendingTask.id);
      }
    } catch (error) {
      console.error('❌ 启动下一个任务失败:', error);
    }
  }

  /**
   * 解析命令字符串
   * @private
   */
  parseCommandString(commandString) {
    // Use the framework parser as the single source of truth so Manager stays
    // aligned with every registered platform and token/password command form.
    const CommandParser = require(`${config.framework.path}/core/CommandParser`);
    const parsedCommand = CommandParser.parse(commandString);
    const taskParams = parsedCommand.params;

    return {
      platform: parsedCommand.platform,
      mode: parsedCommand.mode || null,
      taskType: parsedCommand.task,
      config: {
        ...taskParams,
        // Keep the old Manager field for callers that still display `auth`.
        auth: taskParams.token || taskParams.password,
      }
    };
  }

  sanitizeCommandString(commandString) {
    return sanitizeCommandString(commandString);
  }

  sanitizeTaskConfig(taskConfig = {}) {
    const safe = { ...taskConfig };
    for (const key of ['password', 'payPassword', 'token', 'auth']) delete safe[key];
    if (safe.account) safe.account = this.maskAccount(safe.account);
    return safe;
  }

  maskAccount(account) {
    const value = String(account || '');
    return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : '***';
  }

  /**
   * 启动时清理上一个进程残留的任务。
   *
   * 执行凭据（含米玛）只存在内存里，从不落盘，因此进程一旦退出，running /
   * pending 的任务就无法恢复执行。若放着不动，DB 里会永久挂着 running 的僵尸
   * 任务，并发计数与真实状态也会脱节。这里统一标成 interrupted 并返回需要通
   * 知的任务，由调用方在 QQ 连接就绪后告知发起人重新提交。
   *
   * @returns {Promise<Array<{id: string, qq_user_id: string}>>} 需通知的任务
   */
  async recoverInterruptedTasks() {
    const stale = await database.query(
      "SELECT id, qq_user_id, task_type FROM tasks WHERE status IN ('running', 'pending')"
    );

    if (stale.length) {
      const now = new Date().toISOString();
      await database.run(
        `UPDATE tasks SET status = 'interrupted', error_message = ?, completed_at = ?, updated_at = ?
         WHERE status IN ('running', 'pending')`,
        ['服务重启，任务已中断', now, now]
      );
      console.log(`🧹 已清理 ${stale.length} 个重启残留任务`);
    }

    // 内存态一律以“空”为起点，避免沿用上一个进程的残留计数。
    this.tasks.clear();
    this.runningTaskIds.clear();
    this.executionCommands.clear();

    return stale.filter((task) => task.qq_user_id);
  }

  /**
   * 释放并发槽位。多条收尾路径可能对同一任务重复调用（进程退出事件、
   * executeTask 的 reject、手动 stopTask），用集合删除保证幂等。
   * @private
   */
  releaseSlot(taskId) {
    this.runningTaskIds.delete(taskId);
  }

  async reserveNotification(taskId, eventKey) {
    const result = await database.run(
      'INSERT OR IGNORE INTO task_notifications (task_id, event_key) VALUES (?, ?)',
      [taskId, eventKey]
    );
    return result.changes === 1;
  }

  async getOwnedTask(taskId, qqUserId) {
    return database.queryOne('SELECT * FROM tasks WHERE id = ? AND qq_user_id = ?', [taskId, String(qqUserId)]);
  }

  /**
   * 列出某个 QQ 正在运行的任务，按创建时间正序（与用户提交顺序一致）。
   *
   * 只查该 QQ 自己的任务：任务归属在创建时就绑定，不能让人看到或停掉别人的。
   * @param {string} qqUserId - 发起人 QQ 号
   * @returns {Promise<Array>} 运行中的任务
   */
  async getRunningTasksByOwner(qqUserId) {
    return database.query(
      `SELECT * FROM tasks
       WHERE qq_user_id = ? AND status = 'running'
       ORDER BY created_at ASC`,
      [String(qqUserId)]
    );
  }

  /**
   * 生成任务ID
   * @private
   */
  generateTaskId(platform, mode) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 5);
    return `task_${timestamp}_${platform}_${mode || 'general'}_${random}`;
  }
}

module.exports = TaskManager;
