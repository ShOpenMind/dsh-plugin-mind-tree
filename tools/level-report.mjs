// 用真实会话量化三档削减效果(行数 / 体积 / 是否仍保留决策点)。
// 用法: node tools/level-report.mjs [sessionId]   (省略时取事件最多的会话)
import { apply } from '../lib/index.js';
import { reduceGraph } from '../lib/reduce.js';
import { buildExport } from '../lib/format.js';
import { SESSIONS_DIR, loadAllSessions } from './lib/sessions.mjs';

const entries = loadAllSessions();
if (entries.length === 0) {
  console.error(`[level-report] 未在 ${SESSIONS_DIR} 下找到任何会话日志`);
  process.exit(1);
}
// 目标会话:命令行参数指定 id,否则取事件最多的会话。
const requestedId = process.argv[2];
const target = requestedId
  ? entries.find((e) => e.id === requestedId)
  : entries[0];
if (target === undefined) {
  console.error(`[level-report] 找不到会话 ${requestedId ?? '(任意)'};可用会话数 ${entries.length}`);
  process.exit(1);
}
const records = entries.map((e) => ({ header: e.log.header, live: false, persisted: true }));
const sq = {
  async listSessions() { return records; },
  async readSession() { return { session: target.log.header, inheritedEventCount: 0, events: target.log.events }; },
  async readTitle() { return { title: target.log.header?.title ?? '会话', source: { kind: 'fallback' }, eventSeq: 1, updatedAt: 1 }; },
  async readTitleSnapshots() { return []; },
  async filterSessions() { return records; },
  async traceSession() { return { target: records[0], ancestors: [], descendants: [], complete: true, root: records[0] }; },
  async readEvent() { throw new Error('x'); },
};
const provided = {};
apply({ get: (n) => (n === 'sessionQuery' ? sq : undefined), inject: () => ({ dispose() {} }), on: () => () => {}, effect: (f) => { f(); return () => {}; }, provide: (n, v) => { provided[n] = v; }, logger: { warn() {}, info() {}, error() {} } });
const tree = await provided.mindTree.tree(target.log.header.id);
const labels = {
  branchLabel: (k) => k,
  kindLabel: (k) => k,
};

console.log(`真实会话:${tree.nodes.length} 节点 / ${tree.turnCount} 轮`);
console.log('');
console.log('档位      节点数   轮次  用户  分支  工具行  助手行  大纲体积');
for (const level of ['full', 'standard', 'compact']) {
  const reduced = reduceGraph(tree, level);
  const nodes = reduced.nodes;
  const count = (fn) => nodes.filter(fn).length;
  const outline = buildExport(reduced, 'outline', labels);
  const branches = count((n) => n.branch);
  const toolRows = count((n) => n.kind === 'tool' || n.kind === 'toolgroup');
  console.log(`${level.padEnd(9)} ${String(nodes.length).padStart(6)} ${String(count((n) => n.kind === 'turn')).padStart(6)} ${String(count((n) => n.kind === 'user')).padStart(5)} ${String(branches).padStart(5)} ${String(toolRows).padStart(7)} ${String(count((n) => n.kind === 'assistant')).padStart(7)}  ${(outline.content.length / 1024).toFixed(0).padStart(6)} KB`);
}
const compact = reduceGraph(tree, 'compact');
console.log('');
console.log('精简档保留的轮次数:', compact.nodes.filter((n) => n.kind === 'turn').length, '/', tree.turnCount);
console.log('精简档保留的分支类型:', JSON.stringify([...new Set(compact.nodes.filter((n) => n.branch).map((n) => n.branch.kind))]));
console.log('精简档工具聚合行样例:', compact.nodes.filter((n) => n.kind === 'toolgroup').slice(0, 3).map((n) => n.label).join(' | '));
console.log('精简档每轮节点数(前 6 轮):',
  [...Array(6)].map((_, i) => compact.nodes.filter((n) => n.turn === i + 1).length).join(', '));
