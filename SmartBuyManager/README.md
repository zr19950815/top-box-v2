# SmartBuy Manager

SmartBuy Framework 的任务管理和监控系统，提供Web界面来管理多任务并发抢购、实时监控和日志分析。

## 🚀 快速启动

### 开发模式
```bash
# 安装依赖
npm install

# 初始化数据库
npm run db:init

# 启动开发服务（同时启动前后端）
npm run dev
```

### 生产模式
```bash
# 构建项目
npm run build

# 启动服务（使用PM2）
npm start
```

## 📋 核心功能

### 🎯 任务管理
- **一键上号**: 粘贴命令字符串即可启动任务
- **多任务并发**: 支持同时运行多个抢购任务
- **实时监控**: WebSocket实时更新任务状态
- **任务控制**: 启动/停止/暂停/恢复任务

### 📊 日志管理
- **智能分类**: 自动分类成功、失败、错误日志
- **实时收集**: 监听SmartBuy Framework输出
- **高效查询**: 按时间、平台、状态快速筛选
- **数据导出**: 支持导出日志和统计报告

### 📈 监控统计
- **成功率统计**: 实时计算各平台成功率
- **性能监控**: API响应时间、系统资源使用
- **图表展示**: 直观的数据可视化

## 🏗️ 系统架构

```
SmartBuyManager/
├── backend/              # Node.js + Express后端
│   ├── api/             # RESTful API接口
│   ├── management/      # 任务和日志管理核心
│   ├── database/        # SQLite数据库
│   └── config/          # 配置管理
├── frontend/            # React前端界面
├── shared/              # 前后端共享代码
└── storage/             # 数据存储目录
```

## 🔧 配置说明

### 环境变量
```bash
# 服务端口
PORT=3001

# 数据库路径
DB_PATH=./storage/database/smartbuy.db

# SmartBuy Framework路径
FRAMEWORK_PATH=../SmartBuyFramework

# 日志级别
LOG_LEVEL=info
```

### 集成现有框架
系统通过以下方式与SmartBuy Framework集成：
- **子进程调用**: 通过`child_process.spawn`执行现有CLI命令
- **日志监听**: 实时监听框架日志输出并分类存储
- **配置共享**: 复用现有的平台配置和商品配置

## 📱 Web界面

访问 `http://localhost:3000` 使用Web管理界面：

- **任务管理页**: 创建、监控、控制任务
- **日志查看页**: 分类查看、搜索、导出日志  
- **统计分析页**: 成功率、性能图表
- **系统监控页**: 服务状态、资源使用

## 🐳 Docker部署

```bash
# 构建并启动服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

## 📝 开发指南

### API文档
- `POST /api/tasks` - 创建任务
- `GET /api/tasks` - 获取任务列表
- `PUT /api/tasks/:id/stop` - 停止任务
- `GET /api/logs` - 获取日志
- `GET /api/monitoring/stats` - 获取统计信息

### WebSocket事件
- `task:created` - 任务创建
- `task:updated` - 任务状态更新
- `log:new` - 新日志产生
- `system:stats` - 系统状态更新

## 🚧 开发状态

- [x] 项目初始化
- [ ] TaskManager核心模块
- [ ] 基础API接口
- [ ] SQLite数据库
- [ ] React前端界面
- [ ] WebSocket实时通信
- [ ] Docker部署配置

## 📞 支持

如有问题请提交Issue或联系开发团队。