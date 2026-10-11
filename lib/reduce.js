// 过程信息削减层:把"事件日志式"的完整树压缩成"对话结构式"的思维树。
// 纯函数、无 DSH 依赖,客户端渲染与导出共用,可独立单测。
import { buildHierarchy, isInjectedLabel } from './format.js';

/**
 * 三档信息量:
 * - compact (默认):只留 轮次 + 用户真实发言 + 分支节点 + 每轮工具活动聚合 1 行 + 每轮最终助手回复;
 * - standard:在 compact 基础上保留实质性助手过程文本(≥ MIN_ASSISTANT_STANDARD 字)与工具明细行,去掉工具结果;
 * - full:不做任何削减(与事件日志一一对应)。
 */
export const DETAIL_LEVELS = ['compact', 'standard', 'full'];

/** standard 档保留的助手文本最小字数。 */
export const MIN_ASSISTANT_STANDARD = 60;
/** 工具聚合行里展示的工具名个数。 */
const GROUP_NAME_LIMIT = 4;

const charLength = (text) => [...String(text ?? '')].length;

/** 工具名:去掉"工具 "前缀与参数部分。 */
function toolName(label) {
  return String(label ?? '工具')
    .replace(/^工具\s*/, '')
    .split(/[\s(（:：]/)[0] || '工具';
}

/** 每轮最后一条助手消息(视为该轮答复)。 */
function lastAssistantIds(nodes) {
  const byTurn = new Map();
  for (const node of nodes) {
    if (node.kind !== 'assistant') continue;
    const key = node.turn ?? -1;
    if (!byTurn.has(key)) byTurn.set(key, []);
    byTurn.get(key).push(node);
  }
  const ids = new Set();
  for (const list of byTurn.values()) ids.add(list[list.length - 1].id);
  return ids;
}

/**
 * 削减思维树。
 * @param tree - { sessionId, title, nodes, edges, turnCount }
 * @param level - compact | standard | full
 * @returns 与原结构同形的新对象;full 档原样返回。附 `reduction` 统计与 `grouped` 折叠信息。
 */
export function reduceGraph(tree, level = 'compact') {
  if (tree === null || tree === undefined) return tree;
  if (level === 'full') return tree;
  const nodes = tree.nodes ?? [];
  const keepIds = new Set();
  const isCompact = level === 'compact';
  const minAssistant = isCompact ? Number.POSITIVE_INFINITY : MIN_ASSISTANT_STANDARD;
  const lastOfTurn = lastAssistantIds(nodes);
  /** 归入工具聚合行的节点(turn -> 节点数组)。 */
  const groupBuckets = new Map();

  for (const node of nodes) {
    // 根节点与轮次节点始终保留(树骨架)。
    if (node.id === 'root' || node.kind === 'turn') { keepIds.add(node.id); continue; }
    // 分支节点(决策点)始终保留,哪怕它是工具调用或助手消息。
    if (node.branch) { keepIds.add(node.id); continue; }
    switch (node.kind) {
      case 'result':
        continue; // 工具输出:折叠掉(可在工具行详情中查看)
      case 'info':
        continue; // system / developer 注入内容
      case 'user':
        if (isInjectedLabel(node.label)) continue; // 模型切换、运行时上下文、后台任务通知
        break;
      case 'assistant':
        if (!(lastOfTurn.has(node.id) || charLength(node.label) >= minAssistant)) continue;
        break;
      case 'tool': {
        if (!isCompact) break; // standard 保留工具明细行
        const key = node.turn ?? -1;
        if (!groupBuckets.has(key)) groupBuckets.set(key, []);
        groupBuckets.get(key).push(node);
        continue;
      }
      default:
        break;
    }
    keepIds.add(node.id);
  }

  // 生成每轮的"工具活动"聚合行。
  const synthetic = [];
  for (const [turn, list] of groupBuckets) {
    if (list.length === 0) continue;
    const counts = new Map();
    for (const item of list) {
      const name = toolName(item.label);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, GROUP_NAME_LIMIT)
      .map(([name, count]) => (count > 1 ? `${name}×${count}` : name));
    const rest = counts.size - top.length;
    synthetic.push({
      id: `tg:${turn}`,
      seq: list[0].seq,
      type: 'tool/group',
      kind: 'toolgroup',
      ...(turn >= 0 ? { turn } : {}),
      label: `工具活动 ×${list.length} · ${top.join(' ')}${rest > 0 ? ` +${rest}` : ''}`,
      surface: 'current',
      // 自带折叠清单(含标签与序号),这样聚合行在"精简"档下也能独立展示与搜索。
      grouped: list.map((item) => ({ id: item.id, label: item.label, seq: item.seq, kind: item.kind })),
    });
  }

  const reducedNodes = [...nodes.filter((n) => keepIds.has(n.id)), ...synthetic];
  const keptIds = new Set(reducedNodes.map((n) => n.id));
  const { children, parentOf } = buildHierarchy(tree);

  // 重新挂接:每个保留节点挂到"最近的保留祖先";找不到则挂到所属轮次,再退到根。
  const nearestKeptAncestor = (node) => {
    let cursor = parentOf.get(node.id);
    const seen = new Set([node.id]);
    while (cursor !== undefined && !seen.has(cursor)) {
      if (keptIds.has(cursor)) return cursor;
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
    return undefined;
  };
  const turnIdOf = (node) => (node.turn != null && keptIds.has(`t${node.turn}`) ? `t${node.turn}` : undefined);
  const fallbackParent = (node) => turnIdOf(node)
    ?? (keptIds.has('root') ? 'root' : undefined);

  const edges = [];
  const roots = reducedNodes.filter((n) => n.kind === 'turn' || n.id === 'root');
  const rootId = reducedNodes.find((n) => n.id === 'root')?.id;
  const turns = reducedNodes.filter((n) => n.kind === 'turn').sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0));
  let previous = rootId;
  for (const turn of turns) {
    edges.push({ from: previous ?? turn.id, to: turn.id, kind: 'next' });
    previous = turn.id;
  }
  for (const node of reducedNodes) {
    if (node.id === 'root' || node.kind === 'turn') continue;
    const parent = node.kind === 'toolgroup'
      ? (fallbackParent(node) ?? rootId)
      : (nearestKeptAncestor(node) ?? fallbackParent(node) ?? rootId);
    if (parent === undefined || parent === node.id) continue;
    edges.push({ from: parent, to: node.id, kind: 'step' });
  }
  // 次级边(被替换 / 派生):两端都保留才保留。
  for (const edge of tree.edges ?? []) {
    if (edge.kind !== 'replaced-by' && edge.kind !== 'derived') continue;
    if (!keptIds.has(edge.from) || !keptIds.has(edge.to)) continue;
    if (edge.from === edge.to) continue;
    edges.push({ from: edge.from, to: edge.to, kind: edge.kind });
  }

  return {
    ...tree,
    nodes: reducedNodes,
    edges,
    reduction: {
      level,
      before: nodes.length,
      after: reducedNodes.length,
      grouped: synthetic.length,
      foldedTools: [...groupBuckets.values()].reduce((sum, list) => sum + list.length, 0),
    },
  };
}

/** 便于 UI 显示:三档的中文/英文标签与说明。 */
export const DETAIL_LABELS = {
  compact: { zh: '精简', en: 'Compact' },
  standard: { zh: '标准', en: 'Standard' },
  full: { zh: '完整', en: 'Full' },
};

/** 统计:树里有多少"过程信息"节点(用于提示可以精简)。 */
export function processNodeCount(tree) {
  return (tree?.nodes ?? []).filter((n) => n.kind === 'result' || n.kind === 'info'
    || (n.kind === 'tool' && !n.branch) || (n.kind === 'user' && isInjectedLabel(n.label))).length;
}
