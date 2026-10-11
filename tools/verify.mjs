// 用真实会话日志验证 dsh-plugin-mind-tree 的宿主分析引擎。
// 用法: node tools/verify.mjs [sessionId]   (省略时取事件最多的会话)
// 会话目录默认 ~/.dsh/sessions,可用 DSH_SESSIONS_DIR 覆盖。
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { apply } from '../lib/index.js';
import { SESSIONS_DIR, loadAllSessions, pickSession } from './lib/sessions.mjs';

function foldTitle(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === 'session/title' && typeof events[i].data?.title === 'string') return events[i].data.title;
  }
  return undefined;
}

function buildFakeSessionQuery(entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const records = entries.map((e) => ({
    header: e.log.header, live: false, persisted: true,
  }));
  return {
    async listSessions() { return records; },
    async readSession(id) {
      const entry = byId.get(String(id));
      if (!entry) throw new Error(`session ${id} not found`);
      return { session: entry.log.header, inheritedEventCount: 0, events: entry.log.events };
    },
    async readTitle(id) {
      const entry = byId.get(String(id));
      if (!entry) return undefined;
      const title = foldTitle(entry.log.events);
      return title === undefined ? undefined : { title, source: { kind: 'fallback' }, eventSeq: 0, updatedAt: 0 };
    },
    async readTitleSnapshots(ids) {
      return (ids ?? []).map((id) => {
        const entry = byId.get(String(id));
        if (!entry) return { sessionId: String(id), status: 'rejected', reason: new Error('missing') };
        return {
          sessionId: String(id),
          status: 'fulfilled',
          value: { session: { id: String(id) }, ...(foldTitle(entry.log.events) !== undefined ? { title: { title: foldTitle(entry.log.events) } } : {}) },
        };
      });
    },
    async filterSessions(filters) {
      const parentFilter = filters.find((f) => f.kind === 'parent');
      const parents = parentFilter ? new Set(parentFilter.values.map(String)) : null;
      return records.filter((r) => !parents || parents.has(String(r.header?.parentSession)));
    },
    async traceSession(id) {
      const target = records.find((r) => String(r.header?.id) === String(id));
      if (!target) throw new Error(`session ${id} not found`);
      const ancestors = [];
      let cursor = target;
      const seen = new Set();
      while (cursor.header?.parentSession && !seen.has(cursor.header.parentSession)) {
        seen.add(cursor.header.parentSession);
        const parent = records.find((r) => String(r.header?.id) === String(cursor.header.parentSession));
        if (!parent) return { target, ancestors, descendants: [], complete: false, unresolvedParentId: cursor.header.parentSession };
        ancestors.push(parent);
        cursor = parent;
      }
      const childrenOf = (pid) => records
        .filter((r) => String(r.header?.parentSession) === String(pid))
        .map((r) => ({ session: r, descendants: childrenOf(r.header.id) }));
      return { target, ancestors, descendants: childrenOf(target.header.id), complete: true, root: cursor };
    },
    async readEvent({ sessionId, seq, before, after }) {
      const entry = byId.get(String(sessionId));
      if (!entry) throw new Error(`session ${sessionId} not found`);
      const events = entry.log.events;
      const index = events.findIndex((e) => e.seq === seq);
      if (index < 0) throw new Error(`event ${seq} not found`);
      const start = Math.max(0, index - before);
      const end = Math.min(events.length - 1, index + after);
      return {
        session: entry.log.header, inheritedEventCount: 0, target: events[index],
        events: events.slice(start, end + 1), startSeq: events[start].seq, endSeq: events[end].seq,
      };
    },
  };
}

const entries = loadAllSessions().map(({ id, dir, log }) => ({ id, dir, log }));
if (entries.length === 0) {
  console.error(`[verify] 未在 ${SESSIONS_DIR} 下找到任何会话日志;可用 DSH_SESSIONS_DIR 指定目录`);
  process.exit(1);
}

const requested = process.argv[2];
let targetEntry;
if (requested) {
  targetEntry = entries.find((e) => e.id === requested);
  if (!targetEntry) { console.error(`[verify] 会话不存在: ${requested}`); process.exit(1); }
} else {
  // 省略参数时取最近修改的会话。
  targetEntry = entries
    .map((e) => ({ e, mtime: statSync(join(e.dir, 'session.v4.jsonl.zstd'), { throwIfNoEntry: false })?.mtimeMs ?? 0 }))
    .sort((a, b) => b.mtime - a.mtime)[0].e;
}

console.log(`[verify] 目标会话: ${targetEntry.id}`);
console.log(`[verify] 事件数: ${targetEntry.log.events.length}`);
console.log(`[verify] 标题: ${foldTitle(targetEntry.log.events) ?? '(无)'}`);

const provided = {};
const mockCtx = {
  get(name) { return name === 'sessionQuery' ? buildFakeSessionQuery(entries) : undefined; },
  on() { return () => {}; },
  effect(fn) { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
  provide(name, value) { provided[name] = value; },
};
apply(mockCtx);
const service = provided.mindTree;
if (!service) { console.error('[verify] mindTree 服务未提供'); process.exit(1); }

// ---- tree ----
const tree = await service.tree(targetEntry.id);
const byKind = new Map();
for (const n of tree.nodes) byKind.set(n.kind, (byKind.get(n.kind) ?? 0) + 1);
console.log(`\n[tree] 节点 ${tree.nodes.length}, 边 ${tree.edges.length}, 轮次 ${tree.turnCount}`);
console.log('[tree] 节点种类:', Object.fromEntries(byKind));
const branches = tree.nodes.filter((n) => n.branch);
console.log('[tree] 分支节点分布:', Object.fromEntries([...branches.reduce((m, n) => m.set(n.branch.kind, (m.get(n.branch.kind) ?? 0) + 1), new Map())]));
const edgeKinds = new Map();
for (const e of tree.edges) edgeKinds.set(e.kind, (edgeKinds.get(e.kind) ?? 0) + 1);
console.log('[tree] 边种类:', Object.fromEntries(edgeKinds));
console.log('[tree] 轮次摘要:');
for (const n of tree.nodes.filter((x) => x.kind === 'turn')) {
  console.log(`   第 ${n.turn} 轮  →  ${n.summary ?? '(无摘要)'}`);
}
console.log('[tree] 样例分支节点:');
for (const b of branches.slice(0, 8)) console.log(`   #${b.seq} [${b.kind}] ${b.label.slice(0, 60)}  ← ${b.branch.kind}`);
console.log('[tree] 样例普通节点:');
for (const n of tree.nodes.filter((n) => !n.branch).slice(0, 6)) console.log(`   #${n.seq} [${n.kind}/${n.surface}] ${n.label.slice(0, 60)}`);

// ---- forest ----
const forest = await service.forest();
console.log(`\n[forest] 会话 ${forest.nodes.length}, 边 ${forest.edges.length}, 根 ${forest.roots.length}`);
for (const n of forest.nodes) console.log(`   ${n.sessionId.slice(0, 12)} origin=${n.origin ?? 'root'} parent=${n.parentSessionId ? n.parentSessionId.slice(0, 12) : '—'} ${n.title ?? ''}`.slice(0, 110));

// ---- lineage ----
const lineage = await service.lineage(targetEntry.id);
console.log(`\n[lineage] complete=${lineage.complete} target=${lineage.target.slice(0, 12)} nodes=${lineage.nodes.length} edges=${lineage.edges.length}`);

// ---- detail ----
const sample = tree.nodes.find((n) => n.seq >= 0 && n.kind === 'tool');
if (sample) {
  const detail = await service.detail(targetEntry.id, sample.seq, 1, 1);
  console.log(`\n[detail] seq=${detail.seq} 窗口 [${detail.startSeq},${detail.endSeq}] target.type=${detail.target?.type}`);
}
console.log('\n[verify] 全部通过');
