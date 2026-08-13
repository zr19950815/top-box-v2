/**
 * 自适应请求间隔控制器。
 *
 * 设计取向：从**已验证安全**的间隔起步，连续成功后小步提速；一旦被拦截立刻
 * 大步退避，并把该档标记为不安全。这样运行期始终停留在可行区间内，而不是先
 * 撞墙再回退——EdgeOne 拦截的代价是分钟级冷却，期间完全无法抢单，远高于平时
 * 快几十毫秒的收益。
 *
 * 退避比提速果断（默认 4 档 vs 1 档）：代价不对称，探过头的损失远大于慢一点。
 *
 * 状态可持久化，避免每次重启都从头试探；但设有效期，因为临界值随时段、出口
 * IP 与平台策略变化，不是常数。
 */
class AdaptiveIntervalController {
  /**
   * @param {Object} options
   * @param {number} options.baseInterval - 起始间隔（ms）
   * @param {number} [options.minInterval=300] - 最快间隔下限
   * @param {number} [options.maxInterval=1000] - 最慢间隔上限
   * @param {number} [options.step=50] - 每档调整幅度
   * @param {number} [options.successThreshold=20] - 连续成功多少次后提速一档
   * @param {number} [options.blockBackoffSteps=4] - 被拦截时退避档数
   * @param {number} [options.errorBackoffSteps=1] - 一般异常退避档数
   * @param {number} [options.blockedRetryMs=1800000] - 多久后允许重试被拦截的档位
   * @param {(message: string) => void} [options.onAdjust] - 调整时的回调，用于日志
   * @param {() => number} [options.now] - 取当前时间，便于测试
   */
  constructor(options = {}) {
    this.minInterval = Number(options.minInterval ?? 300);
    this.maxInterval = Number(options.maxInterval ?? 1000);
    this.step = Math.max(1, Number(options.step ?? 50));
    this.successThreshold = Math.max(1, Number(options.successThreshold ?? 20));
    this.blockBackoffSteps = Math.max(1, Number(options.blockBackoffSteps ?? 4));
    this.errorBackoffSteps = Math.max(1, Number(options.errorBackoffSteps ?? 1));
    this.blockedRetryMs = Number(options.blockedRetryMs ?? 30 * 60 * 1000);
    this.onAdjust = typeof options.onAdjust === 'function' ? options.onAdjust : null;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    // 必须在首次 clamp() 之前初始化：getEffectiveMin() 会读它。
    this.sharedMinInterval = 0;

    this.baseInterval = this.clamp(Number(options.baseInterval ?? 500));
    this.interval = this.baseInterval;
    this.consecutiveSuccesses = 0;

    // 已知会被拦截的最快间隔。提速时不越过它，避免反复去撞同一面墙。
    this.blockedInterval = null;
    // 上次被拦截的时刻。这道墙不是永久的——平台限制随时段与策略变化，
    // 长时间未再被拦截就应允许重新试探，否则一次偶发拦截会永久压低上限。
    this.blockedAt = null;
  }

  /**
   * 被拦截的档位是否仍然有效。超过 blockedRetryMs 未再被拦截即视为可重试。
   * @private
   */
  isBlockedStillValid() {
    if (this.blockedInterval === null) return false;
    if (!Number.isFinite(this.blockedRetryMs) || this.blockedRetryMs <= 0) return true;
    if (this.blockedAt === null) return true;
    return (this.now() - this.blockedAt) < this.blockedRetryMs;
  }

  clamp(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this.baseInterval ?? this.maxInterval;
    return Math.min(this.maxInterval, Math.max(this.getEffectiveMin(), Math.round(numeric)));
  }

  /**
   * 当前生效的最快间隔。取配置下限与并发分摊下限中较慢者。
   *
   * 并发分摊是必要的：购买任务各自是独立进程，若每个都只看自己，就会一起探到
   * 下限——各自都没被拦截，但平台侧合计流量早已超标。
   * @private
   */
  getEffectiveMin() {
    return Math.max(this.minInterval, this.sharedMinInterval || 0);
  }

  /**
   * 按当前活跃进程数收紧或放宽下限。
   * @param {number} sharedMinInterval - 分摊后的最快间隔（ms）
   * @returns {boolean} 是否因此调慢了当前间隔
   */
  setSharedMinInterval(sharedMinInterval) {
    const value = Number(sharedMinInterval);
    this.sharedMinInterval = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

    // 下限收紧后，当前值可能已经过快，立刻拉回合法区间。
    const bounded = this.clamp(this.interval);
    if (bounded === this.interval) return false;

    const previous = this.interval;
    this.interval = bounded;
    this.log(`并发分摊，降速 ${previous}ms → ${this.interval}ms`);
    return true;
  }

  /** 当前应使用的间隔（ms）。 */
  getInterval() {
    return this.interval;
  }

  /**
   * 记录一次成功请求。累计到阈值后提速一档。
   * @returns {boolean} 是否发生了提速
   */
  recordSuccess() {
    this.consecutiveSuccesses += 1;
    if (this.consecutiveSuccesses < this.successThreshold) return false;

    this.consecutiveSuccesses = 0;
    const candidate = this.clamp(this.interval - this.step);

    // 已到下限：保持不动。
    if (candidate >= this.interval) return false;

    // 该档已知会被拦截且记录仍有效：停在墙前。
    if (candidate <= this.blockedInterval && this.isBlockedStillValid()) {
      return false;
    }
    // 记录已过期：清掉这道墙，允许再试探一次。
    if (this.blockedInterval !== null && !this.isBlockedStillValid()) {
      this.log(`拦截记录已过期（${this.blockedInterval}ms），重新试探`);
      this.blockedInterval = null;
      this.blockedAt = null;
    }

    const previous = this.interval;
    this.interval = candidate;
    this.log(`提速 ${previous}ms → ${this.interval}ms`);
    return true;
  }

  /**
   * 记录一次被拦截（EdgeOne / 405）。大步退避，并记住该档不安全。
   * @returns {boolean} 是否发生了退避
   */
  recordBlocked() {
    this.consecutiveSuccesses = 0;
    // 记录被拦截的档位，后续提速不再越过它。取较慢者，保守为先。
    this.blockedInterval = this.blockedInterval === null
      ? this.interval
      : Math.max(this.blockedInterval, this.interval);
    this.blockedAt = this.now();

    return this.backoff(this.blockBackoffSteps, '被拦截');
  }

  /**
   * 记录一次一般异常（超时、网络错误等）。小步退避。
   *
   * 不记 blockedInterval：超时多半是网络抖动而非风控，不该据此永久封死档位。
   * @returns {boolean} 是否发生了退避
   */
  recordError() {
    this.consecutiveSuccesses = 0;
    return this.backoff(this.errorBackoffSteps, '请求异常');
  }

  /** @private */
  backoff(steps, reason) {
    const candidate = this.clamp(this.interval + this.step * steps);
    if (candidate <= this.interval) return false;

    const previous = this.interval;
    this.interval = candidate;
    this.log(`${reason}，降速 ${previous}ms → ${this.interval}ms`);
    return true;
  }

  /** @private */
  log(message) {
    if (this.onAdjust) this.onAdjust(`[自适应间隔] ${message}`);
  }

  /** 导出可持久化的状态。 */
  toState() {
    return {
      interval: this.interval,
      blockedInterval: this.blockedInterval,
      // 必须一并保存：缺了它，恢复后的墙会被当成“无时间戳”而永久有效。
      blockedAt: this.blockedAt,
      updatedAt: this.now(),
    };
  }

  /**
   * 恢复此前探到的状态。超过有效期则忽略，重新从起始值试探。
   * @param {Object|null} state - toState() 的产物
   * @param {number} [ttlMs] - 有效期；未传或非正数表示不过期
   * @returns {boolean} 是否成功恢复
   */
  restoreState(state, ttlMs) {
    if (!state || typeof state !== 'object') return false;

    const age = Date.now() - Number(state.updatedAt || 0);
    if (Number.isFinite(Number(ttlMs)) && Number(ttlMs) > 0 && age > Number(ttlMs)) {
      this.log('历史状态已过期，重新试探');
      return false;
    }

    // 必须确有可用的 interval。缺字段时 clamp 会回落到起始值，若据此判定
    // “恢复成功”，损坏的状态文件会被静默接受，掩盖问题。
    if (!Number.isFinite(Number(state.interval))) return false;

    const restored = this.clamp(state.interval);

    this.interval = restored;
    this.consecutiveSuccesses = 0;
    this.blockedInterval = state.blockedInterval === null || state.blockedInterval === undefined
      ? null
      : this.clamp(state.blockedInterval);
    // 旧格式没有 blockedAt，退回“已过期”而非永久有效：宁可多试探一次，
    // 也不要让一条无时间戳的记录永久压低上限。
    this.blockedAt = Number.isFinite(Number(state.blockedAt))
      ? Number(state.blockedAt)
      : null;
    if (this.blockedInterval !== null && this.blockedAt === null) {
      this.blockedAt = 0;
    }

    this.log(`沿用历史间隔 ${this.interval}ms`);
    return true;
  }
}

module.exports = AdaptiveIntervalController;
