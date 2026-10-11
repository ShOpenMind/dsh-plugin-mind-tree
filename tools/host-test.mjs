// 宿主引擎单元测试:合成与畸形事件下的鲁棒性、token 聚合、替换语义、mind_tree 工具契约。
import { apply } from '../lib/index.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

/** 构造一个内存会话查询服务。 */
function fakeSessionQuery(entries) {
  const records = entries.map((e) => ({ header: e.header, live: false, persisted: true }));
  return {
    async listSessions() { return records; },
    async readSession(id) {
      const entry = entries.find((e) => String(e.header.id) === String(id));
      if (!entry) throw new Error(`session ${id} not found`);
      return { session: entry.header, inheritedEventCount: 0, events: entry.events };
    },
    async readTitle() { return undefined; },
    async readTitleSnapshots() { return []; },
    async filterSessions(filters) {
      const parentFilter = filters.find((f) => f.kind === 'parent');
      const parents = parentFilter ? new Set(parentFilter.values.map(String)) : null;
      return records.filter((r) => !parents || parents.has(String(r.header?.parentSession)));
    },
    async traceSession(id) {
      const target = records.find((r) => String(r.header.id) === String(id));
      if (!target) throw new Error('not found');
      const childrenOf = (pid) => records
        .filter((r) => String(r.header?.parentSession) === String(pid))
        .map((r) => ({ session: r, descendants: childrenOf(r.header.id) }));
      return { target, ancestors: [], descendants: childrenOf(target.header.id), complete: true, root: target };
    },
    async readEvent() { throw new Error('unused'); },
  };
}

const SESSION_ID = 'session-test-1';
const CHILD_ID = 'session-child-1';
const T0 = 1700000000000;
let seq = 0;
const ev = (type, data, extra = {}) => ({ type, seq: seq += 1, time: T0 + seq * 1000, data, ...extra });

const events = [
  // 第 1 轮:用户消息 + 两条带 usage 的助手消息 + 工具调用/结果 + 子代理派生
  ev('turn/start', { turn: 1 }),
  ev('user/message', { role: 'user', content: [{ type: 'text', text: '请帮我写一个正则,用于校验手机号' }] }),
  ev('assistant/message', {
    turn: 1, step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text: '好的,手机号正则如下' }] },
    usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200, cacheReadTokens: 300 },
  }),
  ev('tool/call', { turn: 1, step: 1, callId: 'call-1', name: 'pwsh', arguments: '{"command":"echo hi"}' }),
  ev('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'call-1', content: [{ type: 'text', text: 'hi' }] } }),
  ev('tool/call', { turn: 1, step: 1, callId: 'call-sub', name: 'subagent', arguments: '{"description":"调研正则库"}' }),
  ev('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'call-sub', content: [{ type: 'text', text: '子代理已启动' }] } }),
  ev('assistant/message', {
    turn: 1, step: 2,
    message: { role: 'assistant', content: [{ type: 'text', text: '完成' }] },
    usage: { inputTokens: 800, outputTokens: 100 },
  }),
  ev('turn/end', { turn: 1, reason: { kind: 'completed' } }),
  // 第 2 轮:提问(分支)+ 未知事件 + 助手消息
  ev('turn/start', { turn: 2 }),
  ev('user/message', { role: 'user', content: [{ type: 'text', text: '〔图片〕 用表格整理一下' }] }),
  ev('tool/call', {
    turn: 2, step: 1, callId: 'call-2', name: 'ask_user_question',
    arguments: '{"questions":[{"question":"选哪个方案?","options":[{"label":"方案A"},{"label":"方案B"}]}]}',
  }),
  { type: 'unknown/future-event', seq: seq += 1, time: T0 + seq * 1000, data: { whatever: 1 }, ignorable: true },
  ev('assistant/message', {
    turn: 2, step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text: '提问中' }] },
    usage: { inputTokens: 500, outputTokens: 50, reasoningTokens: 200 },
  }),
  ev('turn/end', { turn: 2, reason: { kind: 'completed' } }),
  // 第 3 轮:畸形数据不应中断分析
  ev('turn/start', { turn: 3 }),
  { type: 'user/message', seq: seq += 1, time: T0 + seq * 1000, data: null },
  { type: 'assistant/message', seq: seq += 1, time: T0 + seq * 1000, data: { message: { content: 'not-an-array' } } },
  ev('assistant/message', { turn: 3, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '第 3 轮正常回复' }] }, usage: { inputTokens: 10, outputTokens: 10 } }),
  { type: 'tool/result', seq: seq += 1, time: T0 + seq * 1000, data: undefined },
  { bogus: true, seq: seq += 1, time: T0 + seq * 1000 },
  null,
  ev('turn/end', { turn: 3, reason: { kind: 'forked' } }),
  // 第 4 轮:替换(编辑)产生 shadowed 分支
  ev('turn/start', { turn: 4 }),
  ev('user/message', { role: 'user', content: [{ type: 'text', text: '第一版问题' }] }),
  {
    type: 'user/message', seq: seq += 1, time: T0 + seq * 1000,
    data: { role: 'user', content: [{ type: 'text', text: '修正后的问题版本' }] },
    surfaceOp: { op: 'replace', startSeq: seq - 1, endSeq: seq - 1 },
  },
  ev('assistant/message', { turn: 4, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '回答' }] }, usage: { inputTokens: 300, outputTokens: 300 } }),
  ev('turn/end', { turn: 4, reason: { kind: 'completed' } }),
];

const entries = [
  { header: { id: SESSION_ID, version: 4, createdAt: T0, isSeeded: false }, events },
  { header: { id: CHILD_ID, version: 4, createdAt: T0 + 4500, parentSession: SESSION_ID, origin: 'subagent', isSeeded: false }, events: [] },
];

const provided = {};
const capturedTools = [];
const writes = [];
const mockTools = { register: (definition) => { capturedTools.push(definition); return () => {}; } };
const mockFs = {
  resolve: async (path) => ({ path }),
  writeText: async (target, content) => { writes.push({ path: target?.path ?? String(target), content }); },
  processPath: (target) => target?.path ?? String(target),
};
const services = { sessionQuery: fakeSessionQuery(entries), tools: mockTools, fs: mockFs };
const makeScope = () => ({
  get: (name) => services[name],
  effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
});
const mockCtx = {
  get: (name) => services[name],
  inject: (deps, cb) => { cb(makeScope()); return { dispose: () => {} }; },
  on: () => () => {},
  effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
  provide: (name, value) => { provided[name] = value; },
  logger: { warn: () => {}, info: () => {}, error: () => {} },
};
apply(mockCtx);
const service = provided.mindTree;

console.log('[host-test] 分析合成会话…');
const tree = await service.tree(SESSION_ID);

const byKind = new Map();
for (const n of tree.nodes) byKind.set(n.kind, (byKind.get(n.kind) ?? 0) + 1);
console.log('[host-test] 节点种类:', Object.fromEntries(byKind));

// 1. 完整性:4 轮、根节点、畸形事件不中断。
check('轮次数为 4', tree.turnCount === 4, `实际 ${tree.turnCount}`);
check('存在根节点', tree.nodes.some((n) => n.id === 'root'));
check('用户节点 >= 4', (byKind.get('user') ?? 0) >= 4, `实际 ${byKind.get('user')}`);
check('助手节点 >= 4', (byKind.get('assistant') ?? 0) >= 4, `实际 ${byKind.get('assistant')}`);
check('工具节点 >= 2', (byKind.get('tool') ?? 0) >= 2);

// 2. 每轮 token 聚合。
const t1 = tree.nodes.find((n) => n.kind === 'turn' && n.turn === 1);
const t2 = tree.nodes.find((n) => n.kind === 'turn' && n.turn === 2);
const t3 = tree.nodes.find((n) => n.kind === 'turn' && n.turn === 3);
const t4 = tree.nodes.find((n) => n.kind === 'turn' && n.turn === 4);
check('第 1 轮 usage 聚合正确', t1?.usage && t1.usage.input === 1800 && t1.usage.output === 300 && t1.usage.messageCount === 2,
  `实际 ${JSON.stringify(t1?.usage)}`);
check('第 1 轮 total 字段保留', t1?.usage?.total === 1200, `实际 ${t1?.usage?.total}`);
check('第 2 轮 reasoning 聚合', t2?.usage?.reasoning === 200, `实际 ${t2?.usage?.reasoning}`);
check('第 2 轮缓存读聚合为 0', t2?.usage?.cacheRead === 0, `实际 ${t2?.usage?.cacheRead}`);
check('第 3 轮畸形消息后仍聚合', t3?.usage && t3.usage.messageCount === 1 && t3.usage.input === 10, `实际 ${JSON.stringify(t3?.usage)}`);
check('第 1 轮有耗时', typeof t1?.usage?.durationMs === 'number' && t1.usage.durationMs > 0, `实际 ${t1?.usage?.durationMs}`);
check('第 4 轮有耗时', t4?.usage && t4.usage.durationMs > 0);

// 3. 轮次摘要。
check('第 1 轮摘要含"正则"', typeof t1?.summary === 'string' && t1.summary.includes('正则'), `实际 ${t1?.summary}`);
check('第 2 轮摘要含"表格"(图片标记被剔除)', typeof t2?.summary === 'string' && t2.summary.includes('表格') && !t2.summary.includes('图片'), `实际 ${t2?.summary}`);
check('第 3 轮摘要非空(畸形后回退助手文本)', typeof t3?.summary === 'string' && t3.summary.length >= 2, `实际 ${t3?.summary}`);

// 4. 分支节点。
const question = tree.nodes.find((n) => n.branch?.kind === 'question');
check('提问分支存在', question !== undefined);
check('提问分支携带选项', Array.isArray(question?.branch?.detail?.questions) && question.branch.detail.questions[0]?.options?.length === 2,
  `实际 ${JSON.stringify(question?.branch?.detail)}`);
const forked = tree.nodes.find((n) => n.branch?.kind === 'fork');
check('第 3 轮被标记为分叉', forked?.turn === 3);
const replaced = tree.nodes.find((n) => n.branch?.kind === 'replace');
check('替换分支存在', replaced !== undefined);
check('被替换节点进入 shadowed', tree.nodes.some((n) => n.surface === 'shadowed'));
check('存在 replaced-by 边', tree.edges.some((e) => e.kind === 'replaced-by'));

// 5. 子会话匹配:child.createdAt 与第 1 轮内工具时间接近,应挂到派生工具。
const childNode = tree.nodes.find((n) => n.kind === 'session');
check('子会话节点存在', childNode !== undefined && childNode.sessionId === CHILD_ID);
const spawnEdge = tree.edges.find((e) => e.to === childNode?.id && e.kind === 'spawn');
check('子会话通过 spawn 边挂接', spawnEdge !== undefined);
check('spawn 边起点是工具节点', spawnEdge ? tree.nodes.find((n) => n.id === spawnEdge.from)?.kind === 'tool' : false);

// 6. 空会话与不存在会话的错误处理。
const emptyTree = await service.tree(CHILD_ID);
check('空会话返回 1 个根节点', emptyTree.nodes.length === 1, `实际 ${emptyTree.nodes.length}`);
let missingError = null;
try { await service.tree('session-nonexistent'); } catch (error) { missingError = error; }
check('不存在的会话抛出错误(而非静默)', missingError !== null);

// 7. 森林与血统。
const forest = await service.forest();
check('森林包含 2 个会话', forest.nodes.length === 2);
check('森林边为 subagent', forest.edges[0]?.kind === 'subagent', JSON.stringify(forest.edges));
const lineage = await service.lineage(SESSION_ID);
check('血统完整且含子会话', lineage.complete === true && lineage.nodes.length === 2);

// 8. mind_tree 工具:注册契约与格式。
console.log('[host-test] 校验 mind_tree 工具…');
const tool = capturedTools.find((definition) => definition.name === 'mind_tree');
check('已注册 mind_tree 工具', tool !== undefined, `实际注册 ${capturedTools.map((d) => d.name).join(',')}`);
check('工具参数为 JSON Schema', tool?.parameters?.type === 'object' && tool.parameters.properties?.format?.enum?.length === 4);
check('工具参数含 level 档位', tool?.parameters?.properties?.level?.enum?.length === 3);
check('工具声明输出渲染器', typeof tool?.output?.render === 'function');
check('工具 schema 含全部参数', ['sessionId', 'format', 'view', 'writeTo', 'level'].every((key) => key in (tool?.parameters?.properties ?? {})));
check('输出 schema 为合法 JSON Schema(顶层 required)', Array.isArray(tool?.output?.schema?.required)
  && tool.output.schema.required.includes('summary') && tool.output.schema.properties?.summary?.required === undefined,
  JSON.stringify(tool?.output?.schema?.required));

const asAgent = { agent: { id: SESSION_ID } };
const mindmapResult = await tool.execute({ format: 'mindmap' }, asAgent);
check('导图导出含 mermaid mindmap', typeof mindmapResult.content === 'string'
  && mindmapResult.content.includes('```mermaid') && mindmapResult.content.includes('root(('), mindmapResult.summary);
check('导图统计:全量节点与轮次', mindmapResult.turns === 4 && mindmapResult.nodes === tree.nodes.length,
  `turns=${mindmapResult.turns} nodes=${mindmapResult.nodes}/${tree.nodes.length}`);
check('导图渲染器返回 text 块', Array.isArray(tool.output.render({}, mindmapResult))
  && tool.output.render({}, mindmapResult)[0]?.type === 'text');

const outlineFull = await tool.execute({ format: 'outline', level: 'full' }, asAgent);
check('大纲导出含轮次标题与列表', outlineFull.content.includes('## 第 1 轮') && outlineFull.content.includes('- #'),
  outlineFull.content.split('\n').slice(0, 6).join(' | '));

const jsonFull = await tool.execute({ format: 'json', level: 'full' }, asAgent);
let parsedJson = null;
try { parsedJson = JSON.parse(jsonFull.content); } catch { /* 下面断言 */ }
check('JSON 导出可解析', parsedJson !== null && Array.isArray(parsedJson.nodes));

// 9. writeTo 写盘。
const canvasResult = await tool.execute({ format: 'canvas', writeTo: 'C:/vault/session.canvas' }, asAgent);
check('writeTo 调用了 fs.writeText', writes.length === 1 && writes[0].path === 'C:/vault/session.canvas',
  JSON.stringify(writes.map((w) => w.path)));
check('writeTo 返回路径与字节数', canvasResult.path === 'C:/vault/session.canvas' && canvasResult.bytes > 0,
  JSON.stringify(canvasResult));
let writtenCanvas = null;
try { writtenCanvas = JSON.parse(writes[0]?.content ?? ''); } catch { /* 下面断言 */ }
check('写盘内容为合法 Obsidian 画布', writtenCanvas !== null && Array.isArray(writtenCanvas.nodes) && Array.isArray(writtenCanvas.edges));
check('writeTo 模式不把内容塞进返回值', canvasResult.content === undefined);

// 10. 参数边界。
let viewError = null;
try { await tool.execute({ format: 'mindmap', view: 'forest' }, asAgent); } catch (error) { viewError = error; }
check('血缘/森林视图拒绝导图格式', viewError !== null && String(viewError.message).includes('view=forest'), String(viewError?.message));
let sessionError = null;
try { await tool.execute({ format: 'mindmap' }, {}); } catch (error) { sessionError = error; }
check('无会话上下文时明确报错', sessionError !== null, String(sessionError?.message));
const forestOutline = await tool.execute({ format: 'outline', view: 'forest' }, asAgent);
check('森林视图支持大纲导出', forestOutline.turns === 0 && forestOutline.nodes === 2, String(forestOutline.summary));
const badFormat = await tool.execute({ format: 'nonsense' }, asAgent);
check('未知格式回退为导图', badFormat.format === 'mindmap', badFormat.format);

// 11. 上下文安全:大内容截断(full 档,因为精简档本身就会削掉过程信息)。
const bigEntries = [{
  header: { id: 'session-big', version: 4, createdAt: T0, isSeeded: false },
  events: [
    ev('turn/start', { turn: 1 }),
    ...Array.from({ length: 400 }, (_, index) => ev('tool/result', {
      turn: 1, step: 1,
      message: { role: 'tool', toolCallId: `call-${index}`, content: [{ type: 'text', text: `第 ${index} 条工具输出 ${'x'.repeat(300)}` }] },
    })),
    ev('turn/end', { turn: 1, reason: { kind: 'completed' } }),
  ],
}];
const bigCtx = {
  get: (name) => (name === 'sessionQuery'
    ? fakeSessionQuery(bigEntries)
    : (name === 'tools' ? mockTools : (name === 'fs' ? mockFs : undefined))),
  inject: (deps, cb) => { cb(makeScope()); return { dispose: () => {} }; },
  on: () => () => {},
  effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
  provide: (name, value) => { provided[name] = value; },
  logger: { warn: () => {}, info: () => {}, error: () => {} },
};
apply(bigCtx);
const bigTool = capturedTools.filter((definition) => definition.name === 'mind_tree').at(-1);
const bigResult = await bigTool.execute({ sessionId: 'session-big', format: 'outline', level: 'full' }, {});
check('大内容被截断并标记', bigResult.truncated === true && bigResult.content.length < 41000,
  `bytes=${bigResult.bytes} contentLength=${bigResult.content.length}`);
check('截断提示引导使用 writeTo', bigResult.content.includes('writeTo'), '');
const bigWrite = await bigTool.execute({ sessionId: 'session-big', format: 'outline', level: 'full', writeTo: 'C:/vault/big.md' }, {});
check('writeTo 不受截断影响', bigWrite.bytes > 40000 && bigWrite.truncated === undefined, `bytes=${bigWrite.bytes}`);

// 12. 能力探测:会话查询服务缺方法时必须给出 warnings(而非静默失效)。
{
  const brokenSq = fakeSessionQuery(entries);
  delete brokenSq.readTitleSnapshots;
  const brokenProvided = {};
  const brokenWarnings = [];
  apply({
    get: (name) => (name === 'sessionQuery' ? brokenSq : undefined),
    inject: (deps, cb) => { cb({ get: () => undefined, effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); } }); return { dispose: () => {} }; },
    on: () => () => {},
    effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
    provide: (name, value) => { brokenProvided[name] = value; },
    logger: { warn: (message) => brokenWarnings.push(message), info: () => {}, error: () => {} },
  });
  const brokenTree = await brokenProvided.mindTree.tree(SESSION_ID);
  check('缺方法时树结果带 warnings', Array.isArray(brokenTree.warnings) && brokenTree.warnings.length > 0,
    JSON.stringify(brokenTree.warnings));
  check('warnings 指明缺失的方法', brokenTree.warnings.some((w) => w.includes('readTitleSnapshots')), JSON.stringify(brokenTree.warnings));
  check('同时记录到日志', brokenWarnings.some((w) => w.includes('readTitleSnapshots')), JSON.stringify(brokenWarnings));
  const brokenForest = await brokenProvided.mindTree.forest();
  check('森林结果同样带 warnings', Array.isArray(brokenForest.warnings) && brokenForest.warnings.length > 0);
  check('tools 缺失时提示工具未注册', brokenTree.warnings.some((w) => w.includes('mind_tree') && w.includes('未注册')),
    JSON.stringify(brokenTree.warnings));
}

// 13. 注册失败必须可见,且不影响核心服务。
{
  const provided2 = {};
  const warnings2 = [];
  apply({
    get: (name) => (name === 'sessionQuery' ? fakeSessionQuery(entries) : undefined),
    inject: (deps, cb) => {
      cb({
        get: () => ({ register: () => { throw new Error('模拟注册被拒绝:invalid schema'); } }),
        effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
      });
      return { dispose: () => {} };
    },
    on: () => () => {},
    effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
    provide: (name, value) => { provided2[name] = value; },
    logger: { warn: (message) => warnings2.push(message), info: () => {}, error: () => {} },
  });
  const tree2 = await provided2.mindTree.tree(SESSION_ID);
  check('注册失败写入 warnings', tree2.warnings?.some((w) => w.includes('注册失败') && w.includes('invalid schema')),
    JSON.stringify(tree2.warnings));
  check('注册失败仍记录日志', warnings2.some((w) => w.includes('注册失败')), JSON.stringify(warnings2));
  check('注册失败不影响分析服务', tree2.nodes.length > 1 && tree2.turnCount === 4);
}

// 14. 替换语义:精确目标 + 整段重写保护(真实会话里发现的关键 bug)。
{
  const turnStart = ev('turn/start', { turn: 1 });
  const olds = Array.from({ length: 8 }, (_, i) => ev('user/message', { role: 'user', content: [{ type: 'text', text: `旧消息 ${i}` }] }));
  const targetSeq = olds[2].seq;
  const replaceEvents = [
    turnStart,
    ...olds,
    { type: 'system/message', seq: seq += 1, time: T0 + seq * 1000, data: { role: 'system', content: [{ type: 'text', text: '单条替换' }] },
      surfaceOp: { op: 'replace', startSeq: targetSeq, endSeq: targetSeq }, sourceEventSeqs: [targetSeq] },
    // 显式列出大量目标(等价于整段重写)时也不得逐个标记。
    { type: 'system/message', seq: seq += 1, time: T0 + seq * 1000, data: { role: 'system', content: [{ type: 'text', text: '整段重写' }] },
      surfaceOp: { op: 'replace', startSeq: 1, endSeq: 6000 },
      sourceEventSeqs: Array.from({ length: 500 }, (_, i) => i + 1) },
    ev('turn/end', { turn: 1, reason: { kind: 'completed' } }),
  ];
  const replaceEntries = [{ header: { id: 'session-replace', version: 4, createdAt: T0, isSeeded: false }, events: replaceEvents }];
  const replaceProvided = {};
  apply({
    get: (name) => (name === 'sessionQuery' ? fakeSessionQuery(replaceEntries) : undefined),
    inject: () => ({ dispose: () => {} }),
    on: () => () => {},
    effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
    provide: (name, value) => { replaceProvided[name] = value; },
    logger: { warn: () => {}, info: () => {}, error: () => {} },
  });
  const replaceTree = await replaceProvided.mindTree.tree('session-replace');
  const replacedBy = replaceTree.edges.filter((e) => e.kind === 'replaced-by');
  const shadowedNodes = replaceTree.nodes.filter((n) => n.surface === 'shadowed');
  const replaceBranches = replaceTree.nodes.filter((n) => n.branch?.kind === 'replace');
  const wideBranch = replaceBranches.find((n) => n.branch.detail?.wide === true);
  check('单条替换只产生 1 条 replaced-by 边', replacedBy.length === 1, `实际 ${replacedBy.length}`);
  check('单条替换只标记 1 个 shadowed 节点', shadowedNodes.length === 1, `实际 ${shadowedNodes.length}`);
  check('两次替换都记录为分支', replaceBranches.length === 2, `实际 ${replaceBranches.length}`);
  check('整段重写标记 wide 并给出影响条数', wideBranch !== undefined && wideBranch.branch.detail.affected >= 500,
    JSON.stringify(wideBranch?.branch?.detail));
  check('整段重写不产生 replaced-by 边', replacedBy.every((e) => e.to !== wideBranch?.id));
  check('shadowed 占比保持极小(<20%)', shadowedNodes.length / replaceTree.nodes.length < 0.2,
    `${shadowedNodes.length}/${replaceTree.nodes.length}`);
}

// 15. 工具的信息量档位(与 GUI 的削减策略一致)。
{
  const raw = await tool.execute({ format: 'outline', level: 'full' }, asAgent);
  const compact = await tool.execute({ format: 'outline' }, asAgent);
  const standard = await tool.execute({ format: 'outline', level: 'standard' }, asAgent);
  check('默认按精简档削减并在摘要中说明', compact.nodes < raw.nodes && compact.summary.includes('削减'), compact.summary);
  check('full 档导出全量节点', raw.nodes === tree.nodes.length, `${raw.nodes}/${tree.nodes.length}`);
  check('精简档内容短于完整档', compact.content.length < raw.content.length,
    `${compact.content.length} vs ${raw.content.length}`);
  check('standard 节点数介于两者之间', standard.nodes >= compact.nodes && standard.nodes <= raw.nodes,
    `${compact.nodes}/${standard.nodes}/${raw.nodes}`);
  let parsedCompact = null;
  try { parsedCompact = JSON.parse((await tool.execute({ format: 'json' }, asAgent)).content); } catch { /* 下面断言 */ }
  check('JSON 导出遵循档位且带 reduction', parsedCompact?.nodes?.length === compact.nodes
    && parsedCompact?.reduction?.level === 'compact', JSON.stringify(parsedCompact?.reduction));
  const invalid = await tool.execute({ format: 'outline', level: 'nonsense' }, asAgent);
  check('未知档位回退为精简', invalid.nodes === compact.nodes, `${invalid.nodes}/${compact.nodes}`);
  const forestCompact = await tool.execute({ format: 'outline', view: 'forest', level: 'compact' }, asAgent);
  check('血缘/森林视图不受档位影响', forestCompact.nodes === 2, String(forestCompact.nodes));
}

console.log(failures === 0 ? '[host-test] 全部通过' : `[host-test] ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
