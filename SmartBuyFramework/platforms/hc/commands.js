/**
 * HC / Huancang platform command definitions.
 */

const COMMAND_MAPPINGS = {
  hc列表: {
    platform: 'hc',
    task: 'smart-buy',
    mode: 'list',
    description: 'HC 列表模式智能购买',
  },
  hc快捷: {
    platform: 'hc',
    task: 'smart-buy',
    mode: 'quick',
    description: 'HC 快捷模式智能购买',
  },
  hc批量: {
    platform: 'hc',
    task: 'smart-buy',
    mode: 'batch',
    description: 'HC 批量模式智能购买',
  },
  hc合成: {
    platform: 'hc',
    task: 'combination',
    mode: 'confirm',
    description: 'HC 按合成名称自动匹配配方并确认合成',
  },
  hc成交: {
    platform: 'hc',
    task: 'trade-history',
    mode: 'history',
    description: 'HC 查询藏品最近成交记录（只读）',
  },
  hc取消: {
    platform: 'hc',
    task: 'cancel-resale',
    mode: 'cancel',
    description: 'HC 批量取消寄售',
  },
  hc上架: {
    platform: 'hc',
    task: 'listing',
    mode: 'on-sale',
    description: 'HC 按藏品名称批量上架',
  },
};

module.exports = COMMAND_MAPPINGS;
