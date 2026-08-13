/**
 * SmartBuy Manager 配置文件
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  // 服务配置
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || 'localhost',
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true
    }
  },

  // 数据库配置
  database: {
    path: process.env.DB_PATH || path.join(__dirname, '../../storage/database/smartbuy.db'),
    options: {
      verbose: process.env.NODE_ENV === 'development'
    }
  },

  // SmartBuy Framework集成配置
  framework: {
    path: process.env.FRAMEWORK_PATH || path.resolve(__dirname, '../../../SmartBuyFramework'),
    cliScript: 'cli.js',
    // 0 disables the executor timeout. Purchase monitoring tasks are expected
    // to remain alive until they complete or are stopped explicitly.
    timeout: Number(process.env.TASK_TIMEOUT_MS || 0),
    maxConcurrentTasks: process.env.MAX_CONCURRENT_TASKS || 10
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: path.join(__dirname, '../../storage/logs'),
    maxFiles: '30d', // 保留30天
    maxSize: '20m',  // 单文件最大20MB
    categories: {
      PURCHASE_SUCCESS: 'success',
      PURCHASE_FAILED: 'error',
      PAYMENT_ERROR: 'error',
      SYSTEM_ERROR: 'error',
      PERFORMANCE: 'performance',
      GENERAL: 'general'
    }
  },

  // 任务配置
  tasks: {
    // TaskManager 读的是这个字段，此前它被硬编码，导致 MAX_CONCURRENT_TASKS
    // 环境变量实际无效。
    maxConcurrent: Number(process.env.MAX_CONCURRENT_TASKS || 10),
    defaultTimeout: Number(process.env.TASK_TIMEOUT_MS || 0),
    retryAttempts: 3,         // 失败重试次数
    cleanupInterval: 3600000, // 清理间隔(1小时)
    maxHistoryDays: 30        // 任务历史保留天数
  },

  // WebSocket配置
  websocket: {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  },

  // NapCat OneBot 11 integration. The bridge is opt-in so a regular Manager
  // startup never creates QQ tasks accidentally.
  qqBot: {
    enabled: process.env.QQ_BOT_ENABLED === 'true',
    websocketUrl: process.env.QQ_BOT_WS_URL || 'ws://127.0.0.1:3002',
    accessToken: process.env.QQ_BOT_ACCESS_TOKEN || '',
    commandPrefix: process.env.QQ_BOT_COMMAND_PREFIX || '/topbox',
    // 私聊任务对所有好友开放：谁提交任务，任务就绑定给谁，没有 QQ 白名单。
    // 群聊没有任何交互入口，因此也不存在群白名单。
    directCommandsEnabled: process.env.QQ_BOT_DIRECT_COMMANDS_ENABLED === 'true',
    privateTestReply: process.env.QQ_BOT_PRIVATE_TEST_REPLY || '',
    reconnectInterval: Number(process.env.QQ_BOT_RECONNECT_INTERVAL_MS || 5000),
    actionTimeout: Number(process.env.QQ_BOT_ACTION_TIMEOUT_MS || 10000)
  },

  newBeeAnnouncements: {
    enabled: process.env.NEWBEE_ANNOUNCEMENT_ENABLED === 'true',
    interval: Number(process.env.NEWBEE_ANNOUNCEMENT_INTERVAL_MS || 60000),
    groupId: process.env.NEWBEE_ANNOUNCEMENT_QQ_GROUP || '',
    stateFile: process.env.NEWBEE_ANNOUNCEMENT_STATE_FILE || path.join(
      __dirname,
      '../../storage/qq/newbee-announcement.json'
    )
  },

  // 监控配置
  monitoring: {
    metricsRetentionDays: 7,  // 指标保留天数
    statsUpdateInterval: 5000, // 统计更新间隔(5秒)
    systemStatsInterval: 30000 // 系统状态更新间隔(30秒)
  },

  // 安全配置
  security: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 100 // 最大请求数
    },
    helmet: {
      contentSecurityPolicy: false // 开发时禁用CSP
    }
  }
};

module.exports = config;
