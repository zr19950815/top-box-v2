/**
 * HzMiss平台指令定义
 * 
 * 定义HzMiss平台支持的所有指令映射和参数解析规则
 */

const { ErrorFactory } = require('../../utils/ErrorTypes');
const Validator = require('../../utils/Validator');

/**
 * HzMiss平台指令映射
 */
const COMMAND_MAPPINGS = {
  // 智能购买指令
  'hz列表': {
    platform: 'hzmiss',
    task: 'smart-buy',
    mode: 'list',
    description: 'HzMiss列表模式智能购买'
  },
  'hz快捷': {
    platform: 'hzmiss',
    task: 'smart-buy',
    mode: 'quick',
    description: 'HzMiss快捷模式智能购买'
  },
  'hz批量': {
    platform: 'hzmiss',
    task: 'smart-buy',
    mode: 'batch',
    description: 'HzMiss批量模式智能购买'
  },

  // 合成确认指令
  'hz合成': {
    platform: 'hzmiss',
    task: 'combination',
    mode: 'confirm',
    description: 'HzMiss合成确认'
  },
  'hz合成确认': {
    platform: 'hzmiss',
    task: 'combination',
    mode: 'confirm',
    description: 'HzMiss合成确认'
  },

  // 取消寄售指令
  'hz取消': {
    platform: 'hzmiss',
    task: 'cancel-resale',
    mode: 'cancel',
    description: 'HzMiss取消寄售'
  },
  'hz取消寄售': {
    platform: 'hzmiss',
    task: 'cancel-resale',
    mode: 'cancel',
    description: 'HzMiss取消寄售'
  },

  // HzMiss特有功能
  'hz收藏': {
    platform: 'hzmiss',
    task: 'collection-check',
    mode: 'count',
    description: 'HzMiss查看收藏数量'
  }
};

/**
 * 参数解析器
 */
class HzMissCommandParser {
  /**
   * 解析智能购买指令参数
   * @param {string[]} parts - 指令分割后的部分
   * @param {string} mode - 模式 (list/quick/batch)
   * @returns {Object} 解析结果
   */
  static parseSmartBuyParams(parts, mode) {
    // 预期格式: hz列表-手机号-token-支付密码-商品集合ID*数量*最高价格
    if (parts.length < 5) {
      throw ErrorFactory.createValidationError(
        `智能购买指令参数不足，预期格式: hz${mode}-手机号-token-支付密码-商品集合ID*数量*最高价格`
      );
    }

    const [, account, password, payPassword, productSpec] = parts;

    // 解析商品规格: 商品集合ID*数量*最高价格
    const specParts = productSpec.split('*');
    if (specParts.length !== 3) {
      throw ErrorFactory.createValidationError(
        '商品规格格式错误，应为: 商品集合ID*数量*最高价格'
      );
    }

    const [productId, quantityStr, maxPriceStr] = specParts;
    const quantity = parseInt(quantityStr);
    const maxPrice = parseFloat(maxPriceStr);

    if (isNaN(quantity) || quantity <= 0) {
      throw ErrorFactory.createValidationError('数量必须为正整数');
    }

    if (isNaN(maxPrice) || maxPrice <= 0) {
      throw ErrorFactory.createValidationError('最高价格必须为正数');
    }

    const params = {
      account,
      password,
      payPassword,
      productId,
      quantity,
      maxPrice,
      mode
    };

    // 验证参数
    const validationResult = this.validateSmartBuyParams(params);
    if (!validationResult.valid) {
      throw ErrorFactory.createValidationError(
        `参数验证失败: ${validationResult.errors.join(', ')}`
      );
    }

    return params;
  }

  /**
   * 解析合成确认指令参数
   * @param {string[]} parts - 指令分割后的部分
   * @returns {Object} 解析结果
   */
  static parseCombinationParams(parts) {
    // 预期格式: hz合成-手机号-token-支付密码-合成ID
    if (parts.length < 5) {
      throw ErrorFactory.createValidationError(
        '合成确认指令参数不足，预期格式: hz合成-手机号-token-支付密码-合成ID'
      );
    }

    const [, account, password, payPassword, combinationId] = parts;

    const params = {
      account,
      password,
      payPassword,
      combinationId
    };

    // 验证参数
    const validationResult = this.validateCombinationParams(params);
    if (!validationResult.valid) {
      throw ErrorFactory.createValidationError(
        `参数验证失败: ${validationResult.errors.join(', ')}`
      );
    }

    return params;
  }

  /**
   * 解析取消寄售指令参数
   * @param {string[]} parts - 指令分割后的部分
   * @returns {Object} 解析结果
   */
  static parseCancelResaleParams(parts) {
    // 预期格式: hz取消-手机号-token-支付密码-寄售ID
    if (parts.length < 5) {
      throw ErrorFactory.createValidationError(
        '取消寄售指令参数不足，预期格式: hz取消-手机号-token-支付密码-寄售ID'
      );
    }

    const [, account, password, payPassword, resaleId] = parts;

    const params = {
      account,
      password,
      payPassword,
      resaleId
    };

    // 验证参数
    const validationResult = this.validateCancelResaleParams(params);
    if (!validationResult.valid) {
      throw ErrorFactory.createValidationError(
        `参数验证失败: ${validationResult.errors.join(', ')}`
      );
    }

    return params;
  }

  /**
   * 解析收藏查询指令参数
   * @param {string[]} parts - 指令分割后的部分
   * @returns {Object} 解析结果
   */
  static parseCollectionParams(parts) {
    // 预期格式: hz收藏-手机号-token-商品集合ID
    if (parts.length < 4) {
      throw ErrorFactory.createValidationError(
        '收藏查询指令参数不足，预期格式: hz收藏-手机号-token-商品集合ID'
      );
    }

    const [, account, password, collectionId] = parts;

    const params = {
      account,
      password,
      collectionId
    };

    // 简单验证
    if (!account || !password || !collectionId) {
      throw ErrorFactory.createValidationError('账号、token和商品集合ID都不能为空');
    }

    return params;
  }

  /**
   * 验证智能购买参数
   * @private
   * @param {Object} params - 参数对象
   * @returns {Object} 验证结果
   */
  static validateSmartBuyParams(params) {
    const schema = {
      account: 'required|string|phone',
      password: 'required|string', // HzMiss的token
      payPassword: 'required|string',
      productId: 'required|string',
      quantity: 'required|integer|positive',
      maxPrice: 'required|number|positive'
    };

    return Validator.validateConfig(params, schema);
  }

  /**
   * 验证合成确认参数
   * @private
   * @param {Object} params - 参数对象
   * @returns {Object} 验证结果
   */
  static validateCombinationParams(params) {
    const schema = {
      account: 'required|string|phone',
      password: 'required|string',
      payPassword: 'required|string',
      combinationId: 'required|string'
    };

    return Validator.validateConfig(params, schema);
  }

  /**
   * 验证取消寄售参数
   * @private
   * @param {Object} params - 参数对象
   * @returns {Object} 验证结果
   */
  static validateCancelResaleParams(params) {
    const schema = {
      account: 'required|string|phone',
      password: 'required|string',
      payPassword: 'required|string',
      resaleId: 'required|string'
    };

    return Validator.validateConfig(params, schema);
  }
}

/**
 * HzMiss指令处理器
 */
class HzMissCommandHandler {
  /**
   * 解析HzMiss指令
   * @param {string} command - 完整指令字符串
   * @returns {Object} 解析结果
   */
  static parseCommand(command) {
    const parts = command.split('-');
    if (parts.length < 2) {
      throw ErrorFactory.createValidationError('指令格式错误，缺少必要参数');
    }

    const commandKey = parts[0];
    
    // 检查指令是否存在
    if (!COMMAND_MAPPINGS[commandKey]) {
      throw ErrorFactory.createValidationError(`未知的HzMiss指令: ${commandKey}`);
    }

    const mapping = COMMAND_MAPPINGS[commandKey];
    let params;

    try {
      // 根据任务类型解析参数
      switch (mapping.task) {
        case 'smart-buy':
          params = HzMissCommandParser.parseSmartBuyParams(parts, mapping.mode);
          break;
          
        case 'combination':
          params = HzMissCommandParser.parseCombinationParams(parts);
          break;
          
        case 'cancel-resale':
          params = HzMissCommandParser.parseCancelResaleParams(parts);
          break;
          
        case 'collection-check':
          params = HzMissCommandParser.parseCollectionParams(parts);
          break;
          
        default:
          throw ErrorFactory.createValidationError(`不支持的任务类型: ${mapping.task}`);
      }
    } catch (error) {
      throw ErrorFactory.createValidationError(`参数解析失败: ${error.message}`);
    }

    return {
      platform: mapping.platform,
      task: mapping.task,
      mode: mapping.mode,
      params: Validator.sanitizeConfig(params),
      originalCommand: command,
      description: mapping.description
    };
  }

  /**
   * 获取帮助信息
   * @returns {string} 帮助文本
   */
  static getHelp() {
    let help = '\n🎪 HzMiss平台指令:\n';
    
    help += '\n📦 智能购买:\n';
    help += '  hz列表-手机号-token-支付密码-商品集合ID*数量*最高价格\n';
    help += '  hz快捷-手机号-token-支付密码-商品集合ID*数量*最高价格\n';
    help += '  hz批量-手机号-token-支付密码-商品集合ID*数量*最高价格\n';
    
    help += '\n🔧 其他功能:\n';
    help += '  hz合成-手机号-token-支付密码-合成ID\n';
    help += '  hz取消-手机号-token-支付密码-寄售ID\n';
    help += '  hz收藏-手机号-token-商品集合ID\n';
    
    help += '\n📋 参数说明:\n';
    help += '  • 手机号: 11位中国手机号码\n';
    help += '  • token: HzMiss平台的授权token\n';
    help += '  • 支付密码: 支付时使用的密码\n';
    help += '  • 商品集合ID: HzMiss平台的商品集合编号\n';
    help += '  • 数量: 购买数量 (正整数)\n';
    help += '  • 最高价格: 可接受的最高单价 (正数)\n';
    help += '  • 合成ID: 待确认的合成任务ID\n';
    help += '  • 寄售ID: 要取消的寄售任务ID\n';

    return help;
  }

  /**
   * 获取所有可用指令
   * @returns {Array} 指令列表
   */
  static getAllCommands() {
    return Object.keys(COMMAND_MAPPINGS).map(key => ({
      command: key,
      ...COMMAND_MAPPINGS[key]
    }));
  }
}

// 直接导出命令映射（PlatformRegistry需要的格式）
module.exports = COMMAND_MAPPINGS;