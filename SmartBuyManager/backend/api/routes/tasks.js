/**
 * 任务管理 API 路由
 */

const express = require('express');
const router = express.Router();
const TaskManager = require('../../management/task/TaskManager');

// 创建任务管理器实例
const taskManager = new TaskManager();

/**
 * 创建新任务 (上号功能)
 * POST /api/tasks
 */
router.post('/', async (req, res) => {
  try {
    const { commandString, description, priority } = req.body;

    // 验证必需参数
    if (!commandString) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: commandString'
      });
    }

    // 创建任务
    const task = await taskManager.createTask({
      commandString,
      description,
      priority
    });

    res.json({
      success: true,
      data: task
    });

  } catch (error) {
    console.error('创建任务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取任务统计信息 - 必须放在通用路由之前
 * GET /api/tasks/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await taskManager.getTaskStats();
    
    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('获取任务统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 批量操作任务 - 也要放在通用路由之前
 * POST /api/tasks/batch
 */
router.post('/batch', async (req, res) => {
  try {
    const { action, taskIds } = req.body;
    
    if (!action || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: '无效的批量操作参数'
      });
    }

    const results = [];
    
    for (const taskId of taskIds) {
      try {
        switch (action) {
          case 'stop':
            await taskManager.stopTask(taskId);
            results.push({ id: taskId, success: true });
            break;
          case 'start':
            await taskManager.startTask(taskId);
            results.push({ id: taskId, success: true });
            break;
          case 'delete':
            await taskManager.deleteTask(taskId);
            results.push({ id: taskId, success: true });
            break;
          default:
            results.push({ id: taskId, success: false, error: '不支持的操作' });
        }
      } catch (error) {
        results.push({ id: taskId, success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      data: {
        action,
        results
      }
    });

  } catch (error) {
    console.error('批量操作失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取任务列表
 * GET /api/tasks
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      platform,
      taskType,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20
    } = req.query;

    // 构建过滤条件
    const filters = {};
    if (status) filters.status = status;
    if (platform) filters.platform = platform;
    if (taskType) filters.taskType = taskType;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    const result = await taskManager.getTasks(
      filters,
      parseInt(page),
      parseInt(limit)
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('获取任务列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取任务详情
 * GET /api/tasks/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await taskManager.getTask(id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: '任务不存在'
      });
    }

    res.json({
      success: true,
      data: task
    });

  } catch (error) {
    console.error('获取任务详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 停止任务
 * PUT /api/tasks/:id/stop
 */
router.put('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    
    await taskManager.stopTask(id);
    
    res.json({
      success: true,
      message: '任务停止成功'
    });

  } catch (error) {
    console.error('停止任务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 启动任务
 * PUT /api/tasks/:id/start
 */
router.put('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    
    await taskManager.startTask(id);
    
    res.json({
      success: true,
      message: '任务启动成功'
    });

  } catch (error) {
    console.error('启动任务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 删除任务
 * DELETE /api/tasks/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await taskManager.deleteTask(id);
    
    res.json({
      success: true,
      message: '任务删除成功'
    });

  } catch (error) {
    console.error('删除任务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { router, taskManager };