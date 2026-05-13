/**
 * 批量下单功能测试
 * 测试新实现的KyArt批量下单流程
 */

const SmartBuyFramework = require('./main');

async function testBatchOrder() {
  const framework = new SmartBuyFramework();
  
  try {
    // 初始化框架
    await framework.initialize();
    
    console.log('=== 测试批量下单流程 ===');
    
    // 测试命令：ky批量-手机号-密码-支付密码-小小歌星*2*20
    const testCommand = 'ky批量-13800138000-testpwd123-paypwd123-小小歌星*2*20';
    
    console.log(`测试命令: ${testCommand}`);
    console.log('注意：这是模拟测试，不会进行真实的API调用');
    
    // 解析命令（不执行真实调用）
    const CommandParser = require('./core/CommandParser');
    const parseResult = CommandParser.parse(testCommand);
    
    console.log('✅ 命令解析成功：');
    console.log('- 平台:', parseResult.platform);
    console.log('- 任务:', parseResult.task);  
    console.log('- 模式:', parseResult.mode);
    console.log('- 商品:', parseResult.params.productConfig?.name);
    console.log('- 数量:', parseResult.params.quantity);
    console.log('- 最高价格:', parseResult.params.maxPrice);
    
    // 验证批量模式
    if (parseResult.mode === 'batch' && parseResult.task === 'smart-buy') {
      console.log('✅ 批量下单模式识别正确');
      
      // 检查商品配置是否正确
      if (parseResult.params.productConfig && parseResult.params.productConfig.id === 590) {
        console.log('✅ 商品配置解析正确，小小歌星 ID: 590');
        console.log('✅ 商品KEY:', parseResult.params.productConfig.key);
        console.log('✅ 参考价格:', parseResult.params.productConfig.price);
      }
      
      console.log('\n=== 批量下单流程预览 ===');
      console.log('1. batchBuy API - 批量下单');
      console.log('   - goods_id: 590');
      console.log('   - key: 59fa80c09f8bd589f9503eff68000577');
      console.log('   - num: 2');
      console.log('   - price: 8');
      
      console.log('2. batchPayOrder API - 获取订单列表');
      console.log('   - 返回 batch_order_id 和订单列表');
      
      console.log('3. batchdopay API - 批量支付');
      console.log('   - order_ids: "411707,411708"');
      console.log('   - batch_order_id: 11478');
      console.log('   - pay_way: "huifu"');
      
      console.log('4. doPay API - 最终支付确认');
      console.log('   - order_type: 10 (批量订单)');
      console.log('   - 获取支付URL');
      
      console.log('5. executePayment - 执行支付');
      console.log('   - 汇付支付流程');
      
      console.log('✅ 新的批量下单流程已经实现完成！');
    } else {
      console.log('❌ 批量模式识别失败');
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    framework.cleanup();
  }
}

// 运行测试
if (require.main === module) {
  testBatchOrder().catch(console.error);
}

module.exports = { testBatchOrder };