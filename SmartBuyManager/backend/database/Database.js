/**
 * 数据库操作封装类
 */

const sqlite3 = require('sqlite3').verbose();
const config = require('../config/config');

class Database {
  constructor() {
    this.db = null;
    this.isConnected = false;
  }

  /**
   * 连接数据库
   */
  async connect() {
    if (this.isConnected) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(config.database.path, sqlite3.OPEN_READWRITE, (err) => {
        if (err) {
          console.error('❌ 数据库连接失败:', err.message);
          reject(err);
        } else {
          console.log('✅ 数据库连接成功');
          this.isConnected = true;
          resolve(this.db);
        }
      });
    });
  }

  /**
   * 关闭数据库连接
   */
  async close() {
    if (!this.isConnected || !this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          console.error('❌ 关闭数据库失败:', err.message);
          reject(err);
        } else {
          console.log('✅ 数据库连接已关闭');
          this.isConnected = false;
          this.db = null;
          resolve();
        }
      });
    });
  }

  /**
   * 执行查询（返回多行）
   */
  async query(sql, params = []) {
    await this.connect();
    
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('❌ 查询失败:', err.message);
          console.error('SQL:', sql);
          console.error('参数:', params);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * 执行查询（返回单行）
   */
  async queryOne(sql, params = []) {
    await this.connect();
    
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('❌ 查询失败:', err.message);
          console.error('SQL:', sql);
          console.error('参数:', params);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * 执行更新/插入/删除
   */
  async run(sql, params = []) {
    await this.connect();
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          console.error('❌ 执行失败:', err.message);
          console.error('SQL:', sql);
          console.error('参数:', params);
          reject(err);
        } else {
          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  /**
   * 批量执行（事务）
   */
  async transaction(operations) {
    await this.connect();
    
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        const results = [];
        let completed = 0;
        let hasError = false;

        if (operations.length === 0) {
          this.db.run('COMMIT');
          resolve([]);
          return;
        }

        operations.forEach((op, index) => {
          if (hasError) return;

          this.db.run(op.sql, op.params || [], function(err) {
            if (err) {
              hasError = true;
              console.error(`❌ 事务执行失败 (${index + 1}):`, err.message);
              db.run('ROLLBACK');
              reject(err);
              return;
            }

            results[index] = {
              lastID: this.lastID,
              changes: this.changes
            };
            
            completed++;
            
            if (completed === operations.length) {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  console.error('❌ 事务提交失败:', commitErr.message);
                  reject(commitErr);
                } else {
                  resolve(results);
                }
              });
            }
          });
        });
      });
    });
  }

  /**
   * 获取表的记录数
   */
  async getCount(tableName, whereClause = '', params = []) {
    const sql = `SELECT COUNT(*) as count FROM ${tableName}${whereClause ? ' WHERE ' + whereClause : ''}`;
    const result = await this.queryOne(sql, params);
    return result ? result.count : 0;
  }

  /**
   * 检查表是否存在
   */
  async tableExists(tableName) {
    const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name=?`;
    const result = await this.queryOne(sql, [tableName]);
    return !!result;
  }

  /**
   * 获取数据库信息
   */
  async getDatabaseInfo() {
    const tables = await this.query(`
      SELECT name, sql FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);

    const info = {
      tables: [],
      totalTables: tables.length
    };

    for (const table of tables) {
      const count = await this.getCount(table.name);
      info.tables.push({
        name: table.name,
        rowCount: count,
        sql: table.sql
      });
    }

    return info;
  }
}

// 创建单例实例
const database = new Database();

// 优雅关闭处理
process.on('SIGINT', async () => {
  console.log('\n🛑 收到关闭信号，正在关闭数据库连接...');
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 收到终止信号，正在关闭数据库连接...');
  await database.close();
  process.exit(0);
});

module.exports = database;