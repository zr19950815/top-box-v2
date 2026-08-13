/**
 * 敏感信息脱敏 —— 全项目单一来源。
 *
 * 任务指令里含登录米玛与支付米玛，这些值绝不能出现在 PM2 日志、数据库、
 * API 响应或 QQ 回复中。任何要外发或落盘的文本都必须先过这里，避免各处
 * 各写一份正则后逐渐走样。
 */

/** 手机号脱敏：保留前三后四。 */
function maskPhone(value) {
  const text = String(value || '');
  if (text.length < 7) return text ? '***' : '';
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

/**
 * 清洗任意文本中的敏感片段。
 * @param {string} message - 原始文本
 * @returns {string} 脱敏后的文本
 */
function redactSensitive(message) {
  return String(message ?? '')
    // 手机号
    .replace(/\b(1\d{2})\d{4}(\d{4})\b/g, '$1****$2')
    // 键值对形式的凭据：密码/米玛/token 等
    .replace(
      /((?:密码|米玛|口令|password|pass|pwd|pay_password|payPassword|payPwd|token|access_token|authorization)\s*[：:=]\s*)[^\s,，}\]]+/gi,
      '$1[已脱敏]'
    )
    // 指令串形式：把首段之后的所有分段整体抹掉，凭据都在其中。
    // 必须限定在行首或空白之后、且至少三段，否则会误伤 TOPBOX_RESULT 的 JSON
    // 里的 ISO 日期（2026-08-13）——那段文本要参与结果解析，被改写就会让
    // 成功通知整体失效。
    .replace(
      /(^|\s)((?:幻藏|hc|ky|hz|jl|bb|tb)[^\s-]*)(?:-[^\s-]+){3,}/gi,
      '$1$2-[已脱敏]'
    );
}

/**
 * 只保留指令类型，丢弃全部参数。用于入库与日志。
 * @param {string} commandString - 完整指令
 * @returns {string} 形如 `幻藏指定-[已脱敏]`
 */
function sanitizeCommandString(commandString) {
  const text = String(commandString || '').trim();
  if (!text) return '[已脱敏]';
  const [head] = text.split('-');
  return head ? `${head}-[已脱敏]` : '[已脱敏]';
}

module.exports = { redactSensitive, sanitizeCommandString, maskPhone };
