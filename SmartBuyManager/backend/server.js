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
  }

  /**
   * 初始化服务器
   */
  async initialize() {
    try {
      console.log('🚀 SmartBuy Manager 服务器启动中...');

      // 连接数据库
      await database.connect();
      console.log('✅ 数据库连接成功');

      // 配置中间件
      this.setupMiddleware();

      // 配置路由
      this.setupRoutes();

      // 配置WebSocket
      this.setupWebSocket();

      // 配置事件监听
      this.setupEventListeners();

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
            }
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

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 未处理的Promise拒绝:', reason);
  process.exit(1);
});

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  server.start().catch((error) => {
    console.error('❌ 启动服务器失败:', error);
    process.exit(1);
  });
}

module.exports = server;