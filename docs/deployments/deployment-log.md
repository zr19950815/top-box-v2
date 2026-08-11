# Deployment Log

## 2026-05-13T11:37:42+08:00 - failure

- Summary: Deployment script aborted locally before sync because it was sourced by zsh instead of bash
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `unknown`
- Git commit: `unknown`
- Working tree dirty: `None`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-05-13T11:37:42+08:00`
- Verification status: `not_run`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- First attempt did not reach remote deployment steps
- rerunning with bash

Notes: none

## 2026-05-13T11:38:48+08:00 - failure

- Summary: Deployment aborted while composing nginx config because nginx variables were not escaped in local bash script
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `unknown`
- Git commit: `unknown`
- Working tree dirty: `None`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-05-13T11:38:48+08:00`
- Verification status: `not_run`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- Release files may have synced, but current service was not switched
- rerunning with escaped nginx variables

Notes: none

## 2026-05-13T11:42:31+08:00 - failure

- Summary: Deployment synced release and initialized SQLite, but PM2 command was not found after global install in non-login shell
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `unknown`
- Git commit: `unknown`
- Working tree dirty: `None`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-05-13T11:42:31+08:00`
- Verification status: `not_run`

Services:
- smartbuy-manager

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health

Known issues:
- Switch to project-local SmartBuyManager/node_modules/.bin/pm2 and redeploy

Notes: none

## 2026-05-13T11:45:43+08:00 - success

- Summary: Deployed top-box-v2 SmartBuyManager with SmartBuyFramework to tool-124 using PM2 and Nginx
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `unknown`
- Git commit: `unknown`
- Working tree dirty: `None`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-05-13T11:45:43+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- nginx

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health
- http://127.0.0.1:3001/api/health

Known issues:
- PM2 is invoked from project-local SmartBuyManager/node_modules/.bin/pm2 instead of relying on global npm PATH

Notes: Current release: /www/wwwroot/top-box-v2/releases/20260513114255; public URL: http://124.221.245.146:3000; SQLite and logs persist under /www/wwwroot/top-box-v2/shared/storage

## 2026-08-11T11:29:00+08:00 - success

- Summary: 发布 HC 接口修复并更新 SmartBuy Manager 长任务执行逻辑
- Remote: `root@141.98.199.180:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `0431b8b`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-11T11:29:00+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- nginx

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health
- http://127.0.0.1:3001/api/health

Known issues:
- none

Notes: Current release: /www/wwwroot/top-box-v2/releases/20260811112400; rollback release: /www/wwwroot/top-box-v2/releases/20260513114255; NewBee impit common/init returned code 1; remote task count was 0 before restart

## 2026-08-11T11:30:21+08:00 - success

- Summary: 更正目标记录：已将 HC 修复版本成功发布到 tool-124
- Remote: `root@124.221.245.146:22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Auth method: `key`
- Git branch: `main`
- Git commit: `0431b8b`
- Working tree dirty: `True`
- Deployment plan: `docs/deployments/deployment-plan.md`
- Deployment pattern: `docs/deployments/deployment-pattern.md`
- Verified at: `2026-08-11T11:30:21+08:00`
- Verification status: `passed`

Services:
- smartbuy-manager
- nginx

Ports:
- 3000
- 3001

Health URLs:
- http://124.221.245.146:3000/api/health
- http://127.0.0.1:3001/api/health

Known issues:
- none

Notes: Correct target: root@124.221.245.146; current release: /www/wwwroot/top-box-v2/releases/20260811112400; rollback release: /www/wwwroot/top-box-v2/releases/20260513114255; previous entry inherited stale global host 141 and is superseded by this record

