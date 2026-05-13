/**
 * SmartBuy Framework - 验证工具
 * 
 * 参数格式验证和业务规则验证
 */

class Validator {
  /**
   * 验证配置对象
   * @param {Object} config - 待验证的配置
   * @param {Object} schema - 验证规则
   * @returns {Object} 验证结果 { valid: boolean, errors: string[] }
   */
  static validateConfig(config, schema) {
    const errors = [];

    if (!config || typeof config !== 'object') {
      return {
        valid: false,
        errors: ['Config must be an object']
      };
    }

    // 验证每个字段
    for (const [field, rules] of Object.entries(schema)) {
      const fieldErrors = this.validateField(config[field], rules, field);
      errors.push(...fieldErrors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证单个字段
   * @private
   * @param {*} value - 字段值
   * @param {string|Array} rules - 验证规则
   * @param {string} fieldName - 字段名称
   * @returns {string[]} 错误列表
   */
  static validateField(value, rules, fieldName) {
    const errors = [];
    
    // 将规则字符串分割为数组
    const ruleArray = typeof rules === 'string' ? rules.split('|') : rules;
    
    for (const rule of ruleArray) {
      const error = this.validateRule(value, rule, fieldName);
      if (error) {
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * 验证单个规则
   * @private
   * @param {*} value - 字段值
   * @param {string} rule - 验证规则
   * @param {string} fieldName - 字段名称
   * @returns {string|null} 错误信息或null
   */
  static validateRule(value, rule, fieldName) {
    const [ruleName, ruleParam] = rule.split(':');

    switch (ruleName) {
      case 'required':
        return this.validateRequired(value, fieldName);
        
      case 'string':
        return this.validateString(value, fieldName);
        
      case 'number':
        return this.validateNumber(value, fieldName);
        
      case 'integer':
        return this.validateInteger(value, fieldName);
        
      case 'positive':
        return this.validatePositive(value, fieldName);
        
      case 'min':
        return this.validateMin(value, parseFloat(ruleParam), fieldName);
        
      case 'max':
        return this.validateMax(value, parseFloat(ruleParam), fieldName);
        
      case 'email':
        return this.validateEmail(value, fieldName);
        
      case 'phone':
        return this.validatePhone(value, fieldName);
        
      case 'productId':
        return this.validateProductId(value, fieldName);
        
      default:
        return `Unknown validation rule: ${ruleName}`;
    }
  }

  /**
   * 验证必填字段
   * @private
   */
  static validateRequired(value, fieldName) {
    if (value === null || value === undefined || value === '') {
      return `${fieldName} is required`;
    }
    return null;
  }

  /**
   * 验证字符串类型
   * @private
   */
  static validateString(value, fieldName) {
    if (value !== null && value !== undefined && typeof value !== 'string') {
      return `${fieldName} must be a string`;
    }
    return null;
  }

  /**
   * 验证数字类型
   * @private
   */
  static validateNumber(value, fieldName) {
    if (value !== null && value !== undefined && (typeof value !== 'number' || isNaN(value))) {
      return `${fieldName} must be a number`;
    }
    return null;
  }

  /**
   * 验证整数类型
   * @private
   */
  static validateInteger(value, fieldName) {
    const numberError = this.validateNumber(value, fieldName);
    if (numberError) return numberError;
    
    if (value !== null && value !== undefined && !Number.isInteger(value)) {
      return `${fieldName} must be an integer`;
    }
    return null;
  }

  /**
   * 验证正数
   * @private
   */
  static validatePositive(value, fieldName) {
    const numberError = this.validateNumber(value, fieldName);
    if (numberError) return numberError;
    
    if (value !== null && value !== undefined && value <= 0) {
      return `${fieldName} must be positive`;
    }
    return null;
  }

  /**
   * 验证最小值
   * @private
   */
  static validateMin(value, min, fieldName) {
    const numberError = this.validateNumber(value, fieldName);
    if (numberError) return numberError;
    
    if (value !== null && value !== undefined && value < min) {
      return `${fieldName} must be at least ${min}`;
    }
    return null;
  }

  /**
   * 验证最大值
   * @private
   */
  static validateMax(value, max, fieldName) {
    const numberError = this.validateNumber(value, fieldName);
    if (numberError) return numberError;
    
    if (value !== null && value !== undefined && value > max) {
      return `${fieldName} must be at most ${max}`;
    }
    return null;
  }

  /**
   * 验证邮箱格式
   * @private
   */
  static validateEmail(value, fieldName) {
    const stringError = this.validateString(value, fieldName);
    if (stringError) return stringError;
    
    if (value !== null && value !== undefined && value !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return `${fieldName} must be a valid email address`;
      }
    }
    return null;
  }

  /**
   * 验证手机号格式
   * @private
   */
  static validatePhone(value, fieldName) {
    const stringError = this.validateString(value, fieldName);
    if (stringError) return stringError;
    
    if (value !== null && value !== undefined && value !== '') {
      // 中国手机号格式：1开头，11位数字
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(value)) {
        return `${fieldName} must be a valid Chinese phone number`;
      }
    }
    return null;
  }

  /**
   * 验证商品ID格式
   * @private
   */
  static validateProductId(value, fieldName) {
    const stringError = this.validateString(value, fieldName);
    if (stringError) return stringError;
    
    if (value !== null && value !== undefined && value !== '') {
      // 商品ID应该是非空字符串，可以包含数字、字母、下划线、连字符
      const productIdRegex = /^[a-zA-Z0-9_-]+$/;
      if (!productIdRegex.test(value)) {
        return `${fieldName} must contain only letters, numbers, underscores, and hyphens`;
      }
    }
    return null;
  }

  /**
   * 验证智能购买配置
   * @param {Object} config - 智能购买配置
   * @returns {Object} 验证结果
   */
  static validateSmartBuyConfig(config) {
    const schema = {
      productId: 'required|string|productId',
      quantity: 'required|integer|positive',
      maxPrice: 'required|number|positive',
      account: 'required|string',
      password: 'required|string',
      payPassword: 'required|string',
      interval: 'number|min:100|max:10000',
      batchSize: 'integer|positive|max:50'
    };

    return this.validateConfig(config, schema);
  }

  /**
   * 验证合成确认配置
   * @param {Object} config - 合成确认配置
   * @returns {Object} 验证结果
   */
  static validateCombinationConfig(config) {
    const schema = {
      combinationId: 'required|string',
      account: 'required|string',
      password: 'required|string',
      payPassword: 'required|string'
    };

    return this.validateConfig(config, schema);
  }

  /**
   * 验证取消寄售配置
   * @param {Object} config - 取消寄售配置
   * @returns {Object} 验证结果
   */
  static validateCancelResaleConfig(config) {
    const schema = {
      resaleId: 'required|string',
      account: 'required|string',
      password: 'required|string',
      payPassword: 'required|string'
    };

    return this.validateConfig(config, schema);
  }

  /**
   * 验证平台适配器
   * @param {Object} adapter - 平台适配器实例
   * @returns {Object} 验证结果
   */
  static validatePlatformAdapter(adapter) {
    const errors = [];

    if (!adapter) {
      return {
        valid: false,
        errors: ['Adapter is required']
      };
    }

    // 检查必需的方法
    const requiredMethods = [
      'login',
      'refreshToken', 
      'validateToken',
      'logout',
      'getProductList',
      'placeOrder',
      'quickOrder',
      'batchOrder',
      'getPaymentUrl',
      'executePayment',
      'confirmCombination',
      'cancelResale'
    ];

    for (const method of requiredMethods) {
      if (typeof adapter[method] !== 'function') {
        errors.push(`Adapter missing required method: ${method}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 清理和标准化配置
   * @param {Object} config - 原始配置
   * @returns {Object} 清理后的配置
   */
  static sanitizeConfig(config) {
    const sanitized = { ...config };

    // 清理字符串字段
    const stringFields = ['account', 'password', 'payPassword', 'productId', 'combinationId', 'resaleId'];
    
    for (const field of stringFields) {
      if (typeof sanitized[field] === 'string') {
        sanitized[field] = sanitized[field].trim();
      }
    }

    // 标准化数字字段
    const numberFields = ['quantity', 'maxPrice', 'interval', 'batchSize'];
    
    for (const field of numberFields) {
      if (sanitized[field] !== null && sanitized[field] !== undefined) {
        sanitized[field] = Number(sanitized[field]);
      }
    }

    // 设置默认值
    if (sanitized.interval === undefined) {
      sanitized.interval = 800;
    }

    return sanitized;
  }
}

module.exports = Validator;