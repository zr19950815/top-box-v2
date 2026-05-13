/**
 * 主应用程序组件
 */

import React, { useEffect, useState } from 'react';
import './App.css';
import {
  Layout,
  Card,
  Row,
  Col,
  Space,
  Typography,
  Button,
  Badge,
  Statistic,
  message,
} from 'antd';
import {
  ReloadOutlined,
  WifiOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import TaskCreateModal from './components/TaskCreateModal';
import TaskTable from './components/TaskTable';
import useTaskStore from './stores/taskStore';
import wsService from './services/websocket';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const App = () => {
  const [wsConnected, setWsConnected] = useState(false);
  
  const {
    tasks,
    stats,
    loading,
    fetchTasks,
    fetchStats,
    updateTask,
  } = useTaskStore();

  // 初始化数据
  useEffect(() => {
    fetchTasks();
    fetchStats();
  }, []);

  // WebSocket 连接和事件监听
  useEffect(() => {
    const socket = wsService.connect();

    // 连接状态监听
    const handleConnect = () => {
      setWsConnected(true);
      message.success('实时连接已建立');
    };

    const handleDisconnect = () => {
      setWsConnected(false);
      message.warning('实时连接已断开');
    };

    // 任务状态更新监听
    const handleTaskUpdate = (taskUpdate) => {
      console.log('收到任务更新:', taskUpdate);
      updateTask(taskUpdate.taskId, taskUpdate.data);
    };

    // 任务日志监听
    const handleTaskLog = (logData) => {
      console.log('收到任务日志:', logData);
      // 这里可以添加日志显示逻辑
    };

    // 绑定事件监听器
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('task:update', handleTaskUpdate);
    socket.on('task:log', handleTaskLog);

    // 清理函数
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('task:update', handleTaskUpdate);
      socket.off('task:log', handleTaskLog);
      wsService.disconnect();
    };
  }, [updateTask]);

  // 刷新数据
  const handleRefresh = () => {
    fetchTasks();
    fetchStats();
  };

  // 计算统计数据
  const getTaskStats = () => {
    const total = tasks.length;
    const running = tasks.filter(t => t.status === 'running').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;

    return { total, running, pending, completed, failed };
  };

  const taskStats = getTaskStats();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        background: '#fff', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Title level={3} style={{ margin: 0 }}>
            SmartBuy 任务管理系统
          </Title>
          <Badge 
            status={wsConnected ? 'processing' : 'error'} 
            text={wsConnected ? '实时连接' : '连接断开'}
            style={{ marginLeft: 16 }}
          />
        </div>
        
        <Space>
          {wsConnected ? (
            <WifiOutlined style={{ color: '#52c41a' }} />
          ) : (
            <DisconnectOutlined style={{ color: '#ff4d4f' }} />
          )}
          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleRefresh}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: '24px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* 统计卡片 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="总任务"
                  value={taskStats.total}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="运行中"
                  value={taskStats.running}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="等待中"
                  value={taskStats.pending}
                  valueStyle={{ color: '#faad14' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="已完成"
                  value={taskStats.completed}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
          </Row>

          {/* 任务管理区域 */}
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>任务列表</Text>
                <TaskCreateModal />
              </div>
            }
            bodyStyle={{ padding: '24px' }}
          >
            <TaskTable />
          </Card>
        </Space>
      </Content>
    </Layout>
  );
};

export default App;
