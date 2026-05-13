/**
 * KyArt平台指令定义
 * 
 * 定义KyArt平台支持的所有指令映射和参数解析规则
 */

const { ErrorFactory } = require('../../utils/ErrorTypes');
const Validator = require('../../utils/Validator');

/**
 * KyArt平台指令映射
 */
const COMMAND_MAPPINGS = {
  // 智能购买指令
  'ky列表': {
    platform: 'kyart',
    task: 'smart-buy',
    mode: 'list',
    description: 'KyArt列表模式智能购买'
  },
  'ky快捷': {
    platform: 'kyart',
    task: 'smart-buy',
    mode: 'quick',
    description: 'KyArt快捷模式智能购买'
  },
  'ky批量': {
    platform: 'kyart',
    task: 'smart-buy',
    mode: 'batch',
    description: 'KyArt批量模式智能购买'
  },

  // 合成确认指令
  'ky合成': {
    platform: 'kyart',
    task: 'combination',
    mode: 'confirm',
    description: 'KyArt合成确认'
  },
  'ky合成确认': {
    platform: 'kyart',
    task: 'combination',
    mode: 'confirm',
    description: 'KyArt合成确认'
  },

  // 取消寄售指令
  'ky取消': {
    platform: 'kyart',
    task: 'cancel-resale',
    mode: 'cancel',
    description: 'KyArt取消寄售'
  },
  'ky取消寄售': {
    platform: 'kyart',
    task: 'cancel-resale',
    mode: 'cancel',
    description: 'KyArt取消寄售'
  }
};

/**
 * 参数解析器
 */
class KyArtCommandParser {
  /**
   * 解析智能购买指令参数
   * @param {string[]} parts - 指令分割后的部分
   * @param {string} mode - 模式 (list/quick/batch)
   * @returns {Object} 解析结果
   */
  static parseSmartBuyParams(parts, mode) {
    // 预期格式: ky列表-手机号-登录密码-支付密码-商品ID*数量*最高价格
    if (parts.length < 5) {
      throw ErrorFactory.createValidationError(
        `智能购买指令参数不足，预期格式: ky${mode}-手机号-登录密码-支付密码-商品ID*数量*最高价格`
      );
    }

    const [, account, password, payPassword, productSpec] = parts;

    // 解析商品规格: 商品ID*数量*最高价格
    const specParts = productSpec.split('*');
    if (specParts.length !== 3) {
      throw ErrorFactory.createValidationError(
        '商品规格格式错误，应为: 商品ID*数量*最高价格'
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
    // 预期格式: ky合成-手机号-登录密码-支付密码-合成ID
    if (parts.length < 5) {
      throw ErrorFactory.createValidationError(
        '合成确认指令参数不足，预期格式: ky合成-手机号-登录密码-支付密码-合成ID'
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
    // 预期格式: ky取消-手机号-登录密码-支付密码-寄售ID
    if (parts.length < 5) {
      throw ErrorFactory.createValidationError(
        '取消寄售指令参数不足，预期格式: ky取消-手机号-登录密码-支付密码-寄售ID'
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
   * 验证智能购买参数
   * @private
   * @param {Object} params - 参数对象
   * @returns {Object} 验证结果
   */
  static validateSmartBuyParams(params) {
    const schema = {
      account: 'required|string|phone',
      password: 'required|string',
      payPassword: 'required|string',
      productId: 'required|string|productId',
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
 * KyArt指令处理器
 */
class KyArtCommandHandler {
  /**
   * 解析KyArt指令
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
      throw ErrorFactory.createValidationError(`未知的KyArt指令: ${commandKey}`);
    }

    const mapping = COMMAND_MAPPINGS[commandKey];
    let params;

    try {
      // 根据任务类型解析参数
      switch (mapping.task) {
        case 'smart-buy':
          params = KyArtCommandParser.parseSmartBuyParams(parts, mapping.mode);
          break;
          
        case 'combination':
          params = KyArtCommandParser.parseCombinationParams(parts);
          break;
          
        case 'cancel-resale':
          params = KyArtCommandParser.parseCancelResaleParams(parts);
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
    let help = '\n🏪 KyArt平台指令:\n';
    
    help += '\n📦 智能购买:\n';
    help += '  ky列表-手机号-登录密码-支付密码-商品ID*数量*最高价格\n';
    help += '  ky快捷-手机号-登录密码-支付密码-商品ID*数量*最高价格\n';
    help += '  ky批量-手机号-登录密码-支付密码-商品ID*数量*最高价格\n';
    
    help += '\n🔧 其他功能:\n';
    help += '  ky合成-手机号-登录密码-支付密码-合成ID\n';
    help += '  ky取消-手机号-登录密码-支付密码-寄售ID\n';
    
    help += '\n📋 参数说明:\n';
    help += '  • 手机号: 11位中国手机号码\n';
    help += '  • 登录密码: 账户登录密码\n';
    help += '  • 支付密码: 支付时使用的密码\n';
    help += '  • 商品ID: KyArt平台的商品编号\n';
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