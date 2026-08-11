module.exports = {
  apps: [
    {
      name: 'smartbuy-manager',
      cwd: '/www/wwwroot/top-box-v2/current/SmartBuyManager',
      script: 'backend/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      kill_timeout: 10000,
      time: true,
      error_file: '/www/wwwroot/top-box-v2/shared/storage/logs/pm2-error.log',
      out_file: '/www/wwwroot/top-box-v2/shared/storage/logs/pm2-out.log',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3001,
        DB_PATH: '/www/wwwroot/top-box-v2/shared/storage/database/smartbuy.db',
        FRAMEWORK_PATH: '/www/wwwroot/top-box-v2/current/SmartBuyFramework',
        CORS_ORIGIN: 'http://124.221.245.146:3000',
        LOG_LEVEL: 'info',
        MAX_CONCURRENT_TASKS: 10,
        TASK_TIMEOUT_MS: 0,
      },
    },
  ],
};
