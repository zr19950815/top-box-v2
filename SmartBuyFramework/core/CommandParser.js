/**
 * SmartBuy Framework - 指令解析器
 * 
 * 解析字符串指令为结构化配置对象
 * 支持格式: <平台><任务>-<账号>-<密码>-<支付密码>-<参数>
 */

const ProductConfigManager = require('../config/ProductConfigManager');

class CommandParser {
  /**
   * 解析指令字符串
   * @param {string} commandString - 指令字符串
   * @returns {Object} 解析结果
   */
  static parse(commandString) {
    if (!commandString || typeof commandString !== 'string') {
      throw new Error('Command string is required and must be a string');
    }

    console.log(`[指令解析器] 🔍 解析指令: ${commandString}`);

    try {
      // 智能分割：支持[]括号内的-符号不被分割
      const parts = this.smartSplit(commandString);
      
      if (parts.length < 2) {
        throw new Error('Invalid command format. Expected: <command>-<params>');
      }

      const command = parts[0];
      const params = parts.slice(1);

      // 解析指令部分（平台+任务）
      const commandInfo = this.parseCommand(command);
      
      // 解析参数部分
      const parsedParams = this.parseParams(params, commandInfo.task, commandInfo.platform);
      
      const result = {
        platform: commandInfo.platform,
        task: commandInfo.task,
        mode: commandInfo.mode,
        params: parsedParams
      };

      console.log(`[指令解析器] ✅ 解析成功:`, {
        platform: result.platform,
        task: result.task,
        mode: result.mode,
        account: result.params.account
      });

      return result;

    } catch (error) {
      console.error(`[指令解析器] ❌ 解析失败: ${error.message}`);
      throw new Error(`Command parsing failed: ${error.message}`);
    }
  }

  /**
   * 智能分割命令字符串，支持[]括号内的-符号
   * @private
   * @param {string} commandString - 命令字符串
   * @returns {Array} 分割后的部分
   */
  static smartSplit(commandString) {
    const parts = [];
    let current = '';
    let inBrackets = false;
    
    for (let i = 0; i < commandString.length; i++) {
      const char = commandString[i];
      
      if (char === '[') {
        inBrackets = true;
        current += char;
      } else if (char === ']') {
        inBrackets = false;
        current += char;
      } else if (char === '-' && !inBrackets) {
        // 只有不在[]括号内的-才作为分隔符
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    // 添加最后一部分
    if (current) {
      parts.push(current);
    }
    
    console.log(`[指令解析器] 智能分割结果:`, parts);
    return parts;
  }

  /**
   * 解析指令部分（平台+任务）
   * @private
   * @param {string} command - 指令字符串
   * @returns {Object} 指令信息
   */
  static parseCommand(command) {
    // 定义指令映射表
    const commandMappings = {
      // KyArt平台指令
      'ky列表': { platform: 'kyart', task: 'smart-buy', mode: 'list' },
      'ky快捷': { platform: 'kyart', task: 'smart-buy', mode: 'quick' },
      'ky批量': { platform: 'kyart', task: 'smart-buy', mode: 'batch' },
      'ky合成': { platform: 'kyart', task: 'combination' },
      'ky取消': { platform: 'kyart', task: 'cancel-resale' },
      
      // HzMiss平台指令
      'hz列表': { platform: 'hzmiss', task: 'smart-buy', mode: 'list' },
      'hz快捷': { platform: 'hzmiss', task: 'smart-buy', mode: 'quick' },
      'hz批量': { platform: 'hzmiss', task: 'smart-buy', mode: 'batch' },
      'hz合成': { platform: 'hzmiss', task: 'combination' },
      'hz取消': { platform: 'hzmiss', task: 'cancel-resale' },

      // JulianBaby / Bull Box 平台指令
      'jl列表': { platform: 'julianbaby', task: 'smart-buy', mode: 'list' },
      'jl快捷': { platform: 'julianbaby', task: 'smart-buy', mode: 'quick' },
      'jl批量': { platform: 'julianbaby', task: 'smart-buy', mode: 'batch' },
      'jl合成': { platform: 'julianbaby', task: 'combination' },
      'jl取消': { platform: 'julianbaby', task: 'cancel-resale' },
      'bb列表': { platform: 'julianbaby', task: 'smart-buy', mode: 'list' },
      'bb快捷': { platform: 'julianbaby', task: 'smart-buy', mode: 'quick' },
      'bb批量': { platform: 'julianbaby', task: 'smart-buy', mode: 'batch' },
      'bb合成': { platform: 'julianbaby', task: 'combination' },
      'bb取消': { platform: 'julianbaby', task: 'cancel-resale' },

      // HC / Huancang 平台指令
      'hc列表': { platform: 'hc', task: 'smart-buy', mode: 'list' },
      'hc快捷': { platform: 'hc', task: 'smart-buy', mode: 'quick' },
      'hc批量': { platform: 'hc', task: 'smart-buy', mode: 'batch' },
      'hc合成': { platform: 'hc', task: 'combination' },
      'hc取消': { platform: 'hc', task: 'cancel-resale' },
      
      // TopBox平台指令（未来扩展）
      'tb列表': { platform: 'topbox', task: 'smart-buy', mode: 'list' },
      'tb快捷': { platform: 'topbox', task: 'smart-buy', mode: 'quick' },
      'tb批量': { platform: 'topbox', task: 'smart-buy', mode: 'batch' },
      'tb合成': { platform: 'topbox', task: 'combination' },
      'tb取消': { platform: 'topbox', task: 'cancel-resale' }
    };

    const commandInfo = commandMappings[command];
    
    if (!commandInfo) {
      const availableCommands = Object.keys(commandMappings).join(', ');
      throw new Error(`Unknown command: ${command}. Available commands: ${availableCommands}`);
    }

    return commandInfo;
  }

  /**
   * 解析参数部分
   * @private
   * @param {string[]} params - 参数数组
   * @param {string} taskType - 任务类型
   * @param {string} platform - 平台名称
   * @returns {Object} 解析后的参数
   */
  static parseParams(params, taskType, platform) {
    const baseParams = this.parseBaseParams(params);
    
    switch (taskType) {
      case 'smart-buy':
        return this.parseSmartBuyParams(baseParams, params, platform);
        
      case 'combination':
        return this.parseCombinationParams(baseParams, params);
        
      case 'cancel-resale':
        return this.parseCancelResaleParams(baseParams, params);
        
      default:
        return baseParams;
    }
  }

  /**
   * 解析基础参数（账号、密码/token等）
   * @private
   * @param {string[]} params - 参数数组
   * @returns {Object} 基础参数
   */
  static parseBaseParams(params) {
    if (params.length < 3) {
      throw new Error('Missing required parameters. Expected: account-password-payPassword-... or [token]-payPassword-...');
    }

    const firstParam = params[0];
    const isDirectTokenMode =
      firstParam.startsWith('[') && firstParam.endsWith(']');

    if (isDirectTokenMode) {
      const token = firstParam.slice(1, -1);
      console.log(`[指令解析器] 检测到Token模式，Token长度: ${token.length}`);

      return {
        account: null,
        token,
        payPassword: params[1],
        authMode: 'token',
      };
    }

    const loginParam = params[1];
    const payParam = params[2];
    const isLegacyTokenMode =
      loginParam.startsWith('[') && loginParam.endsWith(']');

    if (isLegacyTokenMode) {
      const token = loginParam.slice(1, -1);
      console.log(`[指令解析器] 检测到兼容Token模式，Token长度: ${token.length}`);

      return {
        account: params[0],
        token,
        payPassword: payParam,
        authMode: 'token',
      };
    }

    console.log(`[指令解析器] 检测到密码模式`);

    return {
      account: params[0],
      password: loginParam,
      payPassword: payParam,
      authMode: 'password',
    };
  }

  /**
   * 解析智能购买参数
   * @private
   * @param {Object} baseParams - 基础参数
   * @param {string[]} params - 参数数组  
   * @param {string} platform - 平台名称
   * @returns {Object} 智能购买参数
   */
  static parseSmartBuyParams(baseParams, params, platform) {
    const productSpecIndex = baseParams.authMode === 'token'
      ? (baseParams.account ? 3 : 2)
      : 3;

    if (params.length <= productSpecIndex) {
      throw new Error(
        'Missing product parameters for smart-buy task. Expected: account-password-payPassword-productSpec or [token]-payPassword-productSpec'
      );
    }

    // 解析商品规格: 商品名称/ID*数量*最高价格
    const productSpec = params[productSpecIndex];
    const productParts = productSpec.split('*');
    
    if (productParts.length !== 3) {
      throw new Error('Invalid product specification. Expected format: productName/productId*quantity*maxPrice');
    }

    const productIdentifier = productParts[0]; // 可能是名称或ID
    const quantity = parseInt(productParts[1], 10);
    const maxPrice = parseFloat(productParts[2]);

    // 验证基础参数
    if (!productIdentifier) {
      throw new Error('Product identifier cannot be empty');
    }
    
    if (isNaN(quantity) || quantity <= 0) {
      throw new Error('Quantity must be a positive number');
    }
    
    if (isNaN(maxPrice) || maxPrice <= 0) {
      throw new Error('Max price must be a positive number');
    }

    // 获取商品配置（支持名称和ID）
    const productConfig = ProductConfigManager.getProductConfig(platform, productIdentifier);
    
    if (!productConfig) {
      // HC 支持在适配器内按藏品名称动态同步商品ID。
      if (platform === 'hc') {
        console.warn(`[指令解析器] ⚠️  HC商品 ${productIdentifier} 未在配置中找到，交由适配器动态解析`);
        return {
          ...baseParams,
          productId: productIdentifier,
          productConfig: {
            name: productIdentifier,
            platform: platform,
            id: productIdentifier,
            unresolved: true
          },
          quantity,
          maxPrice,
          interval: 800,
          batchSize: params[4] ? parseInt(params[4], 10) : undefined
        };
      }

      // 如果找不到商品配置，但是是数字ID，则创建基础配置对象（向下兼容）
      if (/^\d+$/.test(productIdentifier)) {
        console.warn(`[指令解析器] ⚠️  商品ID ${productIdentifier} 未在配置中找到，使用兼容模式`);
        return {
          ...baseParams,
          productId: productIdentifier,
          productConfig: {
            name: `商品${productIdentifier}`,
            platform: platform,
            id: productIdentifier
          },
          quantity,
          maxPrice,
          interval: 800,
          batchSize: params[4] ? parseInt(params[4], 10) : undefined
        };
      } else {
        throw new Error(`Unknown product: ${productIdentifier}. Please check product name or use product ID.`);
      }
    }

    console.log(`[指令解析器] ✅ 商品配置解析成功: ${productConfig.name} (ID: ${productConfig.id})`);

    return {
      ...baseParams,
      productId: productConfig.id, // 保持兼容性
      productConfig: productConfig, // 完整的商品配置对象
      quantity,
      maxPrice,
      // 可选参数
      interval: 800, // 默认间隔
      batchSize: params[4] ? parseInt(params[4], 10) : undefined // 批量大小（可选）
    };
  }

  /**
   * 解析合成确认参数
   * @private
   * @param {Object} baseParams - 基础参数
   * @param {string[]} params - 参数数组
   * @returns {Object} 合成确认参数
   */
  static parseCombinationParams(baseParams, params) {
    if (params.length < 4) {
      throw new Error('Missing combination ID for combination task. Expected: account-password-payPassword-combinationId');
    }

    const combinationId = params[3];
    
    if (!combinationId) {
      throw new Error('Combination ID cannot be empty');
    }

    return {
      ...baseParams,
      combinationId
    };
  }

  /**
   * 解析取消寄售参数
   * @private
   * @param {Object} baseParams - 基础参数
   * @param {string[]} params - 参数数组
   * @returns {Object} 取消寄售参数
   */
  static parseCancelResaleParams(baseParams, params) {
    if (params.length < 4) {
      throw new Error('Missing resale ID for cancel-resale task. Expected: account-password-payPassword-resaleId');
    }

    const resaleId = params[3];
    
    if (!resaleId) {
      throw new Error('Resale ID cannot be empty');
    }

    return {
      ...baseParams,
      resaleId
    };
  }

  /**
   * 验证解析结果
   * @param {Object} parseResult - 解析结果
   * @returns {boolean} 是否有效
   */
  static validate(parseResult) {
    try {
      // 检查必需字段
      if (!parseResult.platform) {
        throw new Error('Missing platform');
      }
      
      if (!parseResult.task) {
        throw new Error('Missing task');
      }
      
      if (!parseResult.params) {
        throw new Error('Missing params');
      }
      
      // 根据认证模式验证不同的字段
      if (parseResult.params.authMode === 'token') {
        if (!parseResult.params.token) {
          throw new Error('Missing token');
        }
      } else {
        if (!parseResult.params.account) {
          throw new Error('Missing account');
        }
        if (!parseResult.params.password) {
          throw new Error('Missing password');
        }
      }
      
      if (!parseResult.params.payPassword) {
        throw new Error('Missing pay password');
      }

      // 根据任务类型验证特定字段
      switch (parseResult.task) {
        case 'smart-buy':
          if (!parseResult.params.productId) {
            throw new Error('Missing productId for smart-buy task');
          }
          if (!parseResult.params.quantity) {
            throw new Error('Missing quantity for smart-buy task');
          }
          if (!parseResult.params.maxPrice) {
            throw new Error('Missing maxPrice for smart-buy task');
          }
          break;
          
        case 'combination':
          if (!parseResult.params.combinationId) {
            throw new Error('Missing combinationId for combination task');
          }
          break;
          
        case 'cancel-resale':
          if (!parseResult.params.resaleId) {
            throw new Error('Missing resaleId for cancel-resale task');
          }
          break;
      }

      return true;

    } catch (error) {
      console.error(`[指令解析器] ❌ 验证失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 格式化指令帮助信息
   * @returns {string} 帮助信息
   */
  static getHelp() {
    return `
SmartBuy Framework 指令格式说明:

📋 抢购任务:
  ky列表-手机号-登录密码-支付密码-商品名称/ID*数量*最高价格
  ky快捷-手机号-登录密码-支付密码-商品名称/ID*数量*最高价格
  ky批量-手机号-登录密码-支付密码-商品名称/ID*数量*最高价格
  hc列表-手机号-登录密码-支付密码-商品ID*数量*最高价格

🔗 简单任务:
  ky合成-手机号-登录密码-支付密码-合成ID
  ky取消-手机号-登录密码-支付密码-寄售ID
  hc合成-手机号-登录密码-支付密码-合成ID:素材ID1,素材ID2
  hc取消-手机号-登录密码-支付密码-商品ID

🔑 Token模式（新增）:
  ky快捷-手机号-[your-token-here]-支付密码-商品名称/ID*数量*最高价格
  hz列表-手机号-[token-with-dashes]-支付密码-商品名称/ID*数量*最高价格
  hc列表-[token-with-dashes]-支付密码-商品ID*数量*最高价格

📝 示例:
  # 密码模式
  node cli ky列表-18812345678-pwd123-pay123-小小歌星*2*100
  node cli hz快捷-13987654321-pwd456-pay456-数字收藏A*1*50
  
	  # Token模式  
	  node cli ky快捷-手机号-[your-token]-支付密码-艺术猫岚炎*2*150
	  node cli hz列表-手机号-[token]-支付密码-测试收藏X*1*10
	  node cli hc列表-[token]-支付密码-6267*1*428
  
  # 向下兼容（仍支持数字ID）
  node cli ky合成-18812345678-pwd123-pay123-combo123
  node cli ky快捷-手机号-密码-支付密码-564*2*1400

🎯 支持的平台:
  ky  - KyArt平台
  hz  - HzMiss平台
  hc  - HC/Huancang平台
  tb  - TopBox平台（开发中）

⚡ 支持的模式:
  列表 - 刷新列表选择最优商品
  快捷 - 直接调用快捷下单接口
  批量 - 批量下单模式

💡 认证模式:
  密码模式 - 使用登录密码进行认证
  Token模式 - 使用[token]格式，支持token内包含-符号

🛍️ 商品配置:
  商品名称 - 支持中文商品名称，如"小小歌星"、"数字收藏A"
  数字ID - 向下兼容数字ID格式，如"564"、"590"
  自动配置 - 根据商品名称自动获取平台所需的id、key等参数
    `;
  }

  /**
   * 生成示例指令
   * @param {string} platform - 平台名称
   * @param {string} task - 任务类型
   * @returns {string} 示例指令
   */
  static generateExample(platform = 'ky', task = 'smart-buy') {
    const examples = {
      'ky-smart-buy': 'ky列表-18812345678-pwd123-pay123-12345*2*100',
      'hz-smart-buy': 'hz快捷-13987654321-pwd456-pay456-67890*1*50', 
      'ky-combination': 'ky合成-18812345678-pwd123-pay123-combo123',
      'ky-cancel-resale': 'ky取消-18812345678-pwd123-pay123-resale456'
    };

    const key = `${platform}-${task}`;
    return examples[key] || examples['ky-smart-buy'];
  }
}

module.exports = CommandParser;
