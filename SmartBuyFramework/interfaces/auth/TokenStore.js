/**
 * SmartBuy Framework - Token存储管理器接口
 * 
 * 负责Token的安全存储和管理
 */

class TokenStore {
  /**
   * 构造函数
   * @param {Object} [options] - 存储选项
   */
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * 保存Token数据到本地存储
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @param {TokenData} tokenData - Token数据对象
   * @returns {Promise<void>}
   */
  async saveToken(platform, account, tokenData) {
    throw new Error('TokenStore.saveToken() must be implemented');
  }

  /**
   * 从本地存储获取Token数据
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<TokenData|null>} Token数据或null
   */
  async getToken(platform, account) {
    throw new Error('TokenStore.getToken() must be implemented');
  }

  /**
   * 从本地存储删除Token
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<void>}
   */
  async removeToken(platform, account) {
    throw new Error('TokenStore.removeToken() must be implemented');
  }

  /**
   * 获取所有Token（可选择特定平台）
   * @param {string} [platform] - 平台名称，不指定则返回所有平台
   * @returns {Promise<TokenData[]>} Token数据数组
   */
  async getAllTokens(platform = null) {
    throw new Error('TokenStore.getAllTokens() must be implemented');
  }

  /**
   * 清理所有过期的Token
   * @returns {Promise<number>} 清理的Token数量
   */
  async cleanExpiredTokens() {
    throw new Error('TokenStore.cleanExpiredTokens() must be implemented');
  }

  /**
   * 检查Token是否有效（未过期）
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<boolean>} 是否有效
   */
  async isTokenValid(platform, account) {
    throw new Error('TokenStore.isTokenValid() must be implemented');
  }

  /**
   * 获取Token过期时间
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<Date|null>} 过期时间或null
   */
  async getTokenExpireTime(platform, account) {
    throw new Error('TokenStore.getTokenExpireTime() must be implemented');
  }

  /**
   * 生成存储键
   * @protected
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {string} 存储键
   */
  getStorageKey(platform, account) {
    return `${platform}_${account}`;
  }
}

module.exports = TokenStore;