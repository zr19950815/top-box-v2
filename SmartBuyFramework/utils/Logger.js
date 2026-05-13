/**
 * SmartBuy Framework - 日志工具
 * 
 * 支持多级别、多输出方式的日志记录
 */

const fs = require('fs');
const path = require('path');

class Logger {
  static levels = {
    ERROR: 0,
    WARN: 1, 
    INFO: 2,
    DEBUG: 3
  };

  static currentLevel = Logger.levels.INFO;
  static logFile = null;
  static enableConsole = true;

  /**
   * 设置日志级别
   * @param {string} level - 日志级别 (ERROR, WARN, INFO, DEBUG)
   */
  static setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.currentLevel = this.levels[level];
    }
  }

  /**
   * 设置日志文件
   * @param {string} filePath - 日志文件路径
   */
  static setLogFile(filePath) {
    this.logFile = filePath;
    
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 启用/禁用控制台输出
   * @param {boolean} enabled - 是否启用
   */
  static setConsoleOutput(enabled) {
    this.enableConsole = enabled;
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {*} [data] - 附加数据
   */
  static log(level, message, data = null) {
    const levelNum = this.levels[level];
    
    if (levelNum === undefined || levelNum > this.currentLevel) {
      return; // 级别不够，不记录
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };

    // 格式化日志消息
    const formattedMessage = this.formatMessage(logEntry);

    // 输出到控制台
    if (this.enableConsole) {
      this.outputToConsole(level, formattedMessage);
    }

    // 输出到文件
    if (this.logFile) {
      this.outputToFile(formattedMessage);
    }
  }

  /**
   * 格式化日志消息
   * @private
   * @param {Object} logEntry - 日志条目
   * @returns {string} 格式化后的消息
   */
  static formatMessage(logEntry) {
    let message = `[${logEntry.timestamp}] [${logEntry.level}] ${logEntry.message}`;
    
    if (logEntry.data !== null && logEntry.data !== undefined) {
      if (typeof logEntry.data === 'object') {
        message += '\n' + JSON.stringify(logEntry.data, null, 2);
      } else {
        message += ` | Data: ${logEntry.data}`;
      }
    }
    
    return message;
  }

  /**
   * 输出到控制台
   * @private
   * @param {string} level - 日志级别
   * @param {string} message - 格式化的消息
   */
  static outputToConsole(level, message) {
    switch (level) {
      case 'ERROR':
        console.error(message);
        break;
      case 'WARN':
        console.warn(message);
        break;
      case 'DEBUG':
        console.debug(message);
        break;
      default:
        console.log(message);
    }
  }

  /**
   * 输出到文件
   * @private
   * @param {string} message - 格式化的消息
   */
  static outputToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * 错误日志
   * @param {string} message - 消息
   * @param {*} [data] - 附加数据
   */
  static error(message, data = null) {
    this.log('ERROR', message, data);
  }

  /**
   * 警告日志
   * @param {string} message - 消息
   * @param {*} [data] - 附加数据
   */
  static warn(message, data = null) {
    this.log('WARN', message, data);
  }

  /**
   * 信息日志
   * @param {string} message - 消息
   * @param {*} [data] - 附加数据
   */
  static info(message, data = null) {
    this.log('INFO', message, data);
  }

  /**
   * 调试日志
   * @param {string} message - 消息
   * @param {*} [data] - 附加数据
   */
  static debug(message, data = null) {
    this.log('DEBUG', message, data);
  }
}

module.exports = Logger;