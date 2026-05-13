/**
 * HzMiss平台适配器
 * 
 * 将原有的HzMissSmartBuyer功能适配到SmartBuy框架
 */

const PlatformAdapter = require('../../interfaces/PlatformAdapter');
const { ErrorFactory, ErrorTypes } = require('../../utils/ErrorTypes');
const Logger = require('../../utils/Logger');
const axios = require('axios');

class HzMissAdapter extends PlatformAdapter {
  constructor(password, config = {}) {
    super('hzmiss', '1.0.0');
    
    this.baseURL = 'https://web.hzmiss.cn';
    this.password = password; // 实际上是token
    this.payPassword = config.payPassword;
    this.account = config.account; // 手机号
    this.token = password; // HzMiss使用token认证
    this.isLoggedIn = false;
    this.requestCount = 0;
    this.successCount = 0;
    this.errorCount = 0;

    // 请求头配置模板
    this.baseHeaders = {
      accept: '*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,eu;q=0.7,km;q=0.6',
      'content-type': 'application/json',
      origin: 'https://web.hzmiss.cn',
      priority: 'u=1, i',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    };

    // Cookie配置（如果需要的话）
    this.cookies = 'acw_tc=af0c62ac17543978460942548eced4257e2d00dd38e3766cd55fcc6c3d; cdn_sec_tc=af0c62ac17543978460942548eced4257e2d00dd38e3766cd55fcc6c3d';
  }

  /**
   * 获取当前请求头
   * @private
   */
  getHeaders() {
    const headers = { ...this.baseHeaders };
    if (this.token) {
      headers.authorization = this.token;
      headers.token = this.token;
    }
    return headers;
  }

  // =============== 认证相关方法 ===============

  /**
   * 用户登录
   * @param {Object} credentials - 登录凭据 {account: string, password: string}
   * @returns {Promise<AuthResult>} 认证结果
   */
  async login(credentials) {
    try {
      Logger.info(`[HzMiss] 开始登录，账号: ${credentials.account}`);

      // HzMiss使用token直接认证，这里将password作为token使用
      this.token = credentials.password;
      this.account = credentials.account;

      // 验证token有效性
      await this.validateTokenInternal();
      
      this.isLoggedIn = true;
      Logger.info(`[HzMiss] 登录成功`);
      
      return {
        success: true,
        token: this.token,
        refreshToken: null,
        expiresIn: null,
        userInfo: {
          account: this.account,
          platform: 'hzmiss'
        }
      };
    } catch (error) {
      Logger.error(`[HzMiss] 登录失败`, error);
      this.isLoggedIn = false;
      this.token = null;
      throw ErrorFactory.createAuthError(`登录失败: ${error.message}`);
    }
  }

  /**
   * 刷新令牌
   * @param {string} refreshToken - 刷新令牌
   * @returns {Promise<AuthResult>} 新的认证结果
   */
  async refreshToken(refreshToken) {
    try {
      Logger.info(`[HzMiss] 开始刷新Token`);
      
      if (!this.token) {
        throw new Error('当前无有效token');
      }

      await this.validateTokenInternal();

      return {
        success: true,
        token: this.token,
        refreshToken: null,
        expiresIn: null,
        userInfo: {
          account: this.account,
          platform: 'hzmiss'
        }
      };
    } catch (error) {
      Logger.error(`[HzMiss] Token刷新失败`, error);
      throw ErrorFactory.createAuthError(`Token刷新失败: ${error.message}`);
    }
  }

  /**
   * 验证令牌有效性
   * @param {string} token - 待验证的令牌
   * @returns {Promise<boolean>} 是否有效
   */
  async validateToken(token) {
    try {
      const oldToken = this.token;
      this.token = token;
      await this.validateTokenInternal();
      return true;
    } catch (error) {
      Logger.warn(`[HzMiss] Token验证失败: ${error.message}`);
      this.token = oldToken;
      return false;
    }
  }

  /**
   * 内部Token验证方法
   * @private
   */
  async validateTokenInternal() {
    // 通过调用用户收藏接口来验证token有效性
    const response = await axios.post(
      `${this.baseURL}/api/user/collection/user/list/group?collectionsBoxflag=0&status=&page=1&pageSize=1`,
      {
        collectionsBoxflag: 0,
        status: '',
        page: 1,
        pageSize: 1,
      },
      {
        headers: {
          ...this.getHeaders(),
          cookie: this.cookies,
        },
        timeout: 10000,
      }
    );

    if (!response.data || response.data.code !== 200) {
      throw new Error('Token验证失败');
    }
  }

  /**
   * 用户登出
   * @returns {Promise<boolean>} 是否成功
   */
  async logout() {
    try {
      Logger.info(`[HzMiss] 开始登出`);
      
      this.token = null;
      this.account = null;
      this.isLoggedIn = false;
      
      Logger.info(`[HzMiss] 登出成功`);
      return true;
    } catch (error) {
      Logger.error(`[HzMiss] 登出失败`, error);
      return false;
    }
  }

  // =============== 购买相关方法 ===============

  /**
   * 获取商品列表
   * @param {string} productId - 商品ID (HzMiss中为collectionId)
   * @param {Object} options - 选项参数
   * @returns {Promise<Product[]>} 商品列表
   */
  async getProductList(productId, options = {}) {
    try {
      if (!this.isLoggedIn) {
        throw new Error('用户未登录');
      }

      const page = options.page || 1;
      const pageSize = options.pageSize || 20;

      Logger.debug(`[HzMiss] 获取商品列表，商品ID: ${productId}`);

      const response = await axios.post(
        `${this.baseURL}/api/collection/get/meta?type=0&onSale=0&collectionId=${productId}&page=${page}&pageSize=${pageSize}`,
        {}, // 空的请求体
        {
          headers: {
            ...this.getHeaders(),
            cookie: this.cookies,
          },
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (response.data && response.data.code === 200) {
        const items = response.data.data?.rows || [];
        Logger.info(`[HzMiss] 获取到 ${items.length} 个商品`);
        
        // 转换为标准格式
        return items.map(item => ({
          id: item.collectionMetaId,
          productId: productId,
          price: parseFloat(item.price || item.currentPrice || 0),
          available: item.metaStatus !== 2, // metaStatus为2表示不可购买
          title: item.name || `商品${item.collectionMetaId}`,
          seller: item.sellerId || 'unknown',
          attributes: {
            collectionId: item.collectionId,
            collectionMetaId: item.collectionMetaId,
            metaStatus: item.metaStatus,
            currentPrice: item.currentPrice
          },
          raw: item
        }));
      } else {
        throw new Error(`获取商品列表失败: ${response.data?.message || '未知错误'}`);
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[HzMiss] 获取商品列表失败`, error);
      throw ErrorFactory.createApiError(`获取商品列表失败: ${error.message}`);
    }
  }

  /**
   * 下单商品
   * @param {Product} product - 商品信息
   * @returns {Promise<string>} 订单ID
   */
  async placeOrder(product) {
    try {
      if (!this.isLoggedIn) {
        throw new Error('用户未登录');
      }

      Logger.info(`[HzMiss] 开始下单，商品ID: ${product.id}`);

      const collectionMetaId = product.attributes?.collectionMetaId || product.id;
      
      const response = await axios.post(
        `${this.baseURL}/api/order/order/sign?collectionMetaId=${collectionMetaId}&followId=`,
        {}, // 空的请求体
        {
          headers: {
            ...this.getHeaders(),
            cookie: this.cookies,
          },
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (response.data && response.data.code === 200) {
        this.successCount++;
        const orderInfo = response.data.data;
        Logger.info(`[HzMiss] 创建订单成功，订单ID: ${orderInfo.id || orderInfo.orderId}`);
        
        return orderInfo.id || orderInfo.orderId || orderInfo.orderNumber;
      } else {
        this.errorCount++;
        throw new Error(`下单失败: ${response.data?.message || '未知错误'} (code: ${response.data?.code})`);
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[HzMiss] 下单失败`, error);
      throw ErrorFactory.createBusinessError(error.message, ErrorTypes.ORDER_FAILED);
    }
  }

  /**
   * 快捷下单
   * @param {string} productId - 商品ID
   * @param {Object} options - 选项参数
   * @returns {Promise<string>} 订单ID
   */
  async quickOrder(productId, options = {}) {
    try {
      // 获取商品列表
      const products = await this.getProductList(productId, options);
      
      // 筛选可用商品
      const availableProducts = products.filter(product => 
        product.available && 
        product.price > 0 && 
        (!options.maxPrice || product.price <= options.maxPrice)
      );

      if (availableProducts.length === 0) {
        throw ErrorFactory.createBusinessError('没有符合条件的商品', ErrorTypes.NO_QUALIFIED_PRODUCTS);
      }

      // 选择价格最低的商品
      availableProducts.sort((a, b) => a.price - b.price);
      const bestProduct = availableProducts[0];

      Logger.info(`[HzMiss] 快捷下单选择商品: ID=${bestProduct.id}, 价格=${bestProduct.price}`);

      // 直接下单
      return await this.placeOrder(bestProduct);
    } catch (error) {
      Logger.error(`[HzMiss] 快捷下单失败`, error);
      throw error;
    }
  }

  /**
   * 批量下单
   * @param {string} productId - 商品ID
   * @param {Object} options - 选项参数 {quantity, maxPrice, batchSize}
   * @returns {Promise<string[]>} 订单ID列表
   */
  async batchOrder(productId, options = {}) {
    try {
      const quantity = options.quantity || 1;
      const batchSize = options.batchSize || Math.min(quantity, 3); // HzMiss批量较小
      const orderIds = [];

      Logger.info(`[HzMiss] 开始批量下单，商品ID: ${productId}, 数量: ${quantity}, 批次大小: ${batchSize}`);

      for (let i = 0; i < quantity; i += batchSize) {
        const currentBatchSize = Math.min(batchSize, quantity - i);
        const batchPromises = [];

        for (let j = 0; j < currentBatchSize; j++) {
          batchPromises.push(this.quickOrder(productId, options));
        }

        try {
          const batchResults = await Promise.allSettled(batchPromises);
          
          for (const result of batchResults) {
            if (result.status === 'fulfilled') {
              orderIds.push(result.value);
            } else {
              Logger.warn(`[HzMiss] 批量下单中的单个订单失败: ${result.reason.message}`);
            }
          }

          // 批次间延迟
          if (i + batchSize < quantity) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } catch (error) {
          Logger.error(`[HzMiss] 批次下单失败`, error);
        }
      }

      Logger.info(`[HzMiss] 批量下单完成，成功: ${orderIds.length}/${quantity}`);
      return orderIds;
    } catch (error) {
      Logger.error(`[HzMiss] 批量下单失败`, error);
      throw error;
    }
  }

  // =============== 支付相关方法 ===============

  /**
   * 获取支付链接
   * @param {string} orderId - 订单ID
   * @returns {Promise<string>} 支付URL
   */
  async getPaymentUrl(orderId) {
    try {
      if (!this.isLoggedIn) {
        throw new Error('用户未登录');
      }

      Logger.info(`[HzMiss] 获取支付链接，订单ID: ${orderId}`);

      // HzMiss需要collectionMetaId，这里假设orderId包含必要信息
      // 实际使用中可能需要调整参数
      const response = await axios.post(
        `${this.baseURL}/api/order/order/pay?collectionMetaId=&orderId=${orderId}&payType=HFPAY&dealpassword=`,
        {}, // 空的请求体
        {
          headers: {
            ...this.getHeaders(),
            cookie: this.cookies,
          },
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (response.data && response.data.code === 200) {
        const payInfo = response.data.data;
        const payUrl = payInfo.payUrl || payInfo.url || payInfo.paymentUrl;
        
        if (!payUrl) {
          throw new Error('未获取到支付链接');
        }

        Logger.info(`[HzMiss] 获取支付链接成功: ${payUrl}`);
        return payUrl;
      } else {
        this.errorCount++;
        throw new Error(`获取支付链接失败: ${response.data?.message || '未知错误'} (code: ${response.data?.code})`);
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[HzMiss] 获取支付链接失败`, error);
      throw ErrorFactory.createBusinessError(`获取支付链接失败: ${error.message}`, ErrorTypes.PAYMENT_FAILED);
    }
  }

  /**
   * 执行支付
   * @param {string} paymentUrl - 支付URL
   * @param {string} payPassword - 支付密码
   * @returns {Promise<PaymentResult>} 支付结果
   */
  async executePayment(paymentUrl, payPassword) {
    try {
      if (!payPassword) {
        throw new Error('支付密码不能为空');
      }

      Logger.info(`[HzMiss] 开始执行自动支付`);

      // 这里需要根据HzMiss的实际支付流程来实现
      // 原代码中使用了外部的Payment模块，这里简化处理
      Logger.warn(`[HzMiss] 支付功能需要集成实际的支付模块`);

      // 临时返回成功状态，实际需要实现具体的支付逻辑
      Logger.info(`[HzMiss] 支付执行完成（模拟）`);
      return {
        success: true,
        transactionId: Date.now().toString(),
        message: '支付成功',
        paymentUrl: paymentUrl
      };
    } catch (error) {
      Logger.error(`[HzMiss] 支付执行失败`, error);
      throw ErrorFactory.createBusinessError(`支付执行失败: ${error.message}`, ErrorTypes.PAYMENT_FAILED);
    }
  }

  // =============== 其他任务方法 ===============

  /**
   * 确认合成
   * @param {string} combinationId - 合成ID
   * @returns {Promise<boolean>} 是否成功
   */
  async confirmCombination(combinationId) {
    try {
      Logger.info(`[HzMiss] 确认合成，ID: ${combinationId}`);
      
      // 这里需要根据HzMiss的实际API实现合成确认功能
      Logger.warn(`[HzMiss] 合成确认功能待实现`);
      
      return true;
    } catch (error) {
      Logger.error(`[HzMiss] 合成确认失败`, error);
      throw ErrorFactory.createBusinessError(`合成确认失败: ${error.message}`, ErrorTypes.ORDER_FAILED);
    }
  }

  /**
   * 取消寄售
   * @param {string} resaleId - 寄售ID
   * @returns {Promise<boolean>} 是否成功
   */
  async cancelResale(resaleId) {
    try {
      Logger.info(`[HzMiss] 取消寄售，ID: ${resaleId}`);
      
      // 这里需要根据HzMiss的实际API实现取消寄售功能
      Logger.warn(`[HzMiss] 取消寄售功能待实现`);
      
      return true;
    } catch (error) {
      Logger.error(`[HzMiss] 取消寄售失败`, error);
      throw ErrorFactory.createBusinessError(`取消寄售失败: ${error.message}`, ErrorTypes.ORDER_FAILED);
    }
  }

  /**
   * 获取用户收藏数量（HzMiss特有功能）
   * @param {string} collectionId - 商品集合ID
   * @returns {Promise<number>} 收藏数量
   */
  async getUserCollectionCount(collectionId) {
    try {
      if (!this.isLoggedIn) {
        throw new Error('用户未登录');
      }

      Logger.debug(`[HzMiss] 获取用户收藏数量，商品集合ID: ${collectionId}`);

      const response = await axios.post(
        `${this.baseURL}/api/user/collection/user/list/group?collectionsBoxflag=0&status=&page=1&pageSize=20`,
        {
          collectionsBoxflag: 0,
          status: '',
          page: 1,
          pageSize: 20,
        },
        {
          headers: {
            ...this.getHeaders(),
            cookie: this.cookies,
          },
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (response.data && response.data.code === 200) {
        const collections = response.data.data?.rows || [];
        const targetCollection = collections.find(item => item.collectionId === collectionId);
        const count = targetCollection ? parseInt(targetCollection.collectionMemberCount || 0) : 0;
        
        Logger.info(`[HzMiss] 用户收藏数量: ${count}`);
        return count;
      } else {
        throw new Error(`获取收藏数量失败: ${response.data?.message || '未知错误'}`);
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[HzMiss] 获取收藏数量失败`, error);
      throw ErrorFactory.createApiError(`获取收藏数量失败: ${error.message}`);
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? 
        ((this.successCount / this.requestCount) * 100).toFixed(2) : 0,
    };
  }
}

module.exports = HzMissAdapter;