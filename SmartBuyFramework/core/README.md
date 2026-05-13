# Core 核心框架层

这里包含框架的核心组件，完全抽象，不包含任何平台特定逻辑。

## 目录结构

```
core/
├── TaskExecutor.js          # 任务执行器 - 统一的任务执行入口和调度
├── CommandParser.js         # 指令解析器 - 解析字符串指令为结构化配置  
├── PlatformRegistry.js      # 平台注册中心 - 管理所有平台的注册和获取
└── strategies/              # 购买策略目录
    ├── PurchaseStrategy.js  # 抽象基类 - 模板方法模式
    ├── ListModeStrategy.js  # 列表模式策略
    ├── QuickModeStrategy.js # 快捷模式策略
    └── BatchModeStrategy.js # 批量模式策略
```

## 设计原则

- **平台无关性**：任何代码都不能包含平台特定逻辑
- **高度抽象**：提供统一的接口和流程控制
- **易于扩展**：新增功能通过接口扩展，不修改核心代码