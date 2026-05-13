# SmartBuy Manager - API 接口文档

## 📋 接口概览

Base URL: `http://localhost:3001/api`

所有 API 返回格式统一为：
```json
{
  "success": true,
  "message": "操作成功",
  "data": {},
  "timestamp": "2025-08-11T09:30:00.000Z"
}
```

## 🎯 任务管理 API

### 获取任务列表
**GET** `/tasks`

#### 查询参数
| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| limit | number | 否 | 每页数量，默认 20 |
| status | string | 否 | 任务状态筛选 |
| platform | string | 否 | 平台筛选 (kyart/hzmiss) |
| taskType | string | 否 | 任务类型筛选 |
| dateFrom | string | 否 | 开始日期 (YYYY-MM-DD) |
| dateTo | string | 否 | 结束日期 (YYYY-MM-DD) |

#### 响应示例
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "kyart_batch_1691234567890",
        "command_string": "ky批量-13800000000-test_token_123456-123456-测试商品001*2*10",
        "platform": "kyart",
        "task_type": "batch",
        "mode": "batch",
        "status": "pending",
        "priority": 1,
        "config": null,
        "progress": null,
        "error_message": null,
        "created_at": "2025-08-11T09:30:00.000Z",
        "started_at": null,
        "completed_at": null,
        "updated_at": "2025-08-11T09:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

### 获取任务详情
**GET** `/tasks/:id`

#### 路径参数
| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| id | string | 是 | 任务ID |

### 创建任务
**POST** `/tasks`

#### 请求体
```json
{
  "commandString": "ky批量-13800000000-test_token_123456-123456-测试商品001*2*10",
  "description": "测试任务描述",
  "priority": 1
}
```

#### 字段说明
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| commandString | string | 是 | 完整命令字符串 |
| description | string | 否 | 任务描述 |
| priority | number | 否 | 优先级 (1-10) |

### 启动任务
**PUT** `/tasks/:id/start`

#### 响应示例
```json
{
  "success": true,
  "message": "任务启动成功",
  "data": {
    "taskId": "kyart_batch_1691234567890",
    "status": "running",
    "startedAt": "2025-08-11T09:30:00.000Z"
  }
}
```

### 停止任务
**PUT** `/tasks/:id/stop`

### 删除任务
**DELETE** `/tasks/:id`

### 批量操作
**POST** `/tasks/batch`

#### 请求体
```json
{
  "action": "start",
  "taskIds": ["task_1", "task_2", "task_3"]
}
```

#### 字段说明
| 字段 | 类型 | 必选 | 说明 |
|------|------|------|------|
| action | string | 是 | 操作类型: start/stop/delete |
| taskIds | array | 是 | 任务ID数组 |

#### 响应示例
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "task_1",
        "success": true,
        "message": "操作成功"
      },
      {
        "id": "task_2",
        "success": false,
        "message": "任务不存在"
      }
    ],
    "summary": {
      "total": 2,
      "success": 1,
      "failed": 1
    }
  }
}
```

### 获取任务统计
**GET** `/tasks/stats`

#### 响应示例
```json
{
  "success": true,
  "data": {
    "total": 100,
    "pending": 20,
    "running": 5,
    "completed": 70,
    "failed": 5,
    "stopped": 0,
    "platformStats": {
      "kyart": 60,
      "hzmiss": 40
    },
    "todayStats": {
      "created": 15,
      "completed": 12,
      "successRate": 0.8
    }
  }
}
```

## 🖥️ 系统 API

### 健康检查
**GET** `/health`

#### 响应示例
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 3600,
    "timestamp": "2025-08-11T09:30:00.000Z",
    "version": "1.0.0"
  }
}
```

### 系统状态
**GET** `/status`

#### 响应示例
```json
{
  "success": true,
  "data": {
    "server": {
      "uptime": 3600,
      "memory": {
        "used": 50.5,
        "total": 1024
      },
      "cpu": 15.2
    },
    "database": {
      "connected": true,
      "size": "2.5MB"
    },
    "websocket": {
      "connected": true,
      "clients": 2
    },
    "tasks": {
      "running": 3,
      "queued": 5
    }
  }
}
```

## 📡 WebSocket 事件

WebSocket 连接地址: `ws://localhost:3001`

### 客户端发送事件

#### 订阅任务更新
```json
{
  "event": "subscribe:task",
  "data": "task_id_here"
}
```

#### 取消订阅任务
```json
{
  "event": "unsubscribe:task",
  "data": "task_id_here"
}
```

### 服务器推送事件

#### 任务状态更新
```json
{
  "event": "task:update",
  "data": {
    "taskId": "kyart_batch_1691234567890",
    "data": {
      "status": "running",
      "progress": "50%",
      "updated_at": "2025-08-11T09:30:00.000Z"
    }
  }
}
```

#### 任务日志
```json
{
  "event": "task:log",
  "data": {
    "taskId": "kyart_batch_1691234567890",
    "level": "info",
    "message": "正在处理商品...",
    "timestamp": "2025-08-11T09:30:00.000Z"
  }
}
```

#### 系统统计更新
```json
{
  "event": "system:stats",
  "data": {
    "runningTasks": 3,
    "pendingTasks": 5,
    "timestamp": "2025-08-11T09:30:00.000Z"
  }
}
```

## 📝 命令字符串格式

### KyArt 平台
```
ky{模式}-{手机号}-{token}-{支付密码}-{商品信息}
```

**示例**:
- `ky批量-13800000000-test_token_123456-123456-测试商品001*2*10`
- `ky快捷-13800000001-test_token_789012-123456-测试商品002*1*15`
- `ky列表-13800000002-test_token_345678-123456-测试商品003*3*8`

### HzMiss 平台
```
hz{模式}-{手机号}-{密码}-{支付密码}-{商品信息}
```

**示例**:
- `hz批量-13900000000-test_password_123-123456-测试商品101*5*20`
- `hz快捷-13900000001-test_password_456-123456-测试商品102*1*25`

### 字段说明
- **模式**: 批量/快捷/列表
- **认证信息**: KyArt 使用 token，HzMiss 使用密码
- **商品信息**: 格式为 `商品ID*数量*最高价格`

## ❌ 错误码说明

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| 400 | 400 | 请求参数错误 |
| 404 | 404 | 资源不存在 |
| 409 | 409 | 任务状态冲突 |
| 500 | 500 | 服务器内部错误 |

### 错误响应格式
```json
{
  "success": false,
  "error": "任务不存在",
  "code": "TASK_NOT_FOUND",
  "timestamp": "2025-08-11T09:30:00.000Z"
}
```

## 🔧 请求示例

### 使用 curl
```bash
# 获取任务列表
curl -X GET "http://localhost:3001/api/tasks?page=1&limit=10"

# 创建任务
curl -X POST "http://localhost:3001/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "commandString": "ky批量-13800000000-test_token_123456-123456-测试商品001*2*10",
    "description": "测试任务",
    "priority": 1
  }'

# 启动任务
curl -X PUT "http://localhost:3001/api/tasks/kyart_batch_1691234567890/start"
```

### 使用 JavaScript (Axios)
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api'
});

// 获取任务列表
const tasks = await api.get('/tasks', {
  params: { page: 1, limit: 10 }
});

// 创建任务
const task = await api.post('/tasks', {
  commandString: 'ky批量-13800000000-test_token_123456-123456-测试商品001*2*10',
  description: '测试任务',
  priority: 1
});

// 启动任务
await api.put(`/tasks/${task.data.id}/start`);
```

---

**最后更新**: 2025-08-11  
**API 版本**: v1.0.0