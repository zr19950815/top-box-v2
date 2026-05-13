/**
 * API接口测试脚本
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

class APITester {
  constructor() {
    this.baseURL = API_BASE;
    this.createdTaskId = null;
  }

  /**
   * 测试健康检查接口
   */
  async testHealthCheck() {
    try {
      console.log('\n🏥 测试健康检查接口...');
      const response = await axios.get(`${this.baseURL}/health`);
      
      console.log('✅ 健康检查响应:', {
        success: response.data.success,
        uptime: `${Math.floor(response.data.uptime)}秒`,
        version: response.data.version
      });
      
      return response.data.success;
    } catch (error) {
      console.error('❌ 健康检查失败:', error.message);
      return false;
    }
  }

  /**
   * 测试系统状态接口
   */
  async testSystemStatus() {
    try {
      console.log('\n📊 测试系统状态接口...');
      const response = await axios.get(`${this.baseURL}/status`);
      
      const data = response.data.data;
      console.log('✅ 系统状态:', {
        服务器运行时间: `${Math.floor(data.server.uptime)}秒`,
        内存使用: `${Math.round(data.server.memory.heapUsed / 1024 / 1024)}MB`,
        数据库表数量: data.database.tables,
        数据库连接: data.database.connection ? '已连接' : '未连接',
        WebSocket客户端: data.websocket.connectedClients
      });
      
      return true;
    } catch (error) {
      console.error('❌ 系统状态测试失败:', error.message);
      return false;
    }
  }

  /**
   * 测试创建任务接口
   */
  async testCreateTask() {
    try {
      console.log('\n📝 测试创建任务接口...');
      
      const taskData = {
        commandString: 'ky批量-13800000000-test_token_123456-123456-测试商品*2*10',
        description: 'API测试任务 - 仅用于测试，不会执行真实操作',
        priority: 1
      };

      const response = await axios.post(`${this.baseURL}/tasks`, taskData);
      
      if (response.data.success) {
        this.createdTaskId = response.data.data.id;
        console.log('✅ 任务创建成功:', {
          任务ID: response.data.data.id,
          平台: response.data.data.platform,
          模式: response.data.data.mode,
          状态: response.data.data.status,
          创建时间: response.data.data.createdAt
        });
        return true;
      } else {
        console.error('❌ 任务创建失败:', response.data.error);
        return false;
      }
    } catch (error) {
      console.error('❌ 创建任务接口测试失败:', error.response?.data?.error || error.message);
      return false;
    }
  }

  /**
   * 测试获取任务列表接口
   */
  async testGetTasks() {
    try {
      console.log('\n📋 测试获取任务列表接口...');
      
      const response = await axios.get(`${this.baseURL}/tasks`);
      
      if (response.data.success) {
        const { tasks, pagination } = response.data.data;
        console.log('✅ 任务列表获取成功:', {
          任务总数: pagination.total,
          当前页面任务数: tasks.length,
          分页信息: `第${pagination.page}页，共${pagination.pages}页`
        });

        if (tasks.length > 0) {
          console.log('📝 最新任务信息:', {
            ID: tasks[0].id,
            状态: tasks[0].status,
            平台: tasks[0].platform,
            模式: tasks[0].mode
          });
        }
        
        return true;
      } else {
        console.error('❌ 获取任务列表失败:', response.data.error);
        return false;
      }
    } catch (error) {
      console.error('❌ 任务列表接口测试失败:', error.response?.data?.error || error.message);
      return false;
    }
  }

  /**
   * 测试获取任务详情接口
   */
  async testGetTaskDetail() {
    if (!this.createdTaskId) {
      console.log('\n⚠️ 跳过任务详情测试：没有可用的任务ID');
      return true;
    }

    try {
      console.log('\n🔍 测试获取任务详情接口...');
      
      const response = await axios.get(`${this.baseURL}/tasks/${this.createdTaskId}`);
      
      if (response.data.success) {
        const task = response.data.data;
        console.log('✅ 任务详情获取成功:', {
          任务ID: task.id,
          命令字符串: task.command_string,
          状态: task.status,
          平台: task.platform,
          任务类型: task.task_type,
          创建时间: task.created_at,
          更新时间: task.updated_at
        });
        return true;
      } else {
        console.error('❌ 获取任务详情失败:', response.data.error);
        return false;
      }
    } catch (error) {
      console.error('❌ 任务详情接口测试失败:', error.response?.data?.error || error.message);
      return false;
    }
  }

  /**
   * 测试停止任务接口
   */
  async testStopTask() {
    if (!this.createdTaskId) {
      console.log('\n⚠️ 跳过停止任务测试：没有可用的任务ID');
      return true;
    }

    try {
      console.log('\n🛑 测试停止任务接口...');
      
      // 等待一下，让任务有时间启动
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await axios.put(`${this.baseURL}/tasks/${this.createdTaskId}/stop`);
      
      if (response.data.success) {
        console.log('✅ 任务停止成功:', response.data.message);
        return true;
      } else {
        console.error('❌ 停止任务失败:', response.data.error);
        return false;
      }
    } catch (error) {
      console.error('❌ 停止任务接口测试失败:', error.response?.data?.error || error.message);
      return false;
    }
  }

  /**
   * 测试任务统计接口
   */
  async testTaskStats() {
    try {
      console.log('\n📈 测试任务统计接口...');
      
      const response = await axios.get(`${this.baseURL}/tasks/stats`);
      
      if (response.data.success) {
        const stats = response.data.data;
        console.log('✅ 任务统计获取成功:', {
          任务总数: stats.total,
          按状态统计: stats.byStatus,
          按平台统计: stats.byPlatform,
          当前运行任务: stats.runningCount,
          最大并发数: stats.maxConcurrent
        });
        return true;
      } else {
        console.error('❌ 获取任务统计失败:', response.data.error);
        return false;
      }
    } catch (error) {
      console.error('❌ 任务统计接口测试失败:', error.response?.data?.error || error.message);
      return false;
    }
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🚀 开始API接口测试...\n');
    
    const tests = [
      { name: '健康检查', func: () => this.testHealthCheck() },
      { name: '系统状态', func: () => this.testSystemStatus() },
      { name: '创建任务', func: () => this.testCreateTask() },
      { name: '任务列表', func: () => this.testGetTasks() },
      { name: '任务详情', func: () => this.testGetTaskDetail() },
      { name: '任务统计', func: () => this.testTaskStats() },
      { name: '停止任务', func: () => this.testStopTask() }
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (const test of tests) {
      try {
        const result = await test.func();
        if (result) {
          passedTests++;
        }
      } catch (error) {
        console.error(`❌ ${test.name}测试异常:`, error.message);
      }
      
      // 测试间隔，避免过于频繁
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n📊 测试结果总结:`);
    console.log(`✅ 通过: ${passedTests}/${totalTests}`);
    console.log(`❌ 失败: ${totalTests - passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
      console.log(`🎉 所有API接口测试通过！`);
    } else {
      console.log(`⚠️ 部分测试失败，请检查服务器日志`);
    }

    return passedTests === totalTests;
  }
}

// 运行测试
const tester = new APITester();
tester.runAllTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((error) => {
  console.error('❌ 测试运行异常:', error);
  process.exit(1);
});