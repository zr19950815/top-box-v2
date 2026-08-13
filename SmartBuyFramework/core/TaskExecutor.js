/**
 * SmartBuy Framework - 任务执行器
 * 
 * 统一的任务执行入口和调度，支持多种任务类型的路由和执行
 */

const ListModeStrategy = require('./strategies/ListModeStrategy');
const QuickModeStrategy = require('./strategies/QuickModeStrategy');
const BatchModeStrategy = require('./strategies/BatchModeStrategy');
const PaymentProcessor = require('../processors/payment/PaymentProcessor');
const OrderProcessor = require('../processors/order/OrderProcessor');

class TaskExecutor {
  /**
   * 构造函数
   */
  constructor() {
    this.adapter = null;
    this.paymentProcessor = null;
    this.orderProcessor = null;
    this.strategies = new Map();
    this.currentTask = null;
    this.isInitialized = false;
    
    // 统计信息
    this.totalTasks = 0;
    this.successfulTasks = 0;
    this.failedTasks = 0;
    this.taskHistory = [];
  }

  /**
   * 初始化执行器，创建策略和处理器实例
   * @param {PlatformAdapter} platformAdapter - 平台适配器
   * @param {Object} [options] - 初始化选项
   */
  init(platformAdapter, options = {}) {
    console.log(`[任务执行器] 🔧 初始化执行器...`);
    
    this.adapter = platformAdapter;
    
    // 创建处理器实例
    this.paymentProcessor = new PaymentProcessor(platformAdapter, options.paymentOptions);
    this.orderProcessor = new OrderProcessor(platformAdapter, options.orderOptions);
    
    // 创建策略实例
    this.strategies.set('list', new ListModeStrategy(
      platformAdapter, 
      this.paymentProcessor, 
      this.orderProcessor
    ));
    
    this.strategies.set('quick', new QuickModeStrategy(
      platformAdapter, 
      this.paymentProcessor, 
      this.orderProcessor
    ));
    
    this.strategies.set('batch', new BatchModeStrategy(
      platformAdapter, 
      this.paymentProcessor, 
      this.orderProcessor
    ));
    
    this.isInitialized = true;
    console.log(`[任务执行器] ✅ 执行器初始化完成`);
  }

  /**
   * 执行指定类型的任务
   * @param {string} taskType - 任务类型
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<*>} 执行结果
   */
  async executeTask(taskType, config) {
    if (!this.isInitialized) {
      throw new Error('TaskExecutor not initialized. Call init() first.');
    }

    const taskId = this.generateTaskId();
    const startTime = Date.now();
    
    console.log(`[任务执行器] 🚀 开始执行任务: ${taskType} (ID: ${taskId})`);
    
    this.totalTasks++;
    this.currentTask = {
      id: taskId,
      type: taskType,
      config,
      startTime,
      status: 'running'
    };
    
    try {
      let result;
      
      // 根据任务类型路由到不同的执行方法
      switch (taskType) {
        case 'smart-buy':
          result = await this.executeSmartBuy(config);
          break;
          
        case 'combination':
          result = await this.executeCombination(config);
          break;

        case 'trade-history':
          result = await this.executeTradeHistory(config);
          break;
          
        case 'cancel-resale':
          result = await this.executeCancelResale(config);
          break;

        case 'listing':
          result = await this.executeListing(config);
          break;
          
        default:
          throw new Error(`Unknown task type: ${taskType}`);
      }
      
      // 记录成功任务
      this.recordTaskSuccess(taskId, result, Date.now() - startTime);
      
      console.log(`[任务执行器] ✅ 任务执行成功: ${taskType} (ID: ${taskId})`);
      return result;
      
    } catch (error) {
      // 记录失败任务
      this.recordTaskFailure(taskId, error, Date.now() - startTime);
      
      console.error(`[任务执行器] ❌ 任务执行失败: ${taskType} (ID: ${taskId}), 错误: ${error.message}`);
      throw error;
    } finally {
      this.currentTask = null;
    }
  }

  /**
   * 执行智能购买任务
   * @private
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<*>} 执行结果
   */
  async executeSmartBuy(config) {
    console.log(`[任务执行器] 🛒 执行智能购买任务 - 模式: ${config.mode}`);
    
    // 认证处理：支持密码模式和token模式
    if (config.authMode === 'token' && config.token) {
      // Token模式：直接验证token有效性
      console.log(`[任务执行器] 🔐 开始Token验证...`);
      try {
        const isValid = await this.adapter.validateToken(config.token);
        if (!isValid) {
          throw new Error('Token验证失败，可能已过期');
        }
        console.log(`[任务执行器] ✅ Token验证成功`);
      } catch (error) {
        console.error(`[任务执行器] ❌ Token验证失败: ${error.message}`);
        throw new Error(`Token验证失败: ${error.message}`);
      }
    } else if (config.account && config.password) {
      // 密码模式：进行登录认证
      console.log(`[任务执行器] 🔐 开始用户登录认证...`);
      try {
        const authResult = await this.adapter.login({
          account: config.account,
          password: config.password
        });
        
        if (!authResult.success) {
          throw new Error(`登录失败: ${authResult.message || '认证失败'}`);
        }
        
        console.log(`[任务执行器] ✅ 登录认证成功`);
      } catch (error) {
        console.error(`[任务执行器] ❌ 登录认证失败: ${error.message}`);
        throw new Error(`登录认证失败: ${error.message}`);
      }
    } else {
      throw new Error('缺少登录凭据，需要提供账号和密码/token');
    }
    
    // 获取策略实例
    const strategy = this.getStrategy(config.mode || 'list');
    
    // 执行策略
    await strategy.execute(config);
    
    // 返回策略执行状态
    return strategy.getStatus();
  }

  /**
   * 执行合成确认任务
   * @private
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<boolean>} 是否成功
   */
  async executeCombination(config) {
    console.log(`[任务执行器] 🔗 执行合成确认任务 - 合成: ${config.combinationName || config.combinationId}`);
    
    if (!config.combinationId) {
      throw new Error('Missing combinationId for combination task');
    }
    
    // 认证处理：支持密码模式和token模式
    if (config.authMode === 'token' && config.token) {
      console.log(`[任务执行器] 🔐 开始Token验证...`);
      try {
        const isValid = await this.adapter.validateToken(config.token);
        if (!isValid) {
          throw new Error('Token验证失败，可能已过期');
        }
        console.log(`[任务执行器] ✅ Token验证成功`);
      } catch (error) {
        console.error(`[任务执行器] ❌ Token验证失败: ${error.message}`);
        throw new Error(`Token验证失败: ${error.message}`);
      }
    } else if (config.account && config.password) {
      console.log(`[任务执行器] 🔐 开始用户登录认证...`);
      try {
        const authResult = await this.adapter.login({
          account: config.account,
          password: config.password
        });
        
        if (!authResult.success) {
          throw new Error(`登录失败: ${authResult.message || '认证失败'}`);
        }
        
        console.log(`[任务执行器] ✅ 登录认证成功`);
      } catch (error) {
        console.error(`[任务执行器] ❌ 登录认证失败: ${error.message}`);
        throw new Error(`登录认证失败: ${error.message}`);
      }
    } else {
      throw new Error('缺少登录凭据，需要提供账号和密码/token');
    }
    
    // 调用平台适配器的合成方法
    const result = await this.adapter.confirmCombination(config.combinationId);
    
    if (result) {
      console.log(`[任务执行器] ✅ 合成确认成功`);
    } else {
      console.log(`[任务执行器] ❌ 合成确认失败`);
    }
    
    return result;
  }

  /**
   * 查询某个藏品最近成交记录（只读）。
   * @private
   */
  async executeTradeHistory(config) {
    if (!config.productId) {
      throw new Error('Missing productId for trade-history task');
    }

    // 复用 authenticate()：它会输出“✅ 登录认证成功”，QQ 侧据此发送登录回执。
    // 此前这里自写了一份不打印日志的登录逻辑，导致查询类任务收不到回执。
    await this.authenticate(config);

    const result = await this.adapter.getRecentTrades(config.productId);
    console.log(`[任务执行器] 📈 查询到 ${result.trades.length} 笔最近成交`);
    return result;
  }

  /**
   * 执行取消寄售任务
   * @private
   * @param {TaskConfig} config - 任务配置
   * @returns {Promise<boolean>} 是否成功
   */
  async executeCancelResale(config) {
    console.log(`[任务执行器] 🚫 执行取消寄售任务 - 寄售ID: ${config.resaleId}`);
    
    if (!config.resaleId) {
      throw new Error('Missing resaleId for cancel-resale task');
    }
    
    // 认证处理：支持密码模式和token模式
    if (config.authMode === 'token' && config.token) {
      console.log(`[任务执行器] 🔐 开始Token验证...`);
      try {
        const isValid = await this.adapter.validateToken(config.token);
        if (!isValid) {
          throw new Error('Token验证失败，可能已过期');
        }
        console.log(`[任务执行器] ✅ Token验证成功`);
      } catch (error) {
        console.error(`[任务执行器] ❌ Token验证失败: ${error.message}`);
        throw new Error(`Token验证失败: ${error.message}`);
      }
    } else if (config.account && config.password) {
      console.log(`[任务执行器] 🔐 开始用户登录认证...`);
      try {
        const authResult = await this.adapter.login({
          account: config.account,
          password: config.password
        });
        
        if (!authResult.success) {
          throw new Error(`登录失败: ${authResult.message || '认证失败'}`);
        }
        
        console.log(`[任务执行器] ✅ 登录认证成功`);
      } catch (error) {
        console.error(`[任务执行器] ❌ 登录认证失败: ${error.message}`);
        throw new Error(`登录认证失败: ${error.message}`);
      }
    } else {
      throw new Error('缺少登录凭据，需要提供账号和密码/token');
    }
    
    // 调用平台适配器的取消寄售方法
    const result = await this.adapter.cancelResale(config.productId || config.resaleId);
    
    if (result) {
      console.log(`[任务执行器] ✅ 取消寄售成功`);
    } else {
      console.log(`[任务执行器] ❌ 取消寄售失败`);
    }
    
    return result;
  }

  async executeListing(config) {
    await this.authenticate(config);
    const result = await this.adapter.listCollectibles({
      productId: config.productId,
      productConfig: config.productConfig,
      quantity: config.quantity,
      amount: config.amount,
      payPassword: config.payPassword,
    });
    console.log(
      `[任务执行器] ✅ 上架完成: 成功 ${result.successCount}，失败 ${result.failureCount}` +
      `（请求 ${result.requestedCount}，可上架 ${result.availableCount}` +
      `${result.aborted ? '，已提前中止' : ''}）`
    );
    return result;
  }

  async authenticate(config) {
    if (config.authMode === 'token' && config.token) {
      if (!await this.adapter.validateToken(config.token)) throw new Error('Token验证失败，可能已过期');
      console.log('[任务执行器] ✅ 登录认证成功');
      return;
    }
    if (!config.account || !config.password) throw new Error('缺少登录凭据');
    const result = await this.adapter.login({ account: config.account, password: config.password });
    if (!result.success) throw new Error('登录认证失败');
    console.log('[任务执行器] ✅ 登录认证成功');
  }

  /**
   * 获取策略实例
   * @private
   * @param {string} mode - 策略模式
   * @returns {PurchaseStrategy} 策略实例
   */
  getStrategy(mode) {
    if (!this.strategies.has(mode)) {
      throw new Error(`Unknown strategy mode: ${mode}. Available: ${Array.from(this.strategies.keys()).join(', ')}`);
    }
    
    return this.strategies.get(mode);
  }

  /**
   * 停止当前任务
   */
  stopCurrentTask() {
    if (this.currentTask && this.currentTask.status === 'running') {
      console.log(`[任务执行器] 🛑 停止当前任务: ${this.currentTask.type} (ID: ${this.currentTask.id})`);
      
      // 如果是智能购买任务，停止策略执行
      if (this.currentTask.type === 'smart-buy') {
        const mode = this.currentTask.config.mode || 'list';
        const strategy = this.strategies.get(mode);
        if (strategy) {
          strategy.stop();
        }
      }
      
      this.currentTask.status = 'stopped';
    }
  }

  /**
   * 生成任务ID
   * @private
   * @returns {string} 任务ID
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  /**
   * 记录成功任务
   * @private
   * @param {string} taskId - 任务ID
   * @param {*} result - 执行结果
   * @param {number} duration - 执行时长
   */
  recordTaskSuccess(taskId, result, duration) {
    this.successfulTasks++;
    
    const taskRecord = {
      id: taskId,
      type: this.currentTask.type,
      status: 'success',
      startTime: this.currentTask.startTime,
      endTime: Date.now(),
      duration,
      result
    };
    
    this.taskHistory.push(taskRecord);
    this.trimTaskHistory();
  }

  /**
   * 记录失败任务
   * @private
   * @param {string} taskId - 任务ID
   * @param {Error} error - 错误对象
   * @param {number} duration - 执行时长
   */
  recordTaskFailure(taskId, error, duration) {
    this.failedTasks++;
    
    const taskRecord = {
      id: taskId,
      type: this.currentTask.type,
      status: 'failed',
      startTime: this.currentTask.startTime,
      endTime: Date.now(),
      duration,
      error: {
        message: error.message,
        type: error.type || error.constructor.name
      }
    };
    
    this.taskHistory.push(taskRecord);
    this.trimTaskHistory();
  }

  /**
   * 保持任务历史记录在合理范围内
   * @private
   */
  trimTaskHistory() {
    const maxHistorySize = 100;
    if (this.taskHistory.length > maxHistorySize) {
      this.taskHistory = this.taskHistory.slice(-maxHistorySize);
    }
  }

  /**
   * 获取当前任务状态
   * @returns {Object|null} 当前任务状态或null
   */
  getCurrentTaskStatus() {
    if (!this.currentTask) {
      return null;
    }
    
    const baseStatus = {
      id: this.currentTask.id,
      type: this.currentTask.type,
      status: this.currentTask.status,
      startTime: this.currentTask.startTime,
      duration: Date.now() - this.currentTask.startTime
    };
    
    // 如果是智能购买任务，添加策略状态
    if (this.currentTask.type === 'smart-buy') {
      const mode = this.currentTask.config.mode || 'list';
      const strategy = this.strategies.get(mode);
      if (strategy) {
        baseStatus.strategyStatus = strategy.getStatus();
      }
    }
    
    return baseStatus;
  }

  /**
   * 获取执行器统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const successRate = this.totalTasks > 0 ? (this.successfulTasks / this.totalTasks * 100) : 0;
    const failureRate = this.totalTasks > 0 ? (this.failedTasks / this.totalTasks * 100) : 0;
    
    return {
      totalTasks: this.totalTasks,
      successfulTasks: this.successfulTasks,
      failedTasks: this.failedTasks,
      successRate: parseFloat(successRate.toFixed(1)),
      failureRate: parseFloat(failureRate.toFixed(1)),
      currentTask: this.getCurrentTaskStatus(),
      isInitialized: this.isInitialized,
      platformName: this.adapter ? this.adapter.getPlatformName() : 'none',
      processorStats: {
        payment: this.paymentProcessor ? this.paymentProcessor.getStats() : null,
        order: this.orderProcessor ? this.orderProcessor.getStats() : null
      }
    };
  }

  /**
   * 获取任务历史记录
   * @param {number} [limit] - 限制返回数量
   * @returns {Array} 任务历史记录
   */
  getTaskHistory(limit = 10) {
    return this.taskHistory.slice(-limit).reverse(); // 最新的在前面
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.totalTasks = 0;
    this.successfulTasks = 0;
    this.failedTasks = 0;
    this.taskHistory = [];
    
    if (this.paymentProcessor) {
      this.paymentProcessor.resetStats();
    }
    
    if (this.orderProcessor) {
      this.orderProcessor.resetStats();
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stopCurrentTask();
    this.adapter = null;
    this.paymentProcessor = null;
    this.orderProcessor = null;
    this.strategies.clear();
    this.isInitialized = false;
    
    console.log(`[任务执行器] 🧹 资源清理完成`);
  }
}

module.exports = TaskExecutor;
