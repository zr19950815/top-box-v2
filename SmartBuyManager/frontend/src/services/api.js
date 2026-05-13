/**
 * API服务封装
 */

import axios from 'axios';

// 创建axios实例
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    console.log('API请求:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('请求拦截器错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    console.log('API响应:', response.status, response.config.url);
    return response.data;
  },
  (error) => {
    console.error('API错误:', error.response?.status, error.message);
    
    // 统一错误处理
    const errorMessage = error.response?.data?.error || error.message || '请求失败';
    
    return Promise.reject(new Error(errorMessage));
  }
);

// 任务相关API
export const taskAPI = {
  // 获取任务列表
  getTasks: (params = {}) => {
    return api.get('/tasks', { params });
  },

  // 获取任务详情
  getTask: (taskId) => {
    return api.get(`/tasks/${taskId}`);
  },

  // 创建任务
  createTask: (data) => {
    return api.post('/tasks', data);
  },

  // 启动任务
  startTask: (taskId) => {
    return api.put(`/tasks/${taskId}/start`);
  },

  // 停止任务
  stopTask: (taskId) => {
    return api.put(`/tasks/${taskId}/stop`);
  },

  // 删除任务
  deleteTask: (taskId) => {
    return api.delete(`/tasks/${taskId}`);
  },

  // 批量操作
  batchOperation: (action, taskIds) => {
    return api.post('/tasks/batch', { action, taskIds });
  },

  // 获取统计信息
  getStats: () => {
    return api.get('/tasks/stats');
  },
};

// 系统相关API
export const systemAPI = {
  // 健康检查
  health: () => {
    return api.get('/health');
  },

  // 系统状态
  status: () => {
    return api.get('/status');
  },
};

export default api;
