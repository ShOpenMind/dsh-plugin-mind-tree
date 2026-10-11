// 真实运行时集成测试:使用 DSH 自带的 cordis 与 ToolRuntime(非 mock),
// 验证 mind_tree 工具能被真实工具注册表接受、参数 Schema 可被模型消费。
// 这同时充当"版本兼容性测试":接口一旦变化,本测试会立刻失败。
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// DSH 运行时依赖目录(用于真实运行时集成测试)。
// 可用 DSH_DSH_NODE_MODULES 覆盖;默认取插件仓库同级的 asar-src 解包目录。
const DSH_NODE_MODULES = process.env.DSH_DSH_NODE_MODULES
  ?? join(import.meta.dirname, '..', '..', 'asar-src', 'dsh', 'node_modules');
const requireFrom = (pkg) => pathToFileURL(join(DSH_NODE_MODULES, '@deepseek-ai', pkg)).href;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures += 1; console.error(`  ✗ ${name} ${detail}`); }
};

const cordisPath = join(DSH_NODE_MODULES, '@deepseek-ai', 'cordis', 'lib', 'index.js');
const toolsPath = join(DSH_NODE_MODULES, '@deepseek-ai', 'dsh-tools', 'lib', 'index.js');
if (!existsSync(cordisPath) || !existsSync(toolsPath)) {
  console.log('[integration-test] 跳过:未找到 DSH 运行时依赖(需要 mindtree-dev/asar-src 已解包)');
  process.exit(0);
}

const { Context } = await import(pathToFileURL(cordisPath).href);
const toolsModule = await import(pathToFileURL(toolsPath).href);
const ToolRuntime = toolsModule.default ?? toolsModule.ToolRuntime;
console.log('[integration-test] 真实运行时:cordis +', ToolRuntime?.name ?? 'ToolRuntime');

// ---- 构造会话数据(与 host-test 同构,但更小) ----
const T0 = 1700000000000;
let seq = 0;
const ev = (type, data) => ({ type, seq: seq += 1, time: T0 + seq * 1000, data });
const SESSION_ID = 'session-integration';
const events = [
  ev('turn/start', { turn: 1 }),
  ev('user/message', { role: 'user', content: [{ type: 'text', text: '把对话整理成思维导图' }] }),
  ev('assistant/message', {
    turn: 1, step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text: '好的' }] },
    usage: { inputTokens: 120, outputTokens: 30 },
  }),
  ev('turn/end', { turn: 1, reason: { kind: 'completed' } }),
];
const record = { header: { id: SESSION_ID, version: 4, createdAt: T0, isSeeded: false }, live: false, persisted: true };
const sessionQuery = {
  async listSessions() { return [record]; },
  async readSession() { return { session: record.header, inheritedEventCount: 0, events }; },
  async readTitle() { return { title: '集成测试会话', source: { kind: 'fallback' }, eventSeq: 1, updatedAt: T0 }; },
  async readTitleSnapshots(ids) {
    return (ids ?? []).map((id) => ({ status: 'fulfilled', value: { session: { id }, title: { title: '集成测试会话' } } }));
  },
  async filterSessions() { return [record]; },
  async traceSession() { return { target: record, ancestors: [], descendants: [], complete: true, root: record }; },
  async readEvent() { throw new Error('unused'); },
};

// ---- 真实运行时装载 ----
const root = new Context();
// ToolRuntime 声明 inject=["systemPrompt"];此处用最小桩,只验证工具注册契约。
const noop = () => () => {};
root.provide('systemPrompt', new Proxy({}, { get: () => noop }));
await root.plugin(ToolRuntime);
root.provide('sessionQuery', sessionQuery);
const plugin = await import(pathToFileURL(join(import.meta.dirname, '..', 'lib', 'index.js')).href);
await root.plugin({ name: plugin.name, inject: plugin.inject, apply: plugin.apply });

const tools = root.get('tools');
check('真实运行时提供了 tools 服务', tools !== undefined);

const definition = tools?.get('mind_tree');
check('mind_tree 被真实注册表接受', definition !== undefined,
  definition === undefined ? '注册表里没有该工具' : '');

if (definition) {
  check('参数按 JSON Schema 暴露给模型', definition.parameters?.type === 'object'
    && Array.isArray(definition.parameters?.properties?.format?.enum), JSON.stringify(definition.parameters).slice(0, 160));
  check('description 非空', typeof definition.description === 'string' && definition.description.length > 20);
  check('output.render 存在', typeof definition.output?.render === 'function');
  const schemas = tools.schemas?.() ?? [];
  const visible = schemas.find((s) => s.name === 'mind_tree');
  check('工具出现在模型可见的 schema 列表', visible !== undefined, `可见工具: ${schemas.map((s) => s.name).join(',')}`);
  check('模型可见 schema 含参数属性', visible?.parameters?.properties?.writeTo !== undefined);

  // 端到端:直接经真实运行时执行工具。
  let executed = null;
  let execError = null;
  try {
    executed = await definition.execute({ format: 'mindmap' }, { agent: { id: SESSION_ID } });
  } catch (error) { execError = error; }
  check('经真实注册表执行成功', execError === null && typeof executed?.content === 'string',
    String(execError?.message ?? ''));
  check('执行输出含 Mermaid 导图', typeof executed?.content === 'string' && executed.content.includes('mindmap'));
  const rendered = definition.output.render({}, executed);
  check('渲染器输出 text 内容块', Array.isArray(rendered) && rendered[0]?.type === 'text', JSON.stringify(rendered).slice(0, 120));
}

await root.fiber?.dispose?.();
console.log(failures === 0 ? '[integration-test] 全部通过' : `[integration-test] ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
