/**
 * 任务管理器 - 核心任务管理功能
 */

const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const EventEmitter = require('events');
const database = require('../../database/Database');
const TaskExecutor = require('./TaskExecutor');
const config = require('../../config/config');

class TaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map(); // 内存中的任务状态
    this.taskExecutor = new TaskExecutor();
    this.maxConcurrent = config.tasks.maxConcurrent;
    this.runningTasks = 0;
    
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
        command_string: taskData.commandString,
        platform: parsedCommand.platform,
        task_type: parsedCommand.taskType,
        mode: parsedCommand.mode,
        status: 'pending',
        priority: taskData.priority || 1,
        config: JSON.stringify(parsedCommand.config),
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
          config, progress, error_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        task.id, task.command_string, task.platform, task.task_type, task.mode,
        task.status, task.priority, task.config, task.progress, task.error_message,
        task.created_at, task.updated_at
      ]);

      // 保存到内存
      this.tasks.set(taskId, task);

      console.log(`✅ 任务创建成功: ${taskId} (${task.platform} ${task.mode}模式)`);
      
      // 发送事件
      this.emit('taskCreated', task);

      // 自动启动任务（如果未达到并发限制）
      if (this.runningTasks < this.maxConcurrent) {
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

      if (this.runningTasks >= this.maxConcurrent) {
        console.log(`⏳ 任务 ${taskId} 等待执行（当前并发: ${this.runningTasks}/${this.maxConcurrent}）`);
        return;
      }

      // 更新任务状态
      await this.updateTaskStatus(taskId, 'running', {
        started_at: new Date().toISOString()
      });

      this.runningTasks++;
      console.log(`🚀 启动任务: ${taskId} (${task.platform} ${task.mode}模式)`);

      // 异步执行任务
      this.taskExecutor.executeTask(taskId, task.command_string)
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

      this.runningTasks--;
      
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

      // 从数据库删除
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
        runningCount: this.runningTasks,
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
      // 将 errorMessage 转换为 error_message
    if (data.errorMessage) {
      data.error_message = data.errorMessage;
      delete data.errorMessage;
    }
    await this.updateTaskStatus(taskId, status, data);
      
      if (status === 'completed' || status === 'failed' || status === 'stopped') {
        this.runningTasks--;
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
    this.runningTasks--;
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
        ...additionalData
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
      this.emit('taskStatusUpdated', { id: taskId, status, ...additionalData });

    } catch (error) {
      console.error(`❌ 更新任务状态失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 启动下一个等待中的任务
   * @private
   */
  async startNextPendingTask() {
    if (this.runningTasks >= this.maxConcurrent) {
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
    const parts = CommandParser.smartSplit(commandString);
    if (parts.length < 2) {
      throw new Error('命令格式错误');
    }

    const command = CommandParser.parseCommand(parts[0]);
    const params = parts.slice(1);
    const baseParams = CommandParser.parseBaseParams(params);
    let taskParams = { ...baseParams };

    if (command.task === 'smart-buy') {
      const productSpecIndex = baseParams.authMode === 'token'
        ? (baseParams.account ? 3 : 2)
        : 3;
      const productParts = String(params[productSpecIndex] || '').split('*');
      if (productParts.length !== 3) {
        throw new Error('商品参数格式应为 商品名称或ID*数量*最高价格');
      }
      const quantity = Number.parseInt(productParts[1], 10);
      const maxPrice = Number.parseFloat(productParts[2]);
      if (!productParts[0] || !Number.isInteger(quantity) || quantity <= 0 || maxPrice <= 0) {
        throw new Error('商品名称、数量或最高价格无效');
      }
      taskParams = {
        ...baseParams,
        productId: productParts[0],
        quantity,
        maxPrice,
      };
    }

    return {
      platform: command.platform,
      mode: command.mode || null,
      taskType: command.task,
      config: {
        ...taskParams,
        // Keep the old Manager field for callers that still display `auth`.
        auth: taskParams.token || taskParams.password,
      }
    };
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
