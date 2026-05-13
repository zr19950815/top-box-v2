/**
 * SmartBuy Framework - 错误类型定义
 * 
 * 标准化的错误类型和错误处理
 */

/**
 * 标准错误类型枚举
 */
const ErrorTypes = {
  // 网络相关错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  
  // API相关错误
  API_ERROR: 'API_ERROR',
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_ERROR: 'RESPONSE_ERROR',
  
  // 认证相关错误
  AUTH_ERROR: 'AUTH_ERROR',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  LOGIN_FAILED: 'LOGIN_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // 业务相关错误
  NO_QUALIFIED_PRODUCTS: 'NO_QUALIFIED_PRODUCTS',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  ORDER_FAILED: 'ORDER_FAILED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  
  // 配置相关错误
  CONFIG_ERROR: 'CONFIG_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  
  // 系统相关错误
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * SmartBuy 自定义错误类
 */
class SmartBuyError extends Error {
  /**
   * 构造函数
   * @param {string} message - 错误消息
   * @param {string} type - 错误类型
   * @param {string|number} [code] - 错误代码
   * @param {*} [data] - 附加数据
   */
  constructor(message, type = ErrorTypes.UNKNOWN_ERROR, code = null, data = null) {
    super(message);
    
    this.name = 'SmartBuyError';
    this.type = type;
    this.code = code;
    this.data = data;
    this.timestamp = new Date();
    
    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SmartBuyError);
    }
  }

  /**
   * 转换为JSON格式
   * @returns {Object} JSON对象
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      code: this.code,
      data: this.data,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * 转换为简化的字符串格式
   * @returns {string} 字符串表示
   */
  toString() {
    let result = `${this.type}: ${this.message}`;
    
    if (this.code) {
      result += ` (Code: ${this.code})`;
    }
    
    return result;
  }

  /**
   * 检查是否为特定类型的错误
   * @param {string} type - 错误类型
   * @returns {boolean} 是否匹配
   */
  isType(type) {
    return this.type === type;
  }

  /**
   * 检查是否为可重试的错误
   * @returns {boolean} 是否可重试
   */
  isRetryable() {
    const retryableTypes = [
      ErrorTypes.NETWORK_ERROR,
      ErrorTypes.TIMEOUT_ERROR,
      ErrorTypes.CONNECTION_ERROR,
      ErrorTypes.API_ERROR,
      ErrorTypes.NO_QUALIFIED_PRODUCTS,
      ErrorTypes.PRODUCT_UNAVAILABLE
    ];
    
    return retryableTypes.includes(this.type);
  }

  /**
   * 检查是否为致命错误（应该停止任务）
   * @returns {boolean} 是否为致命错误
   */
  isFatal() {
    const fatalTypes = [
      ErrorTypes.PAYMENT_FAILED,
      ErrorTypes.INSUFFICIENT_BALANCE,
      ErrorTypes.LOGIN_FAILED,
      ErrorTypes.UNAUTHORIZED,
      ErrorTypes.VALIDATION_ERROR,
      ErrorTypes.CONFIG_ERROR
    ];
    
    return fatalTypes.includes(this.type);
  }
}

/**
 * 错误工厂类 - 用于创建标准化错误
 */
class ErrorFactory {
  /**
   * 创建网络错误
   * @param {string} message - 错误消息
   * @param {*} [data] - 附加数据
   * @returns {SmartBuyError} 错误实例
   */
  static createNetworkError(message, data = null) {
    return new SmartBuyError(message, ErrorTypes.NETWORK_ERROR, null, data);
  }

  /**
   * 创建认证错误
   * @param {string} message - 错误消息
   * @param {*} [data] - 附加数据
   * @returns {SmartBuyError} 错误实例
   */
  static createAuthError(message, data = null) {
    return new SmartBuyError(message, ErrorTypes.AUTH_ERROR, null, data);
  }

  /**
   * 创建API错误
   * @param {string} message - 错误消息
   * @param {string|number} [code] - 错误代码
   * @param {*} [data] - 附加数据
   * @returns {SmartBuyError} 错误实例
   */
  static createApiError(message, code = null, data = null) {
    return new SmartBuyError(message, ErrorTypes.API_ERROR, code, data);
  }

  /**
   * 创建业务错误
   * @param {string} message - 错误消息
   * @param {string} type - 具体的业务错误类型
   * @param {*} [data] - 附加数据
   * @returns {SmartBuyError} 错误实例
   */
  static createBusinessError(message, type, data = null) {
    return new SmartBuyError(message, type, null, data);
  }

  /**
   * 创建验证错误
   * @param {string} message - 错误消息
   * @param {string} [field] - 验证失败的字段
   * @returns {SmartBuyError} 错误实例
   */
  static createValidationError(message, field = null) {
    return new SmartBuyError(message, ErrorTypes.VALIDATION_ERROR, null, { field });
  }

  /**
   * 从普通Error对象创建SmartBuyError
   * @param {Error} error - 原始错误
   * @param {string} [type] - 错误类型
   * @returns {SmartBuyError} 错误实例
   */
  static fromError(error, type = ErrorTypes.UNKNOWN_ERROR) {
    if (error instanceof SmartBuyError) {
      return error;
    }
    
    const smartBuyError = new SmartBuyError(error.message, type);
    smartBuyError.stack = error.stack;
    
    return smartBuyError;
  }

  /**
   * 从HTTP响应创建错误
   * @param {Object} response - HTTP响应对象
   * @param {string} [defaultMessage] - 默认错误消息
   * @returns {SmartBuyError} 错误实例
   */
  static fromHttpResponse(response, defaultMessage = 'HTTP request failed') {
    const status = response.status || response.statusCode;
    const message = response.data?.message || response.statusText || defaultMessage;
    
    let type = ErrorTypes.API_ERROR;
    
    if (status === 401) {
      type = ErrorTypes.UNAUTHORIZED;
    } else if (status === 404) {
      type = ErrorTypes.REQUEST_FAILED;
    } else if (status >= 500) {
      type = ErrorTypes.SYSTEM_ERROR;
    }
    
    return new SmartBuyError(`${message} (HTTP ${status})`, type, status, response.data);
  }
}

module.exports = {
  ErrorTypes,
  SmartBuyError,
  ErrorFactory
};