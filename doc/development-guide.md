# SmartBuy Framework 开发指南

## 📋 项目概述

SmartBuy Framework是一个高度抽象的多平台智能购买框架，支持多种抢购模式和无缝的平台扩展。

### 核心设计原则
- **平台无关性**：框架层完全抽象，不包含任何平台特定逻辑
- **策略模式**：支持列表、快捷、批量三种抢购策略
- **可扩展性**：新增平台只需实现8个标准接口方法
- **统一API**：所有平台使用相同的调用方式和参数格式

## 🏗️ 架构设计

```
SmartBuyFramework/
├── core/                           # 核心框架层（完全抽象）
├── processors/                     # 处理器层（完全抽象）
├── interfaces/                     # 接口定义层（完全抽象）
├── platforms/                      # 平台适配层（唯一包含平台逻辑）
├── utils/                          # 工具层（完全抽象）
├── cli.js                          # CLI入口
├── main.js                         # 程序入口
└── doc/                           # 开发文档
```

## 📝 详细任务分解

---

## 阶段一：核心架构搭建

### Task 1: 项目结构设计 
**目标**: 建立完整的目录结构
**输出**: 标准的目录结构和说明文档

#### 详细步骤：
1. 创建主要目录：
   - `core/` - 核心框架
   - `processors/` - 处理器  
   - `interfaces/` - 接口定义
   - `platforms/` - 平台适配器
   - `utils/` - 工具类

2. 创建子目录：
   - `core/strategies/` - 购买策略
   - `platforms/kyart/` - KyArt平台
   - `platforms/hzmiss/` - HzMiss平台

3. 创建核心文件框架（空文件，定义结构）

**验收标准**: 目录结构创建完成，每个目录都有README说明用途

---

### Task 2: PlatformAdapter接口定义
**目标**: 定义平台适配器的标准接口
**输出**: PlatformAdapter抽象基类

#### 详细步骤：
1. 定义8个核心抽象方法：
   ```javascript
   // 抢购相关（4个方法）
   async getProductList(productId, options)  // 获取商品列表
   async placeOrder(product)                // 普通下单
   async quickOrder(productId, quantity)    // 快捷下单  
   async batchOrder(productId, batchSize)   // 批量下单
   
   // 支付相关（2个方法）
   async getPaymentUrl(orderInfo)           // 获取支付链接
   async executePayment(paymentUrl, pwd)    // 执行支付
   
   // 简单任务（2个方法）
   async confirmCombination(combinationId)  // 确认合成
   async cancelResale(resaleId)             // 取消寄售
   ```

2. 定义标准数据格式：
   - Product对象格式
   - OrderInfo对象格式  
   - PaymentResult对象格式

3. 定义错误处理规范

**验收标准**: 接口清晰，所有方法都有详细JSDoc注释和类型定义

---

### Task 3: PurchaseStrategy抽象基类
**目标**: 实现模板方法模式的抢购策略基类
**输出**: 可复用的抢购流程控制逻辑

#### 详细步骤：
1. 实现核心模板方法：
   ```javascript
   async execute(config) {
     while (this.remainingQuantity > 0) {
       // 1. 获取并下单（抽象方法，子类实现）
       const orderResult = await this.acquireAndOrder(config);
       
       // 2. 检查订单（统一逻辑）
       const orderInfo = await this.checkOrderStatus(orderResult);
       
       // 3. 执行支付（统一逻辑）
       const paymentResult = await this.processPayment(orderInfo);
       
       // 4. 更新进度（统一逻辑）
       this.updateProgress(paymentResult);
     }
   }
   ```

2. 实现统一的辅助方法：
   - `updateProgress()` - 进度管理
   - `handleError()` - 错误处理
   - `delay()` - 延时控制

3. 定义抽象方法接口：
   - `acquireAndOrder()` - 由子类实现具体的获取下单逻辑

**验收标准**: 基类功能完整，模板方法清晰，抽象方法定义明确

---

### Task 4: 三种抢购策略实现
**目标**: 实现列表、快捷、批量三种抢购策略
**输出**: 三个具体策略类

#### 详细步骤：
1. **ListModeStrategy** - 列表模式：
   ```javascript
   async acquireAndOrder(config) {
     const products = await this.adapter.getProductList(config.productId);
     const bestProduct = this.filterBestProduct(products, config.maxPrice);
     if (!bestProduct) throw new Error('NO_QUALIFIED_PRODUCTS');
     return await this.adapter.placeOrder(bestProduct);
   }
   ```

2. **QuickModeStrategy** - 快捷模式：
   ```javascript
   async acquireAndOrder(config) {
     return await this.adapter.quickOrder(config.productId, 1);
   }
   ```

3. **BatchModeStrategy** - 批量模式：
   ```javascript  
   async acquireAndOrder(config) {
     const batchSize = Math.min(config.batchSize || 5, this.remainingQuantity);
     return await this.adapter.batchOrder(config.productId, batchSize);
   }
   ```

4. 实现商品筛选逻辑（ListMode专用）
5. 实现批量大小计算逻辑（BatchMode专用）

**验收标准**: 三个策略类功能完整，逻辑清晰，可独立测试

---

## 阶段二：🆕 认证层实现

### Task 5: AuthManager - 认证管理器
**目标**: 实现统一的认证管理和Token生命周期管理
**输出**: 完整的认证管理系统

#### 详细步骤：
1. 实现认证管理器核心逻辑：
   ```javascript
   class AuthManager {
     async authenticate(platform, credentials) {
       // 1. 检查是否存在有效Token
       const existingToken = await this.tokenStore.getToken(platform, credentials.account);
       if (existingToken && await this.validateToken(platform, existingToken.token)) {
         return { success: true, token: existingToken.token };
       }
       
       // 2. 调用平台登录API
       const adapter = this.platformRegistry.getAdapter(platform);
       const authResult = await adapter.login(credentials);
       
       // 3. 保存Token
       if (authResult.success) {
         await this.tokenStore.saveToken(platform, credentials.account, authResult);
       }
       
       return authResult;
     }
   }
   ```

2. 实现Token刷新和验证机制
3. 实现自动重试装饰器
4. 实现认证状态管理

**验收标准**: 认证流程完整，Token管理可靠，支持自动重试

---

### Task 6: TokenStore - Token存储管理器
**目标**: 实现安全的Token存储和管理
**输出**: 可靠的Token存储系统

#### 详细步骤：
1. 实现Token存储核心功能：
   ```javascript
   class TokenStore {
     async saveToken(platform, account, tokenData) {
       const data = {
         ...tokenData,
         platform,
         account,
         createdAt: new Date(),
         lastUsedAt: new Date()
       };
       
       // 加密存储Token
       const encryptedData = this.encrypt(JSON.stringify(data));
       await this.storage.set(this.getKey(platform, account), encryptedData);
     }
   }
   ```

2. 实现Token过期检查和清理
3. 实现Token加密存储
4. 实现批量Token管理

**验收标准**: Token存储安全，过期处理正确，性能良好

---

### Task 7: CredentialManager - 凭据管理器
**目标**: 实现安全的用户凭据管理
**输出**: 安全的凭据存储系统

#### 详细步骤：
1. 实现凭据加密存储：
   ```javascript
   class CredentialManager {
     async saveCredentials(platform, account, credentials) {
       const encryptedCredentials = {
         account: credentials.account,
         password: await this.encrypt(credentials.password),
         payPassword: credentials.payPassword ? await this.encrypt(credentials.payPassword) : undefined
       };
       
       await this.storage.set(this.getKey(platform, account), encryptedCredentials);
     }
   }
   ```

2. 实现凭据验证规则
3. 实现密码加密/解密机制
4. 实现凭据安全清理

**验收标准**: 凭据存储安全，加密可靠，验证有效

---

## 阶段三：处理器层实现

### Task 8: PaymentProcessor - 支付处理器
**目标**: 抽象化支付流程处理
**输出**: 统一的支付处理逻辑

#### 详细步骤：
1. 实现核心支付流程：
   ```javascript
   async process(orderInfo, payPassword) {
     const paymentUrl = await this.adapter.getPaymentUrl(orderInfo);
     const result = await this.adapter.executePayment(paymentUrl, payPassword);  
     return await this.verifyPaymentResult(result, orderInfo);
   }
   ```

2. 实现支付结果验证
3. 实现支付错误分类处理
4. 实现支付重试逻辑（可配置）

**验收标准**: 支付流程标准化，错误处理完善，支持重试机制

---

### Task 9: OrderProcessor - 订单处理器  
**目标**: 抽象化订单状态检查和处理
**输出**: 统一的订单处理逻辑

#### 详细步骤：
1. 实现订单状态检查：
   ```javascript
   async checkStatus(orderResult) {
     // 标准化不同平台的订单信息格式
     return this.normalizeOrderInfo(orderResult);
   }
   ```

2. 实现订单信息标准化
3. 实现订单状态轮询（如需要）
4. 实现订单超时处理

**验收标准**: 订单处理标准化，状态检查可靠，信息格式统一

---

## 阶段四：核心管理器实现

### Task 10: TaskExecutor - 任务执行器
**目标**: 统一的任务执行入口和调度
**输出**: 核心任务调度器

#### 详细步骤：
1. 实现任务类型路由：
   ```javascript
   async executeTask(taskType, config) {
     switch (taskType) {
       case 'smart-buy':
         return await this.executeSmartBuy(config);
       case 'combination':  
         return await this.adapter.confirmCombination(config.combinationId);
       case 'cancel-resale':
         return await this.adapter.cancelResale(config.resaleId);
     }
   }
   ```

2. 实现策略自动选择和初始化
3. 实现任务生命周期管理
4. 实现任务统计和监控

**验收标准**: 任务路由准确，策略选择正确，生命周期管理完善

---

### Task 11: CommandParser - 指令解析器
**目标**: 解析字符串指令为结构化配置
**输出**: 灵活的指令解析逻辑

#### 详细步骤：
1. 实现指令格式解析：
   ```javascript
   static parse(commandString) {
     // "ky列表-账号-密码-支付密码-商品*数量*价格"
     const [command, params] = commandString.split('-', 2);
     const commandInfo = this.getCommandInfo(command);
     const parsedParams = this.parseParams(params);
     return { ...commandInfo, params: parsedParams };
   }
   ```

2. 实现参数解析和验证
3. 实现指令映射管理
4. 实现解析错误处理

**验收标准**: 解析准确，错误处理完善，支持参数验证

---

### Task 12: PlatformRegistry - 平台注册中心
**目标**: 管理所有平台的注册和获取
**输出**: 平台管理核心组件

#### 详细步骤：
1. 实现平台注册机制：
   ```javascript
   static register(platformName, AdapterClass, commands) {
     this.platforms.set(platformName, AdapterClass);
     this.registerCommands(commands);
   }
   ```

2. 实现指令映射注册
3. 实现平台实例化管理
4. 实现注册状态检查

**验收标准**: 注册机制完善，平台管理清晰，支持动态注册

---

## 阶段五：平台适配器迁移

### Task 13: KyArtAdapter 迁移
**目标**: 将现有KyArt代码迁移到新框架
**输出**: 标准化的KyArt适配器

#### 详细步骤：
1. 创建KyArtAdapter类继承PlatformAdapter
2. 迁移现有API调用逻辑：
   - `getMarketGoodsList` → `getProductList`
   - `createMarketOrder` → `placeOrder`
   - 支付相关方法迁移

3. 实现8个标准接口方法
4. 保留平台特有的加密和签名逻辑
5. 标准化数据格式转换

**验收标准**: 功能完全迁移，接口标准化，原有功能正常

---

### Task 14: HzMissAdapter 迁移  
**目标**: 将现有HzMiss代码迁移到新框架
**输出**: 标准化的HzMiss适配器

#### 详细步骤：
1. 创建HzMissAdapter类继承PlatformAdapter
2. 迁移现有API调用逻辑：
   - `getCollectionMeta` → `getProductList`
   - `placeOrder` → 保持方法名
   - 支付相关方法迁移

3. 实现8个标准接口方法
4. 保留平台特有的支付逻辑
5. 标准化数据格式转换

**验收标准**: 功能完全迁移，接口标准化，原有功能正常

---

### Task 15: 指令定义文件创建
**目标**: 为KyArt和HzMiss创建指令映射
**输出**: commands.js配置文件

#### 详细步骤：
1. 创建KyArt指令映射：
   ```javascript
   // platforms/kyart/commands.js
   module.exports = {
     'ky列表': { platform: 'kyart', task: 'smart-buy', mode: 'list' },
     'ky快捷': { platform: 'kyart', task: 'smart-buy', mode: 'quick' },
     'ky批量': { platform: 'kyart', task: 'smart-buy', mode: 'batch' },
     'ky合成': { platform: 'kyart', task: 'combination' },
     'ky取消': { platform: 'kyart', task: 'cancel-resale' }
   };
   ```

2. 创建HzMiss指令映射
3. 验证指令唯一性和完整性

**验收标准**: 指令映射准确，支持所有业务场景，无冲突

---

## 阶段六：程序入口实现

### Task 16: main.js 程序入口
**目标**: 创建程序启动入口，注册所有平台
**输出**: 统一的程序启动逻辑

#### 详细步骤：
1. 实现平台自动注册：
   ```javascript
   // 导入所有平台适配器和指令
   const platforms = [
     { name: 'kyart', adapter: KyArtAdapter, commands: kyartCommands },
     { name: 'hzmiss', adapter: HzMissAdapter, commands: hzmissCommands }
   ];
   
   // 批量注册
   platforms.forEach(p => PlatformRegistry.register(p.name, p.adapter, p.commands));
   ```

2. 实现启动参数处理
3. 实现全局异常处理
4. 实现优雅退出处理

**验收标准**: 启动流程清晰，平台注册自动化，异常处理完善

---

### Task 17: cli.js CLI入口
**目标**: 创建简化的CLI入口，支持字符串指令
**输出**: 用户友好的命令行接口

#### 详细步骤：
1. 实现指令解析和路由：
   ```javascript
   async function main() {
     const commandString = process.argv[2];
     const { platform, task, mode, params } = CommandParser.parse(commandString);
     
     const AdapterClass = PlatformRegistry.getAdapter(platform);
     const adapter = new AdapterClass(params.token, params);
     
     const executor = new TaskExecutor();
     executor.init(adapter);
     await executor.executeTask(task, { ...params, mode });
   }
   ```

2. 实现帮助信息显示
3. 实现参数验证和错误提示
4. 实现执行状态显示

**验收标准**: CLI友好易用，错误提示清晰，支持帮助信息

---

### Task 18: 工具类实现
**目标**: 创建日志、验证等辅助工具
**输出**: 完善的工具类库

#### 详细步骤：
1. 实现Logger工具：
   - 支持不同日志级别
   - 支持文件和控制台输出
   - 支持格式化输出

2. 实现Validator工具：
   - 参数格式验证
   - 业务规则验证
   - 错误信息标准化

3. 实现其他辅助工具（如需要）

**验收标准**: 工具类功能完善，接口统一，使用简便

---

## 阶段七：测试验证

### Task 19-21: 功能测试
**目标**: 验证所有功能正常工作
**输出**: 完整的测试用例和结果

#### 详细步骤：
1. **KyArt平台测试**：
   - 列表模式抢购测试
   - 快捷模式抢购测试  
   - 批量模式抢购测试
   - 合成功能测试
   - 取消寄售功能测试

2. **HzMiss平台测试**：
   - 三种抢购模式测试
   - 合成和取消功能测试

3. **框架级测试**：
   - 指令解析测试
   - 平台切换测试
   - 错误处理测试
   - 并发执行测试

**验收标准**: 所有功能测试通过，性能满足要求，错误处理正确

---

## 阶段八：系统集成

### Task 22: 与现有系统集成
**目标**: 将新框架集成到现有的CLI系统
**输出**: 完整的集成方案

#### 详细步骤：
1. 分析现有TaskManager集成点
2. 实现兼容性适配器
3. 实现渐进式迁移方案
4. 保留现有API兼容性

**验收标准**: 集成无缝，现有功能不受影响，新旧系统共存

---

### Task 23: 扩展文档编写
**目标**: 编写完整的平台扩展指南
**输出**: 详细的开发文档

#### 详细步骤：
1. 编写新平台接入指南
2. 编写API参考文档
3. 编写最佳实践文档
4. 编写故障排除指南

**验收标准**: 文档完整准确，示例清晰，便于理解和使用

---

## 🎯 关键里程碑

1. **架构里程碑** (Tasks 1-4): 核心架构完成，可运行基本策略
2. **🆕 认证里程碑** (Tasks 5-7): 认证层完成，支持Token管理
3. **处理器里程碑** (Tasks 8-9): 处理器层完成，支付和订单处理统一
4. **框架里程碑** (Tasks 10-12): 核心管理器完成，框架基本可用
5. **迁移里程碑** (Tasks 13-15): 现有平台完全迁移到新框架
6. **集成里程碑** (Tasks 16-18): 用户界面完成，可独立使用
7. **发布里程碑** (Tasks 19-23): 测试完成，文档齐全，可正式发布

## 📋 每日开发检查清单

### 开发前检查：
- [ ] 明确当前任务的输入和输出
- [ ] 检查依赖任务是否完成
- [ ] 准备必要的测试数据

### 开发后检查：
- [ ] 代码符合架构设计原则
- [ ] 抽象层不包含平台特定逻辑  
- [ ] 接口定义清晰，JSDoc注释完整
- [ ] 基本功能测试通过
- [ ] 更新相关文档

### 阶段完成检查：
- [ ] 所有任务的验收标准都已满足
- [ ] 里程碑目标达成
- [ ] 相关测试全部通过
- [ ] 代码review完成
- [ ] 文档更新完整

---

*这个开发指南将指导整个SmartBuy Framework的开发过程，确保每个步骤都有明确的目标和验收标准。*