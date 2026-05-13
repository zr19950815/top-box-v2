/**
 * 测试用的模拟命令数据
 * ⚠️ 注意：这些都是测试数据，不会执行真实的抢购操作
 */

const mockCommands = {
  // KyArt平台测试命令
  kyart: {
    batch: 'ky批量-13800000000-test_token_123456-123456-测试商品001*2*10',
    quick: 'ky快捷-13800000001-test_token_789012-123456-测试商品002*1*15',
    list: 'ky列表-13800000002-test_token_345678-123456-测试商品003*3*8',
    combination: 'ky合成-13800000003-test_token_901234-123456-combo_test_001'
  },

  // HzMiss平台测试命令
  hzmiss: {
    batch: 'hz批量-13900000000-test_password_123-123456-测试商品101*5*20',
    quick: 'hz快捷-13900000001-test_password_456-123456-测试商品102*1*25',
    list: 'hz列表-13900000002-test_password_789-123456-测试商品103*2*12'
  },

  // 错误格式命令（用于测试错误处理）
  invalid: {
    missing_parts: 'ky批量-13800000000',
    wrong_format: 'invalid_command_format',
    empty_command: ''
  }
};

// 测试用户数据
const mockUsers = {
  user1: {
    account: '13800000000',
    token: 'test_token_123456',
    payPassword: '123456'
  },
  user2: {
    account: '13800000001', 
    token: 'test_token_789012',
    payPassword: '123456'
  },
  user3: {
    account: '13900000000',
    password: 'test_password_123',
    payPassword: '123456'
  }
};

// 测试商品数据
const mockProducts = {
  kyart: {
    product1: {
      id: '测试商品001',
      name: 'KyArt测试商品1',
      price: 10,
      quantity: 2
    },
    product2: {
      id: '测试商品002', 
      name: 'KyArt测试商品2',
      price: 15,
      quantity: 1
    }
  },
  hzmiss: {
    product1: {
      id: '测试商品101',
      name: 'HzMiss测试商品1', 
      price: 20,
      quantity: 5
    }
  }
};

module.exports = {
  mockCommands,
  mockUsers,
  mockProducts
};