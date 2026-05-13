/**
 * SmartBuy Framework - 文件系统凭据管理器实现
 * 
 * 基于文件系统的安全凭据存储和管理实现
 */

const CredentialManager = require('./CredentialManager');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { ErrorFactory, ErrorTypes } = require('../../utils/ErrorTypes');
const Logger = require('../../utils/Logger');
const Validator = require('../../utils/Validator');

class FileCredentialManager extends CredentialManager {
  constructor(options = {}) {
    super(options);
    
    this.storageDir = options.storageDir || path.join(process.cwd(), '.smartbuy', 'credentials');
    this.encryptionKey = options.encryptionKey || this.generateEncryptionKey();
    this.credentialCache = new Map(); // 内存缓存
    this.initialized = false;
    
    // 加密算法配置
    this.algorithm = 'aes-256-cbc';
    this.keyLength = 32;
    this.ivLength = 16;
  }

  /**
   * 初始化凭据管理器
   */
  async initialize() {
    try {
      // 确保存储目录存在
      await fs.mkdir(this.storageDir, { recursive: true });
      
      // 加载现有凭据到缓存
      await this.loadCredentialsToCache();
      
      this.initialized = true;
      Logger.info(`[FileCredentialManager] 初始化完成，存储目录: ${this.storageDir}`);
    } catch (error) {
      Logger.error(`[FileCredentialManager] 初始化失败`, error);
      throw ErrorFactory.createSystemError(`CredentialManager初始化失败: ${error.message}`);
    }
  }

  /**
   * 保存用户凭据（加密存储）
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @param {Object} credentials - 登录凭据
   * @returns {Promise<void>}
   */
  async saveCredentials(platform, account, credentials) {
    try {
      this.ensureInitialized();
      
      // 验证凭据格式
      const validation = this.validateCredentials(credentials);
      if (!validation.valid) {
        throw ErrorFactory.createValidationError(`凭据验证失败: ${validation.errors.join(', ')}`);
      }

      const key = this.getStorageKey(platform, account);
      
      // 加密敏感信息
      const encryptedCredentials = {
        platform,
        account,
        password: await this.encryptPassword(credentials.password),
        payPassword: credentials.payPassword ? await this.encryptPassword(credentials.payPassword) : null,
        phone: credentials.phone || account,
        email: credentials.email || null,
        nickname: credentials.nickname || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };

      // 加密整个凭据对象
      const encryptedData = this.encrypt(JSON.stringify(encryptedCredentials));
      
      // 存储到文件
      const filePath = this.getCredentialFilePath(key);
      await fs.writeFile(filePath, encryptedData, 'utf8');
      
      // 更新缓存（存储解密后的数据，但不包含敏感信息）
      const cacheData = {
        platform,
        account,
        phone: encryptedCredentials.phone,
        email: encryptedCredentials.email,
        nickname: encryptedCredentials.nickname,
        createdAt: encryptedCredentials.createdAt,
        updatedAt: encryptedCredentials.updatedAt,
        lastUsed: encryptedCredentials.lastUsed,
        hasPassword: !!credentials.password,
        hasPayPassword: !!credentials.payPassword
      };
      
      this.credentialCache.set(key, cacheData);
      
      Logger.debug(`[FileCredentialManager] 凭据已保存: ${platform}:${account}`);
    } catch (error) {
      Logger.error(`[FileCredentialManager] 保存凭据失败`, error);
      throw ErrorFactory.createSystemError(`保存凭据失败: ${error.message}`);
    }
  }

  /**
   * 获取用户凭据
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<Object|null>} 凭据对象或null
   */
  async getCredentials(platform, account) {
    try {
      this.ensureInitialized();
      
      const key = this.getStorageKey(platform, account);
      
      // 从文件加载完整凭据
      const filePath = this.getCredentialFilePath(key);
      
      try {
        const encryptedData = await fs.readFile(filePath, 'utf8');
        const decryptedData = this.decrypt(encryptedData);
        const credentialData = JSON.parse(decryptedData);
        
        // 解密密码
        const credentials = {
          platform: credentialData.platform,
          account: credentialData.account,
          password: await this.decryptPassword(credentialData.password),
          payPassword: credentialData.payPassword ? await this.decryptPassword(credentialData.payPassword) : null,
          phone: credentialData.phone,
          email: credentialData.email,
          nickname: credentialData.nickname,
          createdAt: credentialData.createdAt,
          updatedAt: credentialData.updatedAt,
          lastUsed: credentialData.lastUsed
        };
        
        // 更新最后使用时间
        credentialData.lastUsed = new Date().toISOString();
        const updatedEncryptedData = this.encrypt(JSON.stringify(credentialData));
        await fs.writeFile(filePath, updatedEncryptedData, 'utf8');
        
        // 更新缓存
        const cacheData = {
          platform: credentials.platform,
          account: credentials.account,
          phone: credentials.phone,
          email: credentials.email,
          nickname: credentials.nickname,
          createdAt: credentials.createdAt,
          updatedAt: credentials.updatedAt,
          lastUsed: credentialData.lastUsed,
          hasPassword: !!credentials.password,
          hasPayPassword: !!credentials.payPassword
        };
        this.credentialCache.set(key, cacheData);
        
        Logger.debug(`[FileCredentialManager] 凭据已获取: ${platform}:${account}`);
        return credentials;
      } catch (fileError) {
        if (fileError.code === 'ENOENT') {
          return null; // 文件不存在，凭据不存在
        }
        throw fileError;
      }
    } catch (error) {
      Logger.error(`[FileCredentialManager] 获取凭据失败`, error);
      throw ErrorFactory.createSystemError(`获取凭据失败: ${error.message}`);
    }
  }

  /**
   * 删除用户凭据
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<void>}
   */
  async removeCredentials(platform, account) {
    try {
      this.ensureInitialized();
      
      const key = this.getStorageKey(platform, account);
      const filePath = this.getCredentialFilePath(key);
      
      // 从缓存移除
      this.credentialCache.delete(key);
      
      // 删除文件
      try {
        await fs.unlink(filePath);
        Logger.debug(`[FileCredentialManager] 凭据已删除: ${platform}:${account}`);
      } catch (fileError) {
        if (fileError.code === 'ENOENT') {
          return; // 文件本来就不存在
        }
        throw fileError;
      }
    } catch (error) {
      Logger.error(`[FileCredentialManager] 删除凭据失败`, error);
      throw ErrorFactory.createSystemError(`删除凭据失败: ${error.message}`);
    }
  }

  /**
   * 验证凭据格式
   * @param {Object} credentials - 凭据对象
   * @returns {Object} 验证结果
   */
  validateCredentials(credentials) {
    if (!credentials || typeof credentials !== 'object') {
      return {
        valid: false,
        errors: ['凭据必须是对象']
      };
    }

    const errors = [];

    // 验证必需字段
    if (!credentials.password || typeof credentials.password !== 'string') {
      errors.push('密码是必需的且必须是字符串');
    }

    // 验证密码强度（可选）
    if (credentials.password && credentials.password.length < 6) {
      errors.push('密码长度至少6位');
    }

    // 验证支付密码（如果提供）
    if (credentials.payPassword) {
      if (typeof credentials.payPassword !== 'string') {
        errors.push('支付密码必须是字符串');
      } else if (credentials.payPassword.length < 4) {
        errors.push('支付密码长度至少4位');
      }
    }

    // 验证手机号（如果提供）
    if (credentials.phone) {
      const phoneValidation = Validator.validateConfig({ phone: credentials.phone }, { phone: 'phone' });
      if (!phoneValidation.valid) {
        errors.push(...phoneValidation.errors);
      }
    }

    // 验证邮箱（如果提供）
    if (credentials.email) {
      const emailValidation = Validator.validateConfig({ email: credentials.email }, { email: 'email' });
      if (!emailValidation.valid) {
        errors.push(...emailValidation.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 加密密码
   * @param {string} password - 明文密码
   * @returns {Promise<string>} 加密后的密码
   */
  async encryptPassword(password) {
    try {
      if (!password || typeof password !== 'string') {
        throw new Error('密码必须是非空字符串');
      }

      const key = crypto.scryptSync(this.encryptionKey, 'password-salt', this.keyLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      const cipher = crypto.createCipher(this.algorithm, key);
      
      let encrypted = cipher.update(password, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return JSON.stringify({
        encrypted,
        iv: iv.toString('hex'),
        algorithm: this.algorithm
      });
    } catch (error) {
      Logger.error(`[FileCredentialManager] 密码加密失败`, error);
      throw ErrorFactory.createSystemError(`密码加密失败: ${error.message}`);
    }
  }

  /**
   * 解密密码
   * @param {string} encryptedPassword - 加密的密码
   * @returns {Promise<string>} 明文密码
   */
  async decryptPassword(encryptedPassword) {
    try {
      if (!encryptedPassword || typeof encryptedPassword !== 'string') {
        throw new Error('加密密码必须是非空字符串');
      }

      const { encrypted, iv, algorithm } = JSON.parse(encryptedPassword);
      const key = crypto.scryptSync(this.encryptionKey, 'password-salt', this.keyLength);
      
      const decipher = crypto.createDecipher(algorithm || this.algorithm, key);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      Logger.error(`[FileCredentialManager] 密码解密失败`, error);
      throw ErrorFactory.createSystemError('密码解密失败，可能是密钥错误或数据损坏');
    }
  }

  /**
   * 获取所有凭据信息（不包含敏感数据）
   * @param {string} [platform] - 可选的平台筛选
   * @returns {Promise<Array>} 凭据信息列表
   */
  async getAllCredentials(platform = null) {
    try {
      this.ensureInitialized();
      
      const credentials = [];
      
      for (const [key, credentialData] of this.credentialCache.entries()) {
        if (!platform || credentialData.platform === platform) {
          credentials.push({
            platform: credentialData.platform,
            account: credentialData.account,
            phone: credentialData.phone,
            email: credentialData.email,
            nickname: credentialData.nickname,
            createdAt: credentialData.createdAt,
            updatedAt: credentialData.updatedAt,
            lastUsed: credentialData.lastUsed,
            hasPassword: credentialData.hasPassword,
            hasPayPassword: credentialData.hasPayPassword
          });
        }
      }
      
      Logger.debug(`[FileCredentialManager] 获取凭据信息列表，数量: ${credentials.length}`);
      return credentials;
    } catch (error) {
      Logger.error(`[FileCredentialManager] 获取凭据信息列表失败`, error);
      throw ErrorFactory.createSystemError(`获取凭据信息列表失败: ${error.message}`);
    }
  }

  // =============== 私有方法 ===============

  /**
   * 确保已初始化
   * @private
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw ErrorFactory.createSystemError('FileCredentialManager尚未初始化，请先调用initialize()方法');
    }
  }

  /**
   * 获取凭据文件路径
   * @private
   * @param {string} key - 键名
   * @returns {string} 文件路径
   */
  getCredentialFilePath(key) {
    // 使用hash作为文件名，避免特殊字符问题
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.storageDir, `${hash}.cred`);
  }

  /**
   * 生成加密密钥
   * @private
   * @returns {string} 加密密钥
   */
  generateEncryptionKey() {
    // 在生产环境中，这个密钥应该从环境变量或安全存储中获取
    return process.env.SMARTBUY_CREDENTIAL_KEY || 'smartbuy-credential-key-change-in-production';
  }

  /**
   * 加密数据
   * @private
   * @param {string} data - 要加密的数据
   * @returns {string} 加密后的数据
   */
  encrypt(data) {
    const key = crypto.scryptSync(this.encryptionKey, 'data-salt', this.keyLength);
    const iv = crypto.randomBytes(this.ivLength);
    
    const cipher = crypto.createCipher(this.algorithm, key);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      algorithm: this.algorithm
    });
  }

  /**
   * 解密数据
   * @private
   * @param {string} encryptedData - 要解密的数据
   * @returns {string} 解密后的数据
   */
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, algorithm } = JSON.parse(encryptedData);
      const key = crypto.scryptSync(this.encryptionKey, 'data-salt', this.keyLength);
      
      const decipher = crypto.createDecipher(algorithm || this.algorithm, key);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw ErrorFactory.createSystemError('凭据数据解密失败，可能是密钥错误或数据损坏');
    }
  }

  /**
   * 加载凭据到缓存
   * @private
   */
  async loadCredentialsToCache() {
    try {
      const files = await fs.readdir(this.storageDir);
      const credentialFiles = files.filter(file => file.endsWith('.cred'));
      
      for (const file of credentialFiles) {
        try {
          const filePath = path.join(this.storageDir, file);
          const encryptedData = await fs.readFile(filePath, 'utf8');
          const decryptedData = this.decrypt(encryptedData);
          const credentialData = JSON.parse(decryptedData);
          
          // 只加载非敏感信息到缓存
          const key = this.getStorageKey(credentialData.platform, credentialData.account);
          const cacheData = {
            platform: credentialData.platform,
            account: credentialData.account,
            phone: credentialData.phone,
            email: credentialData.email,
            nickname: credentialData.nickname,
            createdAt: credentialData.createdAt,
            updatedAt: credentialData.updatedAt,
            lastUsed: credentialData.lastUsed,
            hasPassword: !!credentialData.password,
            hasPayPassword: !!credentialData.payPassword
          };
          
          this.credentialCache.set(key, cacheData);
        } catch (fileError) {
          Logger.warn(`[FileCredentialManager] 加载凭据文件失败: ${file}`, fileError);
          // 继续处理其他文件
        }
      }
      
      Logger.debug(`[FileCredentialManager] 加载凭据到缓存完成，数量: ${this.credentialCache.size}`);
    } catch (error) {
      // 如果目录不存在，忽略错误
      if (error.code !== 'ENOENT') {
        Logger.error(`[FileCredentialManager] 加载凭据到缓存失败`, error);
      }
    }
  }

  /**
   * 清理所有数据
   * @returns {Promise<boolean>} 是否成功
   */
  async cleanup() {
    try {
      Logger.info(`[FileCredentialManager] 开始清理所有数据`);
      
      // 清空缓存
      this.credentialCache.clear();
      
      // 删除所有凭据文件
      try {
        const files = await fs.readdir(this.storageDir);
        const credentialFiles = files.filter(file => file.endsWith('.cred'));
        
        for (const file of credentialFiles) {
          const filePath = path.join(this.storageDir, file);
          await fs.unlink(filePath);
        }
        
        Logger.info(`[FileCredentialManager] 清理完成，删除了 ${credentialFiles.length} 个凭据文件`);
      } catch (dirError) {
        if (dirError.code !== 'ENOENT') {
          throw dirError;
        }
      }
      
      return true;
    } catch (error) {
      Logger.error(`[FileCredentialManager] 清理数据失败`, error);
      throw ErrorFactory.createSystemError(`清理数据失败: ${error.message}`);
    }
  }

  /**
   * 获取存储统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    try {
      this.ensureInitialized();
      
      const stats = {
        totalCredentials: this.credentialCache.size,
        platforms: new Set(),
        accounts: new Set(),
        withPayPassword: 0,
        oldestCredential: null,
        newestCredential: null
      };
      
      let oldestDate = null;
      let newestDate = null;
      
      for (const [key, credentialData] of this.credentialCache.entries()) {
        stats.platforms.add(credentialData.platform);
        stats.accounts.add(`${credentialData.platform}:${credentialData.account}`);
        
        if (credentialData.hasPayPassword) {
          stats.withPayPassword++;
        }
        
        const createdDate = new Date(credentialData.createdAt);
        if (!oldestDate || createdDate < oldestDate) {
          oldestDate = createdDate;
          stats.oldestCredential = credentialData;
        }
        if (!newestDate || createdDate > newestDate) {
          newestDate = createdDate;
          stats.newestCredential = credentialData;
        }
      }
      
      stats.platforms = Array.from(stats.platforms);
      stats.accounts = Array.from(stats.accounts);
      
      return stats;
    } catch (error) {
      Logger.error(`[FileCredentialManager] 获取统计信息失败`, error);
      throw ErrorFactory.createSystemError(`获取统计信息失败: ${error.message}`);
    }
  }
}

module.exports = FileCredentialManager;