/**
 * 任务状态管理 - Zustand Store
 */

import { create } from 'zustand';
import { taskAPI } from '../services/api';

const useTaskStore = create((set, get) => ({
  // 状态
  tasks: [],
  currentTask: null,
  stats: {},
  loading: false,
  error: null,
  
  // 分页信息
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  },

  // 筛选条件
  filters: {
    status: '',
    platform: '',
    taskType: '',
    dateFrom: '',
    dateTo: '',
  },

  // 设置loading状态
  setLoading: (loading) => set({ loading }),

  // 设置错误信息
  setError: (error) => set({ error }),

  // 设置任务列表
  setTasks: (tasks, pagination) => set({ 
    tasks, 
    pagination: pagination || get().pagination 
  }),

  // 添加任务
  addTask: (task) => set((state) => ({
    tasks: [task, ...state.tasks],
    pagination: {
      ...state.pagination,
      total: state.pagination.total + 1,
    }
  })),

  // 更新任务
  updateTask: (taskId, updates) => set((state) => ({
    tasks: state.tasks.map(task => 
      task.id === taskId ? { ...task, ...updates } : task
    ),
    currentTask: state.currentTask?.id === taskId 
      ? { ...state.currentTask, ...updates } 
      : state.currentTask
  })),

  // 删除任务
  removeTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter(task => task.id !== taskId),
    currentTask: state.currentTask?.id === taskId ? null : state.currentTask,
    pagination: {
      ...state.pagination,
      total: Math.max(0, state.pagination.total - 1),
    }
  })),

  // 设置当前任务
  setCurrentTask: (task) => set({ currentTask: task }),

  // 设置统计信息
  setStats: (stats) => set({ stats }),

  // 设置筛选条件
  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters }
  })),

  // 设置分页
  setPagination: (pagination) => set((state) => ({
    pagination: { ...state.pagination, ...pagination }
  })),

  // Actions - 获取任务列表
  fetchTasks: async (page = 1, limit = 20) => {
    const { filters } = get();
    
    set({ loading: true, error: null });
    
    try {
      const params = {
        page,
        limit,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      };

      const response = await taskAPI.getTasks(params);
      
      if (response.success) {
        set({
          tasks: response.data.tasks,
          pagination: response.data.pagination,
          loading: false,
        });
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      set({ 
        loading: false, 
        error: error.message,
        tasks: [],
      });
    }
  },

  // Actions - 获取任务详情
  fetchTask: async (taskId) => {
    set({ loading: true, error: null });
    
    try {
      const response = await taskAPI.getTask(taskId);
      
      if (response.success) {
        set({
          currentTask: response.data,
          loading: false,
        });
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      set({ 
        loading: false, 
        error: error.message,
        currentTask: null,
      });
    }
  },

  // Actions - 创建任务
  createTask: async (taskData) => {
    set({ loading: true, error: null });
    
    try {
      const response = await taskAPI.createTask(taskData);
      
      if (response.success) {
        get().addTask(response.data);
        set({ loading: false });
        return response.data;
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      set({ 
        loading: false, 
        error: error.message 
      });
      throw error;
    }
  },

  // Actions - 启动任务
  startTask: async (taskId) => {
    try {
      const response = await taskAPI.startTask(taskId);
      
      if (response.success) {
        get().updateTask(taskId, { status: 'running' });
        return true;
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // Actions - 停止任务
  stopTask: async (taskId) => {
    try {
      const response = await taskAPI.stopTask(taskId);
      
      if (response.success) {
        get().updateTask(taskId, { status: 'stopped' });
        return true;
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // Actions - 删除任务
  deleteTask: async (taskId) => {
    try {
      const response = await taskAPI.deleteTask(taskId);
      
      if (response.success) {
        get().removeTask(taskId);
        return true;
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  // Actions - 批量操作
  batchOperation: async (action, taskIds) => {
    set({ loading: true, error: null });
    
    try {
      const response = await taskAPI.batchOperation(action, taskIds);
      
      if (response.success) {
        // 根据操作类型更新任务状态
        const { results } = response.data;
        results.forEach((result) => {
          if (result.success) {
            if (action === 'delete') {
              get().removeTask(result.id);
            } else if (action === 'stop') {
              get().updateTask(result.id, { status: 'stopped' });
            } else if (action === 'start') {
              get().updateTask(result.id, { status: 'running' });
            }
          }
        });
        
        set({ loading: false });
        return results;
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      set({ 
        loading: false, 
        error: error.message 
      });
      throw error;
    }
  },

  // Actions - 获取统计信息
  fetchStats: async () => {
    try {
      const response = await taskAPI.getStats();
      
      if (response.success) {
        set({ stats: response.data });
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('获取统计信息失败:', error);
      set({ error: error.message });
    }
  },

  // Actions - 清除错误
  clearError: () => set({ error: null }),

  // Actions - 重置状态
  reset: () => set({
    tasks: [],
    currentTask: null,
    stats: {},
    loading: false,
    error: null,
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      pages: 0,
    },
    filters: {
      status: '',
      platform: '',
      taskType: '',
      dateFrom: '',
      dateTo: '',
    },
  }),
}));

export default useTaskStore;