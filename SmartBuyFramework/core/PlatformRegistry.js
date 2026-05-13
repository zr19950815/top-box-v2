/**
 * SmartBuy Framework - 平台注册中心
 * 
 * 管理所有平台的注册和获取，提供平台实例化和指令映射功能
 */

class PlatformRegistry {
  // 静态存储平台适配器类
  static platforms = new Map();
  
  // 静态存储指令映射
  static commands = new Map();
  
  // 静态存储平台实例（单例模式）
  static instances = new Map();

  /**
   * 注册平台到框架
   * @param {string} platformName - 平台名称
   * @param {class} AdapterClass - 适配器类
   * @param {Object} commands - 指令映射对象
   * @param {Object} [options] - 注册选项
   */
  static register(platformName, AdapterClass, commands, options = {}) {
    console.log(`[平台注册中心] 📝 注册平台: ${platformName}`);

    // 验证参数
    this.validateRegistration(platformName, AdapterClass, commands);

    // 存储平台适配器类
    this.platforms.set(platformName, {
      AdapterClass,
      options,
      registeredAt: new Date(),
      version: options.version || '1.0.0'
    });

    // 注册指令映射
    this.registerCommands(commands, platformName);

    console.log(`[平台注册中心] ✅ 平台注册成功: ${platformName}, 指令数: ${Object.keys(commands).length}`);
  }

  /**
   * 注册指令映射
   * @private
   * @param {Object} commands - 指令映射对象
   * @param {string} platformName - 平台名称
   */
  static registerCommands(commands, platformName) {
    for (const [command, info] of Object.entries(commands)) {
      if (this.commands.has(command)) {
        console.warn(`[平台注册中心] ⚠️  指令冲突: ${command} 已被 ${this.commands.get(command).platform} 注册，将被 ${platformName} 覆盖`);
      }
      
      this.commands.set(command, {
        ...info,
        platform: platformName,
        registeredBy: platformName
      });
    }
  }

  /**
   * 获取平台适配器类
   * @param {string} platformName - 平台名称
   * @returns {class} 适配器类
   */
  static getAdapter(platformName) {
    const platformInfo = this.platforms.get(platformName);
    
    if (!platformInfo) {
      const availablePlatforms = Array.from(this.platforms.keys()).join(', ');
      throw new Error(`Platform not found: ${platformName}. Available platforms: ${availablePlatforms}`);
    }

    return platformInfo.AdapterClass;
  }

  /**
   * 获取平台适配器实例（单例模式）
   * @param {string} platformName - 平台名称
   * @param {string} [token] - 认证Token
   * @param {Object} [options] - 实例化选项
   * @returns {PlatformAdapter} 适配器实例
   */
  static getInstance(platformName, token = null, options = {}) {
    const instanceKey = `${platformName}_${token || 'default'}`;
    
    // 如果实例已存在，返回现有实例
    if (this.instances.has(instanceKey)) {
      return this.instances.get(instanceKey);
    }

    // 获取适配器类
    const AdapterClass = this.getAdapter(platformName);
    const platformInfo = this.platforms.get(platformName);

    // 合并选项
    const mergedOptions = {
      ...platformInfo.options,
      ...options
    };

    // 创建新实例
    const instance = new AdapterClass(token, mergedOptions);
    
    // 缓存实例
    this.instances.set(instanceKey, instance);

    console.log(`[平台注册中心] 🏭 创建平台实例: ${platformName} (缓存key: ${instanceKey})`);
    
    return instance;
  }

  /**
   * 获取指令信息
   * @param {string} command - 指令名称
   * @returns {Object} 指令信息
   */
  static getCommandInfo(command) {
    const commandInfo = this.commands.get(command);
    
    if (!commandInfo) {
      const availableCommands = Array.from(this.commands.keys()).join(', ');
      throw new Error(`Command not found: ${command}. Available commands: ${availableCommands}`);
    }

    return commandInfo;
  }

  /**
   * 获取所有已注册的平台
   * @returns {Object} 平台信息对象
   */
  static getAllPlatforms() {
    const result = {};
    
    for (const [name, info] of this.platforms.entries()) {
      result[name] = {
        name,
        version: info.version,
        registeredAt: info.registeredAt,
        hasInstance: Array.from(this.instances.keys()).some(key => key.startsWith(`${name}_`))
      };
    }

    return result;
  }

  /**
   * 获取所有已注册的指令
   * @returns {Object} 指令信息对象
   */
  static getAllCommands() {
    const result = {};
    
    for (const [command, info] of this.commands.entries()) {
      result[command] = {
        command,
        platform: info.platform,
        task: info.task,
        mode: info.mode,
        description: info.description
      };
    }

    return result;
  }

  /**
   * 获取特定平台的指令
   * @param {string} platformName - 平台名称
   * @returns {Object} 平台指令对象
   */
  static getPlatformCommands(platformName) {
    const result = {};
    
    for (const [command, info] of this.commands.entries()) {
      if (info.platform === platformName) {
        result[command] = info;
      }
    }

    return result;
  }

  /**
   * 检查平台是否已注册
   * @param {string} platformName - 平台名称
   * @returns {boolean} 是否已注册
   */
  static isRegistered(platformName) {
    return this.platforms.has(platformName);
  }

  /**
   * 检查指令是否已注册
   * @param {string} command - 指令名称
   * @returns {boolean} 是否已注册
   */
  static isCommandRegistered(command) {
    return this.commands.has(command);
  }

  /**
   * 注销平台
   * @param {string} platformName - 平台名称
   */
  static unregister(platformName) {
    console.log(`[平台注册中心] 🗑️  注销平台: ${platformName}`);

    // 删除平台信息
    this.platforms.delete(platformName);

    // 删除平台的所有指令
    for (const [command, info] of this.commands.entries()) {
      if (info.platform === platformName) {
        this.commands.delete(command);
      }
    }

    // 清理平台实例
    for (const [key, instance] of this.instances.entries()) {
      if (key.startsWith(`${platformName}_`)) {
        // 如果有清理方法，调用清理
        if (typeof instance.cleanup === 'function') {
          instance.cleanup();
        }
        this.instances.delete(key);
      }
    }

    console.log(`[平台注册中心] ✅ 平台注销成功: ${platformName}`);
  }

  /**
   * 清理所有平台实例
   */
  static clearInstances() {
    console.log(`[平台注册中心] 🧹 清理所有平台实例...`);

    for (const [key, instance] of this.instances.entries()) {
      if (typeof instance.cleanup === 'function') {
        instance.cleanup();
      }
    }

    this.instances.clear();
    console.log(`[平台注册中心] ✅ 实例清理完成`);
  }

  /**
   * 验证注册参数
   * @private
   * @param {string} platformName - 平台名称
   * @param {class} AdapterClass - 适配器类
   * @param {Object} commands - 指令映射
   */
  static validateRegistration(platformName, AdapterClass, commands) {
    // 验证平台名称
    if (!platformName || typeof platformName !== 'string') {
      throw new Error('Platform name is required and must be a string');
    }

    // 验证适配器类
    if (!AdapterClass || typeof AdapterClass !== 'function') {
      throw new Error('AdapterClass is required and must be a constructor function');
    }

    // 验证指令映射
    if (!commands || typeof commands !== 'object') {
      throw new Error('Commands is required and must be an object');
    }

    // 检查平台是否已注册
    if (this.platforms.has(platformName)) {
      console.warn(`[平台注册中心] ⚠️  平台 ${platformName} 已存在，将被覆盖`);
    }

    // 验证指令映射格式
    for (const [command, info] of Object.entries(commands)) {
      if (!info.task) {
        throw new Error(`Command ${command} is missing required field: task`);
      }
      
      if (info.task === 'smart-buy' && !info.mode) {
        throw new Error(`Smart-buy command ${command} is missing required field: mode`);
      }
    }
  }

  /**
   * 获取注册中心统计信息
   * @returns {Object} 统计信息
   */
  static getStats() {
    return {
      totalPlatforms: this.platforms.size,
      totalCommands: this.commands.size,
      totalInstances: this.instances.size,
      platforms: Array.from(this.platforms.keys()),
      commands: Array.from(this.commands.keys()),
      instances: Array.from(this.instances.keys())
    };
  }

  /**
   * 获取平台健康状态
   * @param {string} platformName - 平台名称
   * @returns {Object} 健康状态
   */
  static async getPlatformHealth(platformName) {
    try {
      const instance = this.getInstance(platformName);
      
      // 如果平台有健康检查方法，调用它
      if (typeof instance.healthCheck === 'function') {
        const healthResult = await instance.healthCheck();
        return {
          platform: platformName,
          status: 'healthy',
          ...healthResult
        };
      }

      return {
        platform: platformName,
        status: 'unknown',
        message: 'No health check method available'
      };

    } catch (error) {
      return {
        platform: platformName,
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * 打印注册信息（调试用）
   */
  static printRegistry() {
    console.log('\n=== SmartBuy Framework 平台注册中心 ===');
    
    console.log(`\n📊 统计信息:`);
    const stats = this.getStats();
    console.log(`  平台数: ${stats.totalPlatforms}`);
    console.log(`  指令数: ${stats.totalCommands}`);
    console.log(`  实例数: ${stats.totalInstances}`);

    console.log(`\n🏗️  已注册平台:`);
    for (const [name, info] of this.platforms.entries()) {
      console.log(`  • ${name} (v${info.version}) - ${info.registeredAt.toLocaleString()}`);
    }

    console.log(`\n📝 已注册指令:`);
    for (const [command, info] of this.commands.entries()) {
      console.log(`  • ${command} → ${info.platform}:${info.task}${info.mode ? ':' + info.mode : ''}`);
    }

    console.log('\n=====================================\n');
  }
}

module.exports = PlatformRegistry;