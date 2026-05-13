/**
 * JulianBaby / Bull Box 平台指令定义
 */

const COMMAND_MAPPINGS = {
  jl列表: {
    platform: 'julianbaby',
    task: 'smart-buy',
    mode: 'list',
    description: 'JulianBaby 列表模式智能购买',
  },
  jl快捷: {
    platform: 'julianbaby',
    task: 'smart-buy',
    mode: 'quick',
    description: 'JulianBaby 快捷模式智能购买',
  },
  jl批量: {
    platform: 'julianbaby',
    task: 'smart-buy',
    mode: 'batch',
    description: 'JulianBaby 批量模式智能购买',
  },
  jl合成: {
    platform: 'julianbaby',
    task: 'combination',
    mode: 'confirm',
    description: 'JulianBaby 合成确认',
  },
  jl取消: {
    platform: 'julianbaby',
    task: 'cancel-resale',
    mode: 'cancel',
    description: 'JulianBaby 取消寄售',
  },
  bb列表: {
    platform: 'julianbaby',
    task: 'smart-buy',
    mode: 'list',
    description: 'Bull Box 列表模式智能购买',
  },
  bb快捷: {
    platform: 'julianbaby',
    task: 'smart-buy',
    mode: 'quick',
    description: 'Bull Box 快捷模式智能购买',
  },
  bb批量: {
    platform: 'julianbaby',
    task: 'smart-buy',
    mode: 'batch',
    description: 'Bull Box 批量模式智能购买',
  },
  bb合成: {
    platform: 'julianbaby',
    task: 'combination',
    mode: 'confirm',
    description: 'Bull Box 合成确认',
  },
  bb取消: {
    platform: 'julianbaby',
    task: 'cancel-resale',
    mode: 'cancel',
    description: 'Bull Box 取消寄售',
  },
};

module.exports = COMMAND_MAPPINGS;
