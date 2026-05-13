/**
 * HC / Huancang platform adapter.
 *
 * This is a framework-native version of the API flow in ../../../../hc-node.
 * Methods are single-shot and return standardized framework values; retry loops
 * are left to SmartBuy strategies and processors.
 */

const axios = require('axios');
const https = require('https');
const cryptJs = require('crypto-js');
const fs = require('fs');
const path = require('path');
const PlatformAdapter = require('../../interfaces/PlatformAdapter');
const { ErrorFactory, ErrorTypes } = require('../../utils/ErrorTypes');
const Logger = require('../../utils/Logger');

class HcAdapter extends PlatformAdapter {
  constructor(authValue, config = {}) {
    super(authValue, config);

    this.platformName = 'hc';
    this.platformVersion = '0.1.0';

    this.apiBaseURL = config.apiBaseURL || 'https://api.newbee.net.cn';
    this.payBaseURL = config.payBaseURL || 'https://pay.huancang.art';
    this.h5URL = config.h5URL || 'https://h5.newbee.net.cn';
    this.payReturnURL = config.payReturnURL || 'https://h5.huancang.art/#/';
    this.signatureKey =
      config.signatureKey || '6rnrdpjjv6wz2sspxqeibesov1itxddc';

    this.account = config.account || null;
    this.payPassword = config.payPassword || null;
    this.password = authValue || null;
    this.token = this.isLikelyToken(authValue) ? authValue : null;
    this.isLoggedIn = Boolean(this.token);
    this.userInfo = null;
    this.lastOrderContext = null;
    this.productConfigPath =
      config.productConfigPath ||
      path.resolve(__dirname, '../../config/products/hc.js');

    this.http = axios.create({
      timeout: config.timeout || 10000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      validateStatus: () => true,
    });
  }

  getPlatformName() {
    return this.platformName;
  }

  isLikelyToken(value) {
    return typeof value === 'string' && value.length > 20 && !/^\d{6,}$/.test(value);
  }

  getBaseHeaders(extraHeaders = {}) {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
      Token: this.token || 'null',
      'Content-Type': 'application/json; charset=utf-8',
      signature: '2bd17b71495819c32b37b39388bcb2ac',
      referer: `${this.h5URL}/`,
      platformn: 'h5',
      Origin: this.h5URL,
      ...extraHeaders,
    };

    if (this.token) {
      headers.Token = this.token;
    }

    return headers;
  }

  getSignPath(url) {
    return url
      .replace(`${this.h5URL}/`, '')
      .replace(`${this.apiBaseURL}/`, '')
      .replace('https://pay.newbee.net.cn/', '');
  }

  getXToken(url, payload = {}) {
    const params = Object.keys(payload || {})
      .map((key) => `${key}=${payload[key]}`)
      .join('&');
    const signSource =
      `${this.getSignPath(url)}?${params}&key=${this.signatureKey}`.toLocaleLowerCase();
    return cryptJs.MD5(signSource).toString();
  }

  async request(method, url, data = {}, options = {}) {
    const normalizedMethod = method.toLowerCase();
    const payload = data || {};
    const headers = {
      ...this.getBaseHeaders(options.headers),
      'x-token': this.getXToken(url, payload),
    };

    const requestConfig = {
      method: normalizedMethod,
      url,
      headers,
      timeout: options.timeout || undefined,
    };

    if (normalizedMethod === 'get') {
      requestConfig.params = payload;
    } else {
      requestConfig.data = payload;
    }

    try {
      const response = await this.http.request(requestConfig);

      if (response.status === 504) {
        return { code: -1, data: { code: -1 }, msg: 'Gateway Timeout' };
      }

      if (response.status === 401 || response.data?.code === 401) {
        throw ErrorFactory.createBusinessError(
          response.data?.msg || 'Token 已失效',
          ErrorTypes.UNAUTHORIZED,
          response.data
        );
      }

      if (response.status >= 400) {
        throw ErrorFactory.createApiError(
          response.data?.msg || response.data?.message || `HTTP ${response.status}`,
          response.status,
          response.data
        );
      }

      return response.data;
    } catch (error) {
      Logger.error(`[HC] 请求失败: ${normalizedMethod.toUpperCase()} ${url}`, error);
      if (error.type) {
        throw error;
      }
      throw ErrorFactory.createApiError(`请求失败: ${error.message}`);
    }
  }

  ensureSuccess(data, defaultMessage, errorType = ErrorTypes.REQUEST_FAILED) {
    if (data && data.code === 1) {
      return data;
    }

    if (data?.code === 401) {
      throw ErrorFactory.createBusinessError(
        data.msg || 'Token 已失效',
        ErrorTypes.UNAUTHORIZED,
        data
      );
    }

    throw ErrorFactory.createBusinessError(
      data?.msg || data?.message || defaultMessage,
      errorType,
      data
    );
  }

  async login(credentials) {
    try {
      Logger.info(`[HC] 开始登录，账号: ${credentials.account}`);
      const codeData = await this.getCaptchaResult();

      const data = await this.request('post', `${this.apiBaseURL}/api/user/login`, {
        ...codeData,
        mobile: credentials.account,
        password: credentials.password,
        timestamp: Date.now(),
      });

      this.ensureSuccess(data, '登录失败', ErrorTypes.LOGIN_FAILED);

      const userInfo = data.data?.userinfo || {};
      if (!userInfo.token) {
        throw ErrorFactory.createAuthError('登录成功但未返回 token');
      }

      this.credentials = credentials;
      this.account = credentials.account;
      this.password = credentials.password;
      this.token = userInfo.token;
      this.isLoggedIn = true;
      this.userInfo = userInfo;

      return {
        success: true,
        token: this.token,
        refreshToken: null,
        expiresIn: userInfo.expires_in || null,
        userInfo: {
          account: credentials.account,
          platform: this.platformName,
          id: userInfo.id,
          username: userInfo.username,
          nickname: userInfo.nickname,
          mobile: userInfo.mobile || credentials.account,
        },
      };
    } catch (error) {
      this.token = null;
      this.isLoggedIn = false;
      Logger.error('[HC] 登录失败', error);
      if (error.type) {
        throw error;
      }
      throw ErrorFactory.createAuthError(`登录失败: ${error.message}`);
    }
  }

  async getCaptchaResult() {
    const captchaData = await this.request('get', `${this.apiBaseURL}/api/sms/getCode`, {
      timestamp: Date.now(),
    });
    this.ensureSuccess(captchaData, '获取验证码失败', ErrorTypes.LOGIN_FAILED);

    const imageBase64 = captchaData.data?.base64;
    const captchaId = captchaData.data?.id;
    if (!imageBase64 || !captchaId) {
      throw ErrorFactory.createAuthError('验证码接口返回不完整');
    }

    const username =
      this.options.ttshituUsername || process.env.TTSHITU_USERNAME || 'zrrrrr';
    const password =
      this.options.ttshituPassword || process.env.TTSHITU_PASSWORD || 'qwer1234';

    if (!username || !password) {
      throw ErrorFactory.createAuthError(
        '缺少验证码识别配置，请设置 TTSHITU_USERNAME 和 TTSHITU_PASSWORD，或改用 token 模式'
      );
    }

    const base64Prefix = 'data:image/png;base64,';
    const response = await axios.post(
      this.options.ttshituURL || 'http://api.ttshitu.com/predict',
      {
        username,
        password,
        image: imageBase64.replace(base64Prefix, ''),
        typeid: this.options.ttshituTypeId || 3,
      },
      { timeout: this.options.captchaTimeout || 15000 }
    );

    if (!response.data?.success || !response.data?.data?.result) {
      throw ErrorFactory.createAuthError(
        response.data?.message || response.data?.msg || '验证码识别失败'
      );
    }

    return {
      captcha: response.data.data.result,
      id: captchaId,
    };
  }

  async refreshToken() {
    if (!this.credentials) {
      throw ErrorFactory.createAuthError('缺少登录凭据，无法刷新 token');
    }

    return this.login(this.credentials);
  }

  async validateToken(token) {
    const previousToken = this.token;
    try {
      this.token = token;
      await this.request('get', `${this.apiBaseURL}/api/user_collect`, {
        product_id: 0,
        timestamp: Date.now(),
        page: 1,
        per_page: 1,
        product_type: 'virtual',
        type: 'own_valid',
      });

      this.isLoggedIn = true;
      return true;
    } catch (error) {
      Logger.warn(`[HC] Token 校验失败: ${error.message}`);
      this.token = previousToken;
      this.isLoggedIn = Boolean(previousToken);
      return false;
    }
  }

  async logout() {
    this.token = null;
    this.isLoggedIn = false;
    this.userInfo = null;
    return true;
  }

  async getProductList(productId, options = {}) {
    const resolvedProductId = await this.resolveProductId(
      productId,
      options.productConfig
    );
    const data = await this.request('get', `${this.apiBaseURL}/api/v2/market/productList`, {
      order: 'price',
      page: options.page || 1,
      per_page: options.pageSize || 20,
      product_id: resolvedProductId,
      sort: String(options.order || 'asc').toUpperCase(),
      timestamp: Date.now(),
    });

    this.ensureSuccess(data, '获取商品列表失败');
    const list = data.data?.data || [];

    return list
      .map((item) => this.normalizeProduct(item, resolvedProductId))
      .filter(Boolean);
  }

  normalizeProduct(item, productId) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const id = item.id || item.mid || item.market_id;
    if (!id) {
      return null;
    }

    const price = Number(item.amount ?? item.price ?? item.money ?? 0);
    return {
      id: String(id),
      productId: String(item.product_id || productId),
      price,
      available: String(item.status) === '1',
      name: item.product?.name || item.name || item.title || `商品${productId}`,
      title: item.product?.name || item.name || item.title || `商品${productId}`,
      seller: item.user_id || item.seller_id || null,
      raw: item,
    };
  }

  async placeOrder(product) {
    const marketId = product?.id || product?.raw?.id;
    const productId = product?.productId || product?.raw?.product_id;

    if (!marketId || !productId) {
      throw ErrorFactory.createBusinessError(
        '缺少挂单ID或商品ID，无法下单',
        ErrorTypes.ORDER_FAILED,
        product
      );
    }

    const data = await this.request('post', `${this.apiBaseURL}/api/market/buy`, {
      mid: marketId,
      product_id: productId,
      timestamp: Date.now(),
    });

    this.ensureSuccess(data, '普通下单失败', ErrorTypes.ORDER_FAILED);
    return this.buildOrderToken({
      orderId: data.data?.order_id,
      submitType: 'normal',
      productId,
    });
  }

  async quickOrder(productId, options = {}) {
    const resolvedProductId = await this.resolveProductId(
      productId,
      options.productConfig
    );
    const data = await this.request('post', `${this.apiBaseURL}/api/market/fastBuy`, {
      product_id: resolvedProductId,
      timestamp: Date.now(),
    });

    this.ensureSuccess(data, '快捷下单失败', ErrorTypes.ORDER_FAILED);
    return this.buildOrderToken({
      orderId: data.data?.order_id,
      submitType: 'normal',
      productId: resolvedProductId,
      maxPrice: options.maxPrice,
      quantity: options.quantity || 1,
    });
  }

  async batchOrder(productId, options = {}) {
    const resolvedProductId = await this.resolveProductId(
      productId,
      options.productConfig
    );
    const quantity = Number(options.quantity || options.batchSize || 1);
    const maxMoney = Number(options.maxPrice || options.max_money || 0);

    if (!maxMoney || maxMoney <= 0) {
      throw ErrorFactory.createBusinessError(
        '批量下单缺少最高价格',
        ErrorTypes.ORDER_FAILED
      );
    }

    const data = await this.request('post', `${this.apiBaseURL}/api/market/batchBuy`, {
      buy_num: quantity,
      max_money: maxMoney,
      pay_type: 140,
      product_id: resolvedProductId,
      timestamp: Date.now(),
    });

    this.ensureSuccess(data, '批量下单失败', ErrorTypes.ORDER_FAILED);
    return this.buildOrderToken({
      orderId: data.data?.order_id,
      submitType: 'batch',
      productId: resolvedProductId,
      maxPrice: maxMoney,
      quantity,
    });
  }

  async resolveProductId(productIdentifier, productConfig = null) {
    const identifier = String(
      productConfig?.id || productIdentifier || ''
    ).trim();

    if (!identifier) {
      throw ErrorFactory.createValidationError('缺少 HC 藏品名称或商品ID');
    }

    if (/^\d+$/.test(identifier)) {
      return identifier;
    }

    const configuredProduct = this.findConfiguredProduct(identifier);
    if (configuredProduct?.id) {
      Logger.info(`[HC] 商品配置命中: ${identifier} -> ${configuredProduct.id}`);
      return String(configuredProduct.id);
    }

    Logger.info(`[HC] 商品配置未命中，开始同步藏品列表: ${identifier}`);
    const syncedProducts = await this.syncProductCatalog(identifier);
    const syncedProduct =
      syncedProducts[identifier] || this.findProductInMap(syncedProducts, identifier);

    if (syncedProduct?.id) {
      Logger.info(`[HC] 商品列表同步命中: ${identifier} -> ${syncedProduct.id}`);
      return String(syncedProduct.id);
    }

    throw ErrorFactory.createValidationError(
      `未找到 HC 藏品: ${identifier}，请检查名称或临时使用商品ID`
    );
  }

  findConfiguredProduct(name) {
    return this.findProductInMap(this.loadProductConfig(), name);
  }

  findProductInMap(productMap, name) {
    const normalizedName = this.normalizeProductName(name);
    for (const [productName, config] of Object.entries(productMap || {})) {
      if (this.normalizeProductName(productName) === normalizedName) {
        return {
          name: productName,
          ...config,
        };
      }
    }
    return null;
  }

  normalizeProductName(name) {
    return String(name || '').replace(/\s+/g, '').toLowerCase();
  }

  loadProductConfig() {
    try {
      delete require.cache[require.resolve(this.productConfigPath)];
      return require(this.productConfigPath);
    } catch (error) {
      return {};
    }
  }

  async syncProductCatalog(keyword = '') {
    const existingConfig = this.loadProductConfig();
    const discoveredConfig = {};
    const seenIds = new Set();
    const maxPages = Number(this.options.catalogMaxPages || 20);

    for (let page = 1; page <= maxPages; page++) {
      const data = await this.fetchCatalogPage(page, keyword);
      const rows = this.extractRows(data?.data);

      rows.forEach((item) => {
        const product = this.normalizeCatalogProduct(item);
        if (!product || seenIds.has(product.id)) {
          return;
        }
        seenIds.add(product.id);
        discoveredConfig[product.name] = {
          id: product.id,
          price: product.price,
        };
      });

      const hasMore = Boolean(data?.data?.has_more);
      if (!hasMore || rows.length === 0) {
        break;
      }
    }

    const mergedConfig = {
      ...existingConfig,
      ...discoveredConfig,
    };

    if (Object.keys(discoveredConfig).length > 0) {
      this.writeProductConfig(mergedConfig);
      Logger.info(
        `[HC] 已同步 ${Object.keys(discoveredConfig).length} 个藏品到 ${this.productConfigPath}`
      );
    }

    return mergedConfig;
  }

  async fetchCatalogPage(page, keyword = '') {
    const payload = {
      hasmarket: -1,
      hot: 0,
      collection_id: '',
      album_id: '',
      product_id: '',
      market_type: 0,
      keywords: keyword,
      product_type: 'virtual',
      page,
      time_type: '',
      per_page: Number(this.options.catalogPageSize || 50),
      order: 'weigh',
      sort: 'DESC',
      timestamp: Date.now(),
    };

    return this.request('get', `${this.apiBaseURL}/api/v2/market/search`, payload);
  }

  extractRows(data) {
    if (Array.isArray(data)) {
      return data;
    }

    if (!data || typeof data !== 'object') {
      return [];
    }

    return data.data || data.list || data.rows || data.items || data.records || [];
  }

  normalizeCatalogProduct(item) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const id =
      item.product_id ||
      item.productId ||
      item.product?.id ||
      item.collection_id ||
      item.id;
    const name =
      item.subject ||
      item.product_name ||
      item.productName ||
      item.name ||
      item.title ||
      item.product?.subject ||
      item.product?.name;

    if (!id || !name) {
      return null;
    }

    return {
      id: String(id),
      name: String(name),
      price: Number(
        item.market_amount ||
          item.amount ||
          item.price ||
          item.min_price ||
          item.product?.amount ||
          0
      ),
    };
  }

  writeProductConfig(config) {
    const sortedEntries = Object.entries(config || {}).sort(([left], [right]) =>
      left.localeCompare(right, 'zh-CN')
    );
    const lines = [
      '/**',
      ' * HC / Huancang product aliases.',
      ' *',
      ' * This file may be updated automatically by HcAdapter.syncProductCatalog().',
      ' */',
      '',
      'module.exports = {',
    ];

    sortedEntries.forEach(([name, product]) => {
      lines.push(`  ${JSON.stringify(name)}: {`);
      lines.push(`    id: ${JSON.stringify(String(product.id))},`);
      if (product.price !== undefined) {
        lines.push(`    price: ${JSON.stringify(Number(product.price) || 0)},`);
      }
      lines.push('  },');
    });

    lines.push('};');
    lines.push('');

    fs.writeFileSync(this.productConfigPath, lines.join('\n'), 'utf8');
  }

  buildOrderToken(orderContext) {
    if (!orderContext.orderId) {
      throw ErrorFactory.createBusinessError(
        '下单成功但未返回订单ID',
        ErrorTypes.ORDER_FAILED,
        orderContext
      );
    }

    const token = JSON.stringify(orderContext);
    this.lastOrderContext = orderContext;
    return token;
  }

  parseJsonToken(value) {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return { orderId: value, submitType: 'normal' };
    }
  }

  async getPaymentUrl(orderInfo) {
    const orderContext = {
      ...this.lastOrderContext,
      ...this.parseJsonToken(orderInfo),
    };

    if (!orderContext.orderId) {
      throw ErrorFactory.createBusinessError(
        '缺少订单ID，无法获取支付链接',
        ErrorTypes.PAYMENT_FAILED,
        orderContext
      );
    }

    if (orderContext.maxPrice) {
      await this.assertOrderWithinMaxPrice(orderContext);
    }

    const isBatch = orderContext.submitType === 'batch';
    const endpoint = isBatch ? '/pay/order/batchsubmit' : '/pay/order/submit';
    const data = await this.request('post', `${this.payBaseURL}${endpoint}`, {
      id: orderContext.orderId,
      pay_type: 140,
      return_url: this.payReturnURL,
      timestamp: Date.now(),
    });

    this.ensureSuccess(data, '获取支付链接失败', ErrorTypes.PAYMENT_FAILED);
    if (!data.data) {
      throw ErrorFactory.createBusinessError(
        '支付接口未返回支付链接',
        ErrorTypes.PAYMENT_FAILED,
        data
      );
    }

    return JSON.stringify({
      orderId: String(orderContext.orderId),
      submitType: orderContext.submitType || 'normal',
      paymentUrl: data.data,
      maxPrice: orderContext.maxPrice,
    });
  }

  async executePayment(paymentUrl, password) {
    const paymentInfo = this.parseJsonToken(paymentUrl);
    const url = paymentInfo.paymentUrl || paymentUrl;
    const payPassword = password || this.payPassword || this.options.payPassword;

    if (!url) {
      throw ErrorFactory.createBusinessError(
        '缺少支付链接',
        ErrorTypes.PAYMENT_FAILED,
        paymentInfo
      );
    }

    if (!payPassword) {
      throw ErrorFactory.createBusinessError(
        '缺少支付密码',
        ErrorTypes.PAYMENT_FAILED
      );
    }

    const uuid = this.extractUuidFromPaymentUrl(url);
    if (!uuid) {
      throw ErrorFactory.createBusinessError(
        '无法从支付链接中提取 UUID',
        ErrorTypes.PAYMENT_FAILED,
        url
      );
    }

    const encryptedPwd = this.getPwd(payPassword, uuid);

    await this.executeHFRequest(
      'transpasswordcheck',
      { password: encryptedPwd },
      uuid,
      url
    );
    await this.executeHFRequest(
      'transverifyquery',
      {
        trans_type: '30',
        dev_info_json: '{"devType":"2","devSysType":"H5","mobileFlag":"Y"}',
      },
      uuid,
      url
    );
    await this.executeHFRequest(
      'balancepay',
      {
        dev_info_json: '{"devType":"2","devSysType":"H5","mobileFlag":"Y"}',
      },
      uuid,
      url
    );
    await this.executeHFRequest('paystatquery', {}, uuid, url);

    return {
      success: true,
      orderId: paymentInfo.orderId,
      transactionId: uuid,
      paymentUrl: url,
      message: '支付成功',
    };
  }

  getPwd(pwd, uuid) {
    const key = cryptJs.enc.Utf8.parse(uuid);
    const encrypted = cryptJs.TripleDES.encrypt(pwd, key, {
      mode: cryptJs.mode.CBC,
      padding: cryptJs.pad.Pkcs7,
      iv: cryptJs.enc.Utf8.parse('chinapnr'),
    });
    return cryptJs.enc.Base64.stringify(encrypted.ciphertext);
  }

  getCheckValue(data) {
    const ignoredKeys = ['front_id_pic', 'back_id_pic', 'bank_card_pic', 'pic_list'];

    const normalize = (value) => {
      if (Array.isArray(value)) {
        return JSON.stringify(value);
      }
      if (value && typeof value === 'object') {
        const normalized = {};
        Object.keys(value)
          .sort((left, right) => left.localeCompare(right))
          .forEach((key) => {
            normalized[key] = normalize(value[key]);
          });
        return normalized;
      }
      return value;
    };

    const normalized = normalize(data || {});
    const signingString = Object.keys(normalized)
      .filter((key) => !ignoredKeys.includes(key))
      .sort((left, right) => left.localeCompare(right))
      .map((key) => {
        const value = normalized[key];
        return `${key}=${
          value && typeof value === 'object' ? JSON.stringify(value) : value
        }`;
      })
      .join('&');

    return cryptJs.HmacSHA256(signingString, 'chinapnr').toString();
  }

  getHFHeader(data, uuid, refererUrl) {
    return {
      Token: 'null',
      'Content-Type': 'application/json; charset=utf-8',
      signature: null,
      Check_value: this.getCheckValue(data),
      Hide_head: 0,
      uuid,
      mer_cust_id: uuid.slice(9, 25),
      referer: refererUrl,
      platformn: null,
      Origin: 'https://hfpay.cloudpnr.com',
    };
  }

  extractUuidFromPaymentUrl(paymentUrl) {
    try {
      const url = new URL(paymentUrl);
      return url.searchParams.get('uuid') || url.searchParams.get('reqseqid');
    } catch (error) {
      return paymentUrl.split('?')[1]?.split('&')[0]?.split('=')[1] || null;
    }
  }

  async executeHFRequest(endpoint, data, uuid, refererUrl) {
    const response = await axios.post(
      `https://hfpay.cloudpnr.com/api/hfpwalleth5/${endpoint}`,
      data,
      {
        headers: this.getHFHeader(data, uuid, refererUrl),
        timeout: 10000,
        validateStatus: () => true,
      }
    );

    if (!response.data || response.data.resp_code !== 'C00000') {
      throw ErrorFactory.createBusinessError(
        response.data?.resp_desc || `${endpoint} failed`,
        ErrorTypes.PAYMENT_FAILED,
        response.data
      );
    }

    return response.data;
  }

  async getOrderStatus(orderInfo) {
    const orderContext = this.parseJsonToken(orderInfo);
    if (!orderContext.orderId) {
      return 'unknown';
    }

    const detail = await this.getOrderDetail(orderContext);
    const status = String(detail?.status || '').toLowerCase();
    if (status.includes('fail') || status.includes('cancel') || status.includes('timeout')) {
      return status;
    }

    // At this point the framework is only verifying that the order exists before
    // payment. Treat an existing unpaid order as ready for the payment processor.
    return status === 'paid' ? 'paid' : 'success';
  }

  async getOrderDetail(orderContext) {
    const endpoint =
      orderContext.submitType === 'batch'
        ? '/pay/order/batchdetail'
        : '/pay/order/detail';

    const data = await this.request('get', `${this.payBaseURL}${endpoint}`, {
      id: orderContext.orderId,
      timestamp: Date.now(),
    });

    if (data.code !== 1) {
      return null;
    }

    return data.data || {};
  }

  async assertOrderWithinMaxPrice(orderContext) {
    const detail = await this.getOrderDetail(orderContext);
    const amount = this.extractOrderAmount(detail);

    if (amount === null) {
      throw ErrorFactory.createBusinessError(
        '订单详情中未找到支付金额，为避免超价支付已停止',
        ErrorTypes.PAYMENT_FAILED,
        detail
      );
    }

    if (amount > Number(orderContext.maxPrice)) {
      throw ErrorFactory.createBusinessError(
        `订单金额 ${amount} 超过最高价 ${orderContext.maxPrice}，已停止支付`,
        ErrorTypes.PRODUCT_UNAVAILABLE,
        detail
      );
    }

    Logger.info(`[HC] 订单金额校验通过: ${amount} <= ${orderContext.maxPrice}`);
  }

  extractOrderAmount(detail) {
    if (!detail || typeof detail !== 'object') {
      return null;
    }

    const candidates = [
      detail.amount,
      detail.money,
      detail.price,
      detail.total_amount,
      detail.totalAmount,
      detail.pay_amount,
      detail.payAmount,
      detail.order_amount,
      detail.orderAmount,
      detail.real_amount,
      detail.realAmount,
      detail.pay_money,
      detail.payMoney,
      detail.total_price,
      detail.totalPrice,
      detail.order?.amount,
      detail.order?.money,
      detail.order?.pay_amount,
      detail.order?.total_amount,
    ];

    for (const value of candidates) {
      const amount = Number(value);
      if (Number.isFinite(amount) && amount > 0) {
        return amount;
      }
    }

    return null;
  }

  async confirmCombination(combinationId) {
    const { id, itemIds } = this.parseCombinationId(combinationId);
    const data = await this.request(
      'post',
      `${this.apiBaseURL}/api/product_merge_material/newmerge`,
      {
        id,
        item_ids: itemIds,
        timestamp: Date.now(),
      }
    );

    this.ensureSuccess(data, '合成失败', ErrorTypes.REQUEST_FAILED);
    return true;
  }

  parseCombinationId(combinationId) {
    const [id, itemIds] = String(combinationId || '').split(':');
    if (!id || !itemIds) {
      throw ErrorFactory.createValidationError(
        'HC 合成参数格式应为 合成ID:素材ID1,素材ID2'
      );
    }

    return { id, itemIds };
  }

  async cancelResale(resaleId) {
    const data = await this.request(
      'post',
      `${this.apiBaseURL}/api/user_collect/batchCancelSale`,
      {
        product_id: resaleId,
        timestamp: Date.now(),
      }
    );

    this.ensureSuccess(data, '取消寄售失败', ErrorTypes.REQUEST_FAILED);
    return true;
  }
}

module.exports = HcAdapter;
