# Remote Server

This project uses the global remote-server-assistant SSH config.

## Current Target

- Host: `124.221.245.146`
- User: `root`
- Port: `22`
- Remote project directory: `/www/wwwroot/top-box-v2`
- Authentication: `key`
- Last status: `success`
- Verification status: `passed`

## Current Runtime Status

- Last checked: `2026-08-11T15:59:16+08:00`
- Current release: `/www/wwwroot/top-box-v2/releases/20260811112400`
- Deployed Git revision: `main@0431b8b`
- Public URL: `http://124.221.245.146:3000`
- `smartbuy-manager`: PM2 `online`, single-instance fork mode
- `nginx`: `active`
- PM2 boot service: `enabled`
- Internal and Nginx-proxied health checks: `passed`

## Active Purchase Task

- Task ID: `task_1786420120041_hc_list_knxor`
- Platform/mode: `hc` / `list`
- Status: `running`
- Actual child processes: `1`
- Progress: `0/5`
- Latest behavior: product-list requests return 20 listings; no qualifying listing at or below the configured maximum price
- Current error: none

Secrets and private key contents are intentionally not stored here.

## Related Files

- `deployment-plan.md`: current deployment plan
- `remote-state.json`: latest machine-readable deployment state
- `deployment-log.md`: append-only deployment history
- `deployment-pattern.md`: reusable project-specific deployment pattern
