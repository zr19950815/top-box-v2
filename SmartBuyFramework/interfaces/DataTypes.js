/**
 * SmartBuy Framework - 标准数据格式定义
 * 
 * 定义框架中使用的所有标准数据格式和类型
 */

/**
 * 登录凭据对象
 * @typedef {Object} LoginCredentials
 * @property {string} account - 账号（手机号/邮箱）
 * @property {string} password - 登录密码
 * @property {string} [payPassword] - 支付密码（可选）
 * @property {string} [captcha] - 验证码（可选）
 * @property {string} [deviceId] - 设备ID（可选）
 */

/**
 * 认证结果对象
 * @typedef {Object} AuthResult
 * @property {boolean} success - 认证是否成功
 * @property {string} token - 访问Token
 * @property {string} [refreshToken] - 刷新Token（可选）
 * @property {Date} [expiresAt] - Token过期时间
 * @property {string} account - 关联账号
 * @property {string} [message] - 成功消息
 * @property {string} [error] - 错误信息
 */

/**
 * Token数据对象
 * @typedef {Object} TokenData
 * @property {string} token - 访问Token
 * @property {string} [refreshToken] - 刷新Token
 * @property {Date} expiresAt - 过期时间
 * @property {Date} createdAt - 创建时间
 * @property {Date} [lastUsedAt] - 最后使用时间
 * @property {string} platform - 所属平台
 * @property {string} account - 关联账号
 */

/**
 * 商品对象
 * @typedef {Object} Product
 * @property {string} id - 商品唯一ID
 * @property {string} [name] - 商品名称（可选）
 * @property {number} price - 商品价格
 * @property {boolean} available - 是否可购买
 * @property {number[]} [payTypes] - 商品支持的支付类型
 * @property {Object} [meta] - 平台特有数据（可选）
 */

/**
 * 支付结果对象
 * @typedef {Object} PaymentResult
 * @property {boolean} success - 支付是否成功
 * @property {string} [orderId] - 订单ID（可选）
 * @property {string} [message] - 成功消息（可选）
 * @property {string} [error] - 错误消息（可选）
 */

/**
 * 任务配置对象
 * @typedef {Object} TaskConfig
 * @property {string} productId - 商品ID
 * @property {number} quantity - 目标数量
 * @property {number} maxPrice - 最高价格
 * @property {number} [interval] - 执行间隔，默认800ms
 * @property {string} account - 账号
 * @property {string} [password] - 登录密码
 * @property {string} [token] - 直接使用的Token
 * @property {string} payPassword - 支付密码
 * @property {string} [mode] - 抢购模式 ('list'|'quick'|'batch')
 * @property {number} [batchSize] - 批量大小（批量模式）
 * @property {string} [combinationId] - 合成ID或合成名称
 * @property {string} [combinationName] - 合成名称（HC 自动匹配配方时使用）
 * @property {string} [resaleId] - 寄售ID
 */

/**
 * 认证状态枚举
 */
const AuthStatus = {
  NOT_AUTHENTICATED: 'not_authenticated',
  AUTHENTICATED: 'authenticated',
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',
  REFRESH_NEEDED: 'refresh_needed'
};

/**
 * 验证结果对象
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 是否有效
 * @property {string[]} errors - 错误列表
 * @property {string[]} [warnings] - 警告列表（可选）
 */

/**
 * 任务统计对象
 * @typedef {Object} TaskStats
 * @property {Date} startTime - 开始时间
 * @property {Date} [endTime] - 结束时间
 * @property {number} requestCount - 请求总数
 * @property {number} successCount - 成功次数
 * @property {number} errorCount - 错误次数
 * @property {number} completedQuantity - 完成数量
 * @property {number} targetQuantity - 目标数量
 * @property {number} averageInterval - 平均间隔
 * @property {number} successRate - 成功率（百分比）
 */

module.exports = {
  AuthStatus
};
