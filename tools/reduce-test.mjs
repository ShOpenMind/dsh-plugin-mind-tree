// 削减层的单元测试:三档策略、骨架保留、重新挂接、次级边裁剪。
import { reduceGraph, DETAIL_LEVELS, processNodeCount } from '../lib/reduce.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures += 1; console.error(`  ✗ ${name} ${detail}`); }
};

// 构造:2 轮;第 1 轮含 3 个普通工具调用 + 结果 + 分支工具 + 短助手 + 长助手;
// 第 2 轮含 1 个工具 + 结果 + 注入消息 + info 消息 + session 子节点(挂在第 1 轮工具下)。
const nodes = [
  { id: 'root', seq: -1, kind: 'info', label: '会话根', surface: 'current' },
  { id: 't1', seq: 1, kind: 'turn', turn: 1, label: '第 1 轮', summary: '第一轮摘要', usage: { input: 100, output: 20, total: 120, messageCount: 5 }, surface: 'current' },
  { id: 'u1', seq: 2, kind: 'user', turn: 1, label: '真实用户请求内容', surface: 'current' },
  { id: 'a1', seq: 3, kind: 'assistant', turn: 1, label: '好的', surface: 'current' },
  { id: 'c1', seq: 4, kind: 'tool', turn: 1, label: '工具 pwsh (echo hi)', surface: 'current' },
  { id: 'r1', seq: 5, kind: 'result', turn: 1, label: 'hi', surface: 'current' },
  { id: 'c2', seq: 6, kind: 'tool', turn: 1, label: '工具 read (a.txt)', surface: 'current' },
  { id: 'r2', seq: 7, kind: 'result', turn: 1, label: '文件内容', surface: 'current' },
  { id: 'c3', seq: 8, kind: 'tool', turn: 1, label: '工具 todo_write', branch: { kind: 'todo', detail: { todos: [] } }, surface: 'current' },
  { id: 'r3', seq: 9, kind: 'result', turn: 1, label: '已更新', surface: 'current' },
  { id: 's1', seq: 10, kind: 'session', turn: 1, label: '子会话', sessionId: 'child-1', origin: 'subagent', surface: 'current' },
  { id: 'a2', seq: 11, kind: 'assistant', turn: 1, label: '这是一段足够长的实质性说明文本,用于验证标准档是否会保留它,长度需要超过六十个字符才能通过阈值判定,所以这里继续补充一些文字。', surface: 'current' },
  { id: 't2', seq: 12, kind: 'turn', turn: 2, label: '第 2 轮', summary: '第二轮摘要', surface: 'current' },
  { id: 'i1', seq: 13, kind: 'info', turn: 2, label: 'system 注入内容', surface: 'current' },
  { id: 'inj', seq: 14, kind: 'user', turn: 2, label: '[model changed: assistant turns above this point]', surface: 'current' },
  { id: 'u2', seq: 15, kind: 'user', turn: 2, label: '第二个真实问题', surface: 'current' },
  { id: 'c4', seq: 16, kind: 'tool', turn: 2, label: '工具 grep (foo)', surface: 'current' },
  { id: 'r4', seq: 17, kind: 'result', turn: 2, label: '匹配行', surface: 'current' },
  { id: 'a3', seq: 18, kind: 'assistant', turn: 2, label: '好的', surface: 'current' },
];
const edges = [
  { from: 'root', to: 't1', kind: 'next' },
  { from: 't1', to: 't2', kind: 'next' },
  { from: 't1', to: 'u1', kind: 'step' },
  { from: 't1', to: 'a1', kind: 'step' },
  { from: 't1', to: 'c1', kind: 'step' },
  { from: 'c1', to: 'r1', kind: 'result' },
  { from: 't1', to: 'c2', kind: 'step' },
  { from: 'c2', to: 'r2', kind: 'result' },
  { from: 't1', to: 'c3', kind: 'step' },
  { from: 'c3', to: 'r3', kind: 'result' },
  { from: 't1', to: 's1', kind: 'spawn' },
  { from: 't1', to: 'a2', kind: 'step' },
  { from: 't2', to: 'i1', kind: 'step' },
  { from: 't2', to: 'inj', kind: 'step' },
  { from: 't2', to: 'u2', kind: 'step' },
  { from: 't2', to: 'c4', kind: 'step' },
  { from: 'c4', to: 'r4', kind: 'result' },
  { from: 't2', to: 'a3', kind: 'step' },
  { from: 'u1', to: 'u2', kind: 'derived' },
  { from: 'r1', to: 'r2', kind: 'replaced-by' },
];
const tree = { sessionId: 'session-reduce', title: '削减测试', nodes, edges, turnCount: 2 };

const ids = (result) => new Set(result.nodes.map((n) => n.id));
const kinds = (result, kind) => result.nodes.filter((n) => n.kind === kind);

console.log('[reduce-test] full 档');
{
  const result = reduceGraph(tree, 'full');
  check('full 原样返回', result === tree && result.nodes.length === nodes.length);
}

console.log('[reduce-test] compact 档');
{
  const result = reduceGraph(tree, 'compact');
  const set = ids(result);
  check('保留根与轮次', set.has('root') && set.has('t1') && set.has('t2'));
  check('去掉全部工具结果', kinds(result, 'result').length === 0);
  check('去掉 info 注入', kinds(result, 'info').filter((n) => n.id !== 'root').length === 0);
  check('去掉注入型用户消息', !set.has('inj'));
  check('保留真实用户消息', set.has('u1') && set.has('u2'));
  check('短助手过程消息被去掉', !set.has('a1'));
  check('保留每轮最后一条助手回复(第 1 轮)', set.has('a2'));
  check('第 2 轮最后一条助手被保留', set.has('a3'));
  check('分支工具节点保留', set.has('c3'));
  check('普通工具调用被聚合', !set.has('c1') && !set.has('c2') && !set.has('c4'));
  const groups = result.nodes.filter((n) => n.kind === 'toolgroup');
  check('每轮生成 1 个工具聚合行', groups.length === 2, `实际 ${groups.length}`);
  const g1 = groups.find((g) => g.turn === 1);
  check('第 1 轮聚合行只计普通工具(2 个)', g1?.grouped?.length === 2, JSON.stringify(g1?.grouped));
  check('聚合行标签含工具名与计数', /工具活动 ×2/.test(g1?.label ?? '') && /pwsh/.test(g1?.label ?? ''), g1?.label);
  check('子会话节点保留', set.has('s1'));
  check('边重建后所有端点都存在', result.edges.every((e) => set.has(e.from) && set.has(e.to)),
    JSON.stringify(result.edges.filter((e) => !set.has(e.from) || !set.has(e.to))));
  check('轮次链保留', result.edges.some((e) => e.from === 'root' && e.to === 't1' && e.kind === 'next')
    && result.edges.some((e) => e.from === 't1' && e.to === 't2' && e.kind === 'next'));
  const g1Edge = result.edges.find((e) => e.to === g1?.id);
  check('聚合行挂在所属轮次下', g1Edge?.from === 't1', JSON.stringify(g1Edge));
  check('次级边按两端存在裁剪', result.edges.filter((e) => e.kind === 'replaced-by').length === 0);
  check('削减统计正确', result.reduction.level === 'compact' && result.reduction.before === nodes.length
    && result.reduction.after === result.nodes.length && result.reduction.foldedTools === 3,
    JSON.stringify(result.reduction));
  // root + 2 轮 + 2 条用户 + 2 条轮末助手 + 1 个分支工具 + 1 个子会话 + 2 个聚合行 = 11
  check('结果显著减少(19→11,过程项被折叠)', result.nodes.length === 11, `实际 ${result.nodes.length}`);
}

console.log('[reduce-test] standard 档');
{
  const result = reduceGraph(tree, 'standard');
  const set = ids(result);
  check('standard 保留工具明细行', set.has('c1') && set.has('c2') && set.has('c4'));
  check('standard 不生成聚合行', kinds(result, 'toolgroup').length === 0);
  check('standard 仍去掉工具结果', kinds(result, 'result').length === 0);
  check('standard 保留长助手文本', set.has('a2'));
  check('standard 仍去掉短助手', !set.has('a1'));
  check('standard 仍去掉注入内容', !set.has('i1') && !set.has('inj'));
  check('standard 行数多于 compact', result.nodes.length > reduceGraph(tree, 'compact').nodes.length);
}

console.log('[reduce-test] 边界');
{
  check('null 树返回 null', reduceGraph(null, 'compact') === null);
  check('无 nodes 的树不崩', reduceGraph({ edges: [] }, 'compact')?.nodes?.length === 0);
  check('未知档位按 compact 处理', reduceGraph(tree, 'nonsense').reduction.level === 'nonsense');
  const onlyRoot = { sessionId: 's', nodes: [{ id: 'root', kind: 'info', label: 'root', seq: -1 }], edges: [] };
  check('只有根时不崩', reduceGraph(onlyRoot, 'compact').nodes.length === 1);
  const orphan = {
    sessionId: 's',
    nodes: [
      { id: 'root', kind: 'info', label: 'root', seq: -1 },
      { id: 't1', kind: 'turn', turn: 1, label: '第 1 轮', seq: 1 },
      { id: 'x1', kind: 'assistant', turn: 1, label: '孤立节点(没有结构边)', seq: 2 },
    ],
    edges: [{ from: 'root', to: 't1', kind: 'next' }],
  };
  const reduced = reduceGraph(orphan, 'compact');
  check('孤立节点回落到所属轮次', reduced.edges.some((e) => e.from === 't1' && e.to === 'x1'), JSON.stringify(reduced.edges));
  check('DETAIL_LEVELS 三档', DETAIL_LEVELS.length === 3);
  check('processNodeCount 统计过程信息', processNodeCount(tree) === 10, String(processNodeCount(tree)));
}

console.log(failures === 0 ? '[reduce-test] 全部通过' : `[reduce-test] ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
