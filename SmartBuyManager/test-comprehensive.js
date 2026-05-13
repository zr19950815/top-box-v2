/**
 * 综合API测试脚本 - 使用测试数据
 */

const axios = require('axios');
const { mockCommands, mockUsers, mockProducts } = require('./test-data/mock-commands');

const API_BASE = 'http://localhost:3001/api';

class ComprehensiveAPITester {
  constructor() {
    this.baseURL = API_BASE;
    this.createdTasks = []; // 存储创建的测试任务ID
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  /**
   * 记录测试结果
   */
  recordTest(testName, success, error = null) {
    this.testResults.total++;
    if (success) {
      this.testResults.passed++;
      console.log(`✅ ${testName}: 通过`);
    } else {
      this.testResults.failed++;
      console.log(`❌ ${testName}: 失败`);
      if (error) {
        console.log(`   错误: ${error}`);
        this.testResults.errors.push({ test: testName, error });
      }
    }
  }

  /**
   * 测试基础接口连通性
   */
  async testBasicConnectivity() {
    console.log('\n🔗 === 基础连通性测试 ===');
    
    try {
      const response = await axios.get(`${this.baseURL}/health`);
      this.recordTest('健康检查接口', response.data.success);
      
      const statusResponse = await axios.get(`${this.baseURL}/status`);
      this.recordTest('系统状态接口', statusResponse.data.success);
    } catch (error) {
      this.recordTest('基础连通性', false, error.message);
    }
  }

  /**
   * 测试任务创建功能
   */
  async testTaskCreation() {
    console.log('\n📝 === 任务创建测试 ===');
    
    const testCases = [
      {
        name: 'KyArt批量任务',
        data: {
          commandString: mockCommands.kyart.batch,
          description: '测试KyArt批量下单功能',
          priority: 1
        }
      },
      {
        name: 'KyArt快捷任务', 
        data: {
          commandString: mockCommands.kyart.quick,
          description: '测试KyArt快捷下单功能',
          priority: 2
        }
      },
      {
        name: 'HzMiss批量任务',
        data: {
          commandString: mockCommands.hzmiss.batch,
          description: '测试HzMiss批量下单功能',
          priority: 1
        }
      }
    ];

    for (const testCase of testCases) {
      try {
        const response = await axios.post(`${this.baseURL}/tasks`, testCase.data);
        
        if (response.data.success) {
          this.createdTasks.push(response.data.data.id);
          this.recordTest(`创建${testCase.name}`, true);
          
          console.log(`   任务ID: ${response.data.data.id}`);
          console.log(`   平台: ${response.data.data.platform}`);
          console.log(`   模式: ${response.data.data.mode}`);
        } else {
          this.recordTest(`创建${testCase.name}`, false, response.data.error);
        }
      } catch (error) {
        this.recordTest(`创建${testCase.name}`, false, error.response?.data?.error || error.message);
      }
    }
  }

  /**
   * 测试错误处理
   */
  async testErrorHandling() {
    console.log('\n🚨 === 错误处理测试 ===');
    
    const errorTestCases = [
      {
        name: '空命令字符串',
        data: { commandString: '', description: '测试空命令' }
      },
      {
        name: '缺少必需参数',
        data: { description: '测试缺少commandString' }
      },
      {
        name: '格式错误的命令',
        data: { 
          commandString: mockCommands.invalid.wrong_format,
          description: '测试错误格式命令'
        }
      }
    ];

    for (const testCase of errorTestCases) {
      try {
        const response = await axios.post(`${this.baseURL}/tasks`, testCase.data);
        
        // 这些情况应该返回错误，如果成功了反而是问题
        if (!response.data.success) {
          this.recordTest(`错误处理-${testCase.name}`, true);
        } else {
          this.recordTest(`错误处理-${testCase.name}`, false, '应该返回错误但却成功了');
        }
      } catch (error) {
        // 期望的错误响应
        if (error.response?.status >= 400) {
          this.recordTest(`错误处理-${testCase.name}`, true);
        } else {
          this.recordTest(`错误处理-${testCase.name}`, false, error.message);
        }
      }
    }
  }

  /**
   * 测试任务查询功能
   */
  async testTaskQuerying() {
    console.log('\n🔍 === 任务查询测试 ===');
    
    try {
      // 测试获取任务列表
      const listResponse = await axios.get(`${this.baseURL}/tasks`);
      this.recordTest('获取任务列表', listResponse.data.success);
      
      if (listResponse.data.success) {
        const { tasks, pagination } = listResponse.data.data;
        console.log(`   返回任务数: ${tasks.length}`);
        console.log(`   总任务数: ${pagination.total}`);
      }

      // 测试分页查询
      const pageResponse = await axios.get(`${this.baseURL}/tasks?page=1&limit=2`);
      this.recordTest('分页查询', pageResponse.data.success);

      // 测试按状态筛选
      const statusResponse = await axios.get(`${this.baseURL}/tasks?status=pending`);
      this.recordTest('状态筛选', statusResponse.data.success);

      // 测试按平台筛选
      const platformResponse = await axios.get(`${this.baseURL}/tasks?platform=kyart`);
      this.recordTest('平台筛选', platformResponse.data.success);

      // 测试任务详情查询
      if (this.createdTasks.length > 0) {
        const detailResponse = await axios.get(`${this.baseURL}/tasks/${this.createdTasks[0]}`);
        this.recordTest('任务详情查询', detailResponse.data.success);
      }

    } catch (error) {
      this.recordTest('任务查询功能', false, error.message);
    }
  }

  /**
   * 测试任务统计功能
   */
  async testTaskStatistics() {
    console.log('\n📊 === 任务统计测试 ===');
    
    try {
      const response = await axios.get(`${this.baseURL}/tasks/stats`);
      
      if (response.data.success) {
        const stats = response.data.data;
        this.recordTest('任务统计', true);
        
        console.log('   统计信息:');
        console.log(`   - 总任务数: ${stats.total}`);
        console.log(`   - 运行中任务: ${stats.runningCount}/${stats.maxConcurrent}`);
        console.log(`   - 按状态统计:`, stats.byStatus);
        console.log(`   - 按平台统计:`, stats.byPlatform);
      } else {
        this.recordTest('任务统计', false, response.data.error);
      }
    } catch (error) {
      this.recordTest('任务统计', false, error.message);
    }
  }

  /**
   * 测试任务控制功能
   */
  async testTaskControl() {
    console.log('\n🎮 === 任务控制测试 ===');
    
    if (this.createdTasks.length === 0) {
      console.log('   ⚠️ 没有可用的测试任务，跳过控制功能测试');
      return;
    }

    const taskId = this.createdTasks[0];
    
    try {
      // 等待任务可能开始运行
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 测试停止任务
      const stopResponse = await axios.put(`${this.baseURL}/tasks/${taskId}/stop`);
      this.recordTest('停止任务', stopResponse.data.success);
      
      // 测试启动任务
      const startResponse = await axios.put(`${this.baseURL}/tasks/${taskId}/start`);
      this.recordTest('启动任务', startResponse.data.success);
      
      // 再次停止任务
      await new Promise(resolve => setTimeout(resolve, 500));
      await axios.put(`${this.baseURL}/tasks/${taskId}/stop`);
      
    } catch (error) {
      this.recordTest('任务控制', false, error.response?.data?.error || error.message);
    }
  }

  /**
   * 测试批量操作
   */
  async testBatchOperations() {
    console.log('\n📦 === 批量操作测试 ===');
    
    if (this.createdTasks.length < 2) {
      console.log('   ⚠️ 测试任务不足2个，跳过批量操作测试');
      return;
    }

    const taskIds = this.createdTasks.slice(0, 2);
    
    try {
      // 测试批量停止
      const batchStopResponse = await axios.post(`${this.baseURL}/tasks/batch`, {
        action: 'stop',
        taskIds: taskIds
      });
      
      this.recordTest('批量停止任务', batchStopResponse.data.success);
      
      if (batchStopResponse.data.success) {
        const results = batchStopResponse.data.data.results;
        const successCount = results.filter(r => r.success).length;
        console.log(`   成功停止: ${successCount}/${results.length} 个任务`);
      }
      
    } catch (error) {
      this.recordTest('批量操作', false, error.response?.data?.error || error.message);
    }
  }

  /**
   * 清理测试数据
   */
  async cleanupTestData() {
    console.log('\n🧹 === 清理测试数据 ===');
    
    let cleanedCount = 0;
    
    for (const taskId of this.createdTasks) {
      try {
        await axios.delete(`${this.baseURL}/tasks/${taskId}`);
        cleanedCount++;
      } catch (error) {
        console.log(`   ⚠️ 清理任务失败: ${taskId}`);
      }
    }
    
    console.log(`   清理完成: ${cleanedCount}/${this.createdTasks.length} 个测试任务`);
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    console.log('🚀 SmartBuy Manager API 综合测试开始...');
    console.log(`📊 使用测试数据，不会执行真实操作\n`);
    
    const startTime = Date.now();
    
    // 按顺序执行测试
    await this.testBasicConnectivity();
    await this.testTaskCreation();
    await this.testErrorHandling();
    await this.testTaskQuerying();
    await this.testTaskStatistics();
    await this.testTaskControl();
    await this.testBatchOperations();
    
    // 清理测试数据
    await this.cleanupTestData();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // 输出测试结果
    console.log('\n' + '='.repeat(50));
    console.log('📊 测试结果总结');
    console.log('='.repeat(50));
    console.log(`总测试数: ${this.testResults.total}`);
    console.log(`✅ 通过: ${this.testResults.passed}`);
    console.log(`❌ 失败: ${this.testResults.failed}`);
    console.log(`⏱️  用时: ${duration}秒`);
    console.log(`📈 成功率: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ 失败详情:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.test}: ${error.error}`);
      });
    }
    
    if (this.testResults.failed === 0) {
      console.log('\n🎉 所有测试通过！API功能正常');
      return true;
    } else {
      console.log('\n⚠️ 部分测试失败，请检查错误信息');
      return false;
    }
  }
}

// 运行测试
const tester = new ComprehensiveAPITester();
tester.runAllTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((error) => {
  console.error('❌ 测试运行异常:', error);
  process.exit(1);
});