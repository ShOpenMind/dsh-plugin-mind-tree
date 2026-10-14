// dsh-plugin-mind-tree 网页客户端半区(构建前源码,经 tools/build.mjs 打包为 lib/client.js)。
// Copyright (c) 2026 ShOpenMind · https://github.com/ShOpenMind/dsh-plugin-mind-tree · MIT
// 在右侧栏注册"思维树"标签页:思维树 / 会话血缘 / 会话森林三种视图 + 分支节点详情。
// 入口为纯 CJS(require 形式),与官方静态插件(whale-pet)的加载模式完全一致。
const React = require('react');
const { MenuItemButton } = require('@deepseek-ai/dsh-client-ui-primitives');
const { TYPERT_REMOTE } = require('../lib/remote.js');
// 与宿主半区共享的导出格式化层(打包时内联,保证 GUI 导出与 mind_tree 工具输出完全一致)。
const FMT = require('../lib/format.js');
// 过程信息削减层:三档信息量(精简 / 标准 / 完整),渲染与导出共用。
const REDUCE = require('../lib/reduce.js');

const h = React.createElement;

const PACKAGE_ID = 'dsh-plugin-mind-tree';
const REGISTRY_ID = `${PACKAGE_ID}/mind-tree`;
const TAB_KIND = 'mind-tree';
const NAMESPACE = 'mindTree';

// 诊断状态:供探针与状态行读取。
const DIAG = {
  applied: false,
  bodyMounted: 0,
  boundaryError: null,
  serviceReady: false,
  failed: false,
  lastError: null,
  loadedView: null,
  nodeCount: 0,
  collapsedCount: 0,
  collapsedIds: '',
  renderedRows: 0,
  loadAttempts: 0,
  lastLoadMs: 0,
  lastExport: null,
  filterQuery: '',
  autoOpened: false,
  autoOpenError: null,
  menuClicks: 0,
  hostWarnings: [],
  hostFields: [],
  author: 'ShOpenMind · https://github.com/ShOpenMind/dsh-plugin-mind-tree',
  detailLevel: 'compact',
  palettePreset: 'soft',
  rawNodeCount: 0,
  reducedNodeCount: 0,
  foldedTools: 0,
};
let currentLanguage = 'zh';

// ---------------- 文案 ----------------
const MESSAGES = {
  zh: {
    'tab.title': '思维树',
    'tab.guide': '遍历对话上下文，可视化分支节点与思维树',
    'view.tree': '思维树',
    'view.lineage': '会话血缘',
    'view.forest': '会话森林',
    'refresh': '刷新',
    'loading': '正在分析对话…',
    'empty': '该会话还没有可展示的内容',
    'error': '分析失败',
    'detail.close': '关闭',
    'detail.jump': '定位到对话',
    'detail.event': '查看事件',
    'detail.openSession': '打开会话',
    'detail.showTree': '查看思维树',
    'detail.backToSession': '回到当前会话',
    'node.turn': '轮次',
    'node.user': '用户',
    'node.assistant': '助手',
    'node.tool': '工具',
    'node.result': '结果',
    'node.session': '会话',
    'node.retry': '重试',
    'node.approval': '批准',
    'node.goal': '目标',
    'node.todo': '待办',
    'node.plan': '计划',
    'node.compaction': '压缩',
    'node.team': '团队',
    'node.info': '信息',
    'surface.current': '当前上下文',
    'surface.shadowed': '已脱离上下文',
    'surface.log-only': '仅日志',
    'branch.replace': '替换分支',
    'branch.retry': '生成重试',
    'branch.question': '用户选择',
    'branch.approval': '批准决策',
    'branch.spawn': '派生子代理',
    'branch.fork': '会话分叉',
    'branch.todo': '任务分解',
    'branch.goal': '目标变化',
    'branch.plan': '计划模式',
    'branch.compaction': '上下文压缩',
    'branch.team': '团队协作',
    'branch.error': '出错',
    'branch.questions': '选项',
    'branch.todos': '任务',
    'origin.subagent': '子代理',
    'origin.fork': '分叉',
    'legend.branch': '分支点',
    'legend.shadowed': '已替换',
    'click.hint': '点击节点看详情；点三角展开/折叠；滚动浏览',
    'menu.open': '查看思维树',
    'expandAll': '展开全部',
    'collapseAll': '折叠全部',
    'search': '搜索节点…',
    'search.empty': '没有匹配的节点',
    'export': '导出',
    'export.mindmap': '思维导图 Markdown(打开即见图)',
    'export.outline': '大纲 Markdown(全量节点)',
    'export.canvas': 'Obsidian 画布(.canvas)',
    'export.hint': '导图与画布仅含关键节点;全量过程请用大纲',
    'export.saved': '已导出',
    'export.cancelled': '已取消',
    'export.failed': '导出失败',
    'warning': '兼容性提示',
    'level.compact': '精简',
    'level.standard': '标准',
    'level.full': '完整',
    'level.hint': '信息量',
    'level.compact.hint': '只留轮次、你的发言、分支点、工具活动合计与每轮答复',
    'level.standard.hint': '在精简基础上,保留实质过程文本与每条工具调用(不含工具输出)',
    'level.full.hint': '全部节点,与事件日志一一对应',
    'node.toolgroup': '工具活动',
    'detail.grouped': '折叠的工具调用',
    'expand.short': '展开',
    'collapse.short': '折叠',
    'palette.button': '配色',
    'palette.preset': '预设',
    'palette.soft': '柔和',
    'palette.vivid': '鲜明',
    'palette.slate': '灰蓝',
    'palette.reset': '恢复默认(柔和)',
    'palette.hint': '点色块可逐类调整;选择会保存在本机',
    'color.turn': '轮次',
    'color.user': '用户消息',
    'color.assistant': '助手回复',
    'color.tool': '工具调用',
    'color.toolgroup': '工具活动(聚合)',
    'color.result': '工具结果',
    'color.session': '子会话',
    'color.goal': '目标变化',
    'color.todo': '任务分解',
    'color.plan': '计划模式',
    'color.compaction': '上下文压缩',
    'color.retry': '生成重试',
    'color.approval': '批准决策',
    'color.team': '团队协作',
    'color.info': '系统信息',
    'color.branchUser': '分支·用户',
    'color.branchAssistant': '分支·助手',
    'color.error': '出错',
    'color.shadowed': '已脱离上下文',
    'retry': '重试',
    'token.input': '输入',
    'token.output': '输出',
    'token.cacheRead': '缓存读',
    'token.cacheWrite': '缓存写',
    'token.reasoning': '思考',
    'token.total': '合计',
    'token.messages': '消息',
    'token.duration': '耗时',
    'status.connecting': '连接中',
    'status.ready': '就绪',
    'status.failed': '连接失败',
  },
  en: {
    'tab.title': 'Mind Tree',
    'tab.guide': 'Traverse conversation context and visualize branch nodes as a thought tree',
    'view.tree': 'Thought tree',
    'view.lineage': 'Lineage',
    'view.forest': 'Forest',
    'refresh': 'Refresh',
    'loading': 'Analyzing conversation…',
    'empty': 'Nothing to show for this session yet',
    'error': 'Analysis failed',
    'detail.close': 'Close',
    'detail.jump': 'Jump to conversation',
    'detail.event': 'View event',
    'detail.openSession': 'Open session',
    'detail.showTree': 'Show thought tree',
    'detail.backToSession': 'Back to current session',
    'node.turn': 'Turn',
    'node.user': 'User',
    'node.assistant': 'Assistant',
    'node.tool': 'Tool',
    'node.result': 'Result',
    'node.session': 'Session',
    'node.retry': 'Retry',
    'node.approval': 'Approval',
    'node.goal': 'Goal',
    'node.todo': 'Todo',
    'node.plan': 'Plan',
    'node.compaction': 'Compaction',
    'node.team': 'Team',
    'node.info': 'Info',
    'surface.current': 'In context',
    'surface.shadowed': 'Out of context',
    'surface.log-only': 'Log only',
    'branch.replace': 'Replacement branch',
    'branch.retry': 'Retry',
    'branch.question': 'User choice',
    'branch.approval': 'Approval',
    'branch.spawn': 'Subagent spawn',
    'branch.fork': 'Session fork',
    'branch.todo': 'Task breakdown',
    'branch.goal': 'Goal change',
    'branch.plan': 'Plan mode',
    'branch.compaction': 'Compaction',
    'branch.team': 'Team',
    'branch.error': 'Error',
    'branch.questions': 'Options',
    'branch.todos': 'Tasks',
    'origin.subagent': 'subagent',
    'origin.fork': 'fork',
    'legend.branch': 'branch',
    'legend.shadowed': 'replaced',
    'click.hint': 'Click a node for details; use the caret to expand; scroll to browse',
    'menu.open': 'View mind tree',
    'expandAll': 'Expand all',
    'collapseAll': 'Collapse all',
    'search': 'Search nodes…',
    'search.empty': 'No matching nodes',
    'export': 'Export',
    'export.mindmap': 'Mind-map Markdown (opens as a map)',
    'export.outline': 'Outline Markdown (all nodes)',
    'export.canvas': 'Obsidian Canvas (.canvas)',
    'export.hint': 'Map and canvas keep key nodes only; use outline for everything',
    'export.saved': 'Exported',
    'export.cancelled': 'Cancelled',
    'export.failed': 'Export failed',
    'warning': 'Compatibility',
    'level.compact': 'Compact',
    'level.standard': 'Standard',
    'level.full': 'Full',
    'level.hint': 'Detail level',
    'level.compact.hint': 'Turns, your messages, branch points, tool totals and each turn answer only',
    'level.standard.hint': 'Adds substantive process text and every tool call (no tool output)',
    'level.full.hint': 'Every node, one-to-one with the event log',
    'node.toolgroup': 'Tool activity',
    'detail.grouped': 'Folded tool calls',
    'expand.short': 'Expand',
    'collapse.short': 'Collapse',
    'palette.button': 'Colors',
    'palette.preset': 'Presets',
    'palette.soft': 'Soft',
    'palette.vivid': 'Vivid',
    'palette.slate': 'Slate',
    'palette.reset': 'Reset to Soft',
    'palette.hint': 'Click a swatch to tune each kind; saved locally',
    'color.turn': 'Turn',
    'color.user': 'User message',
    'color.assistant': 'Assistant reply',
    'color.tool': 'Tool call',
    'color.toolgroup': 'Tool activity (grouped)',
    'color.result': 'Tool result',
    'color.session': 'Sub-session',
    'color.goal': 'Goal change',
    'color.todo': 'Task breakdown',
    'color.plan': 'Plan mode',
    'color.compaction': 'Compaction',
    'color.retry': 'Retry',
    'color.approval': 'Approval',
    'color.team': 'Team',
    'color.info': 'System info',
    'color.branchUser': 'Branch · user',
    'color.branchAssistant': 'Branch · assistant',
    'color.error': 'Error',
    'color.shadowed': 'Out of context',
    'retry': 'Retry',
    'token.input': 'input',
    'token.output': 'output',
    'token.cacheRead': 'cache read',
    'token.cacheWrite': 'cache write',
    'token.reasoning': 'reasoning',
    'token.total': 'total',
    'token.messages': 'messages',
    'token.duration': 'duration',
    'status.connecting': 'Connecting',
    'status.ready': 'Ready',
    'status.failed': 'Failed',
  },
};

function languageOf(locale) {
  try {
    const snap = locale?.getLocale?.();
    // LocaleSnapshot 的活动语言字段是 active;其余为兼容性回退。
    const raw = snap?.active ?? snap?.id ?? snap?.locale;
    const id = typeof raw === 'string' ? raw : '';
    if (id.toLowerCase().startsWith('zh')) return 'zh';
  } catch { /* 回退英文 */ }
  return 'en';
}

/**
 * 解开远程调用结果信封:一元 Remote 返回 {ok:true,value} 或 {ok:false,error}。
 * 同时容忍直接返回值的实现(便于本地测试)。
 */
function unwrapResult(result) {
  if (result && typeof result === 'object' && 'ok' in result) {
    if (result.ok === false) {
      const error = result.error;
      const message = typeof error?.message === 'string' ? error.message : (typeof error === 'string' ? error : '远程调用失败');
      throw error instanceof Error ? error : new Error(message);
    }
    return result.value;
  }
  return result;
}

// ---------------- 远程命名空间 ----------------
let mountEntry = null;

function acquireMount(ctx) {
  if (!mountEntry || mountEntry.failed) {
    const entry = { refs: 0, failed: false, closed: false };
    entry.ready = Promise.resolve(ctx.remote.$mount(TYPERT_REMOTE)).catch((error) => {
      entry.failed = true;
      DIAG.failed = true;
      DIAG.lastError = `远程挂载失败: ${error?.message ?? error}`;
      throw error;
    });
    mountEntry = entry;
  }
  mountEntry.refs += 1;
  let released = false;
  return {
    ready: mountEntry.ready,
    release() {
      if (released) return;
      released = true;
      const entry = mountEntry;
      entry.refs -= 1;
      if (entry.refs !== 0) return;
      entry.closing = Promise.resolve(entry.closing).then(() => entry.ready).then(async (unmount) => {
        if (entry.refs !== 0 || entry.closed) return;
        entry.closed = true;
        await unmount();
        if (mountEntry === entry) mountEntry = null;
      }).catch(() => {});
    },
  };
}

function acquireNamespace(ctx, abort) {
  return new Promise((resolve, reject) => {
    let fiber;
    let disposed = false;
    let closing;
    let settled = false;
    // 防御:命名空间 12 秒内未出现即判定失败,避免永远停留在"连接中"。
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('mindTree 命名空间 12 秒内未就绪(远程半区未挂载?)'));
      }
    }, 12000);
    const dispose = () => {
      if (disposed) return closing;
      disposed = true;
      closing = Promise.resolve(fiber?.dispose());
      return closing;
    };
    const cancelled = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('mindTree 命名空间不可用'));
      Promise.resolve(dispose()).catch(() => {});
    };
    if (abort.signal.aborted) { cancelled(); return; }
    abort.signal.addEventListener('abort', cancelled, { once: true });
    try {
      fiber = ctx.inject([`remote.${NAMESPACE}`], (scope) => {
        if (disposed || abort.signal.aborted) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        scope.effect(() => () => abort.abort(), 'mind-tree.namespace');
        resolve({ service: scope.remote[NAMESPACE], dispose });
      });
      if (disposed) Promise.resolve(fiber.dispose()).catch(() => {});
      Promise.resolve(fiber).catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
        Promise.resolve(dispose()).catch(() => {});
      });
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
      Promise.resolve(dispose()).catch(() => {});
    }
  });
}

// ---------------- 图形 ----------------
function GlyphTree({ size = 14, color = 'currentColor' }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('circle', { cx: 8, cy: 1.8, r: 1.5, stroke: color, strokeWidth: 1.3 }),
    h('path', { d: 'M8 3.3V6M8 6H4.5M8 6H11.5M4.5 6v3.5M11.5 6v3.5M4.5 9.5H2.8M4.5 9.5h3M11.5 9.5h3M11.5 9.5h-3', stroke: color, strokeWidth: 1.2, strokeLinecap: 'round' }),
    h('circle', { cx: 2.8, cy: 11.5, r: 1.3, stroke: color, strokeWidth: 1.3 }),
    h('circle', { cx: 7.5, cy: 11.5, r: 1.3, stroke: color, strokeWidth: 1.3 }),
    h('circle', { cx: 14.5, cy: 11.5, r: 1.3, stroke: color, strokeWidth: 1.3 }),
    h('circle', { cx: 8.5, cy: 11.5, r: 1.3, stroke: color, strokeWidth: 1.3 }));
}

function GlyphRefresh({ size = 14 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.6h-2.6', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
}

// ---------------- 配色系统:预设 + 自定义 ----------------
// 行填充通过 CSS 变量注入到 .mt-root,因此换配色只需改一组变量,组件无需感知。
const COLOR_KINDS = [
  'turn', 'user', 'assistant', 'tool', 'toolgroup', 'result',
  'session', 'goal', 'todo', 'plan', 'compaction', 'retry', 'approval', 'team', 'info',
  'branchUser', 'branchAssistant', 'error', 'shadowed',
];
const COLOR_VARS = {
  turn: '--mt-turn', user: '--mt-user', assistant: '--mt-assistant', tool: '--mt-tool',
  toolgroup: '--mt-toolgroup', result: '--mt-result', session: '--mt-session',
  goal: '--mt-goal', todo: '--mt-todo', plan: '--mt-plan', compaction: '--mt-compaction',
  retry: '--mt-retry', approval: '--mt-approval', team: '--mt-team', info: '--mt-info',
  branchUser: '--mt-branch-user', branchAssistant: '--mt-branch-assistant',
  error: '--mt-error', shadowed: '--mt-shadowed',
};
/** 预设配色:soft 为默认 —— 降饱和、提高白字对比,长时间看不刺眼。 */
const PALETTES = {
  soft: {
    turn: '#6b63b5', user: '#3b6fa8', assistant: '#2f7a61', tool: '#6a4c93', toolgroup: '#5b4180',
    result: '#4a5568', session: '#8a5a2b', goal: '#2c6e78', todo: '#5a7a2e', plan: '#32638c',
    compaction: '#5a5560', retry: '#9c5a2c', approval: '#9a4a6b', team: '#8a4a82', info: '#556070',
    branchUser: '#2f5f92', branchAssistant: '#276b55', error: '#a6392f', shadowed: '#cbd5e1',
  },
  vivid: {
    turn: '#8b5cf6', user: '#2563eb', assistant: '#059669', tool: '#7c3aed', toolgroup: '#6d28d9',
    result: '#52525b', session: '#b45309', goal: '#0e7490', todo: '#4d7c0f', plan: '#0369a1',
    compaction: '#57534e', retry: '#c2410c', approval: '#be185d', team: '#a21caf', info: '#64748b',
    branchUser: '#1d4ed8', branchAssistant: '#047857', error: '#b91c1c', shadowed: '#cbd5e1',
  },
  slate: {
    turn: '#5b6478', user: '#3f5a7a', assistant: '#42685c', tool: '#5a5670', toolgroup: '#4d4a63',
    result: '#4b5563', session: '#6f5a42', goal: '#3f6470', todo: '#556b3c', plan: '#3c5f7d',
    compaction: '#565248', retry: '#7a5540', approval: '#6f4a5c', team: '#6a4a66', info: '#5a6472',
    branchUser: '#3a5573', branchAssistant: '#3d6055', error: '#8f4038', shadowed: '#cbd5e1',
  },
};
const DEFAULT_PRESET = 'soft';
const PALETTE_STORAGE_KEY = 'dsh-mind-tree.palette';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function hexToRgb(hex) {
  if (!HEX_RE.test(String(hex))) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(String(hex).slice(1, 3), 16),
    g: parseInt(String(hex).slice(3, 5), 16),
    b: parseInt(String(hex).slice(5, 7), 16),
  };
}

/** 相对亮度(WCAG)。 */
function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 按对比度自动选字色:白字对比不足 4.5:1 时改用深色字。 */
function inkFor(hex, light = '#ffffff', dark = '#1f2937') {
  const contrast = 1.05 / (relativeLuminance(hexToRgb(hex)) + 0.05);
  return contrast >= 4.5 ? light : dark;
}

/** 读取本地保存的配色;任何异常都回退到默认预设。 */
function loadPalette() {
  const fallback = { preset: DEFAULT_PRESET, colors: { ...PALETTES[DEFAULT_PRESET] } };
  try {
    const raw = window?.localStorage?.getItem(PALETTE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const colors = { ...fallback.colors };
    if (parsed && typeof parsed.colors === 'object' && parsed.colors !== null) {
      for (const key of COLOR_KINDS) {
        if (HEX_RE.test(String(parsed.colors[key] ?? ''))) colors[key] = String(parsed.colors[key]);
      }
    }
    const preset = typeof parsed?.preset === 'string' && (PALETTES[parsed.preset] || parsed.preset === 'custom')
      ? parsed.preset
      : 'custom';
    return { preset, colors };
  } catch { return fallback; }
}

function savePalette(palette) {
  try { window?.localStorage?.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palette)); } catch { /* 忽略 */ }
}

const BRANCH_MARKS = {
  replace: '替', retry: '试', question: '问', approval: '批', spawn: '派', fork: '叉',
  todo: '务', goal: '标', plan: '划', compaction: '压', team: '队', error: '错',
};

function branchLabel(kind, t) {
  return t(`branch.${kind}`) ?? kind;
}

// ---- 紧凑纵向大纲布局(适配窄侧栏,纵向滚动,不裁切) ----
const ROW_H = 32;
const INDENT = 16;
const PAD_X = 8;
const PAD_Y = 10;

/** 构建层级图(次级边单独返回;"next" 主干链展开为同级序列)。 */
function buildHierarchy(data) {
  const byId = new Map();
  for (const node of data?.nodes ?? []) byId.set(node.id, node);
  const children = new Map();
  const secondary = new Map();
  const parentOf = new Map();
  const nextOf = new Map();
  const nextTargets = new Set();
  for (const edge of data?.edges ?? []) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    if (edge.kind === 'replaced-by' || edge.kind === 'derived') {
      secondary.set(`${edge.from}->${edge.to}`, edge);
      continue;
    }
    if (edge.kind === 'next') {
      nextOf.set(edge.from, edge.to);
      nextTargets.add(edge.to);
      continue;
    }
    if (!children.has(edge.from)) children.set(edge.from, []);
    children.get(edge.from).push(edge);
    parentOf.set(edge.to, edge.from);
  }
  // "next" 链是主干序列:链上节点彼此同级(挂在链头之下),避免轮次逐层缩进。
  const pushChild = (parentId, childId) => {
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push({ from: parentId, to: childId, kind: 'next' });
    parentOf.set(childId, parentId);
  };
  const chained = new Set();
  for (const head of [...nextOf.keys()].filter((id) => !nextTargets.has(id))) {
    const base = parentOf.get(head) ?? head;
    let current = head;
    let cursor = nextOf.get(current);
    while (cursor !== undefined && !chained.has(cursor) && cursor !== head) {
      chained.add(cursor);
      pushChild(base, cursor);
      current = cursor;
      cursor = nextOf.get(current);
    }
  }
  for (const node of data?.nodes ?? []) if (!children.has(node.id)) children.set(node.id, []);
  const roots = (data?.nodes ?? []).filter((n) => !parentOf.has(n.id)).map((n) => n.id);
  return { byId, children, roots, secondary };
}

/** 深度优先展平为行(折叠状态生效),返回行列表、id→行号索引。 */
function flattenRows(data, collapsed) {
  const { byId, children, roots, secondary } = buildHierarchy(data);
  const rows = [];
  const index = new Map();
  const seen = new Set();
  const walk = (id, depth, parentId) => {
    if (seen.has(id)) return;
    const node = byId.get(id);
    if (node === undefined) return;
    seen.add(id);
    const kids = children.get(id) ?? [];
    rows.push({
      node, depth, parentId, kidCount: kids.length,
      collapsed: collapsed.has(id), index: rows.length,
    });
    index.set(id, rows.length - 1);
    if (collapsed.has(id)) return;
    for (const edge of kids) walk(edge.to, depth + 1, id);
  };
  for (const root of roots) walk(root, 0, null);
  // 兜底:只有"完全不可达"的节点(存在环时)才补行;被折叠隐藏的节点不受影响。
  const reachable = new Set();
  const markReachable = (id) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const edge of children.get(id) ?? []) markReachable(edge.to);
  };
  for (const root of roots) markReachable(root);
  for (const node of data?.nodes ?? []) if (!reachable.has(node.id) && !seen.has(node.id)) walk(node.id, 0, null);
  return { rows, index, secondary };
}

function clampLabel(label, max = 42) {
  if (!label) return '';
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function nodeColor(node, palette) {
  const colors = palette?.colors ?? PALETTES[DEFAULT_PRESET];
  const pick = (key) => (HEX_RE.test(String(colors?.[key] ?? '')) ? colors[key] : PALETTES[DEFAULT_PRESET][key]);
  const wrap = (key) => {
    const hex = pick(key);
    return { fill: `var(${COLOR_VARS[key]}, ${hex})`, ink: inkFor(hex) };
  };
  if (node.surface === 'shadowed') return wrap('shadowed');
  if (node.branch && node.kind === 'user') return wrap('branchUser');
  if (node.branch && node.kind === 'assistant') return wrap('branchAssistant');
  if (node.branch && node.error) return wrap('error');
  return wrap(COLOR_VARS[node.kind] ? node.kind : 'info');
}

/** 大纲连接线:父行左轨 → 子行左端。 */
function outlinePath(parentRow, childRow) {
  const px = PAD_X + parentRow.depth * INDENT + 7;
  const py = PAD_Y + parentRow.index * ROW_H + ROW_H / 2;
  const cx = PAD_X + childRow.depth * INDENT;
  const cy = PAD_Y + childRow.index * ROW_H + ROW_H / 2;
  return `M ${px} ${py} V ${cy - 5} Q ${px} ${cy} ${px + 5} ${cy} H ${cx}`;
}

/** 估算文本像素宽度(CJK 全宽,ASCII 半宽)。 */
function measureText(text, fontSize) {
  let width = 0;
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0);
    const wide = (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef);
    width += wide ? fontSize : fontSize * 0.56;
  }
  return width;
}

/** token 数量格式化:1200 → 1.2k,1500000 → 1.5M。 */
function fmtTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

/** 耗时格式化。 */
function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`;
}

/** 搜索过滤:仅保留匹配行与其可见祖先,隐藏中间层不打断缩进与连线。 */
function flattenFiltered(data, query) {
  const q = String(query ?? '').trim().toLowerCase();
  const { byId, children, roots } = buildHierarchy(data);
  const textOf = (node) => `${node.label ?? ''} ${node.summary ?? ''} ${node.text ?? ''} ${node.type ?? ''} ${(node.grouped ?? []).map((g) => g.label ?? '').join(' ')}`.toLowerCase();
  const matches = new Set();
  for (const node of data?.nodes ?? []) if (textOf(node).includes(q)) matches.add(node.id);
  if (matches.size === 0) return { rows: [], index: new Map(), matches };
  const parentOf = new Map();
  for (const [pid, kids] of children) for (const edge of kids) if (!parentOf.has(edge.to)) parentOf.set(edge.to, pid);
  const visible = new Set(matches);
  for (const id of [...matches]) {
    let cursor = parentOf.get(id);
    let guard = 0;
    while (cursor !== undefined && !visible.has(cursor) && guard < 200) {
      visible.add(cursor);
      cursor = parentOf.get(cursor);
      guard += 1;
    }
  }
  const rows = [];
  const index = new Map();
  const seen = new Set();
  const walk = (id, depth, visibleParentId) => {
    if (seen.has(id)) return;
    const node = byId.get(id);
    if (node === undefined) return;
    seen.add(id);
    if (visible.has(id)) {
      rows.push({
        node, depth, parentId: visibleParentId,
        kidCount: (children.get(id) ?? []).length, collapsed: false, index: rows.length,
      });
      index.set(id, rows.length - 1);
      visibleParentId = id;
      depth += 1;
    }
    for (const edge of children.get(id) ?? []) walk(edge.to, depth, visibleParentId);
  };
  for (const root of roots) walk(root, 0, null);
  return { rows, index, matches };
}

function OutlineRow({ row, width, selected, highlighted, onSelect, onToggle, onJump, t, palette }) {
  const { node, depth, kidCount, collapsed } = row;
  const x = PAD_X + depth * INDENT;
  const railX = x + 7;
  const rowWidth = Math.max(120, width - x - PAD_X * 2);
  const y = PAD_Y + row.index * ROW_H;
  const { fill, ink } = nodeColor(node, palette);
  const shadowed = node.surface === 'shadowed';
  const isTurn = node.kind === 'turn';
  const usage = node.usage;

  // 右侧元素从右向左排布,各自按实测宽度避让,互不重叠。
  const metaText = isTurn && usage
    ? `#${node.seq >= 0 ? node.seq : '—'} · ${usage.messageCount ?? 0}条${fmtTokens(usage.total || usage.input + usage.output) ? ` · ${fmtTokens(usage.total || usage.input + usage.output)} tok` : ''}`
    : `#${node.seq >= 0 ? node.seq : '—'} ${t(`node.${node.kind}`)}`;
  const metaWidth = measureText(metaText, 10) + 8;
  const metaX = rowWidth - 8 - metaWidth;
  let cursor = metaX;
  let jumpX = null;
  if (node.turn != null) {
    jumpX = cursor - 18;
    cursor = jumpX;
  }
  let badgeX = null;
  if (node.branch) {
    badgeX = cursor - 18;
    cursor = badgeX;
  }

  const textX = x + (kidCount > 0 ? 20 : 11);
  const available = Math.max(40, cursor - 8 - textX);
  const maxChars = Math.max(6, Math.floor(available / 6.7));
  const label = clampLabel(node.label, maxChars);
  const open = kidCount > 0 && !collapsed;
  // 轮次摘要:紧跟在"第 N 轮"之后,浅色显示并自适应剩余宽度。
  const summary = typeof node.summary === 'string' ? node.summary : '';
  const labelWidth = measureText(node.label, 12.6) + 12;
  const summaryX = textX + labelWidth;
  const summaryAvailable = Math.max(0, cursor - 8 - summaryX);
  const summaryChars = Math.max(4, Math.floor(summaryAvailable / 11.6));
  const summaryText = summary ? `· ${clampLabel(summary, summaryChars)}` : '';

  const title = `${node.label}${summary ? ` · ${summary}` : ''}`
    + `${usage ? `\n${usage.messageCount ?? 0} 条消息 · ${fmtTokens(usage.input)} 输入 / ${fmtTokens(usage.output)} 输出 / ${fmtTokens(usage.total || usage.input + usage.output)} 合计` : ''}`
    + `${node.turn != null ? `\n点击 ↗ 定位到对话第 ${node.turn} 轮` : ''}`
    + `${node.branch ? `\n分支: ${branchLabel(node.branch.kind, t)}${node.branch.detail?.wide ? `（整段重写 ${node.branch.detail.affected ?? '多'} 条，未逐条标记）` : ''}` : ''}`;

  return h('g', {
    transform: `translate(0, ${y})`,
    style: { cursor: 'pointer' },
    onClick: (event) => { event.stopPropagation(); onSelect(node); },
    onDoubleClick: (event) => { event.stopPropagation(); if (kidCount > 0) onToggle(node.id); },
  },
    h('rect', {
      x, y: 2, width: rowWidth, height: ROW_H - 6, rx: 6, ry: 6,
      fill, opacity: shadowed ? 0.5 : 0.97,
      stroke: highlighted ? '#f59e0b' : (selected ? 'var(--dsw-alias-brand-primary, #111827)' : 'none'),
      strokeWidth: highlighted ? 2 : (selected ? 2 : 0),
      strokeDasharray: highlighted ? '4 3' : undefined,
    }),
    node.kind === 'session' && h('rect', {
      x, y: 2, width: rowWidth, height: ROW_H - 6, rx: 6, ry: 6,
      fill: 'none', stroke: '#b45309', strokeWidth: 1.2, strokeDasharray: '5 3',
    }),
    kidCount > 0 && h('g', {
      onClick: (event) => {
        event.stopPropagation();
        // 点三角展开的同时,若该节点有对话位置,顺带定位过去(折叠时仅折叠)。
        if (!open && node.turn != null && typeof onJump === 'function') onJump(node);
        onToggle(node.id);
      },
    },
      h('rect', { x: railX - 6, y: 6, width: 15, height: 15, rx: 3, fill: 'rgba(255,255,255,0.28)' }),
      h('text', {
        x: railX + 1.5, y: 17.5, fontSize: 10, fontWeight: 700, textAnchor: 'middle',
        fill: ink, style: { userSelect: 'none' },
      }, open ? '▾' : '▸')),
    h('text', {
      x: textX, y: 21, fontSize: 12, fontWeight: 600,
      fill: shadowed ? '#64748b' : ink, style: { userSelect: 'none' },
    }, label),
    summaryText && h('text', {
      x: summaryX, y: 21, fontSize: 11,
      fill: shadowed ? '#64748b' : ink, opacity: 0.9,
      style: { userSelect: 'none' },
    }, summaryText),
    jumpX !== null && h('g', {
      transform: `translate(${jumpX}, 5)`,
      onClick: (event) => { event.stopPropagation(); if (typeof onJump === 'function') onJump(node); },
      style: { cursor: 'pointer' },
    },
      h('rect', { x: 0, y: 0, width: 15, height: 15, rx: 3, fill: 'rgba(255,255,255,0.32)' }),
      h('text', {
        x: 7.5, y: 12, fontSize: 11, fontWeight: 700, textAnchor: 'middle',
        fill: shadowed ? '#64748b' : ink, style: { userSelect: 'none' },
      }, '↗')),
    badgeX !== null && h('g', { transform: `translate(${badgeX}, 5)` },
      h('rect', { x: 0, y: 0, width: 16, height: 15, rx: 3, fill: '#fbbf24', stroke: '#92400e', strokeWidth: 0.8 }),
      h('text', {
        x: 8, y: 12, fontSize: 10, fontWeight: 700, textAnchor: 'middle',
        fill: '#78350f', style: { userSelect: 'none' },
      }, BRANCH_MARKS[node.branch.kind] ?? '分')),
    h('text', {
      x: metaX + metaWidth, y: 21, fontSize: 10, textAnchor: 'end',
      fill: shadowed ? '#64748b' : ink, opacity: 0.85, style: { userSelect: 'none' },
    }, metaText),
    h('title', null, title));
}

function TreeCanvas({ data, collapsed, query, onToggle, onSelect, onJump, selectedId, t, width, palette }) {
  const searching = typeof query === 'string' && query.trim() !== '';
  let rows;
  let index;
  let secondary = new Map();
  let matches = new Set();
  if (searching) {
    const filtered = flattenFiltered(data, query);
    rows = filtered.rows;
    index = filtered.index;
    matches = filtered.matches;
  } else {
    const flattened = flattenRows(data, collapsed);
    rows = flattened.rows;
    index = flattened.index;
    secondary = flattened.secondary;
  }
  DIAG.renderedRows = rows.length;
  DIAG.reducedNodeCount = data?.nodes?.length ?? 0;
  DIAG.detailLevel = data?.reduction?.level ?? 'full';
  DIAG.foldedTools = data?.reduction?.foldedTools ?? 0;
  DIAG.collapsedIds = [...collapsed].join(',');
  DIAG.filterQuery = searching ? query.trim() : '';
  const height = PAD_Y * 2 + rows.length * ROW_H;
  const canvasWidth = Math.max(180, width);

  const paths = [];
  for (const row of rows) {
    if (row.parentId === null) continue;
    const parentRow = rows[index.get(row.parentId)];
    if (parentRow === undefined) continue;
    paths.push(h('path', {
      key: `e:${row.node.id}`,
      d: outlinePath(parentRow, row),
      fill: 'none',
      stroke: row.node.kind === 'session' ? 'var(--mt-edge-spawn, #b45309)' : 'var(--mt-edge, #94a3b8)',
      strokeWidth: row.node.kind === 'turn' ? 1.6 : 1.1,
      opacity: 0.9,
    }));
  }
  // 次级边(派生 / 被替代):虚线弧线,表达分支的来源关系。
  // 若两端本来就是结构上的父子(例如 tool/result 挂在 tool/call 下),这条曲线只是重复表达,略去,
  // 否则上千条曲线既是视觉噪音也是渲染负担。
  for (const [key, edge] of secondary) {
    const [fromId, toId] = key.split('->');
    const fromRow = rows[index.get(fromId)];
    const toRow = rows[index.get(toId)];
    if (fromRow === undefined || toRow === undefined) continue;
    if (toRow.parentId === fromId || fromRow.parentId === toId) continue;
    const y1 = PAD_Y + fromRow.index * ROW_H + ROW_H / 2;
    const y2 = PAD_Y + toRow.index * ROW_H + ROW_H / 2;
    const x2 = PAD_X + toRow.depth * INDENT + 14;
    const x1 = PAD_X + fromRow.depth * INDENT + 14;
    paths.push(h('path', {
      key: `s:${key}`,
      d: `M ${x1} ${y1} C ${x1 + 26} ${y1}, ${x2 + 26} ${y2}, ${x2} ${y2}`,
      fill: 'none',
      stroke: edge.kind === 'replaced-by' ? 'var(--mt-edge-replaced, #f59e0b)' : 'var(--mt-edge-derived, #38bdf8)',
      strokeWidth: 1,
      strokeDasharray: '4 4',
      opacity: 0.7,
    }));
  }

  return h('svg', {
    width: canvasWidth,
    height: Math.max(140, height),
    style: { display: 'block' },
  },
    h('g', null,
      paths,
      rows.map((row) => h(OutlineRow, {
        key: row.node.id, row, width: canvasWidth,
        selected: row.node.id === selectedId,
        highlighted: searching && matches.has(row.node.id),
        onSelect, onToggle, onJump, t, palette,
      })),
      searching && rows.length === 0 && h('text', {
        x: canvasWidth / 2, y: 70, fontSize: 12, textAnchor: 'middle',
        fill: 'var(--dsw-alias-label-secondary, #61666b)',
      }, t('search.empty'))));
}

// ---------------- 详情面板 ----------------
function DetailPanel({ node, detail, loadingDetail, onClose, onJump, onEvent, onOpenSession, onShowTree, onBack, canJump, showBack, t }) {
  const branch = node?.branch;
  return h('div', { className: 'mt-detail' },
    h('div', { className: 'mt-detail-head' },
      h('div', { className: 'mt-detail-title' }, node ? clampLabel(node.label, 200) : ''),
      h('button', { className: 'mt-btn', onClick: onClose, title: t('detail.close') }, '×')),
    node?.summary && h('div', { className: 'mt-detail-summary' }, node.summary),
    node && h('div', { className: 'mt-detail-meta' },
      h('span', { className: 'mt-chip' }, `#${node.seq >= 0 ? node.seq : '—'}`),
      h('span', { className: 'mt-chip' }, t(`node.${node.kind}`)),
      node.surface !== 'current' && h('span', { className: `mt-chip ${node.surface === 'shadowed' ? 'mt-chip-warn' : ''}` }, t(`surface.${node.surface}`)),
      node.turn != null && h('span', { className: 'mt-chip' }, `${t('node.turn')} ${node.turn}`)),
    node?.usage && h('div', { className: 'mt-detail-meta' },
      h('span', { className: 'mt-chip' }, `${t('token.input')} ${fmtTokens(node.usage.input)}`),
      h('span', { className: 'mt-chip' }, `${t('token.output')} ${fmtTokens(node.usage.output)}`),
      (node.usage.cacheRead ?? 0) > 0 && h('span', { className: 'mt-chip' }, `${t('token.cacheRead')} ${fmtTokens(node.usage.cacheRead)}`),
      (node.usage.cacheWrite ?? 0) > 0 && h('span', { className: 'mt-chip' }, `${t('token.cacheWrite')} ${fmtTokens(node.usage.cacheWrite)}`),
      (node.usage.reasoning ?? 0) > 0 && h('span', { className: 'mt-chip' }, `${t('token.reasoning')} ${fmtTokens(node.usage.reasoning)}`),
      h('span', { className: 'mt-chip' }, `${t('token.total')} ${fmtTokens(node.usage.total || node.usage.input + node.usage.output)}`),
      node.usage.messageCount != null && h('span', { className: 'mt-chip' }, `${t('token.messages')} ${node.usage.messageCount}`),
      (node.usage.durationMs ?? 0) > 0 && h('span', { className: 'mt-chip' }, `${t('token.duration')} ${fmtDuration(node.usage.durationMs)}`)),
    branch && h('div', { className: 'mt-detail-branch' },
      h('div', { className: 'mt-branch-title' }, `◆ ${branchLabel(branch.kind, t)}`),
      branch.kind === 'question' && Array.isArray(branch.detail?.questions) && h('div', null,
        h('div', { className: 'mt-detail-section' }, t('branch.questions')),
        branch.detail.questions.map((q, i) => h('div', { key: i, className: 'mt-question' },
          h('div', { className: 'mt-question-text' }, q.question),
          h('div', { className: 'mt-options' }, (q.options ?? []).map((o, j) => h('span', { key: j, className: 'mt-option' }, o.label)))))),
      branch.kind === 'todo' && Array.isArray(branch.detail?.todos) && h('div', null,
        h('div', { className: 'mt-detail-section' }, t('branch.todos')),
        branch.detail.todos.map((item, i) => h('div', { key: i, className: `mt-todo ${item.status}` },
          h('span', { className: 'mt-todo-dot' }, item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '…' : '·'),
          h('span', null, item.content)))),
      branch.kind === 'spawn' && branch.detail?.label && h('div', { className: 'mt-detail-section' }, branch.detail.label),
      branch.kind === 'replace' && h('div', { className: 'mt-detail-section' },
        `${t('branch.replace')}：seq ${branch.detail?.startSeq ?? '?'}–${branch.detail?.endSeq ?? '?'}`)),
    node?.text && h('div', { className: 'mt-detail-text' }, node.text),
    // 工具活动聚合行:直接列出被折叠的调用(可定位到对应轮次)。
    Array.isArray(detail?.grouped) && detail.grouped.length > 0 && h('div', null,
      h('div', { className: 'mt-detail-section' }, `${t('detail.grouped')}（${detail.grouped.length}）`),
      h('div', { className: 'mt-group-list' }, detail.grouped.map((item) => h('div', { key: item.id, className: 'mt-group-item' },
        h('span', { className: 'mt-group-seq' }, `#${item.seq >= 0 ? item.seq : '—'}`),
        h('span', { className: 'mt-group-label' }, clampLabel(item.label, 160)))))),
    node && h('div', { className: 'mt-detail-actions' },
      node.kind === 'session' && node.sessionId && h('button', { className: 'mt-btn mt-btn-primary', onClick: () => onOpenSession(node) }, t('detail.openSession')),
      node.kind === 'session' && node.sessionId && h('button', { className: 'mt-btn', onClick: () => onShowTree(node) }, t('detail.showTree')),
      node.seq >= 0 && h('button', { className: 'mt-btn', onClick: () => onEvent(node) }, t('detail.event')),
      canJump && node.kind !== 'session' && node.turn != null && h('button', { className: 'mt-btn mt-btn-primary', onClick: () => onJump(node) }, t('detail.jump')),
      showBack && h('button', { className: 'mt-btn', onClick: onBack }, t('detail.backToSession'))),
    detail && h('pre', { className: 'mt-detail-json' }, JSON.stringify(detail.target, null, 2)),
    loadingDetail && h('div', { className: 'mt-detail-section' }, t('loading')));
}

/** 把血缘/森林视图的会话记录转换成与思维树一致的展示节点。 */
function sessionsAsDisplay(data) {
  if (!data) return data;
  const nodes = (data.nodes ?? []).map((n) => ({
    id: n.sessionId,
    seq: -1,
    type: 'session',
    kind: 'session',
    label: n.title ?? n.sessionId,
    surface: 'current',
    sessionId: n.sessionId,
    origin: n.origin ?? undefined,
    ...(n.origin ? { branch: { kind: n.origin === 'subagent' ? 'spawn' : 'fork', detail: { sessionId: n.sessionId } } } : {}),
  }));
  return { nodes, edges: data.edges ?? [] };
}

// ---------------- 错误边界(任何渲染崩溃都会显示出来,而不是白屏) ----------------
class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    DIAG.boundaryError = String(error?.stack ?? error);
  }
  render() {
    if (this.state.error) {
      const text = this.state.error?.message ?? String(this.state.error);
      return h('div', { className: 'mt-status mt-status-error' },
        h('div', { style: { padding: '12px', lineHeight: 1.6 } },
          h('div', { style: { fontWeight: 600, marginBottom: 6 } }, '思维树渲染出错'),
          h('div', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11 } }, text)));
    }
    return this.props.children;
  }
}

// ---------------- 主面板 ----------------
/** 请求超时(测试可通过 window.__MT_TIMEOUT__ 缩短)。 */
const FETCH_TIMEOUT_MS = typeof window !== 'undefined' && Number(window.__MT_TIMEOUT__) > 0
  ? Number(window.__MT_TIMEOUT__)
  : 20000;

/** 给远程请求加上超时上限,避免永远停留在加载中。 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label}: 请求超时,请重试`));
    }, ms);
    Promise.resolve(promise).then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function useService(ctx, signal, nonce = 0) {
  const [service, setService] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let disposed = false;
    let retried = false;
    let retryTimer = null;
    let namespace = null;
    const leases = [];
    const controller = new AbortController();
    const link = () => {
      try { if (signal?.aborted) controller.abort(); } catch { /* 忽略 */ }
    };
    try { signal?.addEventListener?.('abort', link); } catch { /* 忽略 */ }
    const attempt = (lease) => {
      leases.push(lease);
      lease.ready
        .then(() => acquireNamespace(ctx, controller))
        .then((ns) => {
          if (disposed) { ns.dispose(); return; }
          namespace = ns;
          DIAG.serviceReady = true;
          DIAG.failed = false;
          setService(ns.service);
          setFailed(false);
        })
        .catch((error) => {
          if (disposed || controller.signal.aborted) return;
          DIAG.failed = true;
          DIAG.lastError = error?.message ?? String(error);
          if (!retried) {
            // 挂载失败自动重试一次(常见于连接刚建立时的瞬时失败)。
            retried = true;
            retryTimer = setTimeout(() => attempt(acquireMount(ctx)), 1500);
            return;
          }
          setFailed(true);
        });
    };
    attempt(acquireMount(ctx));
    return () => {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      try { signal?.removeEventListener?.('abort', link); } catch { /* 忽略 */ }
      controller.abort();
      if (namespace !== null) namespace.dispose();
      for (const lease of leases) lease.release();
    };
  }, [nonce]);
  return { service, failed, setFailed };
}

function MindTreeBodyInner({ ctx, sessionId, signal, uiWorkspace }) {
  const [language, setLanguage] = React.useState(currentLanguage);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    DIAG.bodyMounted += 1;
    let dispose = () => {};
    try { dispose = ctx.locale.subscribe(() => setLanguage(languageOf(ctx.locale))); } catch { /* 忽略 */ }
    setLanguage(languageOf(ctx.locale));
    return dispose;
  }, []);
  const t = (key) => MESSAGES[language]?.[key] ?? MESSAGES.zh[key] ?? key;

  const [serviceNonce, setServiceNonce] = React.useState(0);
  const { service, failed, setFailed } = useService(ctx, signal, serviceNonce);
  const [view, setView] = React.useState('tree');
  // 过程信息档位:默认"精简" —— 只留轮次/用户发言/分支点/工具活动聚合/每轮答复。
  const [detailLevel, setDetailLevel] = React.useState('compact');
  const [treeData, setTreeData] = React.useState(null);
  const [lineageData, setLineageData] = React.useState(null);
  const [forestData, setForestData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(() => new Set());
  const [targetSession, setTargetSession] = React.useState(null);
  const boxRef = React.useRef(null);
  const [canvasWidth, setCanvasWidth] = React.useState(560);
  const [query, setQuery] = React.useState('');
  const [exportNotice, setExportNoticeState] = React.useState('');
  const exportNoticeTimer = React.useRef(null);
  const setExportNotice = React.useCallback((text) => {
    setExportNoticeState(text);
    if (exportNoticeTimer.current !== null) clearTimeout(exportNoticeTimer.current);
    exportNoticeTimer.current = setTimeout(() => setExportNoticeState(''), 4000);
  }, []);
  React.useEffect(() => () => {
    if (exportNoticeTimer.current !== null) clearTimeout(exportNoticeTimer.current);
  }, []);
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  const exportMenuRef = React.useRef(null);
  // 配色:预设 + 自定义,持久化到 localStorage(换配色只改 .mt-root 上的 CSS 变量)。
  const [palette, setPalette] = React.useState(() => loadPalette());
  const [paletteMenuOpen, setPaletteMenuOpen] = React.useState(false);
  const paletteMenuRef = React.useRef(null);
  const paletteStyle = React.useMemo(() => {
    const style = {};
    for (const key of COLOR_KINDS) style[COLOR_VARS[key]] = palette.colors[key];
    return style;
  }, [palette]);
  DIAG.palettePreset = palette.preset;
  const applyPalette = React.useCallback((next) => {
    setPalette(next);
    savePalette(next);
  }, []);
  const applyPreset = React.useCallback((preset) => {
    if (!PALETTES[preset]) return;
    applyPalette({ preset, colors: { ...PALETTES[preset] } });
  }, [applyPalette]);
  const setColor = React.useCallback((key, value) => {
    if (!HEX_RE.test(String(value ?? ''))) return;
    setPalette((prev) => {
      const next = { preset: 'custom', colors: { ...prev.colors, [key]: value } };
      savePalette(next);
      return next;
    });
  }, []);
  React.useEffect(() => {
    if (!paletteMenuOpen) return undefined;
    const close = (event) => {
      const node = paletteMenuRef.current;
      if (node && typeof node.contains === 'function' && !node.contains(event.target)) setPaletteMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [paletteMenuOpen]);
  React.useEffect(() => {
    if (!exportMenuOpen) return undefined;
    const close = (event) => {
      const node = exportMenuRef.current;
      if (node && typeof node.contains === 'function' && !node.contains(event.target)) setExportMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [exportMenuOpen]);

  const activeSession = targetSession ?? sessionId;

  const load = React.useCallback((mode, session, abort) => {
    if (!service) return;
    DIAG.loadAttempts += 1;
    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    const call = mode === 'tree' ? service.tree(session, abort?.signal ?? undefined)
      : mode === 'lineage' ? service.lineage(session, abort?.signal ?? undefined)
        : service.forest(abort?.signal ?? undefined);
    withTimeout(Promise.resolve(call), FETCH_TIMEOUT_MS, `mindTree.${mode}`)
      .then(unwrapResult)
      .then((result) => {
        if (abort?.signal?.aborted) return;
        if (mode === 'tree') setTreeData(result);
        else if (mode === 'lineage') setLineageData(result);
        else setForestData(result);
        DIAG.loadedView = mode;
        DIAG.rawNodeCount = Array.isArray(result?.nodes) ? result.nodes.length : 0;
        DIAG.nodeCount = DIAG.rawNodeCount;
        DIAG.lastLoadMs = Date.now() - startedAt;
        // 宿主版本指纹:用于确认宿主半区是否为最新代码(warnings 字段只有在 0.2.0+ 才会出现)。
        DIAG.hostWarnings = Array.isArray(result?.warnings) ? result.warnings : [];
        DIAG.hostFields = Object.keys(result ?? {}).sort();
        setLoading(false);
      })
      .catch((err) => {
        if (abort?.signal?.aborted) return;
        const message = err?.message ?? String(err);
        DIAG.lastError = message;
        setError(message);
        setLoading(false);
      });
  }, [service]);

  React.useEffect(() => {
    if (!service) return;
    const controller = new AbortController();
    load(view, activeSession, controller);
    return () => controller.abort();
  }, [service, view, activeSession, tick]);

  // 实时刷新:本会话有新事件时重新拉取;流中断自动重连。
  React.useEffect(() => {
    if (!service) return;
    const controller = new AbortController();
    let stopped = false;
    const run = async () => {
      let attempts = 0;
      while (!stopped && attempts < 12) {
        attempts += 1;
        try {
          for await (const rawFrame of service.follow(controller.signal)) {
            if (stopped) return;
            const frame = rawFrame && typeof rawFrame === 'object' && 'ok' in rawFrame && rawFrame.ok === true ? rawFrame.value : rawFrame;
            if (frame?.sessionId === activeSession) setTick((n) => n + 1);
          }
          return; // 正常结束
        } catch {
          if (stopped || controller.signal.aborted) return;
          // 等 2 秒×(尝试次数,上限 10 秒)后重连
          await new Promise((resolve) => setTimeout(resolve, 2000 * Math.min(attempts, 5)));
        }
      }
    };
    run();
    return () => { stopped = true; controller.abort(); };
  }, [service, activeSession]);

  const rawData = view === 'tree' ? treeData : view === 'lineage' ? lineageData : forestData;
  const displayed = React.useMemo(() => (view === 'tree' ? rawData : sessionsAsDisplay(rawData)), [view, rawData]);
  // 过程信息削减:只对"会话思维树"生效(血缘/森林本身就很稀疏);导出同一档位,所见即所得。
  const data = React.useMemo(
    () => (view === 'tree' ? REDUCE.reduceGraph(displayed, detailLevel) : displayed),
    [view, displayed, detailLevel],
  );
  const nodes = data?.nodes ?? [];
  const rawNodeCount = displayed?.nodes?.length ?? 0;
  const nodeMap = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [data]);
  const selectedNode = selected ? nodeMap.get(selected) : null;
  const canJump = activeSession === sessionId;

  // 视图切换(血缘/森林的数据也按需加载)。
  const switchView = (next) => {
    setView(next);
    setSelected(null);
    setDetail(null);
    setQuery('');
    if (next === 'tree') setTargetSession(null);
  };

  const fetchDetail = (node) => {
    // 工具活动聚合行是客户端合成的,没有宿主事件序号:展开折叠清单即可,不请求宿主。
    if (Array.isArray(node.grouped) && node.grouped.length > 0) {
      setLoadingDetail(false);
      setDetail({ grouped: node.grouped });
      return;
    }
    if (!service || node.seq < 0) return;
    setLoadingDetail(true);
    setDetail(null);
    withTimeout(Promise.resolve(service.detail(activeSession, node.seq, 2, 2)), FETCH_TIMEOUT_MS, 'mindTree.detail')
      .then(unwrapResult)
      .then(setDetail)
      .catch((err) => setError(err?.message ?? String(err)))
      .finally(() => setLoadingDetail(false));
  };

  /** 定位到对话位置:必要时切换会话 + 拉取历史 + 滚动到对应轮次。 */
  const jumpToNode = (node) => {
    if (node == null || node.turn == null) return;
    const targetId = activeSession;
    const selector = `[data-chat-turn="${node.turn}"]`;
    const attempt = () => {
      try {
        const el = document.querySelector(selector);
        if (el) {
          if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return true;
        }
      } catch { /* 忽略 */ }
      return false;
    };
    const current = (() => {
      try { return ctx.get('uiSession')?.adapter?.current?.getSnapshot?.()?.key; } catch { return undefined; }
    })();
    if (targetId && current !== targetId) {
      try { uiWorkspace.openSession(targetId); } catch { /* 忽略 */ }
    }
    let retries = 0;
    const retryLoop = () => {
      if (attempt()) return;
      retries += 1;
      if (retries >= 40) return;
      setTimeout(retryLoop, 200);
    };
    if (attempt()) return;
    try {
      const ref = ctx.sessions.retain({ sessionId: targetId }, { source: 'mind-tree.jump' });
      Promise.resolve(ref.ready)
        .then(() => Promise.resolve(ref.loadThrough(node.seq)))
        .finally(() => {
          retryLoop();
          setTimeout(() => { try { ref.release(); } catch { /* 忽略 */ } }, 8000);
        })
        .catch(() => {
          try { ref.release(); } catch { /* 忽略 */ }
          retryLoop();
        });
    } catch { retryLoop(); }
  };

  const openSession = (node) => {
    const childId = node.sessionId;
    if (!childId) return;
    if (node.origin === 'subagent') {
      const parentEdge = (data?.edges ?? []).find((e) => e.to === childId);
      if (parentEdge?.from) {
        try {
          uiWorkspace.openSession({ parentSessionId: parentEdge.from, childSessionId: childId, mode: 'continuable' });
          return;
        } catch { /* 回退普通打开 */ }
      }
    }
    try { uiWorkspace.openSession(childId); } catch { /* 忽略 */ }
  };

  const showTreeOf = (node) => {
    setView('tree');
    setTargetSession(node.sessionId);
    setSelected(null);
    setDetail(null);
  };

  const backToSession = () => {
    setTargetSession(null);
    setSelected(null);
    setDetail(null);
  };

  const toggle = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 画布宽度(响应侧栏尺寸变化,保证不横向裁切)。
  React.useEffect(() => {
    const element = boxRef.current;
    if (!element) return undefined;
    const measure = () => {
      const next = element.clientWidth || 0;
      if (next > 0) setCanvasWidth(next);
    };
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // 默认折叠:只展开最后一轮,避免一次铺开上千节点。
  // 仅在视图/会话切换后首次数据到达时生效;实时刷新不清空用户的展开状态。
  const collapseSeeded = React.useRef(false);
  React.useEffect(() => {
    collapseSeeded.current = false;
    setQuery('');
  }, [view, activeSession]);
  React.useEffect(() => {
    if (data == null || collapseSeeded.current) return;
    collapseSeeded.current = true;
    const { children } = buildHierarchy(data);
    const turnIds = (data.nodes ?? []).filter((n) => n.kind === 'turn').map((n) => n.id);
    const lastTurn = turnIds.length > 0 ? turnIds[turnIds.length - 1] : null;
    const next = new Set();
    for (const [id, kids] of children) {
      if (kids.length === 0) continue;
      if (view === 'tree' && id !== 'root' && id !== lastTurn) next.add(id);
    }
    DIAG.collapsedCount = next.size;
    setCollapsed(next);
  }, [data, view]);

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const { children } = buildHierarchy(data);
    const next = new Set();
    for (const [id, kids] of children) if (kids.length > 0) next.add(id);
    setCollapsed(next);
  };

  const viewButtons = ['tree', 'lineage', 'forest'].map((mode) => h('button', {
    key: mode,
    className: `mt-btn ${view === mode ? 'mt-btn-on' : ''}`,
    onClick: () => switchView(mode),
  }, t(`view.${mode}`)));

  // 信息量三档:精简(默认)/ 标准 / 完整。
  const levelButtons = REDUCE.DETAIL_LEVELS.map((level) => h('button', {
    key: level,
    className: `mt-btn mt-btn-level ${detailLevel === level ? 'mt-btn-on' : ''}`,
    title: `${t(`level.${level}`)} — ${t(`level.${level}.hint`)}`,
    onClick: () => setDetailLevel(level),
  }, t(`level.${level}`)));

  const saveExport = async (content, fileName, mime, description, extensions) => {
    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description, accept: { [mime]: extensions } }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        DIAG.lastExport = `saved:${handle.name ?? fileName}`;
        setExportNotice(`${t('export.saved')}: ${handle.name ?? fileName}`);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') {
          DIAG.lastExport = 'cancelled';
          setExportNotice(t('export.cancelled'));
          return;
        }
        DIAG.lastExport = `picker-failed:${error?.message ?? error}`;
        // 继续走下载回退
      }
    }
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    DIAG.lastExport = 'downloaded';
    setExportNotice(`${t('export.saved')}: ${fileName}`);
  };

  /** 导出入口:mindmap(Mermaid 导图) / outline(大纲) / canvas(原生画布) / json。 */
  const exportAs = async (format) => {
    try {
      if (displayed == null || (displayed.nodes ?? []).length === 0) return;
      // 与宿主 mind_tree 工具共用同一个生成器,保证两个入口导出的内容完全一致。
      // 大纲/JSON 跟随当前信息量档位(所见即所得);导图与画布本身就是抽稀过的骨架,直接用原始数据。
      const source = (format === 'mindmap' || format === 'canvas') && view === 'tree'
        ? displayed
        : data;
      const built = FMT.buildExport(source, format, {
        branchLabel: (kind) => branchLabel(kind, t),
        kindLabel: (kind) => t(`node.${kind}`),
      });
      const spec = FMT.EXPORT_FORMATS[built.format] ?? FMT.EXPORT_FORMATS.mindmap;
      await saveExport(built.content, built.fileName, built.mime, built.description, [spec.extension]);
    } catch (error) {
      DIAG.lastExport = String(error?.message ?? error);
      setExportNotice(`${t('export.failed')}: ${error?.message ?? error}`);
    }
  };

  return h(Boundary, null, h('div', { className: 'mt-root', style: paletteStyle },
    h('div', { className: 'mt-toolbar' },
      h('div', { className: 'mt-toolbar-left' }, viewButtons),
      h('div', { className: 'mt-toolbar-right' },
        h('span', {
          className: `mt-status-chip ${failed ? 'mt-status-chip-bad' : service ? 'mt-status-chip-ok' : ''}`,
          title: failed ? String(DIAG.lastError ?? '') : '',
        }, failed ? t('status.failed') : service ? t('status.ready') : t('status.connecting')),
        h('span', { className: 'mt-level-group', title: t('level.hint') }, levelButtons),
        h('button', { className: 'mt-btn', onClick: expandAll, title: t('expandAll') }, t('expand.short')),
        h('button', { className: 'mt-btn', onClick: collapseAll, title: t('collapseAll') }, t('collapse.short')),
        h('div', { className: 'mt-menu-wrap', ref: paletteMenuRef },
          h('button', {
            className: 'mt-btn',
            onClick: () => setPaletteMenuOpen((open) => !open),
            title: t('palette.button'),
          }, `${t('palette.button')} ▾`),
          paletteMenuOpen && h('div', { className: 'mt-menu mt-menu-wide' },
            h('div', { className: 'mt-menu-title' }, t('palette.preset')),
            h('div', { className: 'mt-preset-row' },
              ['soft', 'vivid', 'slate'].map((preset) => h('button', {
                key: preset,
                className: `mt-btn mt-btn-level ${palette.preset === preset ? 'mt-btn-on' : ''}`,
                onClick: () => applyPreset(preset),
              }, t(`palette.${preset}`)))),
            h('div', { className: 'mt-color-list' },
              COLOR_KINDS.map((key) => h('label', { className: 'mt-color-row', key },
                h('input', {
                  className: 'mt-color-input',
                  type: 'color',
                  value: palette.colors[key],
                  // onInput 直连原生 input 事件;onChange 作为兼容补充(两者同值时幂等)。
                  onInput: (event) => setColor(key, event.target.value),
                  onChange: (event) => setColor(key, event.target.value),
                }),
                h('span', { className: 'mt-color-swatch', style: { background: palette.colors[key] } }),
                h('span', { className: 'mt-color-name' }, t(`color.${key}`))))),
            h('button', {
              className: 'mt-menu-item',
              onClick: () => { applyPreset(DEFAULT_PRESET); },
            }, t('palette.reset')),
            h('div', { className: 'mt-menu-hint' }, t('palette.hint')))),
        h('div', { className: 'mt-menu-wrap', ref: exportMenuRef },
          h('button', {
            className: 'mt-btn',
            onClick: () => setExportMenuOpen((open) => !open),
            title: t('export'),
          }, `${t('export')} ▾`),
          exportMenuOpen && h('div', { className: 'mt-menu' },
            h('button', {
              className: 'mt-menu-item',
              onClick: () => { setExportMenuOpen(false); exportAs('mindmap'); },
            }, t('export.mindmap')),
            h('button', {
              className: 'mt-menu-item',
              onClick: () => { setExportMenuOpen(false); exportAs('outline'); },
            }, t('export.outline')),
            h('button', {
              className: 'mt-menu-item',
              onClick: () => { setExportMenuOpen(false); exportAs('canvas'); },
            }, t('export.canvas')),
            h('div', { className: 'mt-menu-hint' }, t('export.hint')))),
        exportNotice && h('span', { className: 'mt-export-notice', title: exportNotice }, exportNotice.replace(/^[^:：]*[:：]\s*/, '').slice(0, 24)),
        h('button', { className: 'mt-btn', onClick: () => setTick((n) => n + 1), title: t('refresh') },
          h(GlyphRefresh, { size: 13 })))),
    h('div', { className: 'mt-searchbar' },
      h('input', {
        className: 'mt-search',
        type: 'search',
        placeholder: t('search'),
        value: query,
        onChange: (event) => setQuery(event.target.value ?? ''),
      }),
      query && h('button', { className: 'mt-btn', onClick: () => setQuery('') }, '×')),
    activeSession && activeSession !== sessionId && h('div', { className: 'mt-breadcrumb' },
      h('button', { className: 'mt-btn', onClick: backToSession }, `‹ ${t('detail.backToSession')}`),
      h('span', { className: 'mt-breadcrumb-id' }, activeSession.slice(0, 12))),
    (Array.isArray(data?.warnings) && data.warnings.length > 0) && h('div', { className: 'mt-warn' },
      h('span', { className: 'mt-warn-title' }, `${t('warning')}: `),
      h('span', null, data.warnings.join('；'))),
    h('div', { ref: boxRef, className: 'mt-canvas' },
      failed && h('div', { className: 'mt-status mt-status-error' },
        h('div', { className: 'mt-error-box' },
          h('div', null, t('error')),
          h('div', { className: 'mt-error-detail' }, String(DIAG.lastError ?? '')),
          h('button', {
            className: 'mt-btn',
            onClick: () => { setFailed(false); setServiceNonce((n) => n + 1); },
          }, t('retry')))),
      !failed && loading && data == null && h('div', { className: 'mt-status' }, t('loading')),
      !failed && error && h('div', { className: 'mt-status mt-status-error' },
        h('div', { className: 'mt-error-box' },
          h('div', null, `${t('error')}: ${error}`),
          h('button', { className: 'mt-btn', onClick: () => setTick((n) => n + 1) }, t('retry')))),
      !failed && data != null && nodes.length === 0 && h('div', { className: 'mt-status' },
        h('div', { className: 'mt-error-box' },
          h('div', null, t('empty')),
          h('button', { className: 'mt-btn', onClick: () => setTick((n) => n + 1) }, t('refresh')))),
      !failed && data != null && nodes.length > 0 && h(TreeCanvas, {
        // 带上 reduction 等元数据(诊断探针与提示需要),节点/边用削减后的集合。
        data: { ...data, nodes, edges: data.edges ?? [] },
        palette,
        collapsed,
        query,
        onToggle: toggle,
        onJump: jumpToNode,
        onSelect: (node) => {
          setSelected(node.id);
          // 聚合行直接在客户端展开折叠清单(没有对应的宿主事件)。
          if (Array.isArray(node.grouped) && node.grouped.length > 0) setDetail({ grouped: node.grouped });
          else setDetail(null);
        },
        selectedId: selected,
        t,
        width: canvasWidth,
      }),
      data != null && nodes.length > 0 && h('div', { className: 'mt-hint' }, t('click.hint'))),
    selectedNode && h(DetailPanel, {
      node: selectedNode, detail, loadingDetail,
      onClose: () => { setSelected(null); setDetail(null); },
      onJump: jumpToNode,
      onEvent: fetchDetail,
      onOpenSession: openSession,
      onShowTree: showTreeOf,
      onBack: backToSession,
      canJump,
      showBack: activeSession !== sessionId,
      t,
    })));
}

function MindTreeTitle(props) {
  const { useTabInfo, locale } = props;
  const language = languageOf(locale);
  const title = MESSAGES[language]?.['tab.title'] ?? MESSAGES.zh['tab.title'];
  return h(React.Fragment, null, h(GlyphTree, { size: 13 }), h('span', { style: { marginLeft: 6 } }, title));
}

/** 会话行右键菜单项:"查看思维树"。 */
function MindTreeMenuItem(props) {
  const { openMindTreeFor, useMenuOpenState, sessionId } = props;
  const [, setMenuOpen] = typeof useMenuOpenState === 'function' ? useMenuOpenState() : [false, () => {}];
  const label = MESSAGES[currentLanguage]?.['menu.open'] ?? MESSAGES.zh['menu.open'];
  const onSelect = () => {
    try { setMenuOpen(false); } catch { /* 忽略 */ }
    if (typeof openMindTreeFor === 'function') openMindTreeFor(sessionId);
  };
  return h(MenuItemButton, {
    icon: h(GlyphTree, { size: 14 }),
    onSelect,
  }, label);
}

// ---------------- 插件 ----------------
module.exports = {
  inject: ['slots', 'sessions', 'locale', 'remote', 'uiWorkspace', 'sidebarRightTabs', 'sidebarRight'],
  apply(ctx) {
    // 样式:只注入一次,随插件卸载移除。
    const style = document.createElement('style');
    style.dataset.dyn = PACKAGE_ID;
    style.textContent = `
.mt-root{display:flex;flex-direction:column;height:100%;min-height:220px;font-size:12px;color:var(--dsw-alias-label-primary,#111827);background:var(--dsw-alias-bg-base,#fff)}
.mt-root *{box-sizing:border-box}
.mt-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.mt-toolbar-left{display:flex;flex-wrap:wrap;gap:4px;min-width:0}
.mt-toolbar-right{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-left:auto;justify-content:flex-end}
.mt-btn{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fafafa);color:var(--dsw-alias-label-primary,#111827);font-size:11.5px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.mt-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.mt-btn-on{background:var(--dsw-alias-brand-primary,#111827);color:var(--dsw-alias-label-primary-foreground,#fff);border-color:var(--dsw-alias-brand-primary,#111827)}
.mt-btn-primary{background:var(--dsw-alias-brand-primary,#111827);color:var(--dsw-alias-label-primary-foreground,#fff)}
.mt-breadcrumb{display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.mt-breadcrumb-id{color:var(--dsw-alias-label-secondary,#61666b);font-size:11px}
.mt-canvas{position:relative;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
.mt-searchbar{display:flex;align-items:center;gap:4px;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.mt-search{flex:1;min-width:0;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fafafa);color:var(--dsw-alias-label-primary,#111827);font-size:11.5px;outline:none}
.mt-search:focus{border-color:var(--dsw-alias-brand-primary,#111827)}
.mt-error-box{display:flex;flex-direction:column;gap:8px;align-items:center;max-width:86%;text-align:center}
.mt-error-detail{font-size:10.5px;color:var(--dsw-alias-label-secondary,#61666b);word-break:break-all;white-space:pre-wrap}
.mt-export-notice{font-size:10.5px;color:var(--dsw-alias-state-success-primary,#059669);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt-warn{margin:4px 8px 0;padding:5px 8px;border-radius:6px;font-size:10.5px;line-height:1.5;color:var(--dsw-alias-state-warning-primary,#b45309);background:color-mix(in srgb, var(--dsw-alias-state-warning-primary,#b45309) 12%, transparent);border:1px solid color-mix(in srgb, var(--dsw-alias-state-warning-primary,#b45309) 35%, transparent)}
.mt-warn-title{font-weight:600}
.mt-level-group{display:inline-flex;flex:0 0 auto;gap:2px;padding:1px;border-radius:7px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.04))}
.mt-btn-level{padding:3px 6px;font-size:10.5px;opacity:.75}
.mt-btn-level.mt-btn-on{opacity:1;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.mt-menu-wide{min-width:250px;max-height:70vh;overflow:auto}
.mt-menu-title{padding:4px 9px 2px;font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary,#61666b)}
.mt-preset-row{display:flex;gap:4px;padding:2px 6px 6px}
.mt-color-list{display:grid;grid-template-columns:1fr 1fr;gap:2px 6px;padding:4px 6px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}
.mt-color-row{display:flex;align-items:center;gap:5px;padding:2px 3px;border-radius:5px;cursor:pointer;font-size:11px}
.mt-color-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.mt-color-input{width:18px;height:18px;padding:0;border:none;background:none;cursor:pointer;flex:0 0 auto}
.mt-color-swatch{width:12px;height:12px;border-radius:3px;border:1px solid rgba(0,0,0,.15);flex:0 0 auto}
.mt-color-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt-group-list{margin-top:4px;max-height:220px;overflow:auto;border-left:2px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));padding-left:6px}
.mt-group-item{display:flex;gap:6px;padding:2px 0;font-size:11px;line-height:1.45}
.mt-group-seq{color:var(--dsw-alias-label-tertiary,#9ca3af);flex:none;font-variant-numeric:tabular-nums}
.mt-group-label{color:var(--dsw-alias-label-primary,#111827);word-break:break-word}
.mt-menu-wrap{position:relative;display:inline-flex}
.mt-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:30;min-width:230px;padding:4px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 24px rgba(0,0,0,.18)}
.mt-menu-item{display:block;width:100%;padding:6px 9px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#111827);font-size:11.5px;text-align:left;cursor:pointer}
.mt-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.08))}
.mt-menu-hint{padding:5px 9px 3px;font-size:10px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#9ca3af);border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));margin-top:3px}
.mt-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#61666b)}
.mt-status-error{color:var(--dsw-alias-state-error-primary,#dc2626)}
.mt-hint{position:sticky;bottom:0;left:0;padding:3px 8px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#9ca3af);background:var(--dsw-alias-bg-base,#fff);pointer-events:none}
.mt-detail{flex-shrink:0;max-height:46%;overflow:auto;border-top:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));padding:8px 10px;background:var(--dsw-alias-bg-layer-1,#fafafa)}
.mt-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.mt-detail-title{font-weight:600;font-size:12.5px;white-space:pre-wrap;word-break:break-all}
.mt-detail-summary{margin-top:4px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#61666b);word-break:break-all}
.mt-detail-meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.mt-chip{display:inline-block;padding:1px 7px;border-radius:99px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));color:var(--dsw-alias-label-secondary,#61666b);font-size:10.5px}
.mt-chip-warn{color:var(--dsw-alias-state-warn-primary,#b45309);border-color:var(--dsw-alias-state-warn-primary,#b45309)}
.mt-detail-branch{margin-top:8px;padding:6px 8px;border-left:3px solid #f59e0b;background:var(--dsw-alias-bg-layer-2,#f3f4f6);border-radius:0 6px 6px 0}
.mt-branch-title{font-weight:600;color:#92400e;font-size:11.5px}
.mt-detail-section{margin-top:5px;color:var(--dsw-alias-label-secondary,#61666b);font-size:11px;white-space:pre-wrap;word-break:break-all}
.mt-question-text{margin-top:6px;font-weight:600;font-size:11.5px}
.mt-options{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
.mt-option{display:inline-block;padding:1px 7px;border-radius:99px;background:var(--dsw-alias-brand-primary,#111827);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:10.5px}
.mt-todo{display:flex;align-items:center;gap:5px;margin-top:3px;font-size:11px;color:var(--dsw-alias-label-primary,#111827)}
.mt-todo.completed{opacity:.55;text-decoration:line-through}
.mt-todo-dot{color:var(--dsw-alias-state-success-primary,#059669);font-weight:700}
.mt-detail-text{margin-top:8px;font-size:11.5px;line-height:1.55;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-primary,#111827)}
.mt-detail-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.mt-detail-json{margin-top:8px;padding:8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);font-size:10.5px;line-height:1.5;overflow:auto;max-height:220px;color:var(--dsw-alias-label-secondary,#61666b)}
.mt-status-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;font-size:10.5px;color:var(--dsw-alias-label-secondary,#61666b);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16))}
.mt-status-chip-ok{color:var(--dsw-alias-state-success-primary,#059669);border-color:var(--dsw-alias-state-success-primary,#059669)}
.mt-status-chip-bad{color:var(--dsw-alias-state-error-primary,#dc2626);border-color:var(--dsw-alias-state-error-primary,#dc2626)}
`;
    document.head.append(style);
    ctx.effect(() => () => style.remove(), 'mind-tree.styles');
    DIAG.applied = true;
    currentLanguage = languageOf(ctx.locale);
    try {
      ctx.locale.subscribe(() => { currentLanguage = languageOf(ctx.locale); });
    } catch { /* 忽略 */ }

    // 会话行右键菜单:"查看思维树"(切换会话 → 打开右侧栏并定位到思维树页签)。
    const openMindTreeFor = (sessionId) => {
      DIAG.menuClicks += 1;
      let current;
      try { current = ctx.get('uiSession')?.adapter?.current?.getSnapshot?.()?.key; } catch { current = undefined; }
      if (sessionId && current !== sessionId) {
        try { ctx.uiWorkspace.openSession(sessionId); } catch (error) { DIAG.lastError = error?.message ?? String(error); }
      }
      let attempts = 0;
      const attempt = () => {
        attempts += 1;
        try {
          ctx.sidebarRight.openTab(TAB_KIND, { revealIfOpened: true });
          return true;
        } catch { return false; }
      };
      if (attempt()) return;
      const timer = window.setInterval(() => {
        if (attempt() || attempts >= 40) window.clearInterval(timer);
      }, 150);
    };

    // 首次加载:自动展开右侧栏并打开思维树页签(有会话上屏时才可行,失败则重试)。
    const tryAutoOpen = () => {
      if (DIAG.autoOpened) return true;
      try {
        ctx.sidebarRight.openTab(TAB_KIND, { revealIfOpened: true });
        DIAG.autoOpened = true;
        return true;
      } catch (error) {
        DIAG.autoOpenError = error?.message ?? String(error);
        return false;
      }
    };
    ctx.effect(() => {
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        if (tryAutoOpen() || attempts >= 40) window.clearInterval(timer);
      }, 250);
      tryAutoOpen();
      return () => window.clearInterval(timer);
    }, 'mind-tree.auto-open');

    // 注册右侧栏标签页类型(含引导入口)。
    ctx.effect(() => {
      const tabs = ctx.sidebarRightTabs;
      const disposeType = tabs.register({
        id: REGISTRY_ID,
        kind: TAB_KIND,
        priority: 'extension',
        title: () => {
          const language = currentLanguage;
          return MESSAGES[language]?.['tab.title'] ?? MESSAGES.zh['tab.title'];
        },
        guide: [{
          id: `${REGISTRY_ID}/guide`,
          order: 400,
          icon: GlyphTree,
          title: () => {
            const language = currentLanguage;
            return MESSAGES[language]?.['tab.title'] ?? MESSAGES.zh['tab.title'];
          },
          description: () => {
            const language = currentLanguage;
            const base = MESSAGES[language]?.['tab.guide'] ?? MESSAGES.zh['tab.guide'];
            return `${base}\n作者:ShOpenMind · github.com/ShOpenMind/dsh-plugin-mind-tree`;
          },
        }],
      });
      const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: REGISTRY_ID,
      }, (props) => h(MindTreeBodyInner, { ...props, ctx, uiWorkspace: ctx.uiWorkspace })));
      const disposeTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: REGISTRY_ID,
      }, (props) => h(MindTreeTitle, { ...props, locale: ctx.locale })));
      const disposeMenuItem = ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
        name: 'sidebar.workspaces.session.menu.item',
        id: 'mind-tree',
        order: 450,
      }, (props) => h(MindTreeMenuItem, { ...props, openMindTreeFor })));
      return () => {
        disposeMenuItem();
        disposeTitle();
        disposeBody();
        disposeType();
      };
    }, 'mind-tree.ui');

    // 诊断探针:让宿主/我可以通过 cordis_inspect_query 查看客户端状态。
    try {
      const probe = ctx.get('cordisInspect');
      if (probe && typeof probe.register === 'function') {
        probe.register({
          manifest: {
            id: 'MindTree',
            description: 'dsh-plugin-mind-tree 客户端诊断探针(只读)。',
            methods: [{
              name: 'state',
              description: '返回插件客户端半区的当前状态。',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false },
              outputSchema: { description: 'DIAG 状态对象' },
            }],
          },
          query: async (method) => {
            if (method === 'state') return { ...DIAG, language: currentLanguage };
            throw new Error(`MindTree 探针不支持方法 ${method}`);
          },
        });
      }
    } catch { /* 探针尽力而为 */ }
  },
};
