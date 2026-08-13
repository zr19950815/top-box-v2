const fs = require('fs/promises');
const path = require('path');

class NewBeeAnnouncementMonitor {
  constructor(options = {}) {
    this.config = options.config || {};
    this.qqBot = options.qqBot;
    this.fetchAnnouncements = options.fetchAnnouncements;
    this.fetchAnnouncementDetail = options.fetchAnnouncementDetail;
    this.timer = null;
    this.running = false;
    this.stopped = true;
  }

  start() {
    if (!this.config.enabled || !this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(delay = this.config.interval) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      await this.check().catch(error => {
        console.error(`NewBee 公告检查失败: ${error.message}`);
      });
      this.schedule();
    }, delay);
  }

  async check() {
    if (this.running) return;
    this.running = true;
    try {
      const announcements = (await this.fetchAnnouncements())
        .filter(item => item?.id && item?.subject && Number(item.createtime) > 0)
        .sort((left, right) => Number(left.createtime) - Number(right.createtime));
      if (!announcements.length) return;

      const state = await this.readState();
      if (!state?.lastCreateTime) {
        const latest = announcements.at(-1);
        await this.writeState(latest);
        console.log(`NewBee 公告监控已初始化: ${latest.id}`);
        return;
      }

      const unseen = announcements.filter(item =>
        Number(item.createtime) > Number(state.lastCreateTime) ||
        (Number(item.createtime) === Number(state.lastCreateTime) &&
          String(item.id) !== String(state.lastAnnouncementId))
      );
      for (const announcement of unseen) {
        const detail = await this.fetchAnnouncementDetail(announcement.id);
        await this.qqBot.sendGroupMessage(
          this.config.groupId,
          this.formatMessage({ ...announcement, ...detail })
        );
        await this.writeState(announcement);
        console.log(`NewBee 新公告已推送: ${announcement.id}`);
      }
    } finally {
      this.running = false;
    }
  }

  formatMessage(announcement) {
    const publishedAt = new Date(Number(announcement.createtime) * 1000)
      .toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const content = this.htmlToText(announcement.content);
    return [
      '【NewBee 新公告】',
      announcement.subject,
      `发布时间：${publishedAt}`,
      '公告详情：',
      content || '暂无正文内容'
    ].join('\n');
  }

  htmlToText(html) {
    return String(html || '')
      .replace(/<\/?(?:p|div|section|article|header|footer|main|aside|h[1-6]|ul|ol|li|blockquote|pre|table|thead|tbody|tfoot|tr|figure|figcaption)[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/(?:https?:\/\/|www\.)[^\s<]+/gi, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\f\v]+\n/g, '\n')
      .replace(/\n[ \t\f\v]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async readState() {
    try {
      return JSON.parse(await fs.readFile(this.config.stateFile, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async writeState(announcement) {
    await fs.mkdir(path.dirname(this.config.stateFile), { recursive: true });
    const state = JSON.stringify({
      lastAnnouncementId: String(announcement.id),
      lastCreateTime: Number(announcement.createtime),
      subject: announcement.subject,
      updatedAt: new Date().toISOString()
    }, null, 2);
    const temporaryFile = `${this.config.stateFile}.tmp`;
    await fs.writeFile(temporaryFile, state);
    await fs.rename(temporaryFile, this.config.stateFile);
  }
}

module.exports = NewBeeAnnouncementMonitor;
