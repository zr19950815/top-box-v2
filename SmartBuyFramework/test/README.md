# Test 测试文件

这里包含框架级别的测试用例，各平台的测试用例在respective platforms目录下。

## 目录结构

```
test/
├── core/                    # 核心组件测试
│   ├── TaskExecutor.test.js
│   ├── CommandParser.test.js
│   └── strategies/          # 策略测试
├── processors/              # 处理器测试
│   ├── PaymentProcessor.test.js
│   └── OrderProcessor.test.js
├── integration/             # 集成测试
│   ├── end-to-end.test.js   # 端到端测试
│   └── platform-switch.test.js # 平台切换测试
└── utils/                   # 工具类测试
    ├── Logger.test.js
    └── Validator.test.js
```

## 测试原则

- **覆盖全面**：核心功能必须有测试覆盖
- **隔离性**：单元测试之间相互隔离，不依赖外部状态
- **真实性**：集成测试使用真实的数据和场景