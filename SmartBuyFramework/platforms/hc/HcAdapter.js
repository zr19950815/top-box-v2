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
    this.supportedPayType = 8;

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
    this.useBrowserTransport = config.useBrowserTransport !== false;
    this.browserTransport = null;
    this.intervalJitterRatio = Number(config.intervalJitterRatio ?? 1 / 3);
    this.intervalJitterRatios = config.intervalJitterRatios || {
      list: 1 / 9,
      quick: 1 / 9,
    };
    this.edgeOneCooldownSchedule = (
      config.edgeOneCooldownSchedule || [30 * 1000, 60 * 1000, 120 * 1000]
    ).map(Number).filter((value) => Number.isFinite(value) && value >= 0);
    this.edgeOneBlockCount = 0;
    this.edgeOneBlockedUntil = 0;
    this.sleep = config.sleep || ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.listPageIntervalMs = Number(config.listPageIntervalMs || 450);
    this.productConfigPath =
      config.productConfigPath ||
      path.resolve(__dirname, '../../config/products/hc.js');
    this.combinationConfigPath =
      config.combinationConfigPath ||
      path.resolve(__dirname, '../../config/combinations/hc.js');

    this.http = axios.create({
      timeout: config.timeout || 10000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      validateStatus: () => true,
    });
  }

  async getBrowserTransport() {
    if (this.browserTransport) {
      return this.browserTransport;
    }

    const { Impit } = await import('impit');
    const proxyUrl =
      this.options.proxyUrl ||
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.ALL_PROXY;

    this.browserTransport = new Impit({
      browser: this.options.browserProfile || 'chrome',
      ignoreTlsErrors: true,
      ...(proxyUrl ? { proxyUrl } : {}),
    });
    return this.browserTransport;
  }

  normalizeRequestHeaders(headers = {}) {
    return Object.fromEntries(
      Object.entries(headers)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([name, value]) => [name, String(value)])
    );
  }

  async sendHttpRequest(method, url, payload, headers, timeout) {
    const normalizedHeaders = this.normalizeRequestHeaders(headers);

    if (!this.useBrowserTransport) {
      const requestConfig = {
        method,
        url,
        headers: normalizedHeaders,
        timeout,
        validateStatus: () => true,
      };
      if (method === 'get') {
        requestConfig.params = payload;
      } else {
        requestConfig.data = payload;
      }
      return this.http.request(requestConfig);
    }

    const transport = await this.getBrowserTransport();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout || 10000);

    try {
      const requestURL = new URL(url);
      const options = {
        method: method.toUpperCase(),
        headers: normalizedHeaders,
        signal: controller.signal,
      };

      if (method === 'get') {
        Object.entries(payload || {}).forEach(([key, value]) => {
          requestURL.searchParams.append(key, String(value));
        });
      } else {
        options.body = JSON.stringify(payload || {});
      }

      const response = await transport.fetch(requestURL.toString(), options);
      const responseText = await response.text();
      let responseData = responseText;
      try {
        responseData = responseText ? JSON.parse(responseText) : null;
      } catch (error) {
        // Keep non-JSON responses for the standard HTTP error handling below.
      }

      return { status: response.status, data: responseData };
    } finally {
      clearTimeout(timeoutId);
    }
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
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Token: this.token || 'null',
      'Content-Type': 'application/json; charset=utf-8',
      signature: '2bd17b71495819c32b37b39388bcb2ac',
      referer: `${this.h5URL}/`,
      platformn: 'h5',
      Origin: this.h5URL,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
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
    // NewBee's H5 client canonicalizes request fields before signing them.
    // Keeping insertion order happens to work for the default market payload,
    // but fails as soon as a field such as `keywords` is appended later.
    const params = Object.keys(payload || {})
      .filter((key) => payload[key] !== undefined && payload[key] !== null)
      .sort()
      .map((key) => `${key}=${payload[key]}`)
      .join('&');
    const signSource =
      `${this.getSignPath(url)}?${params}&key=${this.signatureKey}`.toLocaleLowerCase();
    return cryptJs.MD5(signSource).toString();
  }

  isEdgeOneBlock(response) {
    if (response?.status !== 405 || typeof response.data !== 'string') {
      return false;
    }

    return /EdgeOne|请求已被站点的安全策略拦截|Access Restricted/i.test(
      response.data
    );
  }

  shouldCircuitBreakEdgeOne(url) {
    const pathname = this.getSignPath(url);
    return pathname.replace(/^\//, '') !== 'api/market/buy';
  }

  registerEdgeOneBlock() {
    const schedule = this.edgeOneCooldownSchedule.length > 0
      ? this.edgeOneCooldownSchedule
      : [5 * 60 * 1000];
    const cooldownMs = schedule[Math.min(this.edgeOneBlockCount, schedule.length - 1)];
    this.edgeOneBlockCount += 1;
    this.edgeOneBlockedUntil = Date.now() + cooldownMs;

    Logger.warn(
      `[HC] EdgeOne 安全拦截，暂停请求 ${Math.ceil(cooldownMs / 60000)} 分钟`
    );

    return cooldownMs;
  }

  async waitForEdgeOneCooldown() {
    const remainingMs = this.edgeOneBlockedUntil - Date.now();
    if (remainingMs <= 0) {
      return;
    }

    Logger.warn(
      `[HC] EdgeOne 熔断中，${Math.ceil(remainingMs / 1000)} 秒后恢复请求`
    );
    await this.sleep(remainingMs);
  }

  resetEdgeOneCircuit() {
    this.edgeOneBlockCount = 0;
    this.edgeOneBlockedUntil = 0;
  }

  async request(method, url, data = {}, options = {}) {
    const normalizedMethod = method.toLowerCase();
    const payload = data || {};
    const headers = {
      ...this.getBaseHeaders(options.headers),
      'x-token': this.getXToken(url, payload),
    };

    try {
      await this.waitForEdgeOneCooldown();

      const response = await this.sendHttpRequest(
        normalizedMethod,
        url,
        payload,
        headers,
        options.timeout || this.options.timeout || 10000
      );

      if (this.isEdgeOneBlock(response)) {
        if (!this.shouldCircuitBreakEdgeOne(url)) {
          throw ErrorFactory.createApiError(
            'EdgeOne 安全拦截，本次下单失败',
            405,
            { edgeOneBlocked: true, cooldownMs: 0 }
          );
        }
        const cooldownMs = this.registerEdgeOneBlock();
        throw ErrorFactory.createApiError(
          `EdgeOne 安全拦截，已暂停请求 ${Math.ceil(cooldownMs / 60000)} 分钟`,
          405,
          { edgeOneBlocked: true, cooldownMs }
        );
      }

      if (response.status < 400 && this.edgeOneBlockCount > 0) {
        this.resetEdgeOneCircuit();
      }

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
    const username =
      this.options.ttshituUsername || process.env.TTSHITU_USERNAME || 'zrrrrr';
    const password =
      this.options.ttshituPassword || process.env.TTSHITU_PASSWORD || 'qwer1234';

    if (!username || !password) {
      throw ErrorFactory.createAuthError(
        '缺少验证码识别配置，请设置 TTSHITU_USERNAME 和 TTSHITU_PASSWORD，或改用 token 模式'
      );
    }

    const maxAttempts = Number(this.options.captchaMaxAttempts || 5);
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Fetch a fresh captcha for every attempt. Reusing an old captcha ID can
        // make a later recognition result invalid even when its text is correct.
        const captchaData = await this.request(
          'get',
          `${this.apiBaseURL}/api/sms/getCode`,
          { timestamp: Date.now() }
        );
        this.ensureSuccess(captchaData, '获取验证码失败', ErrorTypes.LOGIN_FAILED);

        const imageBase64 = captchaData.data?.base64;
        const captchaId = captchaData.data?.id;
        if (!imageBase64 || !captchaId) {
          throw new Error('验证码接口返回不完整');
        }

        const response = await axios.post(
          this.options.ttshituURL || 'http://api.ttshitu.com/predict',
          {
            username,
            password,
            image: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
            typeid: this.options.ttshituTypeId || 3,
          },
          { timeout: this.options.captchaTimeout || 15000 }
        );
        const result = response.data?.data?.result;
        if (!response.data?.success || !result) {
          throw new Error(
            response.data?.message || response.data?.msg || '验证码识别失败'
          );
        }

        Logger.info(`[HC] 验证码识别成功 (${attempt}/${maxAttempts})`);
        return { captcha: result, id: captchaId };
      } catch (error) {
        lastError = error;
        Logger.warn(
          `[HC] 验证码识别失败 (${attempt}/${maxAttempts}): ${error.message}`
        );
      }
    }

    throw ErrorFactory.createAuthError(
      `验证码识别连续失败 ${maxAttempts} 次: ${lastError?.message || '未知错误'}`
    );
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
    // The current NewBee endpoint rejects values above 20 even though the
    // shared list strategy asks adapters for 50 items by default.
    const pageSize = Math.min(
      20,
      Math.max(1, Number(options.pageSize || 20))
    );
    const page = Number(options.page || 1);

    // 只拉取指定的单页，不再进行多页合并
    const data = await this.request(
      'get',
      `${this.apiBaseURL}/api/v2/market/productList`,
      {
        order: 'price',
        page,
        per_page: pageSize,
        product_id: resolvedProductId,
        sort: String(options.order || 'asc').toUpperCase(),
        timestamp: Date.now(),
      }
    );

    this.ensureSuccess(data, '获取商品列表失败');
    const list = data.data?.data || [];

    const seenIds = new Set();
    return list
      .map((item) => this.normalizeProduct(item, resolvedProductId))
      .filter(Boolean)
      .filter((product) => {
        if (seenIds.has(product.id)) {
          return false;
        }
        seenIds.add(product.id);
        return true;
      });
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
    const payTypes = this.normalizePayTypes(item.pay_types ?? item.payTypes);
    return {
      id: String(id),
      productId: String(item.product_id || productId),
      price,
      available: String(item.status) === '1',
      name: item.product?.name || item.name || item.title || `商品${productId}`,
      title: item.product?.name || item.name || item.title || `商品${productId}`,
      seller: item.user_id || item.seller_id || null,
      payTypes,
      raw: item,
    };
  }

  normalizePayTypes(value) {
    if (value === null || value === undefined || value === '') {
      return [];
    }

    let values = value;
    if (typeof value === 'string') {
      try {
        values = JSON.parse(value);
      } catch (error) {
        values = value.split(',');
      }
    }

    if (!Array.isArray(values)) {
      values = [values];
    }

    return [...new Set(values
      .map((payType) => Number(payType))
      .filter(Number.isFinite))];
  }

  isProductPaymentSupported(product) {
    return Array.isArray(product?.payTypes) &&
      product.payTypes.includes(this.supportedPayType);
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

    // The current HC market separates products by numeric product_type.
    // Query every supported market type because names may exist in either tab.
    for (const productType of this.getCatalogProductTypes()) {
      for (let page = 1; page <= maxPages; page++) {
        const data = await this.fetchCatalogPage(page, keyword, productType);
        this.ensureSuccess(data, '获取 HC 藏品目录失败');
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

  getCatalogProductTypes() {
    const configuredTypes = this.options.catalogProductTypes || [19, 25];
    const values = Array.isArray(configuredTypes)
      ? configuredTypes
      : String(configuredTypes).split(',');

    return [...new Set(values.map(Number).filter(Number.isFinite))];
  }

  async fetchCatalogPage(page, keyword = '', productType = null) {
    const resolvedProductType =
      productType === null ? this.getCatalogProductTypes()[0] : Number(productType);
    const payload = {
      hasmarket: -1,
      hot: 0,
      market_type: 0,
      order: 'weigh',
      page: Number(page),
      per_page: Number(this.options.catalogPageSize || 20),
      product_type: resolvedProductType,
      sort: 'DESC',
      time_type: Number(this.options.catalogTimeType || 1),
      timestamp: Date.now(),
    };

    if (keyword) {
      payload.keywords = keyword;
    }

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
    const response = await this.sendHttpRequest(
      'post',
      `https://hfpay.cloudpnr.com/api/hfpwalleth5/${endpoint}`,
      data,
      this.getHFHeader(data, uuid, refererUrl),
      10000
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

  async confirmCombination(combinationReference) {
    // 保留旧的手工实例 ID 格式，方便已有任务平滑迁移。
    if (String(combinationReference || '').includes(':')) {
      const { id, itemIds } = this.parseCombinationId(combinationReference);
      return this.submitCombination(id, itemIds.split(','));
    }

    const combination = await this.resolveCombinationByName(combinationReference);
    const { itemIds, ysItemIds } = await this.resolveCombinationMaterialInstanceIds(
      combination
    );
    return this.submitCombination(combination.id, itemIds, ysItemIds);
  }

  /**
   * 获取 HC 藏品的最近成交记录。
   * NewBee H5 使用 /api/market/getTradeList，接口要求先登录，但只读取成交数据。
   * @param {string} productId 商品 ID 或配置中的商品名称
   * @param {Object} [options]
   * @param {number} [options.limit=50] 返回条数，上限 50
   */
  async getRecentTrades(productId, options = {}) {
    const resolvedProductId = await this.resolveProductId(
      productId,
      options.productConfig
    );
    const limit = Math.max(1, Math.min(50, Number(options.limit || 50)));
    const data = await this.request(
      'get',
      `${this.apiBaseURL}/api/market/getTradeList`,
      {
        id: resolvedProductId,
        page: 1,
        per_page: limit,
        timestamp: Date.now(),
      }
    );
    this.ensureSuccess(data, '获取最近成交记录失败');

    const rows = Array.isArray(data.data) ? data.data : [];
    return {
      productId: String(resolvedProductId),
      trades: rows.slice(0, limit).map((trade) => ({
        serialNumber: trade.no == null ? null : String(trade.no),
        price: Number(trade.price),
        timestamp: Number(trade.time),
        time: Number.isFinite(Number(trade.time))
          ? new Date(Number(trade.time) * 1000).toISOString()
          : null,
      })).filter((trade) => Number.isFinite(trade.price)),
    };
  }

  async submitCombination(id, itemIds, ysItemIds = []) {
    const data = await this.request(
      'post',
      `${this.apiBaseURL}/api/product_merge_material/newmerge`,
      {
        id,
        item_ids: itemIds.join(','),
        ys_item_ids: ysItemIds.join(','),
        timestamp: Date.now(),
      }
    );

    this.ensureSuccess(data, '合成失败', ErrorTypes.REQUEST_FAILED);
    return true;
  }

  loadCombinationConfig() {
    if (!fs.existsSync(this.combinationConfigPath)) {
      return {};
    }

    try {
      const resolvedPath = require.resolve(this.combinationConfigPath);
      delete require.cache[resolvedPath];
      return require(resolvedPath) || {};
    } catch (error) {
      throw ErrorFactory.createValidationError(
        `读取 HC 合成配置失败: ${error.message}`
      );
    }
  }

  writeCombinationConfig(combinations) {
    fs.mkdirSync(path.dirname(this.combinationConfigPath), { recursive: true });
    const content = [
      '/**',
      ' * HC / Huancang 合成活动目录。由程序自动同步，请勿保存账号、密码或实例 ID。',
      ' */',
      '',
      `module.exports = ${JSON.stringify(combinations, null, 2)};`,
      '',
    ].join('\n');
    fs.writeFileSync(this.combinationConfigPath, content, 'utf8');
  }

  async fetchCombinationCatalog() {
    const pageSize = Math.max(
      1,
      Math.min(50, Number(this.options.combinationCatalogPageSize || 20))
    );
    const all = [];

    // 前端将“限时活动”和“常驻活动”分别以 bf_type=0/1 查询。
    for (const bfType of [0, 1]) {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const data = await this.request('get', `${this.apiBaseURL}/api/product_merge`, {
          page,
          per_page: pageSize,
          subject: '',
          bf_type: bfType,
          merge_type: 2,
          timestamp: Date.now(),
        });
        this.ensureSuccess(data, '获取 HC 合成活动列表失败');
        const payload = data.data || {};
        const rows = Array.isArray(payload.data) ? payload.data : [];
        all.push(...rows);
        hasMore = Boolean(payload.has_more) || (
          Number(payload.current_page || page) < Number(payload.last_page || page)
        );
        page += 1;
      }
    }

    return [...new Map(all.filter((item) => item && item.id != null)
      .map((item) => [String(item.id), item])).values()];
  }

  normalizeCombination(listItem, detail) {
    const productList = Array.isArray(detail?.product_list) ? detail.product_list : [];
    const materials = productList.map((condition, index) => ({
      condition: index + 1,
      quantity: Number(condition.quantity || 1),
      products: (Array.isArray(condition.product) ? condition.product : [])
        .filter((product) => product && product.id != null)
        .map((product) => ({
          productId: String(product.id),
          name: product.subject || product.name || String(product.id),
          type: product.type || '',
      })),
    })).filter((condition) => condition.products.length > 0);

    const statusText = this.getCombinationStatusText(detail?.merge_info?.status);
    const scheduleText = [detail?.merge_info?.starttime, detail?.merge_info?.endtime]
      .filter(Boolean)
      .join(' ~ ');

    if (!listItem?.code || !detail?.subject || materials.length === 0) {
      throw ErrorFactory.createValidationError(
        `HC 合成活动“${detail?.subject || listItem?.id || '未知'}”未返回可用素材配方` +
        `${statusText ? `（状态: ${statusText}` : ''}` +
        `${scheduleText ? `${statusText ? '，' : '（'}时间: ${scheduleText}` : ''}` +
        `${statusText || scheduleText ? '）' : ''}`
      );
    }

    return {
      // newmerge 的 id 是活动 code，详情接口使用 detailId。
      id: String(listItem.code),
      detailId: String(listItem.id),
      name: detail.subject,
      materials,
      logic: Number(detail.logic || 0),
      quantity: Number(detail.quantity || 0),
      isBatch: Number(detail.is_batch || 0) === 1,
      updatedAt: new Date().toISOString(),
    };
  }

  getCombinationStatusText(status) {
    const normalized = String(status ?? '');
    return {
      0: '未开始',
      1: '进行中',
      2: '已抢完',
      3: '已结束',
    }[normalized] || (normalized ? `未知(${normalized})` : '');
  }

  async syncCombinationCatalog() {
    const list = await this.fetchCombinationCatalog();
    const combinations = {};

    for (const listItem of list) {
      const detailData = await this.request(
        'get',
        `${this.apiBaseURL}/api/v2/product_merge_material/getMaterial`,
        { id: listItem.id, timestamp: Date.now() }
      );
      if (detailData?.code !== 1) {
        Logger.warn(`[HC] 跳过无法读取配方的合成活动: ${listItem.subject || listItem.id}`);
        continue;
      }

      try {
        const combination = this.normalizeCombination(listItem, detailData.data);
        combinations[combination.name] = combination;
      } catch (error) {
        Logger.warn(`[HC] 跳过无法解析配方的合成活动: ${error.message}`);
      }
    }

    this.writeCombinationConfig(combinations);
    Logger.info(`[HC] 已同步 ${Object.keys(combinations).length} 个合成活动到本地配置`);
    return combinations;
  }

  async resolveCombinationByName(name) {
    const requestedName = String(name || '').trim();
    if (!requestedName) {
      throw ErrorFactory.createValidationError('HC 合成名称不能为空');
    }

    let combinations = this.loadCombinationConfig();
    let combination = combinations[requestedName];
    if (!combination) {
      combination = Object.values(combinations).find((item) => item?.name === requestedName);
    }
    if (!combination) {
      combinations = await this.syncCombinationCatalog();
      combination = combinations[requestedName] || Object.values(combinations)
        .find((item) => item?.name === requestedName);
    }
    if (!combination) {
      throw ErrorFactory.createBusinessError(
        `未找到可合成活动“${requestedName}”，已完成一次活动目录同步`,
        ErrorTypes.PRODUCT_UNAVAILABLE
      );
    }
    return combination;
  }

  async getUserCollectiblesByProductId(productId, materialType = '') {
    const all = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const payload = {
        product_id: productId,
        type: 'confirm',
        page,
        per_page: 50,
        timestamp: Date.now(),
      };
      if (materialType === 'digital') {
        payload.product_type = 'digital';
      }
      const data = await this.request('get', `${this.apiBaseURL}/api/user_collect`, payload);
      this.ensureSuccess(data, `获取素材 ${productId} 的账号库存失败`);
      const result = data.data || {};
      const rows = Array.isArray(result.data) ? result.data : [];
      all.push(...rows);
      hasMore = Boolean(result.has_more);
      page += 1;
    }

    return all.filter((record) => {
      const status = record?.status;
      return status === undefined || status === null || String(status) === '2';
    }).map((record) => ({
      // 官方 H5 前端最终把 user_collect.item_id（即 item.id）提交到 newmerge。
      instanceId: String(record.item_id ?? record.item?.id ?? record.id),
      productId: String(record.product_id ?? productId),
      type: materialType,
    })).filter((record) => record.instanceId && record.instanceId !== 'undefined');
  }

  async resolveCombinationMaterialInstanceIds(combination) {
    const inventoryByProduct = new Map();
    const getInventory = async (product) => {
      const key = `${product.type || ''}:${product.productId}`;
      if (!inventoryByProduct.has(key)) {
        inventoryByProduct.set(
          key,
          await this.getUserCollectiblesByProductId(product.productId, product.type)
        );
      }
      return inventoryByProduct.get(key);
    };

    const itemIds = [];
    const ysItemIds = [];
    for (const condition of combination.materials || []) {
      let remaining = Number(condition.quantity || 1);
      for (const product of condition.products || []) {
        if (remaining <= 0) break;
        const inventory = await getInventory(product);
        const selected = inventory.splice(0, remaining);
        selected.forEach((record) => {
          if (record.type === 'digital') {
            ysItemIds.push(record.instanceId);
          } else {
            itemIds.push(record.instanceId);
          }
        });
        remaining -= selected.length;
      }
      if (remaining > 0) {
        throw ErrorFactory.createBusinessError(
          `合成“${combination.name}”的第 ${condition.condition || '?'} 组素材不足，还缺 ${remaining} 件`,
          ErrorTypes.PRODUCT_UNAVAILABLE
        );
      }
    }

    if (itemIds.length + ysItemIds.length === 0) {
      throw ErrorFactory.createBusinessError('未找到可用于合成的素材实例', ErrorTypes.PRODUCT_UNAVAILABLE);
    }
    return { itemIds, ysItemIds };
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
