/**
 * SmartBuy Framework - 文件系统Token存储实现
 * 
 * 基于文件系统的安全Token存储和管理实现
 */

const TokenStore = require('./TokenStore');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { ErrorFactory, ErrorTypes } = require('../../utils/ErrorTypes');
const Logger = require('../../utils/Logger');

class FileTokenStore extends TokenStore {
  constructor(options = {}) {
    super(options);
    
    this.storageDir = options.storageDir || path.join(process.cwd(), '.smartbuy', 'auth');
    this.encryptionKey = options.encryptionKey || this.generateEncryptionKey();
    this.tokenCache = new Map(); // 内存缓存，提高性能
    this.initialized = false;
  }

  /**
   * 初始化存储
   */
  async initialize() {
    try {
      // 确保存储目录存在
      await fs.mkdir(this.storageDir, { recursive: true });
      
      // 加载现有tokens到缓存
      await this.loadTokensToCache();
      
      this.initialized = true;
      Logger.info(`[FileTokenStore] 初始化完成，存储目录: ${this.storageDir}`);
    } catch (error) {
      Logger.error(`[FileTokenStore] 初始化失败`, error);
      throw ErrorFactory.createSystemError(`TokenStore初始化失败: ${error.message}`);
    }
  }

  /**
   * 保存Token数据到本地存储
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @param {Object} tokenData - Token数据对象
   * @returns {Promise<void>}
   */
  async saveToken(platform, account, tokenData) {
    try {
      this.ensureInitialized();
      
      const key = this.getStorageKey(platform, account);
      const data = {
        ...tokenData,
        platform,
        account,
        storedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };

      // 加密数据
      const encryptedData = this.encrypt(JSON.stringify(data));
      
      // 存储到文件
      const filePath = this.getTokenFilePath(key);
      await fs.writeFile(filePath, encryptedData, 'utf8');
      
      // 更新缓存
      this.tokenCache.set(key, data);
      
      Logger.debug(`[FileTokenStore] Token已存储: ${platform}:${account}`);
    } catch (error) {
      Logger.error(`[FileTokenStore] 存储Token失败`, error);
      throw ErrorFactory.createSystemError(`存储Token失败: ${error.message}`);
    }
  }

  /**
   * 从本地存储获取Token数据
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<Object|null>} Token数据或null
   */
  async getToken(platform, account) {
    try {
      this.ensureInitialized();
      
      const key = this.getStorageKey(platform, account);
      
      // 优先从缓存获取
      if (this.tokenCache.has(key)) {
        const tokenData = this.tokenCache.get(key);
        
        // 检查Token是否过期
        if (this.isTokenExpired(tokenData)) {
          await this.removeToken(platform, account);
          return null;
        }
        
        // 更新最后使用时间
        tokenData.lastUsed = new Date().toISOString();
        this.tokenCache.set(key, tokenData);
        
        return tokenData;
      }
      
      // 从文件加载
      const filePath = this.getTokenFilePath(key);
      
      try {
        const encryptedData = await fs.readFile(filePath, 'utf8');
        const decryptedData = this.decrypt(encryptedData);
        const tokenData = JSON.parse(decryptedData);
        
        // 检查Token是否过期
        if (this.isTokenExpired(tokenData)) {
          await this.removeToken(platform, account);
          return null;
        }
        
        // 更新最后使用时间并缓存
        tokenData.lastUsed = new Date().toISOString();
        this.tokenCache.set(key, tokenData);
        
        // 更新文件
        const updatedEncryptedData = this.encrypt(JSON.stringify(tokenData));
        await fs.writeFile(filePath, updatedEncryptedData, 'utf8');
        
        Logger.debug(`[FileTokenStore] Token已获取: ${platform}:${account}`);
        return tokenData;
      } catch (fileError) {
        if (fileError.code === 'ENOENT') {
          return null; // 文件不存在，Token不存在
        }
        throw fileError;
      }
    } catch (error) {
      Logger.error(`[FileTokenStore] 获取Token失败`, error);
      throw ErrorFactory.createSystemError(`获取Token失败: ${error.message}`);
    }
  }

  /**
   * 从本地存储删除Token
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<void>}
   */
  async removeToken(platform, account) {
    try {
      this.ensureInitialized();
      
      const key = this.getStorageKey(platform, account);
      const filePath = this.getTokenFilePath(key);
      
      // 从缓存移除
      this.tokenCache.delete(key);
      
      // 删除文件
      try {
        await fs.unlink(filePath);
        Logger.debug(`[FileTokenStore] Token已移除: ${platform}:${account}`);
      } catch (fileError) {
        if (fileError.code === 'ENOENT') {
          return; // 文件本来就不存在
        }
        throw fileError;
      }
    } catch (error) {
      Logger.error(`[FileTokenStore] 移除Token失败`, error);
      throw ErrorFactory.createSystemError(`移除Token失败: ${error.message}`);
    }
  }

  /**
   * 获取所有Token（可选择特定平台）
   * @param {string} [platform] - 平台名称，不指定则返回所有平台
   * @returns {Promise<Array>} Token数据数组
   */
  async getAllTokens(platform = null) {
    try {
      this.ensureInitialized();
      
      const tokens = [];
      
      for (const [key, tokenData] of this.tokenCache.entries()) {
        if (!platform || tokenData.platform === platform) {
          // 检查是否过期
          if (!this.isTokenExpired(tokenData)) {
            tokens.push({
              platform: tokenData.platform,
              account: tokenData.account,
              storedAt: tokenData.storedAt,
              lastUsed: tokenData.lastUsed,
              expiresAt: tokenData.expiresAt,
              userInfo: tokenData.userInfo,
              token: tokenData.token
            });
          }
        }
      }
      
      Logger.debug(`[FileTokenStore] 获取Token列表，数量: ${tokens.length}`);
      return tokens;
    } catch (error) {
      Logger.error(`[FileTokenStore] 获取Token列表失败`, error);
      throw ErrorFactory.createSystemError(`获取Token列表失败: ${error.message}`);
    }
  }

  /**
   * 清理所有过期的Token
   * @returns {Promise<number>} 清理的Token数量
   */
  async cleanExpiredTokens() {
    try {
      this.ensureInitialized();
      
      let cleanedCount = 0;
      const expiredKeys = [];
      
      // 找出过期的Token
      for (const [key, tokenData] of this.tokenCache.entries()) {
        if (this.isTokenExpired(tokenData)) {
          expiredKeys.push(key);
        }
      }
      
      // 删除过期Token
      for (const key of expiredKeys) {
        const tokenData = this.tokenCache.get(key);
        await this.removeToken(tokenData.platform, tokenData.account);
        cleanedCount++;
      }
      
      Logger.info(`[FileTokenStore] 清理过期Token完成，清理数量: ${cleanedCount}`);
      return cleanedCount;
    } catch (error) {
      Logger.error(`[FileTokenStore] 清理过期Token失败`, error);
      throw ErrorFactory.createSystemError(`清理过期Token失败: ${error.message}`);
    }
  }

  /**
   * 检查Token是否有效（未过期）
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<boolean>} 是否有效
   */
  async isTokenValid(platform, account) {
    try {
      const tokenData = await this.getToken(platform, account);
      return tokenData !== null;
    } catch (error) {
      Logger.error(`[FileTokenStore] 检查Token有效性失败`, error);
      return false;
    }
  }

  /**
   * 获取Token过期时间
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<Date|null>} 过期时间或null
   */
  async getTokenExpireTime(platform, account) {
    try {
      const tokenData = await this.getToken(platform, account);
      if (tokenData && tokenData.expiresAt) {
        return new Date(tokenData.expiresAt);
      }
      return null;
    } catch (error) {
      Logger.error(`[FileTokenStore] 获取Token过期时间失败`, error);
      return null;
    }
  }

  // =============== 私有方法 ===============

  /**
   * 确保已初始化
   * @private
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw ErrorFactory.createSystemError('FileTokenStore尚未初始化，请先调用initialize()方法');
    }
  }

  /**
   * 获取Token文件路径
   * @private
   * @param {string} key - 键名
   * @returns {string} 文件路径
   */
  getTokenFilePath(key) {
    // 使用hash作为文件名，避免特殊字符问题
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.storageDir, `${hash}.token`);
  }

  /**
   * 生成加密密钥
   * @private
   * @returns {string} 加密密钥
   */
  generateEncryptionKey() {
    // 在生产环境中，这个密钥应该从环境变量或安全存储中获取
    return process.env.SMARTBUY_ENCRYPTION_KEY || 'smartbuy-default-key-change-in-production';
  }

  /**
   * 加密数据
   * @private
   * @param {string} data - 要加密的数据
   * @returns {string} 加密后的数据
   */
  encrypt(data) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex')
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
      const { encrypted, iv } = JSON.parse(encryptedData);
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      
      const decipher = crypto.createDecipher(algorithm, key);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      // 如果解密失败，可能是密钥错误或数据损坏
      throw ErrorFactory.createSystemError('Token数据解密失败，可能是密钥错误或数据损坏');
    }
  }

  /**
   * 检查Token是否过期
   * @private
   * @param {Object} tokenData - Token数据
   * @returns {boolean} 是否过期
   */
  isTokenExpired(tokenData) {
    if (!tokenData.expiresAt) {
      return false; // 没有过期时间，认为不过期
    }
    
    const expiresAt = new Date(tokenData.expiresAt);
    const now = new Date();
    
    return now >= expiresAt;
  }

  /**
   * 加载Token到缓存
   * @private
   */
  async loadTokensToCache() {
    try {
      const files = await fs.readdir(this.storageDir);
      const tokenFiles = files.filter(file => file.endsWith('.token'));
      
      for (const file of tokenFiles) {
        try {
          const filePath = path.join(this.storageDir, file);
          const encryptedData = await fs.readFile(filePath, 'utf8');
          const decryptedData = this.decrypt(encryptedData);
          const tokenData = JSON.parse(decryptedData);
          
          // 检查是否过期
          if (!this.isTokenExpired(tokenData)) {
            const key = this.getStorageKey(tokenData.platform, tokenData.account);
            this.tokenCache.set(key, tokenData);
          } else {
            // 删除过期文件
            await fs.unlink(filePath);
          }
        } catch (fileError) {
          Logger.warn(`[FileTokenStore] 加载Token文件失败: ${file}`, fileError);
          // 继续处理其他文件
        }
      }
      
      Logger.debug(`[FileTokenStore] 加载Token到缓存完成，数量: ${this.tokenCache.size}`);
    } catch (error) {
      // 如果目录不存在，忽略错误
      if (error.code !== 'ENOENT') {
        Logger.error(`[FileTokenStore] 加载Token到缓存失败`, error);
      }
    }
  }

  /**
   * 清理所有数据
   * @returns {Promise<boolean>} 是否成功
   */
  async cleanup() {
    try {
      Logger.info(`[FileTokenStore] 开始清理所有数据`);
      
      // 清空缓存
      this.tokenCache.clear();
      
      // 删除所有Token文件
      try {
        const files = await fs.readdir(this.storageDir);
        const tokenFiles = files.filter(file => file.endsWith('.token'));
        
        for (const file of tokenFiles) {
          const filePath = path.join(this.storageDir, file);
          await fs.unlink(filePath);
        }
        
        Logger.info(`[FileTokenStore] 清理完成，删除了 ${tokenFiles.length} 个Token文件`);
      } catch (dirError) {
        if (dirError.code !== 'ENOENT') {
          throw dirError;
        }
      }
      
      return true;
    } catch (error) {
      Logger.error(`[FileTokenStore] 清理数据失败`, error);
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
        totalTokens: this.tokenCache.size,
        platforms: new Set(),
        accounts: new Set(),
        expiredTokens: 0,
        oldestToken: null,
        newestToken: null
      };
      
      let oldestDate = null;
      let newestDate = null;
      
      for (const [key, tokenData] of this.tokenCache.entries()) {
        stats.platforms.add(tokenData.platform);
        stats.accounts.add(`${tokenData.platform}:${tokenData.account}`);
        
        if (this.isTokenExpired(tokenData)) {
          stats.expiredTokens++;
        }
        
        const storedDate = new Date(tokenData.storedAt);
        if (!oldestDate || storedDate < oldestDate) {
          oldestDate = storedDate;
          stats.oldestToken = tokenData;
        }
        if (!newestDate || storedDate > newestDate) {
          newestDate = storedDate;
          stats.newestToken = tokenData;
        }
      }
      
      stats.platforms = Array.from(stats.platforms);
      stats.accounts = Array.from(stats.accounts);
      
      return stats;
    } catch (error) {
      Logger.error(`[FileTokenStore] 获取统计信息失败`, error);
      throw ErrorFactory.createSystemError(`获取统计信息失败: ${error.message}`);
    }
  }
}

module.exports = FileTokenStore;