/**
 * SmartBuy Framework - 认证管理器实现
 * 
 * 提供统一的认证管理和Token生命周期管理功能
 */

const { ErrorFactory, ErrorTypes } = require('../../utils/ErrorTypes');
const Logger = require('../../utils/Logger');

class AuthManager {
  /**
   * 构造函数
   * @param {TokenStore} tokenStore - Token存储管理器
   * @param {CredentialManager} credentialManager - 凭据管理器
   * @param {Object} [options] - 配置选项
   */
  constructor(tokenStore, credentialManager, options = {}) {
    this.tokenStore = tokenStore;
    this.credentialManager = credentialManager;
    this.options = {
      tokenRefreshThreshold: options.tokenRefreshThreshold || 5 * 60 * 1000, // 5分钟
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      autoSaveCredentials: options.autoSaveCredentials !== false,
      ...options
    };
    
    // 认证状态缓存
    this.authStatusCache = new Map();
    
    // Token刷新锁，防止并发刷新
    this.refreshLocks = new Map();
    
    this.initialized = false;
  }

  /**
   * 初始化认证管理器
   */
  async initialize() {
    try {
      // 初始化TokenStore和CredentialManager
      if (typeof this.tokenStore.initialize === 'function') {
        await this.tokenStore.initialize();
      }
      
      if (typeof this.credentialManager.initialize === 'function') {
        await this.credentialManager.initialize();
      }
      
      // 清理过期Token
      if (typeof this.tokenStore.cleanExpiredTokens === 'function') {
        await this.tokenStore.cleanExpiredTokens();
      }
      
      this.initialized = true;
      Logger.info(`[AuthManager] 认证管理器初始化完成`);
    } catch (error) {
      Logger.error(`[AuthManager] 初始化失败`, error);
      throw ErrorFactory.createSystemError(`认证管理器初始化失败: ${error.message}`);
    }
  }

  /**
   * 统一认证入口，自动处理Token获取和缓存
   * @param {string} platform - 平台名称
   * @param {Object} credentials - 登录凭据
   * @returns {Promise<Object>} 认证结果
   */
  async authenticate(platform, credentials) {
    try {
      this.ensureInitialized();
      
      Logger.info(`[AuthManager] 开始认证: ${platform}:${credentials.account}`);

      // 获取平台适配器
      const AdapterClass = await this.getPlatformAdapter(platform);
      const adapter = new AdapterClass(credentials.password, {
        account: credentials.account,
        payPassword: credentials.payPassword
      });

      // 执行登录
      const authResult = await adapter.login({
        account: credentials.account,
        password: credentials.password
      });

      if (!authResult.success) {
        throw ErrorFactory.createAuthError('平台登录失败');
      }

      // 保存Token
      if (authResult.token) {
        const tokenData = {
          token: authResult.token,
          refreshToken: authResult.refreshToken,
          expiresAt: authResult.expiresIn ? 
            new Date(Date.now() + authResult.expiresIn * 1000).toISOString() : null,
          userInfo: authResult.userInfo
        };
        
        await this.tokenStore.saveToken(platform, credentials.account, tokenData);
      }

      // 自动保存凭据（如果启用）
      if (this.options.autoSaveCredentials) {
        try {
          await this.credentialManager.saveCredentials(platform, credentials.account, credentials);
        } catch (credError) {
          Logger.warn(`[AuthManager] 保存凭据失败，但认证成功`, credError);
        }
      }

      // 更新认证状态缓存
      const authStatus = {
        authenticated: true,
        platform,
        account: credentials.account,
        token: authResult.token,
        expiresAt: tokenData.expiresAt,
        userInfo: authResult.userInfo,
        lastCheck: new Date().toISOString()
      };
      
      this.authStatusCache.set(`${platform}:${credentials.account}`, authStatus);

      Logger.info(`[AuthManager] 认证成功: ${platform}:${credentials.account}`);
      return authResult;
    } catch (error) {
      Logger.error(`[AuthManager] 认证失败: ${platform}:${credentials.account}`, error);
      
      // 清理无效的认证状态
      this.authStatusCache.delete(`${platform}:${credentials.account}`);
      
      throw error instanceof Error && error.type ? 
        error : 
        ErrorFactory.createAuthError(`认证失败: ${error.message}`);
    }
  }

  /**
   * 获取有效的Token，如果不存在或过期会自动刷新
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<string|null>} 有效的Token或null
   */
  async getValidToken(platform, account) {
    try {
      this.ensureInitialized();
      
      const key = `${platform}:${account}`;
      
      // 检查缓存的认证状态
      const cachedStatus = this.authStatusCache.get(key);
      if (cachedStatus && cachedStatus.token) {
        // 检查是否需要刷新
        if (this.shouldRefreshToken(cachedStatus)) {
          Logger.debug(`[AuthManager] Token需要刷新: ${platform}:${account}`);
          return await this.refreshToken(platform, account, cachedStatus.token);
        }
        return cachedStatus.token;
      }
      
      // 从存储中获取Token
      const tokenData = await this.tokenStore.getToken(platform, account);
      if (!tokenData) {
        Logger.debug(`[AuthManager] 未找到Token: ${platform}:${account}`);
        return null;
      }
      
      // 更新缓存
      const authStatus = {
        authenticated: true,
        platform,
        account,
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
        userInfo: tokenData.userInfo,
        lastCheck: new Date().toISOString()
      };
      
      this.authStatusCache.set(key, authStatus);
      
      // 检查是否需要刷新
      if (this.shouldRefreshToken(authStatus)) {
        Logger.debug(`[AuthManager] Token需要刷新: ${platform}:${account}`);
        return await this.refreshToken(platform, account, tokenData.token);
      }
      
      Logger.debug(`[AuthManager] 获取到有效Token: ${platform}:${account}`);
      return tokenData.token;
    } catch (error) {
      Logger.error(`[AuthManager] 获取Token失败: ${platform}:${account}`, error);
      return null;
    }
  }

  /**
   * 刷新Token
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @param {string} oldToken - 旧Token
   * @returns {Promise<string>} 新Token
   */
  async refreshToken(platform, account, oldToken) {
    const key = `${platform}:${account}`;
    
    // 检查是否有其他请求正在刷新Token
    if (this.refreshLocks.has(key)) {
      Logger.debug(`[AuthManager] 等待Token刷新完成: ${platform}:${account}`);
      return await this.refreshLocks.get(key);
    }
    
    const refreshPromise = this.performTokenRefresh(platform, account, oldToken);
    this.refreshLocks.set(key, refreshPromise);
    
    try {
      const newToken = await refreshPromise;
      this.refreshLocks.delete(key);
      return newToken;
    } catch (error) {
      this.refreshLocks.delete(key);
      throw error;
    }
  }

  /**
   * 执行Token刷新
   * @private
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @param {string} oldToken - 旧Token
   * @returns {Promise<string>} 新Token
   */
  async performTokenRefresh(platform, account, oldToken) {
    try {
      Logger.info(`[AuthManager] 开始刷新Token: ${platform}:${account}`);

      // 获取存储的Token数据
      const tokenData = await this.tokenStore.getToken(platform, account);
      if (!tokenData || !tokenData.refreshToken) {
        // 没有刷新Token，尝试重新登录
        Logger.warn(`[AuthManager] 无刷新Token，尝试重新登录: ${platform}:${account}`);
        return await this.reAuthenticate(platform, account);
      }

      // 获取平台适配器并刷新Token
      const AdapterClass = await this.getPlatformAdapter(platform);
      const adapter = new AdapterClass(oldToken);
      
      const authResult = await adapter.refreshToken(tokenData.refreshToken);
      
      if (!authResult.success || !authResult.token) {
        throw ErrorFactory.createAuthError('Token刷新失败');
      }

      // 保存新Token
      const newTokenData = {
        token: authResult.token,
        refreshToken: authResult.refreshToken || tokenData.refreshToken,
        expiresAt: authResult.expiresIn ? 
          new Date(Date.now() + authResult.expiresIn * 1000).toISOString() : null,
        userInfo: authResult.userInfo || tokenData.userInfo
      };
      
      await this.tokenStore.saveToken(platform, account, newTokenData);

      // 更新缓存
      const authStatus = {
        authenticated: true,
        platform,
        account,
        token: authResult.token,
        expiresAt: newTokenData.expiresAt,
        userInfo: newTokenData.userInfo,
        lastCheck: new Date().toISOString()
      };
      
      this.authStatusCache.set(`${platform}:${account}`, authStatus);

      Logger.info(`[AuthManager] Token刷新成功: ${platform}:${account}`);
      return authResult.token;
    } catch (error) {
      Logger.error(`[AuthManager] Token刷新失败: ${platform}:${account}`, error);
      
      // 刷新失败，尝试重新登录
      try {
        Logger.info(`[AuthManager] Token刷新失败，尝试重新登录: ${platform}:${account}`);
        return await this.reAuthenticate(platform, account);
      } catch (reAuthError) {
        // 重新登录也失败，清理状态
        await this.invalidateToken(platform, account);
        throw ErrorFactory.createAuthError(`Token刷新和重新登录都失败: ${reAuthError.message}`);
      }
    }
  }

  /**
   * 重新认证
   * @private
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<string>} 新Token
   */
  async reAuthenticate(platform, account) {
    try {
      // 从凭据管理器获取保存的凭据
      const credentials = await this.credentialManager.getCredentials(platform, account);
      if (!credentials) {
        throw ErrorFactory.createAuthError('未找到保存的凭据，无法重新登录');
      }

      const authResult = await this.authenticate(platform, credentials);
      return authResult.token;
    } catch (error) {
      Logger.error(`[AuthManager] 重新认证失败: ${platform}:${account}`, error);
      throw error;
    }
  }

  /**
   * 失效Token
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<void>}
   */
  async invalidateToken(platform, account) {
    try {
      this.ensureInitialized();
      
      const key = `${platform}:${account}`;
      
      // 清理缓存
      this.authStatusCache.delete(key);
      
      // 清理存储
      await this.tokenStore.removeToken(platform, account);
      
      Logger.info(`[AuthManager] Token已失效: ${platform}:${account}`);
    } catch (error) {
      Logger.error(`[AuthManager] 失效Token失败: ${platform}:${account}`, error);
      throw ErrorFactory.createSystemError(`失效Token失败: ${error.message}`);
    }
  }

  /**
   * 检查是否已认证
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<boolean>} 是否已认证
   */
  async isAuthenticated(platform, account) {
    try {
      const token = await this.getValidToken(platform, account);
      return !!token;
    } catch (error) {
      Logger.debug(`[AuthManager] 检查认证状态失败: ${platform}:${account}`, error);
      return false;
    }
  }

  /**
   * 获取认证状态
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @returns {Promise<Object>} 认证状态
   */
  async getAuthStatus(platform, account) {
    try {
      this.ensureInitialized();
      
      const key = `${platform}:${account}`;
      
      // 检查缓存
      if (this.authStatusCache.has(key)) {
        return this.authStatusCache.get(key);
      }
      
      // 检查存储的Token
      const tokenData = await this.tokenStore.getToken(platform, account);
      const isAuthenticated = !!tokenData;
      
      const status = {
        authenticated: isAuthenticated,
        platform,
        account,
        token: tokenData?.token || null,
        expiresAt: tokenData?.expiresAt || null,
        userInfo: tokenData?.userInfo || null,
        lastCheck: new Date().toISOString()
      };
      
      if (isAuthenticated) {
        this.authStatusCache.set(key, status);
      }
      
      return status;
    } catch (error) {
      Logger.error(`[AuthManager] 获取认证状态失败: ${platform}:${account}`, error);
      return {
        authenticated: false,
        platform,
        account,
        token: null,
        expiresAt: null,
        userInfo: null,
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * 自动重试装饰器，API调用失败时自动刷新Token重试
   * @param {Function} fn - 要执行的API调用函数
   * @param {string} platform - 平台名称
   * @param {string} account - 账号
   * @param {number} [maxRetries] - 最大重试次数，默认使用配置值
   * @returns {Promise<*>} API调用结果
   */
  async withAuthRetry(fn, platform, account, maxRetries = null) {
    const maxAttempts = maxRetries || this.options.maxRetries;
    let lastError = null;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // 检查是否是认证相关错误
        if (this.isAuthError(error) && attempt < maxAttempts - 1) {
          Logger.warn(`[AuthManager] API调用认证失败，尝试刷新Token (尝试 ${attempt + 1}/${maxAttempts}): ${platform}:${account}`);
          
          try {
            // 获取当前Token并刷新
            const currentToken = await this.getValidToken(platform, account);
            if (currentToken) {
              await this.refreshToken(platform, account, currentToken);
              
              // 等待一段时间后重试
              await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
              continue;
            } else {
              // 没有Token，无法刷新
              break;
            }
          } catch (refreshError) {
            Logger.warn(`[AuthManager] Token刷新失败: ${platform}:${account}`, refreshError);
            // 刷新失败，继续重试或退出
            if (attempt === maxAttempts - 1) {
              break;
            }
          }
        } else {
          // 非认证错误或已达最大重试次数
          break;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 获取所有认证状态
   * @returns {Promise<Array>} 所有认证状态
   */
  async getAllAuthStatus() {
    try {
      this.ensureInitialized();
      
      const allTokens = await this.tokenStore.getAllTokens();
      const statusList = [];
      
      for (const tokenInfo of allTokens) {
        const status = await this.getAuthStatus(tokenInfo.platform, tokenInfo.account);
        statusList.push(status);
      }
      
      return statusList;
    } catch (error) {
      Logger.error(`[AuthManager] 获取所有认证状态失败`, error);
      throw ErrorFactory.createSystemError(`获取所有认证状态失败: ${error.message}`);
    }
  }

  /**
   * 清理所有认证数据
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      Logger.info(`[AuthManager] 开始清理所有认证数据`);
      
      // 清理缓存
      this.authStatusCache.clear();
      this.refreshLocks.clear();
      
      // 清理存储
      if (typeof this.tokenStore.cleanup === 'function') {
        await this.tokenStore.cleanup();
      }
      
      if (typeof this.credentialManager.cleanup === 'function') {
        await this.credentialManager.cleanup();
      }
      
      Logger.info(`[AuthManager] 认证数据清理完成`);
    } catch (error) {
      Logger.error(`[AuthManager] 清理认证数据失败`, error);
      throw ErrorFactory.createSystemError(`清理认证数据失败: ${error.message}`);
    }
  }

  // =============== 私有方法 ===============

  /**
   * 确保已初始化
   * @private
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw ErrorFactory.createSystemError('认证管理器尚未初始化，请先调用initialize()方法');
    }
  }

  /**
   * 获取平台适配器类
   * @private
   * @param {string} platform - 平台名称
   * @returns {Promise<Class>} 适配器类
   */
  async getPlatformAdapter(platform) {
    // 这里需要一个方式来获取平台适配器
    // 可以通过全局注册中心或者依赖注入的方式
    const PlatformRegistry = require('../../core/PlatformRegistry');
    return PlatformRegistry.getAdapter(platform);
  }

  /**
   * 检查Token是否需要刷新
   * @private
   * @param {Object} authStatus - 认证状态
   * @returns {boolean} 是否需要刷新
   */
  shouldRefreshToken(authStatus) {
    if (!authStatus.expiresAt) {
      return false; // 没有过期时间，不需要刷新
    }
    
    const expiresAt = new Date(authStatus.expiresAt);
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    
    // 如果在阈值时间内过期，需要刷新
    return timeUntilExpiry <= this.options.tokenRefreshThreshold;
  }

  /**
   * 检查是否是认证相关错误
   * @private
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否是认证错误
   */
  isAuthError(error) {
    if (!error) return false;
    
    const authErrorTypes = [
      ErrorTypes.AUTH_ERROR,
      ErrorTypes.TOKEN_EXPIRED,
      ErrorTypes.TOKEN_INVALID,
      ErrorTypes.UNAUTHORIZED
    ];
    
    return authErrorTypes.includes(error.type) ||
      error.message?.includes('认证') ||
      error.message?.includes('token') ||
      error.message?.includes('unauthorized') ||
      error.message?.includes('401');
  }

  /**
   * 获取统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    try {
      this.ensureInitialized();
      
      const tokenStats = typeof this.tokenStore.getStats === 'function' ? 
        await this.tokenStore.getStats() : {};
      
      const credentialStats = typeof this.credentialManager.getStats === 'function' ? 
        await this.credentialManager.getStats() : {};
      
      return {
        initialized: this.initialized,
        authStatusCache: this.authStatusCache.size,
        refreshLocks: this.refreshLocks.size,
        tokenStore: tokenStats,
        credentialManager: credentialStats,
        options: this.options
      };
    } catch (error) {
      Logger.error(`[AuthManager] 获取统计信息失败`, error);
      throw ErrorFactory.createSystemError(`获取统计信息失败: ${error.message}`);
    }
  }
}

module.exports = AuthManager;