#!/usr/bin/env node
/**
 * 一次性数据清理：脱敏历史任务中的明文凭据。
 *
 * 任务脱敏是在 2026-08-13 的发布中引入的，只对新建任务生效。此前入库的
 * `command_string` 保存了完整指令（含登录米玛与支付米玛），`config` 里也留有
 * password / payPassword / token 字段。本脚本把它们改写成与新任务一致的形式。
 *
 * 用法：
 *   node scripts/redact-existing-tasks.js --dry-run   # 只报告，不改动
 *   node scripts/redact-existing-tasks.js             # 实际执行
 *
 * 幂等：已脱敏的记录会被跳过，可重复运行。
 */

const path = require('path');
const sqlite3 = require('sqlite3');
const { sanitizeCommandString, maskPhone } = require('../backend/utils/redact');

const dryRun = process.argv.includes('--dry-run');
const dbPath = process.env.DB_PATH
  || path.join(__dirname, '../storage/database/smartbuy.db');

const CREDENTIAL_KEYS = ['password', 'payPassword', 'token', 'auth'];

/** 与 TaskManager.sanitizeTaskConfig 保持一致的清洗规则。 */
function sanitizeConfig(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return { changed: false, value: raw };
  }
  if (!parsed || typeof parsed !== 'object') return { changed: false, value: raw };

  let changed = false;
  for (const key of CREDENTIAL_KEYS) {
    if (key in parsed) {
      delete parsed[key];
      changed = true;
    }
  }
  // 手机号只留脱敏值；已是脱敏形式的不再处理。
  if (parsed.account && !String(parsed.account).includes('*')) {
    parsed.account = maskPhone(parsed.account);
    changed = true;
  }
  return { changed, value: JSON.stringify(parsed) };
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(`❌ 无法打开数据库: ${dbPath}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); });
});

(async () => {
  console.log(`数据库: ${dbPath}`);
  console.log(dryRun ? '模式: 试运行（不写入）\n' : '模式: 实际执行\n');

  const rows = await all('SELECT id, command_string, config FROM tasks');
  let commandFixed = 0;
  let configFixed = 0;

  for (const row of rows) {
    const updates = {};

    // command_string：只保留指令类型。
    if (row.command_string && !row.command_string.includes('[已脱敏]')) {
      updates.command_string = sanitizeCommandString(row.command_string);
      commandFixed += 1;
    }

    // config：移除凭据字段，手机号脱敏。
    if (row.config) {
      const { changed, value } = sanitizeConfig(row.config);
      if (changed) {
        updates.config = value;
        configFixed += 1;
      }
    }

    const fields = Object.keys(updates);
    if (!fields.length) continue;

    console.log(`  ${row.id}`);
    if (updates.command_string) {
      console.log(`    command_string -> ${updates.command_string}`);
    }
    if (updates.config) {
      console.log('    config         -> 已移除凭据字段并脱敏手机号');
    }

    if (!dryRun) {
      const setClause = fields.map((field) => `${field} = ?`).join(', ');
      await run(
        `UPDATE tasks SET ${setClause} WHERE id = ?`,
        [...fields.map((field) => updates[field]), row.id]
      );
    }
  }

  console.log(`\n共 ${rows.length} 条任务`);
  console.log(`  command_string 需脱敏: ${commandFixed}`);
  console.log(`  config 需脱敏:         ${configFixed}`);

  if (dryRun) {
    console.log('\n试运行结束，未写入任何改动。');
  } else if (commandFixed || configFixed) {
    // 复查：确认库中不再残留明文。
    const after = await all('SELECT command_string, config FROM tasks');
    // 按解析后的键名判断，不能用子串匹配：config 里的 authMode 值为
    // "password"，`includes('"password"')` 会把它误判成残留凭据。
    const hasCredentialKey = (raw) => {
      try {
        const parsed = JSON.parse(raw || '{}');
        return CREDENTIAL_KEYS.some((key) => key in parsed);
      } catch (_) {
        return false;
      }
    };
    const leftover = after.filter((row) =>
      (row.command_string && !row.command_string.includes('[已脱敏]'))
      || hasCredentialKey(row.config)
    );
    console.log(leftover.length
      ? `\n⚠️ 仍有 ${leftover.length} 条未清理，请检查`
      : '\n✅ 清理完成，库中已无明文凭据字段');
  } else {
    console.log('\n无需清理。');
  }

  db.close();
})().catch((error) => {
  console.error(`❌ 执行失败: ${error.message}`);
  db.close();
  process.exit(1);
});
