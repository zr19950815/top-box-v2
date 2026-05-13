# SmartBuy Manager - 开发指南

## 🚀 快速启动

### 前置要求
- Node.js >= 16.0.0
- npm >= 8.0.0
- Git

### 开发环境启动
```bash
# 克隆项目 (如需要)
cd /Users/zhangrui2/Desktop/workSpace/ky/top-box-v2/SmartBuyManager/

# 安装依赖
npm install

# 启动后端服务 (端口: 3001)
npm run dev:backend

# 启动前端服务 (端口: 5173)
npm run dev:frontend

# 或同时启动前后端
npm run dev
```

### 访问地址
- **前端界面**: http://localhost:5173/
- **后端API**: http://localhost:3001/api
- **WebSocket**: ws://localhost:3001

## 📁 项目架构

```
SmartBuyManager/
├── backend/                 # 后端服务
│   ├── api/routes/         # API 路由
│   ├── config/             # 配置文件
│   ├── database/           # 数据库相关
│   ├── management/         # 业务逻辑
│   │   ├── task/          # 任务管理
│   │   └── logging/       # 日志管理
│   └── server.js          # 服务器入口
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/    # React 组件
│   │   ├── services/      # API 和 WebSocket 服务
│   │   ├── stores/        # Zustand 状态管理
│   │   └── App.jsx        # 主应用组件
│   └── package.json
├── shared/                 # 共享代码
├── storage/                # 存储目录
│   ├── database/          # SQLite 数据库
│   ├── logs/              # 日志文件
│   └── uploads/           # 上传文件
├── doc/                    # 项目文档
└── package.json           # 根项目配置
```

## 🔧 开发工具和命令

### 后端开发
```bash
# 启动后端开发服务器 (nodemon)
npm run dev:backend

# 运行后端测试
npm run test:backend

# 运行 API 测试
node test-api.js

# 运行综合测试
node test-comprehensive.js
```

### 前端开发
```bash
# 启动前端开发服务器 (Vite)
npm run dev:frontend

# 构建前端生产版本
npm run build:frontend

# 预览生产构建
npm run preview:frontend
```

### 数据库操作
```bash
# 初始化数据库
node backend/database/init.js

# 重置数据库 (清空所有数据)
rm storage/database/smartbuy.db && node backend/database/init.js
```

## 🛠️ 技术栈

### 后端技术
- **框架**: Express.js
- **数据库**: SQLite3
- **实时通信**: Socket.io
- **进程管理**: PM2
- **开发工具**: Nodemon

### 前端技术
- **框架**: React 18
- **构建工具**: Vite
- **UI 库**: Ant Design
- **状态管理**: Zustand
- **HTTP 客户端**: Axios
- **实时通信**: Socket.io-client

### 开发和部署
- **容器化**: Docker + Docker Compose
- **代码规范**: ESLint
- **版本控制**: Git

## 📊 数据库设计

### 主要数据表

#### tasks 表
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,                    -- 任务唯一标识
    command_string TEXT NOT NULL,          -- 完整命令字符串
    platform TEXT NOT NULL,               -- 平台 (kyart/hzmiss)
    task_type TEXT NOT NULL,              -- 任务类型
    mode TEXT,                             -- 模式 (batch/quick/list)
    status TEXT NOT NULL DEFAULT 'pending', -- 状态
    priority INTEGER DEFAULT 1,           -- 优先级
    config TEXT,                           -- 配置信息 (JSON)
    progress TEXT,                         -- 进度信息 (JSON)
    error_message TEXT,                    -- 错误信息
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### logs 表 (待实现)
```sql
CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    level TEXT NOT NULL,                   -- info/warn/error
    category TEXT,                         -- success/error/payment_error
    message TEXT NOT NULL,
    data TEXT,                             -- 附加数据 (JSON)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

## 🌐 API 接口

### 任务管理 API
- `GET /api/tasks` - 获取任务列表
- `GET /api/tasks/:id` - 获取任务详情
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id/start` - 启动任务
- `PUT /api/tasks/:id/stop` - 停止任务
- `DELETE /api/tasks/:id` - 删除任务
- `POST /api/tasks/batch` - 批量操作
- `GET /api/tasks/stats` - 获取统计信息

### 系统 API
- `GET /api/health` - 健康检查
- `GET /api/status` - 系统状态

### WebSocket 事件
- `task:update` - 任务状态更新
- `task:log` - 任务日志
- `system:stats` - 系统统计更新

## 🧪 测试

### 测试数据
项目包含完整的测试数据，不会影响生产环境：
- 测试账号和token信息
- 模拟的商品和价格数据
- 各种任务状态模拟

### 运行测试
```bash
# API 功能测试
node test-api.js

# 综合功能测试
node test-comprehensive.js
```

## 🚀 生产部署

### Docker 部署
```bash
# 构建和启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### PM2 部署
```bash
# 启动集群模式
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 重启服务
pm2 restart smartbuy-manager
```

## 📝 代码规范

### 文件命名
- React 组件：PascalCase (例: `TaskCreateModal.jsx`)
- 工具函数：camelCase (例: `apiService.js`)
- 常量文件：kebab-case (例: `task-constants.js`)

### 代码风格
- 使用 ESLint 进行代码检查
- React Hooks 优先于 Class 组件
- 错误处理必须完整
- 添加必要的注释和文档

## 🔍 调试技巧

### 后端调试
- 查看服务器日志：`npm run dev:backend`
- 数据库查看：使用 SQLite 工具查看 `storage/database/smartbuy.db`
- API 测试：使用 Postman 或运行测试脚本

### 前端调试
- React Developer Tools
- 浏览器开发者工具 Network 面板
- WebSocket 连接状态检查

### 常见问题
1. **WebSocket 连接失败**：检查后端服务是否启动
2. **API 调用失败**：检查跨域配置和端口冲突
3. **数据库错误**：检查数据库文件权限和路径

---

**最后更新**: 2025-08-11  
**文档版本**: v1.0.0