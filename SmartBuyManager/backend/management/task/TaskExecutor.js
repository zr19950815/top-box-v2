/**
 * 任务执行器 - 负责执行具体的SmartBuy Framework任务
 */

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const config = require('../../config/config');

class TaskExecutor extends EventEmitter {
  constructor() {
    super();
    this.runningProcesses = new Map(); // taskId -> childProcess
    this.frameworkPath = config.framework.path;
    this.cliScript = config.framework.cliScript;
    this.timeout = config.framework.timeout;
  }

  /**
   * 执行任务
   * @param {string} taskId - 任务ID
   * @param {string} commandString - 命令字符串
   */
  async executeTask(taskId, commandString) {
    try {
      console.log(`🔧 开始执行任务: ${taskId}`);
      console.log(`📝 命令: ${commandString}`);

      // 检查框架路径是否存在
      if (!require('fs').existsSync(this.frameworkPath)) {
        throw new Error(`SmartBuy Framework路径不存在: ${this.frameworkPath}`);
      }

      // 启动子进程
      const child = spawn('node', [this.cliScript, commandString], {
        cwd: this.frameworkPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      // 保存进程引用
      this.runningProcesses.set(taskId, child);

      // Long-running purchase monitors have no timeout by default. A positive
      // TASK_TIMEOUT_MS can still be supplied when a deployment needs one.
      const timeoutId = this.timeout > 0
        ? setTimeout(() => {
            this.killTask(taskId, '任务执行超时');
          }, this.timeout)
        : null;

      // 监听标准输出
      child.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[${taskId}] 输出:`, output);
          this.parseAndEmitLog(taskId, 'info', output);
        }
      });

      // 监听错误输出
      child.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
          console.error(`[${taskId}] 错误:`, error);
          this.parseAndEmitLog(taskId, 'error', error);
        }
      });

      // 监听进程退出
      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(taskId);

        console.log(`[${taskId}] 进程退出: code=${code}, signal=${signal}`);

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          // 任务被手动停止
          this.emit('taskStatusChanged', taskId, 'stopped');
        } else if (code === 0) {
          // 任务成功完成
          this.emit('taskStatusChanged', taskId, 'completed');
        } else {
          // 任务执行失败
          this.emit('taskStatusChanged', taskId, 'failed', {
            error_message: `进程退出码: ${code}`
          });
        }
      });

      // 监听进程错误
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(taskId);
        
        console.error(`[${taskId}] 进程错误:`, error);
        this.emit('taskStatusChanged', taskId, 'failed', {
          error_message: `进程错误: ${error.message}`
        });
      });

      // 发送任务开始事件
      this.emit('taskStatusChanged', taskId, 'running');

    } catch (error) {
      console.error(`❌ 执行任务失败: ${taskId}`, error);
      this.emit('taskStatusChanged', taskId, 'failed', {
        error_message: error.message
      });
      throw error;
    }
  }

  /**
   * 停止任务
   * @param {string} taskId - 任务ID
   */
  async stopTask(taskId) {
    const child = this.runningProcesses.get(taskId);
    if (!child) {
      console.warn(`⚠️ 任务进程不存在: ${taskId}`);
      return;
    }

    try {
      console.log(`🛑 停止任务进程: ${taskId} (PID: ${child.pid})`);
      
      // 发送终止信号
      child.kill('SIGTERM');
      
      // 如果进程在3秒内没有退出，强制杀死
      setTimeout(() => {
        if (this.runningProcesses.has(taskId)) {
          console.log(`💀 强制杀死进程: ${taskId}`);
          child.kill('SIGKILL');
        }
      }, 3000);

    } catch (error) {
      console.error(`❌ 停止任务进程失败: ${taskId}`, error);
      throw error;
    }
  }

  /**
   * 强制终止任务
   * @private
   */
  killTask(taskId, reason = '未知原因') {
    const child = this.runningProcesses.get(taskId);
    if (child) {
      console.log(`💀 强制终止任务: ${taskId} (${reason})`);
      child.kill('SIGKILL');
      this.runningProcesses.delete(taskId);
      
      this.emit('taskStatusChanged', taskId, 'failed', {
        error_message: reason
      });
    }
  }

  /**
   * 解析日志输出并发送事件
   * @private
   */
  parseAndEmitLog(taskId, level, message) {
    try {
      // 解析日志内容，提取有用信息
      const logData = this.parseLogMessage(message);
      
      this.emit('taskLog', taskId, {
        level,
        message,
        category: logData.category,
        data: logData.data,
        timestamp: new Date().toISOString()
      });

      // 根据日志内容更新任务进度
      if (logData.progress) {
        this.emit('taskProgress', taskId, logData.progress);
      }

    } catch (error) {
      console.error(`❌ 解析日志失败: ${taskId}`, error);
    }
  }

  /**
   * 解析日志消息
   * @private
   */
  parseLogMessage(message) {
    const result = {
      category: 'GENERAL',
      data: {},
      progress: null
    };

    try {
      // 检查是否包含成功购买信息
      if (message.includes('购买成功') || message.includes('下单成功')) {
        result.category = 'PURCHASE_SUCCESS';
        
        // 提取订单号
        const orderMatch = message.match(/订单号[：:]\s*([^\s,，]+)/);
        if (orderMatch) {
          result.data.orderId = orderMatch[1];
        }
        
        // 提取价格信息
        const priceMatch = message.match(/价格[：:]\s*([0-9.]+)/);
        if (priceMatch) {
          result.data.price = parseFloat(priceMatch[1]);
        }
      }

      // 检查购买失败信息
      else if (message.includes('购买失败') || message.includes('下单失败')) {
        result.category = 'PURCHASE_FAILED';
        
        // 提取失败原因
        const reasonMatch = message.match(/失败[：:]?\s*(.+)/);
        if (reasonMatch) {
          result.data.reason = reasonMatch[1];
        }
      }

      // 检查支付错误
      else if (message.includes('支付失败') || message.includes('密码错误')) {
        result.category = 'PAYMENT_ERROR';
        result.data.paymentError = message;
      }

      // 检查进度信息
      else if (message.includes('进度') || message.includes('成功') && message.includes('/')) {
        const progressMatch = message.match(/(\d+)\/(\d+)/);
        if (progressMatch) {
          result.progress = {
            completed: parseInt(progressMatch[1]),
            total: parseInt(progressMatch[2])
          };
        }
      }

      // 检查错误信息
      else if (message.includes('错误') || message.includes('异常') || message.includes('失败')) {
        result.category = 'SYSTEM_ERROR';
        result.data.error = message;
      }

    } catch (error) {
      console.error('解析日志消息失败:', error);
    }

    return result;
  }

  /**
   * 获取正在运行的任务数量
   */
  getRunningTaskCount() {
    return this.runningProcesses.size;
  }

  /**
   * 获取所有正在运行的任务ID
   */
  getRunningTaskIds() {
    return Array.from(this.runningProcesses.keys());
  }

  /**
   * 检查任务是否正在运行
   */
  isTaskRunning(taskId) {
    return this.runningProcesses.has(taskId);
  }

  /**
   * 清理所有运行中的任务
   */
  async cleanup() {
    console.log('🧹 清理所有运行中的任务...');
    
    const taskIds = Array.from(this.runningProcesses.keys());
    const cleanupPromises = taskIds.map(taskId => this.stopTask(taskId));
    
    await Promise.all(cleanupPromises);
    
    console.log('✅ 任务清理完成');
  }
}

module.exports = TaskExecutor;
