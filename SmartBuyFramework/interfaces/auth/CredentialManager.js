/**
 * SmartBuy Framework - 凭据管理器接口
 * 
 * 负责用户凭据的安全存储和管理
 */

class CredentialManager {
  /**
   * 构造函数
   * @param {Object} [options] - 配置选项
   */
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * 保存用户凭据（加密存储）
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @param {LoginCredentials} credentials - 登录凭据
   * @returns {Promise<void>}
   */
  async saveCredentials(platform, account, credentials) {
    throw new Error('CredentialManager.saveCredentials() must be implemented');
  }

  /**
   * 获取用户凭据
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<LoginCredentials|null>} 凭据对象或null
   */
  async getCredentials(platform, account) {
    throw new Error('CredentialManager.getCredentials() must be implemented');
  }

  /**
   * 删除用户凭据
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<void>}
   */
  async removeCredentials(platform, account) {
    throw new Error('CredentialManager.removeCredentials() must be implemented');
  }

  /**
   * 验证凭据格式
   * @param {LoginCredentials} credentials - 凭据对象
   * @returns {ValidationResult} 验证结果
   */
  validateCredentials(credentials) {
    throw new Error('CredentialManager.validateCredentials() must be implemented');
  }

  /**
   * 加密密码
   * @param {string} password - 明文密码
   * @returns {Promise<string>} 加密后的密码
   */
  async encryptPassword(password) {
    throw new Error('CredentialManager.encryptPassword() must be implemented');
  }

  /**
   * 解密密码
   * @param {string} encryptedPassword - 加密的密码
   * @returns {Promise<string>} 明文密码
   */
  async decryptPassword(encryptedPassword) {
    throw new Error('CredentialManager.decryptPassword() must be implemented');
  }

  /**
   * 生成存储键
   * @protected
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {string} 存储键
   */
  getStorageKey(platform, account) {
    return `credentials_${platform}_${account}`;
  }

  /**
   * 检查凭据是否存在
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<boolean>} 是否存在
   */
  async hasCredentials(platform, account) {
    const credentials = await this.getCredentials(platform, account);
    return credentials !== null;
  }
}

module.exports = CredentialManager;