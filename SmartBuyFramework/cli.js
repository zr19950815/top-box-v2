#!/usr/bin/env node

/**
 * SmartBuy Framework - CLI入口
 * 
 * 简化的命令行接口，支持字符串指令输入
 */

const SmartBuyFramework = require('./main');
const CommandParser = require('./core/CommandParser');
const { ErrorFactory } = require('./utils/ErrorTypes');

class CLI {
  constructor() {
    this.framework = new SmartBuyFramework();
  }

  /**
   * 解析命令行参数
   */
  parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      return { action: 'help' };
    }

    const firstArg = args[0];

    // 检查是否为帮助参数
    if (firstArg === '--help' || firstArg === '-h') {
      return { action: 'help' };
    }

    // 检查是否为版本参数
    if (firstArg === '--version' || firstArg === '-v') {
      return { action: 'version' };
    }

    // 检查是否为状态参数
    if (firstArg === '--status' || firstArg === '-s') {
      return { action: 'status' };
    }

    // 其他情况当作命令处理
    return {
      action: 'command',
      command: firstArg
    };
  }

  /**
   * 显示帮助信息
   */
  showHelp() {
    console.log(`
🚀 SmartBuy Framework CLI

📖 使用方法:
  node cli <指令>                    执行指令
  node cli --help                   显示此帮助信息
  node cli --version                显示版本信息
  node cli --status                 显示框架状态

${CommandParser.getHelp()}

🔧 示例:
  node cli ky列表-18812345678-pwd123-pay123-12345*2*100
  node cli hz快捷-13987654321-pwd456-pay456-67890*1*50
  node cli ky合成-18812345678-pwd123-pay123-combo123

⚠️  当前状态:
  框架基础架构已完成，正在等待平台适配器实现。
  完成适配器实现后即可正常使用。

📞 获取更多帮助:
  查看项目文档: ./doc/README.md
  架构设计文档: ./doc/architecture-design.md
    `);
  }

  /**
   * 显示版本信息
   */
  showVersion() {
    const packageInfo = require('./package.json');
    console.log(`SmartBuy Framework v${packageInfo.version}`);
  }

  /**
   * 显示框架状态
   */
  async showStatus() {
    try {
      console.log('🔧 初始化框架...');
      await this.framework.initialize();
      
      const status = this.framework.getStatus();
      
      console.log('\n📊 SmartBuy Framework 状态:');
      console.log(`  初始化状态: ${status.initialized ? '✅ 已初始化' : '❌ 未初始化'}`);
      console.log(`  注册平台数: ${Object.keys(status.platforms).length}`);
      console.log(`  可用指令数: ${status.commands}`);
      
      if (Object.keys(status.platforms).length > 0) {
        console.log('\n🏗️  已注册平台:');
        for (const [name, info] of Object.entries(status.platforms)) {
          console.log(`  • ${name} (v${info.version || 'unknown'})`);
        }
      } else {
        console.log('\n⚠️  当前无已注册平台，需要实现平台适配器');
      }

      if (status.currentTask) {
        console.log('\n⚡ 当前任务:');
        console.log(`  任务ID: ${status.currentTask.id}`);
        console.log(`  任务类型: ${status.currentTask.type}`);
        console.log(`  执行状态: ${status.currentTask.status}`);
      } else {
        console.log('\n💤 当前无运行中的任务');
      }

      console.log('\n');

    } catch (error) {
      console.error('❌ 获取状态失败:', error.message);
      process.exit(1);
    }
  }

  /**
   * 执行命令
   */
  async executeCommand(command) {
    try {
      console.log('🔧 初始化框架...');
      await this.framework.initialize();

      console.log('⚡ 执行命令...');
      const result = await this.framework.executeCommand(command);

      console.log('✅ 命令执行成功!');
      
      // 如果有结果，显示摘要
      if (result && typeof result === 'object') {
        if (result.completedQuantity !== undefined) {
          console.log(`📦 完成数量: ${result.completedQuantity}`);
        }
        if (result.successRate !== undefined) {
          console.log(`🎯 成功率: ${result.successRate}%`);
        }
      }

    } catch (error) {
      console.error('❌ 命令执行失败:', error.message);
      
      // 提供一些常见错误的帮助信息
      if (error.message.includes('Platform not found')) {
        console.log('\n💡 提示: 请检查平台名称是否正确，或者平台适配器是否已实现');
        console.log('   可用平台将在适配器实现后显示');
      } else if (error.message.includes('Command parsing failed')) {
        console.log('\n💡 提示: 请检查指令格式是否正确');
        console.log('   正确格式: <平台><任务>-<账号>-<密码>-<支付密码>-<参数>');
        console.log('   例如: ky列表-18812345678-pwd123-pay123-12345*2*100');
      } else if (error.message.includes('not initialized')) {
        console.log('\n💡 提示: 框架初始化失败，可能是平台适配器尚未实现');
      }

      process.exit(1);
    }
  }

  /**
   * 运行CLI
   */
  async run() {
    try {
      const args = this.parseArgs();

      switch (args.action) {
        case 'help':
          this.showHelp();
          break;

        case 'version':
          this.showVersion();
          break;

        case 'status':
          await this.showStatus();
          break;

        case 'command':
          await this.executeCommand(args.command);
          break;

        default:
          console.error('❌ 未知的操作');
          this.showHelp();
          process.exit(1);
      }

    } catch (error) {
      console.error('💥 CLI运行失败:', error.message);
      process.exit(1);

    } finally {
      // 清理资源
      if (this.framework) {
        this.framework.cleanup();
      }
    }
  }
}

// 优雅退出处理
process.on('SIGINT', () => {
  console.log('\n🛑 收到中断信号，正在退出...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 收到终止信号，正在退出...');
  process.exit(0);
});

// 运行CLI
if (require.main === module) {
  const cli = new CLI();
  cli.run();
}

module.exports = CLI;