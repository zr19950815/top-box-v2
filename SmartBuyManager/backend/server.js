/**
 * SmartBuy Manager 服务器入口
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config/config');
const database = require('./database/Database');
const productConfigManager = require(`${config.framework.path}/config/ProductConfigManager`);
const QQBotBridge = require('./integrations/qq/QQBotBridge');
const NewBeeAnnouncementMonitor = require('./integrations/qq/NewBeeAnnouncementMonitor');
const HcAdapter = require(`${config.framework.path}/platforms/hc/HcAdapter`);

// 导入路由
const { router: tasksRouter, taskManager } = require('./api/routes/tasks');

class SmartBuyServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: config.websocket.cors,
      pingTimeout: config.websocket.pingTimeout,
      pingInterval: config.websocket.pingInterval
    });
    
    this.connectedClients = new Set();
    this.qqBot = new QQBotBridge({
      config: config.qqBot,
      taskManager
    });
    const newBeeAdapter = new HcAdapter(null);
    this.newBeeAnnouncementMonitor = new NewBeeAnnouncementMonitor({
      config: config.newBeeAnnouncements,
      qqBot: this.qqBot,
      fetchAnnouncements: async () => {
        const response = await newBeeAdapter.request(
          'get',
          `${newBeeAdapter.apiBaseURL}/api/news`,
          { page: 1, per_page: 20, timestamp: Date.now() }
        );
        if (response?.code !== 1 || !Array.isArray(response?.data?.data)) {
          throw new Error(response?.msg || 'NewBee 公告列表返回异常');
        }
        return response.data.data;
      },
      fetchAnnouncementDetail: async id => {
        const response = await newBeeAdapter.request(
          'get',
          `${newBeeAdapter.apiBaseURL}/api/news/content`,
          { id, timestamp: Date.now() }
        );
        if (response?.code !== 1 || !response?.data || typeof response.data.content !== 'string') {
          throw new Error(response?.msg || `NewBee 公告正文返回异常: ${id}`);
        }
        return response.data;
      }
    });
  }

  /**
   * 初始化服务器
   */
  async initialize() {
    try {
      console.log('🚀 SmartBuy Manager 服务器启动中...');

      // 连接数据库
      await database.connect();
      await database.ensureTaskOwnershipSchema();
      console.log('✅ 数据库连接成功');

      // 执行凭据（含米玛）只存在内存中，从不落盘，因此上个进程未跑完的任务
      // 无法恢复执行。先统一标成 interrupted，避免 DB 里留下永久 running 的
      // 僵尸任务；待通知列表在 QQ 连接就绪后补发。
      this.interruptedTasks = await taskManager.recoverInterruptedTasks();

      // Manager 直接复用 Framework 的 CommandParser，创建任务前需先
      // 初始化同一份商品配置。
      await productConfigManager.initialize();

      // 配置中间件
      this.setupMiddleware();

      // 配置路由
      this.setupRoutes();

      // 配置WebSocket
      this.setupWebSocket();

      // 配置事件监听
      this.setupEventListeners();

      // QQ integration is explicitly enabled through QQ_BOT_ENABLED.
      this.qqBot.start();
      this.newBeeAnnouncementMonitor.start();

      // 通知失败不能影响启动，因此不 await 也不向上抛。
      this.qqBot.notifyInterruptedTasks(this.interruptedTasks || [])
        .catch(() => console.error('QQ Bot 中断通知入队失败'));

      console.log('✅ 服务器初始化完成');
    } catch (error) {
      console.error('❌ 服务器初始化失败:', error);
      process.exit(1);
    }
  }

  /**
   * 配置中间件
   */
  setupMiddleware() {
    // 安全中间件
    this.app.use(helmet(config.security.helmet));

    // CORS
    this.app.use(cors(config.server.cors));

    // 限流
    const limiter = rateLimit(config.security.rateLimit);
    this.app.use('/api/', limiter);

    // 解析JSON
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 静态文件服务（前端构建文件）
    const frontendPath = path.join(__dirname, '../frontend/dist');
    this.app.use(express.static(frontendPath));

    // 请求日志
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * 配置路由
   */
  setupRoutes() {
    // API路由
    this.app.use('/api/tasks', tasksRouter);

    // 健康检查
    this.app.get('/api/health', (req, res) => {
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../package.json').version
      });
    });

    // 系统状态API
    this.app.get('/api/status', async (req, res) => {
      try {
        const stats = await taskManager.getTaskStats();
        const dbInfo = await database.getDatabaseInfo();
        
        res.json({
          success: true,
          data: {
            server: {
              uptime: process.uptime(),
              memory: process.memoryUsage(),
              pid: process.pid
            },
            database: {
              tables: dbInfo.totalTables,
              connection: database.isConnected
            },
            tasks: stats,
            websocket: {
              connectedClients: this.connectedClients.size
            },
            qqBot: this.qqBot.getStatus()
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // SPA路由回退（返回index.html）
    this.app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    });

    // 错误处理中间件
    this.app.use((error, req, res, next) => {
      console.error('❌ API错误:', error);
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' ? error.message : '内部服务器错误'
      });
    });
  }

  /**
   * 配置WebSocket
   */
  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 客户端连接: ${socket.id}`);
      this.connectedClients.add(socket.id);

      // 发送初始状态
      this.sendSystemStats(socket);

      // 处理客户端断开连接
      socket.on('disconnect', () => {
        console.log(`🔌 客户端断开: ${socket.id}`);
        this.connectedClients.delete(socket.id);
      });

      // 处理客户端订阅特定任务
      socket.on('subscribe:task', (taskId) => {
        socket.join(`task:${taskId}`);
        console.log(`📡 客户端 ${socket.id} 订阅任务: ${taskId}`);
      });

      // 处理客户端取消订阅
      socket.on('unsubscribe:task', (taskId) => {
        socket.leave(`task:${taskId}`);
        console.log(`📡 客户端 ${socket.id} 取消订阅任务: ${taskId}`);
      });
    });
  }

  /**
   * 配置事件监听
   */
  setupEventListeners() {
    // 监听任务事件
    taskManager.on('taskCreated', (task) => {
      this.io.emit('task:created', task);
    });

    taskManager.on('taskStatusUpdated', (taskUpdate) => {
      this.io.emit('task:updated', taskUpdate);
      this.io.to(`task:${taskUpdate.id}`).emit('task:status', taskUpdate);
    });

    taskManager.on('taskLog', (logData) => {
      this.io.emit('log:new', logData);
      this.io.to(`task:${logData.taskId}`).emit('task:log', logData);
    });

    taskManager.on('taskProgress', (progressUpdate) => {
      this.io.emit('task:updated', {
        id: progressUpdate.taskId,
        progress: progressUpdate.progress
      });
      this.io.to(`task:${progressUpdate.taskId}`).emit('task:progress', progressUpdate);
    });

    taskManager.on('taskDeleted', (task) => {
      this.io.emit('task:deleted', task);
    });

    // 定时发送系统状态
    setInterval(() => {
      this.broadcastSystemStats();
    }, config.monitoring.systemStatsInterval);
  }

  /**
   * 发送系统统计信息
   */
  async sendSystemStats(socket = null) {
    try {
      const stats = await taskManager.getTaskStats();
      const systemInfo = {
        timestamp: new Date().toISOString(),
        tasks: stats,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          connectedClients: this.connectedClients.size
        }
      };

      if (socket) {
        socket.emit('system:stats', systemInfo);
      } else {
        this.io.emit('system:stats', systemInfo);
      }
    } catch (error) {
      console.error('❌ 发送系统统计失败:', error);
    }
  }

  /**
   * 广播系统统计信息
   */
  async broadcastSystemStats() {
    await this.sendSystemStats();
  }

  /**
   * 启动服务器
   */
  async start() {
    await this.initialize();

    return new Promise((resolve) => {
      this.server.listen(config.server.port, config.server.host, () => {
        console.log(`🌟 SmartBuy Manager 服务器运行在:`);
        console.log(`   HTTP: http://${config.server.host}:${config.server.port}`);
        console.log(`   WebSocket: ws://${config.server.host}:${config.server.port}`);
        console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
        resolve();
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop() {
    console.log('🛑 正在停止服务器...');

    // 关闭WebSocket连接
    this.io.close();
    this.newBeeAnnouncementMonitor.stop();
    await this.qqBot.stop();

    // 关闭HTTP服务器
    return new Promise((resolve) => {
      this.server.close(async () => {
        // 关闭数据库连接
        await database.close();
        console.log('✅ 服务器已停止');
        resolve();
      });
    });
  }
}

// 创建服务器实例
const server = new SmartBuyServer();

// 优雅关闭处理
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 收到${signal}信号，正在优雅关闭...`);
  
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error('❌ 关闭服务器时出错:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('💥 未捕获异常:', error);
  process.exit(1);
});

// 不因单个 Promise 拒绝退出进程。QQ 桥接与 NapCat 是网络组件，断线、action
// 超时都会产生被拒绝的 Promise；退出会连带中断所有在跑的任务，而执行凭据只在
// 内存中、无法恢复。记录后继续运行，由各任务自己的失败路径收尾。
process.on('unhandledRejection', (reason) => {
  console.error('💥 未处理的Promise拒绝:', reason);
});

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  server.start().catch((error) => {
    console.error('❌ 启动服务器失败:', error);
    process.exit(1);
  });
}

module.exports = server;
