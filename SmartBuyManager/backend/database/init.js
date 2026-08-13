/**
 * 数据库初始化脚本
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

class DatabaseInitializer {
  constructor() {
    this.dbPath = config.database.path;
    this.dbDir = path.dirname(this.dbPath);
  }

  /**
   * 初始化数据库
   */
  async initialize() {
    try {
      console.log('🔧 开始初始化数据库...');
      
      // 确保数据库目录存在
      if (!fs.existsSync(this.dbDir)) {
        fs.mkdirSync(this.dbDir, { recursive: true });
        console.log(`✅ 创建数据库目录: ${this.dbDir}`);
      }

      // 创建数据库连接
      const db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ 数据库连接失败:', err.message);
          process.exit(1);
        }
        console.log('✅ 数据库连接成功');
      });

      // 创建表结构
      await this.createTables(db);
      
      // 创建索引
      await this.createIndexes(db);
      
      // 插入初始数据
      await this.insertInitialData(db);

      // 关闭数据库连接
      db.close((err) => {
        if (err) {
          console.error('❌ 关闭数据库连接失败:', err.message);
        } else {
          console.log('✅ 数据库初始化完成');
        }
      });

    } catch (error) {
      console.error('❌ 数据库初始化失败:', error);
      process.exit(1);
    }
  }

  /**
   * 创建表结构
   */
  createTables(db) {
    return new Promise((resolve, reject) => {
      const tables = [
        // 任务表
        `CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          command_string TEXT NOT NULL,
          platform TEXT NOT NULL,
          task_type TEXT NOT NULL,
          mode TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          priority INTEGER DEFAULT 1,
          config TEXT,
          progress TEXT,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          started_at DATETIME,
          completed_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          ,qq_user_id TEXT
        )`,

        // 日志表
        `CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT,
          category TEXT NOT NULL,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          data TEXT,
          platform TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
        )`,

        // 订单表
        `CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL,
          order_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          price DECIMAL(10,2),
          status TEXT NOT NULL,
          platform TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )`,

        // 系统指标表
        `CREATE TABLE IF NOT EXISTS metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          metric_type TEXT NOT NULL,
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          tags TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // 配置表
        `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          description TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS task_notifications (
          task_id TEXT NOT NULL,
          event_key TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (task_id, event_key),
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )`
      ];

      let completed = 0;
      const total = tables.length;

      tables.forEach((sql, index) => {
        db.run(sql, (err) => {
          if (err) {
            console.error(`❌ 创建表失败 (${index + 1}):`, err.message);
            reject(err);
            return;
          }
          
          completed++;
          console.log(`✅ 创建表 ${completed}/${total}`);
          
          if (completed === total) {
            console.log('✅ 所有表创建完成');
            resolve();
          }
        });
      });
    });
  }

  /**
   * 创建索引
   */
  createIndexes(db) {
    return new Promise((resolve, reject) => {
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
        'CREATE INDEX IF NOT EXISTS idx_tasks_platform ON tasks(platform)',
        'CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_tasks_qq_user_id ON tasks(qq_user_id)',
        'CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id)',
        'CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category)',
        'CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_orders_task_id ON orders(task_id)',
        'CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(platform)',
        'CREATE INDEX IF NOT EXISTS idx_metrics_type_name ON metrics(metric_type, metric_name)',
        'CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)'
      ];

      let completed = 0;
      const total = indexes.length;

      indexes.forEach((sql, index) => {
        db.run(sql, (err) => {
          if (err) {
            console.error(`❌ 创建索引失败 (${index + 1}):`, err.message);
            reject(err);
            return;
          }
          
          completed++;
          console.log(`✅ 创建索引 ${completed}/${total}`);
          
          if (completed === total) {
            console.log('✅ 所有索引创建完成');
            resolve();
          }
        });
      });
    });
  }

  /**
   * 插入初始数据
   */
  insertInitialData(db) {
    return new Promise((resolve, reject) => {
      const settings = [
        {
          key: 'system_initialized',
          value: 'true',
          description: '系统是否已初始化'
        },
        {
          key: 'database_version',
          value: '1.0.0',
          description: '数据库版本'
        },
        {
          key: 'max_concurrent_tasks',
          value: '10',
          description: '最大并发任务数'
        }
      ];

      let completed = 0;
      const total = settings.length;

      if (total === 0) {
        resolve();
        return;
      }

      const sql = 'INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)';
      
      settings.forEach((setting, index) => {
        db.run(sql, [setting.key, setting.value, setting.description], (err) => {
          if (err) {
            console.error(`❌ 插入初始数据失败 (${index + 1}):`, err.message);
            reject(err);
            return;
          }
          
          completed++;
          console.log(`✅ 插入初始数据 ${completed}/${total}`);
          
          if (completed === total) {
            console.log('✅ 初始数据插入完成');
            resolve();
          }
        });
      });
    });
  }
}

// 如果直接运行此文件，则执行初始化
if (require.main === module) {
  const initializer = new DatabaseInitializer();
  initializer.initialize();
}

module.exports = DatabaseInitializer;
