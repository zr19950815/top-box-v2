/**
 * 任务执行器 - 负责执行具体的SmartBuy Framework任务
 */

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const config = require('../../config/config');
const { redactSensitive } = require('../../utils/redact');

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
      console.log(`📝 命令类型: ${String(commandString).split('-')[0]}`);

      // 检查框架路径是否存在
      if (!require('fs').existsSync(this.frameworkPath)) {
        throw new Error(`SmartBuy Framework路径不存在: ${this.frameworkPath}`);
      }

      // 凭据通过环境变量下发，不作为 argv。argv 会进入 /proc/<pid>/cmdline，
      // 该文件对所有用户可读（ps aux 即可看到米玛）；环境变量落在
      // /proc/<pid>/environ，仅同 UID 与 root 可读。
      const child = spawn('node', [this.cliScript], {
        cwd: this.frameworkPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
        env: { ...process.env, TOPBOX_COMMAND: commandString }
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

      // 子进程报出的失败原因。进程退出码只能表达“失败了”，说不出为什么；
      // 真实原因（如“密码不正确”）只出现在子进程日志里，必须在这里捕获，
      // 否则用户只会看到“任务异常结束”，误以为是程序故障。
      let failureReason = null;
      const captureFailureReason = (line) => {
        const reason = this.extractFailureReason(line);
        // 保留最早出现的根因：后续行往往是它引发的连锁报错。
        if (reason && !failureReason) failureReason = reason;
      };

      // stdout/stderr 送达的是任意大小的 chunk，不保证按行对齐。直接解析整个
      // chunk 有两种漏报：关键字（如“登录认证成功”）被切在 chunk 边界上永远匹配
      // 不到；多条日志挤在一个 chunk 里时后面的分类会覆盖前面的。这里按行缓冲，
      // 只把完整行交给解析器，残行留到下一个 chunk 或进程退出时再处理。
      const stdoutBuffer = this.createLineBuffer((line) => {
        const safeOutput = this.redactSensitive(line);
        captureFailureReason(safeOutput);
        console.log(`[${taskId}] 输出:`, safeOutput);
        this.parseAndEmitLog(taskId, 'info', safeOutput);
      });
      const stderrBuffer = this.createLineBuffer((line) => {
        const safeError = this.redactSensitive(line);
        captureFailureReason(safeError);
        console.error(`[${taskId}] 错误:`, safeError);
        this.parseAndEmitLog(taskId, 'error', safeError);
      });

      child.stdout.on('data', (data) => stdoutBuffer.push(data));
      child.stderr.on('data', (data) => stderrBuffer.push(data));

      // 监听进程退出
      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(taskId);
        // 进程结束时最后一行可能没有换行符，补发出去避免丢失结果日志。
        stdoutBuffer.flush();
        stderrBuffer.flush();

        console.log(`[${taskId}] 进程退出: code=${code}, signal=${signal}`);

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          // 任务被手动停止
          this.emit('taskStatusChanged', taskId, 'stopped');
        } else if (code === 0) {
          // 任务成功完成
          this.emit('taskStatusChanged', taskId, 'completed');
        } else {
          // 任务执行失败。优先上报子进程给出的真实原因，退出码只作兜底——
          // “进程退出码: 1”对用户没有任何指导意义。
          this.emit('taskStatusChanged', taskId, 'failed', {
            error_message: failureReason || `进程退出码: ${code}`
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
   * 把任意分块的 chunk 流重组成整行。残缺尾行留在缓冲区，等下一个 chunk 拼接，
   * 进程退出时由 flush() 补发。
   * @private
   * @param {(line: string) => void} onLine - 每收到一整行时回调
   */
  createLineBuffer(onLine) {
    let pending = '';
    return {
      push(chunk) {
        pending += chunk.toString();
        const lines = pending.split(/\r?\n/);
        // 最后一段可能是不完整的行，留到下次。
        pending = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) onLine(trimmed);
        }
      },
      flush() {
        const trimmed = pending.trim();
        pending = '';
        if (trimmed) onLine(trimmed);
      }
    };
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
        // 一行可能同时命中多个分类，订阅方需要全部命中项才不会漏事件。
        categories: logData.categories,
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
      // 一行日志可能同时命中多个分类（例如“上架完成: 成功 3，失败 0”同时含
      // “上架完成”和“失败”），单值 category 会被后面的判断覆盖，导致成功事件
      // 丢失。categories 保留全部命中项，category 只保留首个具体分类，兼容仍按
      // 单值读取的调用方。
      categories: [],
      data: {},
      progress: null
    };

    const addCategory = (name) => {
      if (!result.categories.includes(name)) result.categories.push(name);
      if (result.category === 'GENERAL') result.category = name;
    };

    try {
      const resultMatch = message.match(/TOPBOX_RESULT:(.+)/);
      if (resultMatch) {
        addCategory('TASK_RESULT');
        try { result.data.result = JSON.parse(resultMatch[1]); } catch (_) { result.data.result = null; }
        return result;
      }
      if (message.includes('登录认证成功') || message.includes('Token验证成功')) {
        addCategory('LOGIN_SUCCESS');
      }
      if (message.includes('合成确认成功')) addCategory('COMBINATION_SUCCESS');
      if (message.includes('取消寄售成功')) addCategory('CANCEL_SUCCESS');
      if (message.includes('上架完成')) addCategory('LISTING_SUCCESS');
      // 检查是否包含成功购买信息
      if (message.includes('购买成功') || message.includes('下单成功')) {
        addCategory('PURCHASE_SUCCESS');
        
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
        addCategory('PURCHASE_FAILED');
        
        // 提取失败原因
        const reasonMatch = message.match(/失败[：:]?\s*(.+)/);
        if (reasonMatch) {
          result.data.reason = reasonMatch[1];
        }
      }

      // 检查支付错误
      else if (message.includes('支付失败') || message.includes('密码错误')) {
        addCategory('PAYMENT_ERROR');
        result.data.paymentError = message;
      }

      // 检查错误信息
      else if (message.includes('错误') || message.includes('异常') || message.includes('失败')) {
        addCategory('SYSTEM_ERROR');
        result.data.error = message;
      }

      // 进度可以和“购买成功”出现在同一行，需要独立解析。
      if (message.includes('购买成功') && message.includes('进度')) {
        const progressMatches = [...message.matchAll(/(\d+)\/(\d+)/g)];
        const progressMatch = progressMatches[progressMatches.length - 1];
        if (progressMatch) {
          result.progress = {
            completed: parseInt(progressMatch[1]),
            total: parseInt(progressMatch[2])
          };
        }
      }

    } catch (error) {
      console.error('解析日志消息失败:', error);
    }

    return result;
  }

  /**
   * 从子进程的一行日志里提取可上报的失败原因。
   *
   * 框架把错误对象序列化后逐行打印，真实原因通常单独占一行，形如
   * `"message": "密码不正确"`；也有直接以文案形式出现的（`登录认证失败: ...`）。
   * 只认这些明确的形态，避免把普通进度日志误当成失败原因。
   *
   * @param {string} line - 已脱敏的单行日志
   * @returns {string|null} 失败原因，无法识别时返回 null
   */
  extractFailureReason(line) {
    const text = String(line || '').trim();
    if (!text) return null;

    // 形如 "message": "密码不正确"（框架打印错误对象时的形态）
    const jsonMessage = text.match(/"(?:message|msg)"\s*:\s*"([^"]{2,120})"/);
    if (jsonMessage) return jsonMessage[1];

    // 形如 登录认证失败: 密码不正确 / ❌ 取消寄售失败：xxx
    const labelled = text.match(
      /(?:登录认证失败|登录失败|认证失败|支付失败|上架失败|合成失败|取消寄售失败|执行失败)\s*[：:]\s*(.{2,120})/
    );
    if (labelled) return labelled[1].trim();

    // 明确的凭据类错误，即使没有冒号也要能识别。
    if (/密码不正确|密码错误|支付密码/.test(text)) return text.slice(0, 120);

    return null;
  }

  // 脱敏规则集中在 utils/redact，避免各处各写一份正则后逐渐走样。
  redactSensitive(message) {
    return redactSensitive(message);
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
