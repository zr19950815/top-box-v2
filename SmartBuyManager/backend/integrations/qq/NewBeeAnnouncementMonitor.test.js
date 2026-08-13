const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const NewBeeAnnouncementMonitor = require('./NewBeeAnnouncementMonitor');

describe('NewBeeAnnouncementMonitor', () => {
  let directory;
  let stateFile;
  let qqBot;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'topbox-announcement-'));
    stateFile = path.join(directory, 'state.json');
    qqBot = { sendGroupMessage: jest.fn().mockResolvedValue({ message_id: 1 }) };
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  test('records the current announcement without sending it on first run', async () => {
    const monitor = makeMonitor([{ id: 10, subject: '当前公告', createtime: 100 }]);
    await monitor.check();
    expect(qqBot.sendGroupMessage).not.toHaveBeenCalled();
    expect(JSON.parse(await fs.readFile(stateFile, 'utf8')).lastAnnouncementId).toBe('10');
  });

  test('sends and persists a newly discovered announcement', async () => {
    await fs.writeFile(stateFile, JSON.stringify({
      lastAnnouncementId: '10', lastCreateTime: 100
    }));
    const monitor = makeMonitor([{ id: 11, subject: '新的公告', createtime: 200 }]);
    await monitor.check();
    expect(qqBot.sendGroupMessage).toHaveBeenCalledWith(
      '1060530098',
      expect.stringContaining('【NewBee 新公告】\n新的公告\n发布时间：')
    );
    const message = qqBot.sendGroupMessage.mock.calls[0][1];
    expect(message).toContain('公告详情：\n第一段\n\n第二段 & 更多');
    expect(message).not.toContain('https://');
    expect(JSON.parse(await fs.readFile(stateFile, 'utf8')).lastAnnouncementId).toBe('11');
  });

  test('does not advance state when fetching announcement content fails', async () => {
    await fs.writeFile(stateFile, JSON.stringify({
      lastAnnouncementId: '10', lastCreateTime: 100
    }));
    const monitor = makeMonitor([{ id: 11, subject: '新的公告', createtime: 200 }], {
      fetchAnnouncementDetail: jest.fn().mockRejectedValue(new Error('detail offline'))
    });
    await expect(monitor.check()).rejects.toThrow('detail offline');
    expect(qqBot.sendGroupMessage).not.toHaveBeenCalled();
    expect(JSON.parse(await fs.readFile(stateFile, 'utf8')).lastAnnouncementId).toBe('10');
  });

  test('does not advance state when QQ delivery fails', async () => {
    await fs.writeFile(stateFile, JSON.stringify({
      lastAnnouncementId: '10', lastCreateTime: 100
    }));
    qqBot.sendGroupMessage.mockRejectedValue(new Error('offline'));
    const monitor = makeMonitor([{ id: 11, subject: '新的公告', createtime: 200 }]);
    await expect(monitor.check()).rejects.toThrow('offline');
    expect(JSON.parse(await fs.readFile(stateFile, 'utf8')).lastAnnouncementId).toBe('10');
  });

  test('sends multiple announcements from oldest to newest', async () => {
    await fs.writeFile(stateFile, JSON.stringify({
      lastAnnouncementId: '10', lastCreateTime: 100
    }));
    const monitor = makeMonitor([
      { id: 12, subject: '第二条', createtime: 300 },
      { id: 11, subject: '第一条', createtime: 200 }
    ]);
    await monitor.check();
    expect(qqBot.sendGroupMessage.mock.calls.map(call => call[1])).toEqual([
      expect.stringContaining('第一条'),
      expect.stringContaining('第二条')
    ]);
    expect(JSON.parse(await fs.readFile(stateFile, 'utf8')).lastAnnouncementId).toBe('12');
  });

  test('migrates a legacy state to the latest list item without backfilling', async () => {
    await fs.writeFile(stateFile, JSON.stringify({ lastAnnouncementId: '29850' }));
    const monitor = makeMonitor([
      { id: 32601, subject: '最新公告', createtime: 300 },
      { id: 32502, subject: '置顶旧公告', createtime: 100 }
    ]);
    await monitor.check();
    expect(qqBot.sendGroupMessage).not.toHaveBeenCalled();
    expect(JSON.parse(await fs.readFile(stateFile, 'utf8'))).toMatchObject({
      lastAnnouncementId: '32601', lastCreateTime: 300
    });
  });

  function makeMonitor(announcements, overrides = {}) {
    return new NewBeeAnnouncementMonitor({
      config: { enabled: true, interval: 60000, groupId: '1060530098', stateFile },
      qqBot,
      fetchAnnouncements: jest.fn().mockResolvedValue(announcements),
      fetchAnnouncementDetail: jest.fn().mockImplementation(async id => ({
        id,
        content: '<p>第一段</p><p>第二段 &amp; 更多 https://example.com/detail</p>'
      })),
      ...overrides
    });
  }
});
