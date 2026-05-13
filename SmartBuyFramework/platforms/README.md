# Platforms 平台适配层

这里是唯一可以包含平台特定逻辑的地方，负责将不同平台的API适配到统一接口。

## 目录结构

```
platforms/
├── kyart/                    # KyArt平台适配器
│   ├── KyArtAdapter.js       # KyArt适配器实现
│   ├── commands.js           # KyArt指令映射定义
│   ├── README.md            # KyArt平台说明
│   └── test/                # KyArt测试文件
│       └── adapter.test.js
├── hzmiss/                   # HzMiss平台适配器
│   ├── HzMissAdapter.js      # HzMiss适配器实现
│   ├── commands.js           # HzMiss指令映射定义
│   ├── README.md            # HzMiss平台说明
│   └── test/                # HzMiss测试文件
│       └── adapter.test.js
└── topbox/                   # TopBox平台适配器（规划中）
    └── README.md            # TopBox平台开发计划
```

## 接入要求

每个平台必须：
1. 继承PlatformAdapter抽象基类
2. 实现8个标准接口方法（4个抢购 + 2个支付 + 2个简单任务）  
3. 提供指令映射配置文件
4. 编写完整的测试用例

## 设计原则

- **唯一特异性**：只有这层可以包含平台特定代码
- **标准接口**：必须严格遵循PlatformAdapter接口定义
- **数据标准化**：输入输出数据必须符合框架标准格式