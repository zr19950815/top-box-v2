/**
 * 任务列表表格组件
 */

import React, { useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Popconfirm,
  message,
  Tooltip,
  Typography,
  Dropdown,
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  MoreOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import useTaskStore from '../stores/taskStore';

const { Text } = Typography;

const TaskTable = () => {
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  
  const {
    tasks,
    loading,
    pagination,
    startTask,
    stopTask,
    deleteTask,
    batchOperation,
    fetchTasks,
  } = useTaskStore();

  // 状态标签配置
  const statusConfig = {
    pending: { color: 'blue', text: '等待中' },
    running: { color: 'green', text: '运行中' },
    completed: { color: 'success', text: '已完成' },
    failed: { color: 'error', text: '失败' },
    stopped: { color: 'default', text: '已停止' },
  };

  // 平台标签配置
  const platformConfig = {
    kyart: { color: 'purple', text: 'KyArt' },
    hzmiss: { color: 'orange', text: 'HzMiss' },
  };

  // 模式标签配置
  const modeConfig = {
    batch: { color: 'gold', text: '批量' },
    quick: { color: 'cyan', text: '快捷' },
    list: { color: 'lime', text: '列表' },
  };

  // 操作处理
  const handleStart = async (record) => {
    try {
      await startTask(record.id);
      message.success('任务启动成功');
    } catch (error) {
      message.error(`启动失败: ${error.message}`);
    }
  };

  const handleStop = async (record) => {
    try {
      await stopTask(record.id);
      message.success('任务停止成功');
    } catch (error) {
      message.error(`停止失败: ${error.message}`);
    }
  };

  const handleDelete = async (record) => {
    try {
      await deleteTask(record.id);
      message.success('任务删除成功');
    } catch (error) {
      message.error(`删除失败: ${error.message}`);
    }
  };

  // 批量操作
  const handleBatchOperation = async (action) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要操作的任务');
      return;
    }

    try {
      const results = await batchOperation(action, selectedRowKeys);
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;
      
      if (failCount === 0) {
        message.success(`批量${action === 'start' ? '启动' : action === 'stop' ? '停止' : '删除'}成功！`);
      } else {
        message.warning(`操作完成：成功${successCount}个，失败${failCount}个`);
      }
      
      setSelectedRowKeys([]);
    } catch (error) {
      message.error(`批量操作失败: ${error.message}`);
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '任务ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <Text code>{text.slice(-12)}</Text>
        </Tooltip>
      ),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 80,
      render: (platform) => {
        const config = platformConfig[platform] || { color: 'default', text: platform };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 80,
      render: (mode) => {
        if (!mode) return <Tag color="default">通用</Tag>;
        const config = modeConfig[mode] || { color: 'default', text: mode };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '命令',
      dataIndex: 'command_string',
      key: 'command_string',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <Text style={{ maxWidth: 200 }}>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (time) => dayjs(time).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        const canStart = ['pending', 'stopped', 'failed'].includes(record.status);
        const canStop = record.status === 'running';

        const items = [
          {
            key: 'detail',
            icon: <InfoCircleOutlined />,
            label: '查看详情',
            onClick: () => {
              // TODO: 实现任务详情查看
              message.info('任务详情功能开发中...');
            },
          },
        ];

        return (
          <Space size="small">
            {canStart && (
              <Button
                type="text"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleStart(record)}
              />
            )}
            {canStop && (
              <Button
                type="text"
                size="small"
                icon={<PauseCircleOutlined />}
                onClick={() => handleStop(record)}
              />
            )}
            <Popconfirm
              title="确认删除"
              description="删除后无法恢复，确定要删除这个任务吗？"
              onConfirm={() => handleDelete(record)}
              okText="确认"
              cancelText="取消"
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
            <Dropdown menu={{ items }} trigger={['click']}>
              <Button type="text" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  // 表格选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    getCheckboxProps: (record) => ({
      name: record.id,
    }),
  };

  // 分页处理
  const handleTableChange = (paginationConfig) => {
    const { current, pageSize } = paginationConfig;
    fetchTasks(current, pageSize);
  };

  return (
    <div>
      {/* 批量操作按钮 */}
      {selectedRowKeys.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Text>已选择 {selectedRowKeys.length} 个任务</Text>
            <Button size="small" onClick={() => handleBatchOperation('start')}>
              批量启动
            </Button>
            <Button size="small" onClick={() => handleBatchOperation('stop')}>
              批量停止
            </Button>
            <Popconfirm
              title="批量删除确认"
              description={`确定要删除选中的 ${selectedRowKeys.length} 个任务吗？`}
              onConfirm={() => handleBatchOperation('delete')}
              okText="确认"
              cancelText="取消"
            >
              <Button size="small" danger>
                批量删除
              </Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={tasks}
        loading={loading}
        rowKey="id"
        scroll={{ x: 1000 }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) =>
            `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        onChange={handleTableChange}
        size="small"
      />
    </div>
  );
};

export default TaskTable;