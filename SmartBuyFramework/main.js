/**
 * SmartBuy Framework - 程序主入口
 * 
 * 负责注册所有平台并提供统一的启动接口
 */

const PlatformRegistry = require('./core/PlatformRegistry');
const TaskExecutor = require('./core/TaskExecutor');
const CommandParser = require('./core/CommandParser');
const Logger = require('./utils/Logger');
const { ErrorFactory, ErrorTypes } = require('./utils/ErrorTypes');
const Validator = require('./utils/Validator');
const ProductConfigManager = require('./config/ProductConfigManager');
const IntervalConfigManager = require('./config/IntervalConfigManager');

class SmartBuyFramework {
  constructor() {
    this.isInitialized = false;
    this.taskExecutor = null;
    this.currentTask = null;
    
    // 设置日志
    Logger.setLevel('INFO');
    Logger.setConsoleOutput(true);
    
    console.log('🚀 SmartBuy Framework 启动中...');
  }

  /**
   * 初始化框架
   */
  async initialize() {
    try {
      console.log('🔧 初始化框架...');
      
      // 初始化商品配置管理器
      await ProductConfigManager.initialize();
      
      // 初始化间隔配置管理器
      await IntervalConfigManager.initialize();
      
      // 注册所有平台
      await this.registerPlatforms();
      
      // 初始化任务执行器
      this.taskExecutor = new TaskExecutor();
      
      this.isInitialized = true;
      console.log('✅ 框架初始化完成');
      
      // 打印注册信息
      PlatformRegistry.printRegistry();
      
    } catch (error) {
      console.error('❌ 框架初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 注册所有平台
   */
  async registerPlatforms() {
    console.log('📝 注册平台...');
    
    try {
      // 注册KyArt平台
      const KyArtAdapter = require('./platforms/kyart/KyArtAdapter');
      const kyartCommands = require('./platforms/kyart/commands');
      PlatformRegistry.register('kyart', KyArtAdapter, kyartCommands);
      console.log('✅ KyArt平台注册成功');
      
      // 注册HzMiss平台
      const HzMissAdapter = require('./platforms/hzmiss/HzMissAdapter');
      const hzmissCommands = require('./platforms/hzmiss/commands');
      PlatformRegistry.register('hzmiss', HzMissAdapter, hzmissCommands);
      console.log('✅ HzMiss平台注册成功');

      // 注册 JulianBaby / Bull Box 平台
      const JulianBabyAdapter = require('./platforms/julianbaby/JulianBabyAdapter');
      const julianBabyCommands = require('./platforms/julianbaby/commands');
      PlatformRegistry.register(
        'julianbaby',
        JulianBabyAdapter,
        julianBabyCommands
      );
      console.log('✅ JulianBaby/Bull Box 平台注册成功');

      // 注册 HC / Huancang 平台
      const HcAdapter = require('./platforms/hc/HcAdapter');
      const hcCommands = require('./platforms/hc/commands');
      PlatformRegistry.register('hc', HcAdapter, hcCommands);
      console.log('✅ HC/Huancang 平台注册成功');
      
    } catch (error) {
      console.warn('⚠️  平台注册失败:', error.message);
      // 不抛出错误，允许框架继续运行
    }
    
    console.log('📝 平台注册完成');
  }

  /**
   * 执行命令
   * @param {string} commandString - 命令字符串
   */
  async executeCommand(commandString) {
    if (!this.isInitialized) {
      throw new Error('Framework not initialized. Call initialize() first.');
    }

    try {
      console.log(`🎯 开始执行命令: ${String(commandString).split('-')[0]}`);
      
      // 1. 解析命令
      const parseResult = CommandParser.parse(commandString);
      console.log(`📝 命令解析结果:`, {
        platform: parseResult.platform,
        task: parseResult.task,
        mode: parseResult.mode
      });
      
      // 2. 验证解析结果
      if (!CommandParser.validate(parseResult)) {
        throw ErrorFactory.createValidationError('Command validation failed');
      }

      // 3. 获取平台适配器
      const AdapterClass = PlatformRegistry.getAdapter(parseResult.platform);
      
      // 根据认证模式传递不同的参数
      const authParam = parseResult.params.authMode === 'token' ? 
        parseResult.params.token : 
        parseResult.params.password;
      
      console.log(`🔐 使用${parseResult.params.authMode}模式创建适配器`);
      
      const adapter = new AdapterClass(authParam, {
        account: parseResult.params.account,
        payPassword: parseResult.params.payPassword
      });

      // 4. 初始化任务执行器
      this.taskExecutor.init(adapter);

      // 5. 执行任务
      const result = await this.taskExecutor.executeTask(parseResult.task, {
        ...parseResult.params,
        mode: parseResult.mode
      });

      console.log('✅ 命令执行完成');
      return result;

    } catch (error) {
      console.error('❌ 命令执行失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取框架状态
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      platforms: PlatformRegistry.getAllPlatforms(),
      commands: Object.keys(PlatformRegistry.getAllCommands()).length,
      currentTask: this.taskExecutor ? this.taskExecutor.getCurrentTaskStatus() : null,
      stats: this.taskExecutor ? this.taskExecutor.getStats() : null
    };
  }

  /**
   * 停止当前任务
   */
  stopCurrentTask() {
    if (this.taskExecutor) {
      this.taskExecutor.stopCurrentTask();
    }
  }

  /**
   * 获取帮助信息
   */
  getHelp() {
    return CommandParser.getHelp();
  }

  /**
   * 清理资源
   */
  cleanup() {
    console.log('🧹 清理框架资源...');
    
    if (this.taskExecutor) {
      this.taskExecutor.cleanup();
    }
    
    PlatformRegistry.clearInstances();
    this.isInitialized = false;
    
    console.log('✅ 资源清理完成');
  }
}

// 全局异常处理
process.on('uncaughtException', (error) => {
  console.error('💥 未捕获的异常:', error);
  Logger.error('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 未处理的Promise拒绝:', reason);
  Logger.error('Unhandled Rejection', { reason, promise });
});

// 优雅退出处理
process.on('SIGINT', () => {
  console.log('\n🛑 收到退出信号，正在清理...');
  
  // 这里可以添加全局清理逻辑
  // 比如停止当前任务、保存状态等
  
  process.exit(0);
});

// 如果直接运行此文件，则启动交互式模式
if (require.main === module) {
  console.log('📖 使用方式:');
  console.log('  node main.js <command>');
  console.log('  例如: node main.js ky列表-18812345678-pwd123-pay123-12345*2*100');
  console.log('\n📋 获取完整帮助信息:');
  console.log('  node cli.js --help');
  console.log('\n⚠️  注意: 当前版本需要先实现平台适配器');
}

module.exports = SmartBuyFramework;
