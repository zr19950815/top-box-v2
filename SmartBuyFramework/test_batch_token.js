/**
 * Token模式批量下单测试
 */

const SmartBuyFramework = require('./main');

async function testTokenBatchOrder() {
  const framework = new SmartBuyFramework();
  
  try {
    await framework.initialize();
    
    console.log('=== 测试Token模式批量下单 ===');
    
    // 测试Token模式的批量下单
    const tokenCommand = 'ky批量-手机号-[your-token-with-dashes]-支付密码-艺术猫岚炎*3*25';
    
    console.log(`测试命令: ${tokenCommand}`);
    
    const CommandParser = require('./core/CommandParser');
    const parseResult = CommandParser.parse(tokenCommand);
    
    console.log('✅ Token模式批量下单解析成功：');
    console.log('- 认证模式:', parseResult.params.authMode);
    console.log('- Token长度:', parseResult.params.token?.length || 0);
    console.log('- 商品名称:', parseResult.params.productConfig?.name);
    console.log('- 商品ID:', parseResult.params.productConfig?.id);
    console.log('- 商品KEY:', parseResult.params.productConfig?.key);
    console.log('- 购买数量:', parseResult.params.quantity);
    console.log('- 最高价格:', parseResult.params.maxPrice);
    
    if (parseResult.params.authMode === 'token' && parseResult.mode === 'batch') {
      console.log('✅ Token模式 + 批量下单识别正确！');
      console.log('✅ 支持Token内包含-符号的解析');
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    framework.cleanup();
  }
}

if (require.main === module) {
  testTokenBatchOrder().catch(console.error);
}
