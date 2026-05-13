/**
 * JulianBaby / Bull Box 平台适配器
 *
 * 当前优先打通认证链路，并提供市场列表的基础读取能力。
 * 下单与支付接口已预留，但还需要进一步抓包确认字段后再补齐。
 */

const axios = require('axios');
const cryptJs = require('crypto-js');
const PlatformAdapter = require('../../interfaces/PlatformAdapter');
const { ErrorFactory, ErrorTypes } = require('../../utils/ErrorTypes');
const Logger = require('../../utils/Logger');

class JulianBabyAdapter extends PlatformAdapter {
  constructor(authValue, config = {}) {
    super(authValue, config);

    this.platformName = 'julianbaby';
    this.platformVersion = '0.1.0';
    this.baseURL = 'https://api.art.julian.baby';
    this.basePath = '/api';
    this.h5URL = 'https://h5.art.julian.baby';
    this.appVersion = config.appVersion || '1.0.23';
    this.inviterCode = config.inviterCode ?? null;
    this.account = config.account || null;
    this.payPassword = config.payPassword || null;
    this.password = authValue || null;
    this.token = null;
    this.isLoggedIn = false;
    this.userInfo = null;

    this.http = axios.create({
      baseURL: `${this.baseURL}${this.basePath}`,
      timeout: 15000,
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        origin: this.h5URL,
        referer: `${this.h5URL}/`,
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Cache-Control': 'no-cache',
      },
      validateStatus: () => true,
    });
  }

  getPlatformName() {
    return this.platformName;
  }

  getHeaders(extraHeaders = {}) {
    const headers = {
      accept: '*/*',
      'content-type': 'application/json',
      origin: this.h5URL,
      referer: `${this.h5URL}/`,
      'user-agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      'Cache-Control': 'no-cache',
      version: this.appVersion,
      ...extraHeaders,
    };

    if (this.token) {
      headers.token = this.token;
    }

    return headers;
  }

  decodeEncryptedString(value) {
    if (typeof value !== 'string' || value.length === 0 || value[0] !== '$') {
      return value;
    }

    const hex = value.slice(1);
    const bytes = [];
    for (let index = 0; index < hex.length; index += 2) {
      bytes.push(parseInt(hex.slice(index, index + 2), 16));
    }

    if (bytes.length === 0) {
      return '';
    }

    const saltLength = bytes[0];
    const saltBytes = bytes.slice(1, saltLength + 1);
    const payloadBytes = bytes.slice(saltLength + 1);
    const decodedBytes = payloadBytes.map((byte, index) => {
      const saltByte = saltBytes[index % saltLength];
      return byte >= saltByte ? byte - saltByte : 255 - (saltByte - byte) + 1;
    });

    return Buffer.from(decodedBytes).toString('utf8');
  }

  decodePayload(value) {
    if (Array.isArray(value)) {
      return value.map((item) => this.decodePayload(item));
    }

    if (!value || typeof value !== 'object') {
      if (typeof value === 'string' && value.startsWith('$')) {
        const decoded = this.decodeEncryptedString(value);
        try {
          return JSON.parse(decoded);
        } catch (error) {
          return decoded;
        }
      }
      return value;
    }

    const result = {};
    for (const [key, itemValue] of Object.entries(value)) {
      result[key] = this.decodePayload(itemValue);
    }
    return result;
  }

  async request(method, url, data = {}, options = {}) {
    try {
      const response = await this.http.request({
        method,
        url,
        data,
        headers: this.getHeaders(options.headers),
        params: options.params,
      });

      if (!response || !response.data) {
        throw ErrorFactory.createApiError('平台返回空响应');
      }

      return this.decodePayload(response.data);
    } catch (error) {
      Logger.error(`[JulianBaby] 请求失败: ${method.toUpperCase()} ${url}`, error);
      if (error.type) {
        throw error;
      }
      throw ErrorFactory.createApiError(`请求失败: ${error.message}`);
    }
  }

  ensureSuccess(data, defaultMessage) {
    if (data && data.code === 1) {
      return data;
    }

    const message = data?.msg || data?.message || defaultMessage;
    if (data?.code === 401) {
      throw ErrorFactory.createBusinessError(
        message || '未授权',
        ErrorTypes.UNAUTHORIZED,
        data
      );
    }

    throw ErrorFactory.createApiError(message || defaultMessage, data?.code, data);
  }

  async login(credentials) {
    try {
      Logger.info(`[JulianBaby] 开始登录，账号: ${credentials.account}`);

      const data = await this.request('post', '/user/login', {
        account: credentials.account,
        password: credentials.password,
        inviter_code: credentials.inviterCode ?? this.inviterCode,
      });

      this.ensureSuccess(data, '登录失败');

      const userInfo = data?.data?.userinfo;
      if (!userInfo?.token) {
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
        token: userInfo.token,
        refreshToken: null,
        expiresIn: userInfo.expires_in || null,
        userInfo: {
          account: credentials.account,
          platform: this.platformName,
          id: userInfo.id,
          username: userInfo.username,
          nickname: userInfo.nickname,
          mobile: userInfo.mobile,
        },
      };
    } catch (error) {
      this.isLoggedIn = false;
      this.token = null;
      this.userInfo = null;
      Logger.error('[JulianBaby] 登录失败', error);
      if (error.type) {
        throw error;
      }
      throw ErrorFactory.createAuthError(`登录失败: ${error.message}`);
    }
  }

  async refreshToken() {
    if (!this.credentials) {
      throw ErrorFactory.createAuthError('缺少登录凭据，无法刷新 token');
    }

    const result = await this.login(this.credentials);
    return result;
  }

  async validateToken(token) {
    const previousToken = this.token;
    try {
      this.token = token;
      const data = await this.request('post', '/user/getUserInfo', {});
      this.ensureSuccess(data, 'Token 校验失败');

      this.userInfo = data?.data || this.userInfo;
      this.isLoggedIn = true;
      return true;
    } catch (error) {
      Logger.warn(`[JulianBaby] Token 校验失败: ${error.message}`);
      this.token = previousToken;
      this.isLoggedIn = false;
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
    const keyword = productId ? String(productId) : '';
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const goodsType = options.goodsType || 2;
    const marketType = options.marketType || 1;
    const seriesId = options.seriesId || 0;

    // 已知固定商品ID时，直接进入该商品的挂单列表刷新。
    if (/^\d+$/.test(keyword)) {
      const listings = await this.getMarketGoodsListings(keyword, {
        page,
        pageSize,
        order: options.order || 'asc',
        sort: options.sort || '',
      });

      return listings
        .map((item) =>
          this.normalizeProduct(item, {
            parentProduct: {
              id: String(keyword),
              productId: String(keyword),
            },
          })
        )
        .filter(Boolean);
    }

    const payloadCandidates = [
      {
        goods_type: goodsType,
        page,
        list_rows: pageSize,
        series_id: seriesId,
        market_type: marketType,
        order: '',
        keywords: keyword,
        sort: '',
        add_deal_num: true,
      },
      {
        goods_type: goodsType,
        page,
        list_rows: pageSize,
        series_id: seriesId,
        market_type: marketType,
        order: '',
        keyword,
        sort: '',
        add_deal_num: true,
      },
      { goods_type: goodsType, page, list_rows: pageSize, keywords: keyword },
      { keywords: keyword },
      {},
    ];

    const rawItems = [];
    const seen = new Set();

    for (const payload of payloadCandidates) {
      try {
        const data = await this.request('post', '/market/market/getMarketList', payload);
        if (data?.code !== 1) {
          continue;
        }
        const items = this.extractRows(data.data);
        for (const item of items) {
          const id = this.getRawId(item);
          if (!id || seen.has(id)) {
            continue;
          }
          seen.add(id);
          rawItems.push(item);
        }
      } catch (error) {
        Logger.warn(`[JulianBaby] 获取市场列表失败，payload=${JSON.stringify(payload)}`);
      }
    }

    // 市场列表为空时，回退到盲盒/藏品列表，至少保证能做商品发现。
    if (rawItems.length === 0) {
      const fallbackEndpoints = [
        '/box/blind_box/list',
        '/box/collection/CollectionList',
      ];

      for (const endpoint of fallbackEndpoints) {
        try {
          const data = await this.request('post', endpoint, {});
          if (data?.code !== 1) {
            continue;
          }
          const items = this.extractRows(data.data);
          for (const item of items) {
            const id = this.getRawId(item);
            if (!id || seen.has(id)) {
              continue;
            }
            seen.add(id);
            rawItems.push(item);
          }
        } catch (error) {
          Logger.warn(`[JulianBaby] 回退商品列表失败: ${endpoint}`);
        }
      }
    }

    const normalized = rawItems
      .map((item) => this.normalizeProduct(item))
      .filter(Boolean);

    const filterByKeyword = (items) => {
      if (!keyword) {
        return items;
      }

      const lowerKeyword = keyword.toLowerCase();
      return items.filter((item) => {
        const haystack = [
          item.id,
          item.productId,
          item.title,
          item.name,
          item.raw?.name,
          item.raw?.title,
          item.raw?.collection_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(lowerKeyword);
      });
    };

    if (!keyword) {
      return normalized;
    }

    const matchedProducts = filterByKeyword(normalized);
    if (matchedProducts.length === 0) {
      Logger.warn(`[JulianBaby] 聚合市场中未匹配到目标商品: ${keyword}`);
      return [];
    }

    const aggregateProducts = matchedProducts;
    const marketListings = [];

    for (const product of aggregateProducts) {
      try {
        const listings = await this.getMarketGoodsListings(product.productId || product.id, {
          page,
          pageSize,
          order: options.order || 'asc',
          sort: options.sort || '',
        });

        marketListings.push(
          ...listings.map((item) =>
            this.normalizeProduct(item, {
              parentProduct: product,
            })
          )
        );
      } catch (error) {
        Logger.warn(
          `[JulianBaby] 获取具体挂单失败，product=${product.productId || product.id}: ${error.message}`
        );
      }
    }

    const normalizedListings = marketListings.filter(Boolean);
    if (normalizedListings.length > 0) {
      return filterByKeyword(normalizedListings);
    }

    Logger.warn(
      `[JulianBaby] 未获取到 ${keyword} 的具体挂单列表，本轮跳过下单以避免误买`
    );
    return [];
  }

  async getMarketGoodsListings(productId, options = {}) {
    const data = await this.request('post', '/market/market/getMarketGoodsListByGoodsId', {
      type: Number(options.type || 2),
      id: String(productId),
      page: Number(options.page || 1),
      list_rows: Number(options.pageSize || 20),
      order: options.order || '',
      sort: options.sort || '',
    });

    this.ensureSuccess(data, '获取市场挂单列表失败');
    return this.extractRows(data.data);
  }

  async getProductDetail(productId, options = {}) {
    const type = String(options.goodsType || 2);
    const data = await this.request('post', '/market/market/marketGoodsDetail', {
      id: String(productId),
      type,
    });

    this.ensureSuccess(data, '获取商品详情失败');
    return data.data;
  }

  buildOrderToken(orderInfo) {
    return JSON.stringify({
      order_id: String(orderInfo.order_id),
      order_sn: orderInfo.order_sn,
      order_type: Number(orderInfo.order_type || 2),
      pay_type: Number(orderInfo.pay_type || 4),
      pay_way: orderInfo.pay_way || this.config?.payWay || 'huifu',
    });
  }

  parseOrderToken(orderInfo) {
    if (typeof orderInfo !== 'string') {
      return orderInfo;
    }

    try {
      return JSON.parse(orderInfo);
    } catch (error) {
      return { order_id: orderInfo };
    }
  }

  async getMarketOrderDetail(orderId) {
    const data = await this.request('post', '/order/order/saleMarketOrderDetail', {
      order_id: String(orderId),
    });

    this.ensureSuccess(data, '获取市场订单详情失败');
    return data.data;
  }

  extractRows(data) {
    if (Array.isArray(data)) {
      return data;
    }

    if (!data || typeof data !== 'object') {
      return [];
    }

    return (
      data.list ||
      data.rows ||
      data.data ||
      data.items ||
      data.records ||
      []
    );
  }

  getRawId(item) {
    return (
      item?.id ||
      item?.goods_id ||
      item?.collection_id ||
      item?.product_id ||
      item?.blind_box_id ||
      item?.market_id ||
      item?.collectionId ||
      item?.goodsId ||
      item?.product?.id ||
      null
    );
  }

  normalizeProduct(item, context = {}) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const parentProduct = context.parentProduct || null;
    const marketGoodsId =
      item.market_goods_id || (item.collection_code !== undefined ? item.id : null);
    const id = this.getRawId(item);
    if (!id) {
      return null;
    }

    const priceValue =
      item.price ??
      item.min_price ??
      item.reprice_limit ??
      item.floor_price ??
      item.money ??
      item.sell_price ??
      item.current_price ??
      item.currentPrice ??
      0;

    const circulation =
      item.circulation_num ?? item.flow_num ?? item.circulation ?? null;
    const issued =
      item.issue_num ?? item.publish_num ?? item.total_num ?? item.total ?? null;

    return {
      id: String(marketGoodsId || id),
      productId: String(
        parentProduct?.productId ||
          parentProduct?.id ||
          item.collection_id ||
          item.product_id ||
          item.product?.id ||
          item.goods_id ||
          id
      ),
      marketGoodsId: marketGoodsId ? String(marketGoodsId) : null,
      price: Number(priceValue) || 0,
      available:
        (item.status === undefined || Number(item.status) === 1) &&
        item.buy_status !== 0 &&
        item.sell_out !== 1 &&
        item.is_sellout !== 1 &&
        item.stock_status !== 0 &&
        item.is_out !== 1,
      title:
        parentProduct?.title ||
        parentProduct?.name ||
        item.name ||
        item.title ||
        item.collection_name ||
        item.product?.name ||
        item.goods_name ||
        `商品${id}`,
      name:
        parentProduct?.name ||
        parentProduct?.title ||
        item.name ||
        item.title ||
        item.collection_name ||
        item.product?.name ||
        item.goods_name ||
        `商品${id}`,
      seller: item.user_id || item.seller_id || null,
      attributes: {
        circulation,
        issued,
        dealNum: item.deal_num ?? 0,
        marketType: item.market_type ?? null,
        repriceLimit: item.reprice_limit ?? null,
      },
      raw: item,
    };
  }

  async placeOrder(product) {
    const marketGoodsId = product?.marketGoodsId || product?.raw?.market_goods_id;
    if (marketGoodsId) {
      return this.createMarketOrder(String(marketGoodsId), {
        payWay: product?.payWay,
      });
    }

    const productId = product?.productId || product?.id || product?.raw?.product?.id || product?.raw?.id;
    if (!productId) {
      throw ErrorFactory.createBusinessError('缺少商品ID或挂单ID，无法创建订单', ErrorTypes.ORDER_FAILED);
    }

    return this.quickOrder(String(productId), 1);
  }

  async createMarketOrder(marketGoodsId, options = {}) {
    const payWay = options.payWay || this.options.payWay || this.config?.payWay || 'huifu';
    const data = await this.request('post', '/order/pay/CreateMarketOrder', {
      market_goods_id: String(marketGoodsId),
      pay_type: Number(options.payType || 4),
      pay_way: payWay,
      ...options.extraData,
    });

    this.ensureSuccess(data, '市场下单失败');

    const orderInfo = data?.data;
    if (!orderInfo?.order_id || !orderInfo?.order_sn) {
      throw ErrorFactory.createBusinessError('市场下单成功但未返回完整订单信息', ErrorTypes.ORDER_FAILED, data);
    }

    Logger.info(`[JulianBaby] 市场下单成功，订单ID: ${orderInfo.order_id}, 订单号: ${orderInfo.order_sn}`);

    return this.buildOrderToken({
      ...orderInfo,
      order_type: 2,
      pay_type: 4,
      pay_way: payWay,
    });
  }

  async quickOrder(productId, quantity = 1, options = {}) {
    if (Number(quantity) !== 1) {
      throw ErrorFactory.createBusinessError(
        'JulianBaby 快捷下单当前仅支持单次 1 件，批量请走 batchOrder',
        ErrorTypes.ORDER_FAILED
      );
    }

    const detail = await this.getProductDetail(productId, options);
    const payWay = options.payWay || this.options.payWay || this.config?.payWay || 'huifu';

    const data = await this.request('post', '/order/pay/fastOrderNew', {
      goods_id: detail.id,
      key: detail.key,
      pay_way: payWay,
      ...options.extraData,
    });

    this.ensureSuccess(data, '快捷下单失败');

    const orderInfo = data?.data;
    if (!orderInfo?.order_id || !orderInfo?.order_sn) {
      throw ErrorFactory.createBusinessError('下单成功但未返回完整订单信息', ErrorTypes.ORDER_FAILED, data);
    }

    Logger.info(`[JulianBaby] 快捷下单成功，订单ID: ${orderInfo.order_id}, 订单号: ${orderInfo.order_sn}`);

    return this.buildOrderToken({
      ...orderInfo,
      order_type: 2,
      pay_type: 4,
      pay_way: payWay,
    });
  }

  async batchOrder(productId, batchSize, options = {}) {
    const detail = await this.getProductDetail(productId, options);
    const payWay = options.payWay || this.options.payWay || this.config?.payWay || 'huifu';
    const price = Number(options.price || detail.reprice_limit || detail.price || 0);

    if (!batchSize || Number(batchSize) <= 1) {
      throw ErrorFactory.createBusinessError('批量下单数量必须大于 1', ErrorTypes.ORDER_FAILED);
    }

    const data = await this.request('post', '/order/pay/batchBuy', {
      goods_id: detail.id,
      key: detail.key,
      num: Number(batchSize),
      price,
      pay_way: payWay,
      ...options.extraData,
    });

    this.ensureSuccess(data, '批量下单失败');

    const orderInfo = data?.data;
    if (!orderInfo?.order_id || !orderInfo?.order_sn) {
      throw ErrorFactory.createBusinessError('批量下单成功但未返回完整订单信息', ErrorTypes.ORDER_FAILED, data);
    }

    Logger.info(`[JulianBaby] 批量下单成功，订单ID: ${orderInfo.order_id}, 订单号: ${orderInfo.order_sn}`);

    return this.buildOrderToken({
      ...orderInfo,
      order_type: 2,
      pay_type: 4,
      pay_way: payWay,
    });
  }

  async getPaymentUrl(orderInfo) {
    const orderToken = this.parseOrderToken(orderInfo);
    if (orderToken.order_sn && orderToken.pay_way) {
      return JSON.stringify(orderToken);
    }

    if (!orderToken.order_id) {
      throw ErrorFactory.createBusinessError('缺少订单ID，无法获取支付信息', ErrorTypes.PAYMENT_FAILED);
    }

    const detail = await this.getMarketOrderDetail(orderToken.order_id);
    const orderNumber =
      detail.order_sn || detail.order_number || detail.orderNumber || detail.out_trade_no;

    if (!orderNumber) {
      throw ErrorFactory.createBusinessError('订单详情中未找到订单号', ErrorTypes.PAYMENT_FAILED, detail);
    }

    return JSON.stringify({
      order_id: String(orderToken.order_id),
      order_sn: orderNumber,
      order_type: Number(orderToken.order_type || 2),
      pay_type: Number(orderToken.pay_type || 4),
      pay_way: orderToken.pay_way || this.options.payWay || this.config?.payWay || 'huifu',
    });
  }

  async executePayment(paymentUrl, password) {
    const paymentInfo = this.parseOrderToken(paymentUrl);
    const payPassword = password || this.payPassword || this.options.payPassword || this.config?.payPassword;

    if (!paymentInfo?.order_id || !paymentInfo?.order_sn) {
      throw ErrorFactory.createBusinessError('支付信息不完整，无法执行支付', ErrorTypes.PAYMENT_FAILED);
    }

    if (!payPassword) {
      throw ErrorFactory.createBusinessError('缺少支付密码，无法执行支付', ErrorTypes.PAYMENT_FAILED);
    }

    const payCheck = await this.request('post', '/user/checkPaypass', {
      pay_password: payPassword,
    });

    if (payCheck?.code !== 1) {
      throw ErrorFactory.createBusinessError(
        payCheck?.msg || '支付密码校验失败',
        ErrorTypes.PAYMENT_FAILED,
        payCheck
      );
    }

    const payResult = await this.request('post', '/order/pay/doPay', {
      pay_type: Number(paymentInfo.pay_type || 4),
      order_number: paymentInfo.order_sn,
      order_type: Number(paymentInfo.order_type || 2),
      pay_way: paymentInfo.pay_way || this.options.payWay || this.config?.payWay || 'huifu',
      pay_scene: 'H5',
      returnurl: `${this.h5URL}/#/pages/order/defaultDetail?id=${paymentInfo.order_id}&orderType=${paymentInfo.order_type || 2}`,
      pay_password: payPassword,
    });

    this.ensureSuccess(payResult, '支付请求失败');

    const resultData = payResult?.data || {};
    const payData = resultData?.pay || {};
    const redirectUrl = payData?.pay_url || payData?.url || null;

    if (resultData.balancePay) {
      return {
        success: true,
        orderId: String(paymentInfo.order_id),
        paymentUrl,
        message: payResult.msg || '支付成功',
      };
    }

    if (redirectUrl) {
      const transactionId = await this.executeHuifuWalletPayment(
        redirectUrl,
        payPassword
      );

      return {
        success: true,
        orderId: String(paymentInfo.order_id),
        transactionId,
        paymentUrl: redirectUrl,
        message: payResult.msg || '支付成功',
      };
    }

    return {
      success: true,
      orderId: String(paymentInfo.order_id),
      paymentUrl,
      message: payResult.msg || '支付请求已提交',
    };
  }

  getPwd(pwd, uuid) {
    const key = cryptJs.enc.Utf8.parse(uuid);
    const options = {
      mode: cryptJs.mode.CBC,
      padding: cryptJs.pad.Pkcs7,
      iv: cryptJs.enc.Utf8.parse('chinapnr'),
    };
    const encrypted = cryptJs.TripleDES.encrypt(pwd, key, options);
    return cryptJs.enc.Base64.stringify(encrypted.ciphertext);
  }

  getCheckValue(data) {
    const ignoredKeys = ['front_id_pic', 'back_id_pic', 'bank_card_pic', 'pic_list'];

    const normalize = (value) => {
      if (Array.isArray(value)) {
        return JSON.stringify(value);
      }
      if (value && typeof value === 'object') {
        const result = {};
        Object.keys(value)
          .sort((left, right) => left.localeCompare(right))
          .forEach((key) => {
            result[key] = normalize(value[key]);
          });
        return result;
      }
      return value;
    };

    const normalized = normalize(data);
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

  getHFHeader(data, uuid, url) {
    return {
      Token: 'null',
      'Content-Type': 'application/json; charset=utf-8',
      signature: null,
      Check_value: this.getCheckValue(data),
      Hide_head: 0,
      uuid,
      mer_cust_id: uuid.slice(9, 25),
      referer: url,
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
      }
    );

    const result = response.data;
    if (!result || result.resp_code !== 'C00000') {
      throw new Error(result?.resp_desc || `${endpoint} failed`);
    }

    return result;
  }

  async executeHuifuWalletPayment(paymentUrl, payPassword) {
    const uuid = this.extractUuidFromPaymentUrl(paymentUrl);
    if (!uuid) {
      throw new Error('无法从支付链接中提取UUID');
    }

    const encryptedPwd = this.getPwd(payPassword, uuid);

    await this.executeHFRequest(
      'transpasswordcheck',
      { password: encryptedPwd },
      uuid,
      paymentUrl
    );

    await this.executeHFRequest(
      'transverifyquery',
      {
        trans_type: '30',
        dev_info_json: '{"devType":"2","devSysType":"H5","mobileFlag":"Y"}',
      },
      uuid,
      paymentUrl
    );

    await this.executeHFRequest(
      'balancepay',
      {
        dev_info_json: '{"devType":"2","devSysType":"H5","mobileFlag":"Y"}',
      },
      uuid,
      paymentUrl
    );

    await this.executeHFRequest('paystatquery', {}, uuid, paymentUrl);
    return uuid;
  }

  async confirmCombination() {
    throw ErrorFactory.createBusinessError(
      'JulianBaby 合成功能尚未接入',
      ErrorTypes.REQUEST_FAILED
    );
  }

  async cancelResale() {
    throw ErrorFactory.createBusinessError(
      'JulianBaby 取消寄售功能尚未接入',
      ErrorTypes.REQUEST_FAILED
    );
  }
}

module.exports = JulianBabyAdapter;
