/**
 * PM2 生产环境配置
 */

module.exports = {
  apps: [
    {
      name: 'smartbuy-manager',
      script: 'backend/server.js',
      instances: 2,
      exec_mode: 'cluster',
      
      // 环境变量
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      
      // 开发环境变量
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
        LOG_LEVEL: 'debug'
      },
      
      // 内存和重启配置
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 5,
      
      // 日志配置
      error_file: './storage/logs/pm2-error.log',
      out_file: './storage/logs/pm2-out.log',
      log_file: './storage/logs/pm2-combined.log',
      time: true,
      
      // 监听文件变化（仅开发环境）
      watch: false,
      ignore_watch: [
        'node_modules',
        'frontend',
        'storage/logs',
        'storage/database'
      ],
      
      // 集群相关配置
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000
    }
  ],

  // 部署配置
  deploy: {
    production: {
      user: 'deploy',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:username/smartbuy-manager.git',
      path: '/var/www/smartbuy-manager',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
};