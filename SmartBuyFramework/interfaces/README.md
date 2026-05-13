# Interfaces 接口定义层

这里定义所有的抽象接口和数据格式，是框架的契约层。

## 目录结构

```
interfaces/
├── PlatformAdapter.js        # 平台适配器抽象基类 - 定义8个标准接口方法
├── auth/                     # 认证相关接口
│   ├── AuthManager.js        # 认证管理器接口
│   ├── TokenStore.js         # Token存储管理接口
│   └── CredentialManager.js  # 凭据管理器接口
└── DataTypes.js             # 标准数据格式定义
```

## 设计原则

- **纯定义**：只定义接口和数据格式，不包含具体实现
- **标准化**：所有平台必须遵循这些接口标准
- **版本稳定**：接口变更需要考虑向后兼容性