/**
 * WebSocket服务封装
 */

import { io } from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  /**
   * 连接WebSocket
   */
  connect() {
    if (this.socket && this.isConnected) {
      return this.socket;
    }

    console.log('🔌 连接WebSocket服务器...');

    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;

    this.socket = io(wsUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
    });

    // 连接成功
    this.socket.on('connect', () => {
      console.log('✅ WebSocket连接成功, ID:', this.socket.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    // 连接断开
    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket连接断开:', reason);
      this.isConnected = false;
    });

    // 连接错误
    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket连接错误:', error);
      this.isConnected = false;
      this.reconnectAttempts++;
    });

    // 重连尝试
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 WebSocket重连尝试 ${attemptNumber}/${this.maxReconnectAttempts}`);
    });

    // 重连成功
    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`✅ WebSocket重连成功，尝试次数: ${attemptNumber}`);
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    return this.socket;
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      console.log('🔌 断开WebSocket连接');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * 监听事件
   */
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  /**
   * 移除事件监听
   */
  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  /**
   * 发送消息
   */
  emit(event, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    } else {
      console.warn('⚠️ WebSocket未连接，无法发送消息');
    }
  }

  /**
   * 订阅任务更新
   */
  subscribeTask(taskId) {
    this.emit('subscribe:task', taskId);
  }

  /**
   * 取消订阅任务
   */
  unsubscribeTask(taskId) {
    this.emit('unsubscribe:task', taskId);
  }

  /**
   * 获取连接状态
   */
  getConnectionState() {
    return {
      isConnected: this.isConnected,
      socketId: this.socket?.id,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// 创建单例实例
const wsService = new WebSocketService();

export default wsService;
