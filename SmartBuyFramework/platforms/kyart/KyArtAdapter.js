/**
 * KyArt平台适配器
 *
 * 将原有的KyArtSmartBuyer功能适配到SmartBuy框架
 */

const PlatformAdapter = require('../../interfaces/PlatformAdapter');
const { ErrorFactory, ErrorTypes } = require('../../utils/ErrorTypes');
const Logger = require('../../utils/Logger');
const axios = require('axios');
const cryptJs = require('crypto-js');

class KyArtAdapter extends PlatformAdapter {
  constructor(authValue, config = {}) {
    super(authValue, config);

    // 设置平台标识
    this.platformName = 'kyart';
    this.platformVersion = '1.0.0';

    this.baseURL = 'https://api.kyart.art';
    this.h5URL = 'https://h5.kyart.art';
    this.payPassword = config.payPassword;
    this.account = config.account; // 手机号

    // 根据传入值的类型设置认证模式
    if (this.isTokenFormat(authValue)) {
      // Token模式
      this.token = authValue;
      this.password = null;
      this.isLoggedIn = true; // token模式直接设为已登录
    } else {
      // 密码模式
      this.password = authValue;
      this.token = null;
      this.isLoggedIn = false; // 密码模式需要登录
    }

    this.userInfo = null; // 用户信息
    this.requestCount = 0;
    this.successCount = 0;
    this.errorCount = 0;

    // 请求头配置模板
    this.baseHeaders = {
      accept: '*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,eu;q=0.7,km;q=0.6',
      'content-type': 'application/json',
      origin: this.h5URL,
      priority: 'u=1, i',
      referer: `${this.h5URL}/`,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    };
  }

  /**
   * 判断是否为token格式的辅助方法
   * @param {string} value - 待检查的值
   * @returns {boolean} 是否为token格式
   */
  isTokenFormat(value) {
    // 检查是否为UUID格式（如: c7bf7e19-5d50-4e5c-9328-699ab3a12e21）
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    );
  }

  /**
   * 获取当前请求头
   * @private
   */
  getHeaders() {
    const headers = { ...this.baseHeaders };
    if (this.token) {
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
      Logger.info(`[KyArt] 开始登录，账号: ${credentials.account}`);

      // 调用KyArt登录API
      const response = await axios.post(
        `${this.baseURL}/api/user/login`,
        {
          account: credentials.account,
          password: credentials.password,
        },
        {
          headers: this.baseHeaders,
          timeout: 10000,
        }
      );

      // 检查API响应
      if (!response.data || response.data.code !== 1) {
        const errorMsg = response.data?.msg || '登录API调用失败';
        throw new Error(errorMsg);
      }

      const userData = response.data.data.userinfo;

      // 保存认证信息
      this.token = userData.token;
      this.account = credentials.account;
      this.isLoggedIn = true;

      // 保存用户信息
      this.userInfo = {
        id: userData.id,
        username: userData.username,
        nickname: userData.nickname,
        mobile: userData.mobile,
        avatar: userData.avatar,
        score: userData.score,
        inviter_code: userData.inviter_code,
        yao_count: userData.yao_count,
        expiretime: userData.expiretime,
        expires_in: userData.expires_in,
      };

      Logger.info(
        `[KyArt] 登录成功，用户: ${userData.nickname} (ID: ${userData.id})`
      );

      return {
        success: true,
        token: this.token,
        refreshToken: null,
        expiresIn: userData.expires_in,
        userInfo: {
          account: this.account,
          platform: 'kyart',
          id: userData.id,
          username: userData.username,
          nickname: userData.nickname,
          mobile: userData.mobile,
          avatar: userData.avatar,
          score: userData.score,
          expiretime: userData.expiretime,
        },
      };
    } catch (error) {
      Logger.error(`[KyArt] 登录失败`, error);
      this.isLoggedIn = false;
      this.token = null;
      this.userInfo = null;

      // 根据错误类型返回更具体的错误信息
      let errorMessage = error.message;
      if (error.response) {
        // HTTP错误响应
        if (error.response.status === 401) {
          errorMessage = '用户名或密码错误';
        } else if (error.response.status === 429) {
          errorMessage = '登录请求过于频繁，请稍后重试';
        } else if (error.response.data?.msg) {
          errorMessage = error.response.data.msg;
        }
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = '无法连接到KyArt服务器';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = '登录请求超时';
      }

      throw ErrorFactory.createAuthError(`登录失败: ${errorMessage}`);
    }
  }

  /**
   * 刷新令牌
   * @param {string} refreshToken - 刷新令牌
   * @returns {Promise<AuthResult>} 新的认证结果
   */
  async refreshToken(refreshToken) {
    try {
      Logger.info(`[KyArt] 开始刷新Token`);

      // KyArt的token刷新机制需要根据实际API实现
      // 目前暂时返回当前token
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
          platform: 'kyart',
        },
      };
    } catch (error) {
      Logger.error(`[KyArt] Token刷新失败`, error);
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
      Logger.warn(`[KyArt] Token验证失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 内部Token验证方法
   * @private
   */
  async validateTokenInternal() {
    if (!this.token) {
      throw new Error('Token不存在');
    }

    // 通过调用API来验证token有效性，让服务器自己检查过期
    try {
      const response = await axios.post(
        `${this.baseURL}/api/user/getUserInfo`, // 假设有这样的接口
        {},
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      if (!response.data || response.data.code !== 1) {
        throw new Error('Token验证失败');
      }
    } catch (error) {
      // 如果用户信息接口不存在，退回到使用商品列表接口验证
      const response = await axios.post(
        `${this.baseURL}/api/market/market/getMarketGoodsListByGoodsId`,
        {
          page: 1,
          sort: 'price',
          type: 2,
          id: '1', // 使用一个测试商品ID
          order: 'asc',
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      if (!response.data || response.data.code !== 1) {
        throw new Error('Token验证失败');
      }
    }
  }

  /**
   * 用户登出
   * @returns {Promise<boolean>} 是否成功
   */
  async logout() {
    try {
      Logger.info(`[KyArt] 开始登出`);

      // 清理所有认证相关信息
      this.token = null;
      this.userInfo = null;
      this.account = null;
      this.isLoggedIn = false;

      // 重置统计信息
      this.requestCount = 0;
      this.successCount = 0;
      this.errorCount = 0;

      Logger.info(`[KyArt] 登出成功`);
      return true;
    } catch (error) {
      Logger.error(`[KyArt] 登出失败`, error);
      return false;
    }
  }

  // =============== 购买相关方法 ===============

  /**
   * 获取商品列表
   * @param {string} productId - 商品ID
   * @param {Object} options - 选项参数
   * @returns {Promise<Product[]>} 商品列表
   */
  async getProductList(productId, options = {}) {
    try {
      if (!this.isLoggedIn) {
        throw new Error('用户未登录');
      }

      const page = options.page || 1;
      const sort = options.sort || 'price';
      const type = options.type || 2;
      const order = options.order || 'asc';

      Logger.debug(`[KyArt] 获取商品列表，商品ID: ${productId}`);

      const response = await axios.post(
        `${this.baseURL}/api/market/market/getMarketGoodsListByGoodsId`,
        {
          page,
          sort,
          type,
          id: productId,
          order,
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (response.data && response.data.code === 1) {
        const items = response.data.data?.list || [];
        Logger.info(`[KyArt] 获取到 ${items.length} 个商品`);

        // 转换为标准格式
        return items.map((item) => ({
          id: item.id,
          productId: productId,
          price: parseFloat(item.price || 0),
          available: item.status === 4, // status为4表示可购买
          title: item.collection_code || `商品${item.id}`,
          seller: item.seller_id || 'unknown',
          attributes: {
            collectionCode: item.collection_code,
            status: item.status,
            marketGoodsId: item.id,
          },
          raw: item,
        }));
      } else {
        throw new Error(
          `获取商品列表失败: ${response.data?.msg || '未知错误'}`
        );
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[KyArt] 获取商品列表失败`, error);
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

      Logger.info(`[KyArt] 开始下单，商品ID: ${product.id}`);

      const marketGoodsId = product.attributes?.marketGoodsId || product.id;

      const response = await axios.post(
        `${this.baseURL}/api/order/pay/CreateMarketOrder`,
        {
          market_goods_id: marketGoodsId,
          pay_type: 4,
          pay_way: 'huifu',
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (response.data && response.data.code === 1) {
        this.successCount++;
        const orderInfo = response.data.data;
        Logger.info(`[KyArt] 创建订单成功，订单号: ${orderInfo.order_sn}`);

        return orderInfo.order_sn;
      } else {
        this.errorCount++;
        throw new Error(
          `创建订单失败: ${response.data?.msg || '未知错误'} (code: ${
            response.data?.code
          })`
        );
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[KyArt] 下单失败`, error);
      throw ErrorFactory.createBusinessError(
        error.message,
        ErrorTypes.ORDER_FAILED
      );
    }
  }

  /**
   * 快捷下单 - 带价格验证
   * @param {string} productId - 商品ID
   * @param {Object} options - 选项参数 {maxPrice, productConfig}
   * @returns {Promise<string>} 订单ID
   */
  async quickOrder(productId, options = {}) {
    try {
      if (!this.isLoggedIn) {
        throw new Error('用户未登录');
      }

      const maxPrice = options.maxPrice;
      const productConfig = options.productConfig || {};

      Logger.info(
        `[KyArt] 开始快捷下单，商品ID: ${productId}, 最高价格: ${maxPrice}`
      );

      // 第一步：快捷下单
      const response = await axios.post(
        `${this.baseURL}/api/order/pay/fastOrderNew`,
        {
          goods_id: parseInt(productId, 10),
          key: productConfig.key || '',
          pay_way: 'huifu',
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (!response.data || response.data.code !== 1) {
        this.errorCount++;
        throw new Error(
          `创建订单失败: ${response.data?.msg || '未知错误'} (code: ${
            response.data?.code
          })`
        );
      }

      const orderInfo = response.data.data;
      const { order_sn, order_id } = orderInfo;

      Logger.info(
        `[KyArt] 创建订单成功，订单号: ${order_sn}, 订单ID: ${order_id}`
      );

      // 第二步：查询订单详情验证价格
      if (maxPrice && maxPrice > 0) {
        const orderDetail = await this.getOrderDetailWithRetry(order_id);

        if (orderDetail && orderDetail.total_price) {
          const actualPrice = parseFloat(orderDetail.total_price);

          Logger.info(
            `[KyArt] 订单价格: ${actualPrice}, 最高价格: ${maxPrice}`
          );

          if (actualPrice > maxPrice) {
            Logger.info(
              `[KyArt] 🚫 价格超出预期 (${actualPrice} > ${maxPrice})，取消订单: ${order_sn}`
            );

            // 第三步：取消订单
            await this.cancelOrder(order_sn);

            // 抛出价格超出错误，让调用方知道订单已被取消
            throw new Error(
              `价格超出预期: ${actualPrice} > ${maxPrice}，订单已取消`
            );
          } else {
            Logger.info(`[KyArt] ✅ 价格符合预期，继续支付流程`);
          }
        }
      }

      this.successCount++;
      return order_sn;
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[KyArt] 快捷下单失败`, error);
      throw ErrorFactory.createBusinessError(
        error.message,
        ErrorTypes.ORDER_FAILED
      );
    }
  }

  /**
   * 获取订单详情（带重试）
   * @private
   * @param {string} orderId - 订单ID
   * @returns {Promise<Object>} 订单详情
   */
  async getOrderDetailWithRetry(orderId) {
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        Logger.info(
          `[KyArt] 查询订单详情 (尝试 ${attempt}/2)，订单ID: ${orderId}`
        );

        const response = await axios.post(
          `${this.baseURL}/api/order/order/MarketOrderDetail/ids/${orderId}`,
          {},
          {
            headers: this.getHeaders(),
            timeout: 10000,
          }
        );

        if (response.data && response.data.code === 1) {
          Logger.info(`[KyArt] 获取订单详情成功`);
          return response.data.data;
        } else {
          throw new Error(
            `获取订单详情失败: ${response.data?.msg || '未知错误'}`
          );
        }
      } catch (error) {
        lastError = error;
        Logger.warn(
          `[KyArt] 获取订单详情失败 (尝试 ${attempt}/2): ${error.message}`
        );

        if (attempt < 2) {
          // 第一次失败，等待1秒后重试
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    // 两次都失败，抛出错误停止执行
    Logger.error(`[KyArt] 获取订单详情最终失败，停止执行`);
    throw lastError;
  }

  /**
   * 取消订单
   * @private
   * @param {string} orderSn - 订单号
   * @returns {Promise<boolean>} 是否成功
   */
  async cancelOrder(orderSn) {
    try {
      Logger.info(`[KyArt] 取消订单: ${orderSn}`);

      const response = await axios.post(
        `${this.baseURL}/api/order/order/changeMarketOrderStatus`,
        {
          order_type: 2,
          status: 3,
          order_sn: orderSn,
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      if (response.data && response.data.code === 1) {
        Logger.info(`[KyArt] ✅ 订单取消成功: ${orderSn}`);
        return true;
      } else {
        Logger.error(
          `[KyArt] ❌ 订单取消失败: ${response.data?.msg || '未知错误'}`
        );
        return false;
      }
    } catch (error) {
      Logger.error(`[KyArt] 订单取消失败`, error);
      return false;
    }
  }

  /**
   * 批量下单 - 使用KyArt官方批量API
   * @param {string} productId - 商品ID
   * @param {Object} options - 选项参数 {quantity, maxPrice, productConfig, payPassword}
   * @returns {Promise<string[]>} 订单ID列表
   */
  async batchOrder(productId, options = {}) {
    try {
      const quantity = options.quantity || 1;
      const productConfig = options.productConfig || {};
      const payPassword = options.payPassword || this.payPassword;

      Logger.info(
        `[KyArt] 开始批量下单流程，商品ID: ${productId}, 数量: ${quantity}`
      );

      if (!payPassword) {
        throw new Error('批量下单需要支付密码');
      }

      // 第一步：批量下单 (batchBuy)
      const batchOrderId = await this.batchBuy(
        productId,
        quantity,
        productConfig
      );

      // 第二步：获取订单列表 (batchPayOrder)
      const orderData = await this.batchPayOrder();

      if (!orderData || !orderData.data || orderData.data.length === 0) {
        throw new Error('批量下单后未找到待支付订单');
      }

      // 第三步：批量支付 (batchdopay)
      const orderIds = orderData.data.map((order) => order.id.toString());
      const payOrderSn = await this.batchdopay(
        orderIds,
        orderData.batch_order_id
      );

      // 第四步：最终支付确认 (doPay)
      const paymentUrl = await this.getPaymentUrl(payOrderSn, 10); // 批量支付使用order_type=10

      // 第五步：执行支付
      await this.executePayment(paymentUrl, payPassword);

      Logger.info(`[KyArt] 批量下单流程完成，处理订单数: ${orderIds.length}`);
      return orderIds;
    } catch (error) {
      Logger.error(`[KyArt] 批量下单流程失败`, error);
      throw error;
    }
  }

  /**
   * 第一步：批量下单API
   * @private
   * @param {string} productId - 商品ID
   * @param {number} quantity - 数量
   * @param {Object} productConfig - 商品配置
   * @returns {Promise<number>} batch_order_id
   */
  async batchBuy(productId, quantity, productConfig) {
    try {
      Logger.info(
        `[KyArt] 执行批量下单，商品ID: ${productId}, 数量: ${quantity}`
      );
      Logger.info(
        `[KyArt] 执行批量下单，商品${JSON.stringify({
          price: productConfig.price || 8, // 商品价格
          num: quantity,
          key: productConfig.key || '', // 商品key
          goods_id: parseInt(productId, 10),
        })}`
      );
      const response = await axios.post(
        `${this.baseURL}/api/order/pay/batchBuy`,
        {
          price: productConfig.price || 8, // 商品价格
          num: quantity,
          key: productConfig.key || '', // 商品key
          goods_id: parseInt(productId, 10),
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      this.requestCount++;
      console.log(response.data, '===========');

      if (response.data && response.data.code === 1) {
        Logger.info(`[KyArt] 批量下单成功: ${response.data.msg}`);
        return response.data.data; // 可能返回batch_order_id
      } else {
        throw new Error(`批量下单失败: ${response.data?.msg || '未知错误'}`);
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[KyArt] 批量下单API失败`, error);
      throw error;
    }
  }

  /**
   * 第二步：获取批量订单列表
   * @private
   * @returns {Promise<Object>} 订单数据
   */
  async batchPayOrder() {
    try {
      Logger.info(`[KyArt] 获取批量订单列表`);

      const response = await axios.post(
        `${this.baseURL}/api/order/order/batchPayOrder`,
        {}, // 空参数
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (response.data && response.data.code === 1) {
        Logger.info(
          `[KyArt] 获取订单列表成功，订单数: ${
            response.data.data?.data?.length || 0
          }`
        );
        return response.data.data;
      } else {
        throw new Error(
          `获取订单列表失败: ${response.data?.msg || '未知错误'}`
        );
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[KyArt] 获取订单列表失败`, error);
      throw error;
    }
  }

  /**
   * 第三步：批量支付
   * @private
   * @param {string[]} orderIds - 订单ID列表
   * @param {number} batchOrderId - 批量订单ID
   * @returns {Promise<string>} 支付订单号
   */
  async batchdopay(orderIds, batchOrderId) {
    try {
      Logger.info(
        `[KyArt] 批量支付，订单IDs: ${orderIds.join(
          ','
        )}, 批量ID: ${batchOrderId}`
      );

      const response = await axios.post(
        `${this.baseURL}/api/order/pay/batchdopay`,
        {
          order_ids: orderIds.join(','), // 订单ID用逗号连接
          batch_order_id: batchOrderId,
          pay_way: 'huifu',
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (response.data && response.data.code === 1) {
        const payOrderSn = response.data.data.order_sn;
        Logger.info(`[KyArt] 批量支付创建成功，支付订单号: ${payOrderSn}`);
        return payOrderSn;
      } else {
        throw new Error(`批量支付失败: ${response.data?.msg || '未知错误'}`);
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[KyArt] 批量支付失败`, error);
      throw error;
    }
  }

  // =============== 支付相关方法 ===============

  /**
   * 获取支付链接
   * @param {string} orderId - 订单ID
   * @param {number} orderType - 订单类型 (2=普通订单, 10=批量订单)
   * @returns {Promise<string>} 支付URL
   */
  async getPaymentUrl(orderId, orderType = 2) {
    try {
      if (!this.isLoggedIn) {
        throw new Error('用户未登录');
      }

      Logger.info(
        `[KyArt] 获取支付链接，订单号: ${orderId}, 订单类型: ${orderType}`
      );

      const returnUrl = encodeURIComponent(
        `${this.h5URL}/#/pages/order/defaultDetail?id=${orderId}`
      );

      const response = await axios.post(
        `${this.baseURL}/api/order/pay/doPay`,
        {
          pay_type: 4,
          order_number: orderId,
          order_type: orderType, // 支持批量订单类型
          pay_way: 'huifu',
          pay_scene: 'H5',
          returnurl: returnUrl,
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      this.requestCount++;

      if (response.data && response.data.code === 1) {
        const payInfo = response.data.data;
        const payUrl = payInfo.pay?.pay_url;

        if (!payUrl) {
          throw new Error('未获取到支付链接');
        }

        Logger.info(`[KyArt] 获取支付链接成功: ${payUrl}`);
        return payUrl;
      } else {
        this.errorCount++;
        throw new Error(
          `获取支付链接失败: ${response.data?.msg || '未知错误'} (code: ${
            response.data?.code
          })`
        );
      }
    } catch (error) {
      this.requestCount++;
      this.errorCount++;
      Logger.error(`[KyArt] 获取支付链接失败`, error);
      throw ErrorFactory.createBusinessError(
        `获取支付链接失败: ${error.message}`,
        ErrorTypes.PAYMENT_FAILED
      );
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

      Logger.info(`[KyArt] 开始执行自动支付`);

      const uuid = paymentUrl.split('?')[1]?.split('&')[0]?.split('=')[1];
      if (!uuid) {
        throw new Error('无法从支付链接中提取UUID');
      }

      Logger.debug(`[KyArt] UUID: ${uuid}`);

      // 加密支付密码
      const encryptedPwd = this.getPwd(payPassword, uuid);

      // 执行支付流程
      await this.transpasswordcheck(encryptedPwd, uuid, paymentUrl);

      Logger.info(`[KyArt] 支付执行完成`);
      return {
        success: true,
        transactionId: uuid,
        message: '支付成功',
        paymentUrl: paymentUrl,
      };
    } catch (error) {
      Logger.error(`[KyArt] 支付执行失败`, error);
      throw ErrorFactory.createBusinessError(
        `支付执行失败: ${error.message}`,
        ErrorTypes.PAYMENT_FAILED
      );
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
      Logger.info(`[KyArt] 确认合成，ID: ${combinationId}`);

      // 这里需要根据KyArt的实际API实现合成确认功能
      // 目前暂时返回成功状态
      Logger.warn(`[KyArt] 合成确认功能待实现`);

      return true;
    } catch (error) {
      Logger.error(`[KyArt] 合成确认失败`, error);
      throw ErrorFactory.createBusinessError(
        `合成确认失败: ${error.message}`,
        ErrorTypes.ORDER_FAILED
      );
    }
  }

  /**
   * 取消寄售
   * @param {string} resaleId - 寄售ID
   * @returns {Promise<boolean>} 是否成功
   */
  async cancelResale(resaleId) {
    try {
      Logger.info(`[KyArt] 取消寄售，ID: ${resaleId}`);

      // 这里需要根据KyArt的实际API实现取消寄售功能
      // 目前暂时返回成功状态
      Logger.warn(`[KyArt] 取消寄售功能待实现`);

      return true;
    } catch (error) {
      Logger.error(`[KyArt] 取消寄售失败`, error);
      throw ErrorFactory.createBusinessError(
        `取消寄售失败: ${error.message}`,
        ErrorTypes.ORDER_FAILED
      );
    }
  }

  // =============== 私有方法 ===============

  /**
   * 加密支付密码
   * @private
   * @param {string} pwd - 支付密码
   * @param {string} uuid - UUID
   * @returns {string} 加密后的密码
   */
  getPwd(pwd, uuid) {
    const a = uuid;
    const s = 'chinapnr';
    const n = cryptJs.mode.CBC;
    const o = cryptJs.pad.Pkcs7;
    const t = pwd;
    const r = cryptJs.enc.Utf8.parse(a);
    const l = {
      mode: n,
      padding: o,
      iv: cryptJs.enc.Utf8.parse(s),
    };
    const c = cryptJs.TripleDES.encrypt(t, r, l);
    const p = cryptJs.enc.Base64.stringify(c.ciphertext);
    return p;
  }

  /**
   * 生成校验值
   * @private
   * @param {Object} data - 数据对象
   * @returns {string} 校验值
   */
  getCheckValue(data) {
    const d = ['front_id_pic', 'back_id_pic', 'bank_card_pic', 'pic_list'];
    const l = {
      aesEncrypt: function (e, a) {
        const n = this.setSign(this.objSort(e));
        return cryptJs.HmacSHA256(n, a).toString();
      },
      objSort: function (e) {
        const a = this;
        let n = {};
        const t = Object.keys(e).sort((e, a) => e.localeCompare(a));

        t.forEach(function (t) {
          if (e[t].constructor === Object) {
            n[t] = a.objSort(e[t]);
          } else if (e[t].constructor === Array) {
            n[t] = a.toUnicode(JSON.stringify(e[t]));
          } else {
            n[t] = e[t];
          }
        });
        return n;
      },
      setSign: function (e) {
        const a = Object.keys(e);
        const n = a.filter((e) => d.indexOf(e) === -1);
        let t = '';

        n.sort((e, a) => e.localeCompare(a)).forEach((a, i) => {
          if (e[a].constructor === Object) {
            t += a + '=' + JSON.stringify(e[a]) + (i < n.length - 1 ? '&' : '');
          } else {
            t += a + '=' + e[a] + (i < n.length - 1 ? '&' : '');
          }
        });
        return t;
      },
      toUnicode: function (str) {
        return str; // 简化实现
      },
    };
    return l.aesEncrypt(data, 'chinapnr');
  }

  /**
   * 生成汇付请求头
   * @private
   * @param {Object} data - 请求数据
   * @param {string} uuid - UUID
   * @param {string} url - 请求URL
   * @returns {Object} 请求头
   */
  getHFHeader(data, uuid, url) {
    return {
      Token: 'null',
      'Content-Type': 'application/json; charset=utf-8',
      signature: null,
      Check_value: this.getCheckValue(data),
      Hide_head: 0,
      uuid: uuid,
      mer_cust_id: uuid.slice(9, 25),
      referer: url,
      platformn: null,
      Origin: 'https://hfpay.cloudpnr.com',
    };
  }

  /**
   * 验证支付密码
   * @private
   * @param {string} pwd - 加密后的密码
   * @param {string} uuid - UUID
   * @param {string} url - 原始URL
   */
  async transpasswordcheck(pwd, uuid, url) {
    try {
      const data = { password: pwd };
      const response = await axios.post(
        'https://hfpay.cloudpnr.com/api/hfpwalleth5/transpasswordcheck',
        data,
        {
          headers: this.getHFHeader(data, uuid, url),
          timeout: 10000,
        }
      );

      Logger.debug(`[KyArt] 密码验证响应:`, response.data);

      if (response.data.resp_code === 'C00000') {
        await this.transverifyquery(uuid, url);
      } else {
        throw new Error(`密码验证失败: ${response.data.resp_desc}`);
      }
    } catch (error) {
      Logger.error(`[KyArt] 密码验证失败`, error);
      throw error;
    }
  }

  /**
   * 交易验证查询
   * @private
   */
  async transverifyquery(uuid, url) {
    try {
      const data = {
        trans_type: '30',
        dev_info_json: '{"devType":"2","devSysType":"H5","mobileFlag":"Y"}',
      };

      const response = await axios.post(
        'https://hfpay.cloudpnr.com/api/hfpwalleth5/transverifyquery',
        data,
        {
          headers: this.getHFHeader(data, uuid, url),
          timeout: 10000,
        }
      );

      Logger.debug(`[KyArt] 交易验证响应:`, response.data);

      if (response.data.resp_code === 'C00000') {
        await this.balancepay(uuid, url);
      } else {
        throw new Error(`交易验证失败: ${response.data.resp_desc}`);
      }
    } catch (error) {
      Logger.error(`[KyArt] 交易验证失败`, error);
      throw error;
    }
  }

  /**
   * 余额支付
   * @private
   */
  async balancepay(uuid, url) {
    try {
      const data = {
        dev_info_json: '{"devType":"2","devSysType":"H5","mobileFlag":"Y"}',
      };

      const response = await axios.post(
        'https://hfpay.cloudpnr.com/api/hfpwalleth5/balancepay',
        data,
        {
          headers: this.getHFHeader(data, uuid, url),
          timeout: 10000,
        }
      );

      Logger.debug(`[KyArt] 余额支付响应:`, response.data);

      if (response.data.resp_code === 'C00000') {
        await this.paystatquery(uuid, url);
      } else {
        throw new Error(`余额支付失败: ${response.data.resp_desc}`);
      }
    } catch (error) {
      Logger.error(`[KyArt] 余额支付失败`, error);
      throw error;
    }
  }

  /**
   * 支付状态查询
   * @private
   */
  async paystatquery(uuid, url) {
    try {
      const data = {};
      const response = await axios.post(
        'https://hfpay.cloudpnr.com/api/hfpwalleth5/paystatquery',
        data,
        {
          headers: this.getHFHeader(data, uuid, url),
          timeout: 10000,
        }
      );

      Logger.debug(`[KyArt] 支付状态查询响应:`, response.data);

      const message = response.data?.resp_desc || '未知状态';

      if (response.data.resp_code === 'C00000') {
        Logger.info(`[KyArt] 支付成功: ${message}`);
        return true;
      } else {
        throw new Error(`支付失败: ${message}`);
      }
    } catch (error) {
      Logger.error(`[KyArt] 支付状态查询失败`, error);
      throw error;
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
      successRate:
        this.requestCount > 0
          ? ((this.successCount / this.requestCount) * 100).toFixed(2)
          : 0,
    };
  }
}

module.exports = KyArtAdapter;
