// 用真实会话数据跑通「宿主引擎 → 客户端渲染 → 导出」全链路,并落盘 Obsidian 友好的文件。
// 用法: node tools/export-real.mjs [sessionId]
// 会话目录默认 ~/.dsh/sessions(DSH_SESSIONS_DIR 覆盖),输出目录默认仓库同级 mindtree-export(DSH_MIND_TREE_OUT 覆盖)。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { apply } from '../lib/index.js';
import { SESSIONS_DIR, loadAllSessions, pickSession } from './lib/sessions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const toolsRequire = createRequire(import.meta.url);
const { Window } = toolsRequire('happy-dom');
const React = toolsRequire('react');
const { createRoot } = toolsRequire('react-dom/client');

// ---------- 1. 读取真实会话日志 ----------
const entries = loadAllSessions();
if (entries.length === 0) {
  console.error(`[export-real] 未在 ${SESSIONS_DIR} 下找到任何会话日志`);
  process.exit(1);
}

const requested = process.argv[2];
const target = requested
  ? entries.find((e) => e.id === requested)
  : [...entries].sort((a, b) => b.log.events.length - a.log.events.length)[0];
if (!target) { console.error('[export-real] 找不到会话'); process.exit(1); }
console.log(`[export-real] 会话 ${target.id},事件 ${target.log.events.length}`);

// ---------- 2. 宿主引擎产出思维树 ----------
const records = entries.map((e) => ({ header: e.log.header, live: false, persisted: true }));
const fakeSessionQuery = {
  async listSessions() { return records; },
  async readSession(id) {
    const entry = entries.find((e) => String(e.log.header.id) === String(id));
    if (!entry) throw new Error(`session ${id} not found`);
    return { session: entry.log.header, inheritedEventCount: 0, events: entry.log.events };
  },
  async readTitle(id) {
    const entry = entries.find((e) => String(e.log.header.id) === String(id));
    if (!entry) return undefined;
    for (let i = entry.log.events.length - 1; i >= 0; i -= 1) {
      const event = entry.log.events[i];
      if (event.type === 'session/title' && typeof event.data?.title === 'string') {
        return { title: event.data.title, source: { kind: 'fallback' }, eventSeq: event.seq, updatedAt: event.time };
      }
    }
    return undefined;
  },
  async readTitleSnapshots() { return []; },
  async filterSessions(filters) {
    const parentFilter = filters.find((f) => f.kind === 'parent');
    const parents = parentFilter ? new Set(parentFilter.values.map(String)) : null;
    return records.filter((r) => !parents || parents.has(String(r.header?.parentSession)));
  },
  async traceSession(id) {
    const t = records.find((r) => String(r.header.id) === String(id));
    if (!t) throw new Error('not found');
    const childrenOf = (pid) => records.filter((r) => String(r.header?.parentSession) === String(pid)).map((r) => ({ session: r, descendants: childrenOf(r.header.id) }));
    return { target: t, ancestors: [], descendants: childrenOf(t.header.id), complete: true, root: t };
  },
  async readEvent() { throw new Error('unused'); },
};

const provided = {};
apply({
  get: (name) => (name === 'sessionQuery' ? fakeSessionQuery : undefined),
  on: () => () => {},
  effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
  provide: (name, value) => { provided[name] = value; },
});
const tree = await provided.mindTree.tree(target.id);
console.log(`[export-real] 思维树: ${tree.nodes.length} 节点 / ${tree.turnCount} 轮 / 摘要 ${tree.nodes.filter((n) => n.summary).length} 条`);

// ---------- 3. 客户端 bundle 渲染并导出 ----------
const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
globalThis.AbortController = AbortController;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const registrations = [];
win.__ModuleLoader__ = { load: (r) => registrations.push(r) };
new Function('window', `${readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')};`)(win);
const registration = registrations[0];
const primitivesStub = new Proxy({}, { get: (t, prop) => (prop === 'MenuItemButton' ? (props) => React.createElement('button', null, props.children ?? '') : () => null) });
const requireShim = (spec) => {
  if (spec === 'react') return React;
  if (spec === 'react-dom') return toolsRequire('react-dom');
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
  if (spec.startsWith('@deepseek-ai/')) return new Proxy({}, { get: () => () => null });
  throw new Error(`unexpected require: ${spec}`);
};
const plugin = registration.factory(requireShim);

const captured = { tabBody: null, probe: null };
const fakeService = {
  tree: async () => ({ ok: true, value: tree }),
  lineage: async () => ({ ok: true, value: { complete: true, target: target.id, nodes: [], edges: [] } }),
  forest: async () => ({ ok: true, value: { nodes: [], edges: [], roots: [] } }),
  detail: async () => ({ ok: true, value: {} }),
  follow: function* () {},
};
const mockCtx = {
  inject: (deps, cb) => {
    const scope = { remote: { mindTree: fakeService }, effect: () => () => {}, get: () => undefined };
    const result = cb(scope);
    return { dispose: () => {}, then: (fn) => Promise.resolve(result).then(fn) };
  },
  remote: { $mount: async () => async () => {} },
  locale: { subscribe: () => () => {}, getLocale: () => ({ active: 'zh' }) },
  slots: {
    inject: (_name, cb) => { const r = cb(); return () => (typeof r === 'function' ? r() : undefined); },
    register: (opts, component) => {
      if (opts.name === 'sidebar.right.pane.tab') captured.tabBody = component;
      return () => {};
    },
  },
  sidebarRightTabs: { register: () => () => {} },
  sidebarRight: { openTab: () => {} },
  uiWorkspace: { openSession: () => {} },
  sessions: { retain: () => ({ ready: Promise.resolve(), loadThrough: () => Promise.resolve(), release: () => {} }) },
  effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
  provide: () => {},
  get: (name) => {
    if (name === 'cordisInspect') return { register: (r) => { captured.probe = r; } };
    if (name === 'uiSession') return { adapter: { current: { getSnapshot: () => ({ key: target.id }) } } };
    return undefined;
  },
  on: () => () => {},
};
plugin.apply(mockCtx);

const saved = [];
win.showSaveFilePicker = async (options) => ({
  name: options?.suggestedName ?? 'export',
  createWritable: async () => ({
    write: async (text) => { saved.push({ name: String(options?.suggestedName ?? 'export'), text: String(text) }); },
    close: async () => {},
  }),
});

const container = win.document.createElement('div');
win.document.body.append(container);
const root = createRoot(container);
root.render(React.createElement(captured.tabBody, {
  ctx: mockCtx,
  uiWorkspace: mockCtx.uiWorkspace,
  sessionId: target.id,
  signal: new win.AbortController().signal,
  useTabInfo: () => ({ sidebar: {}, panel: {}, tab: { title: '思维树' } }),
}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(800);

const buttons = () => [...container.querySelectorAll('button')];
const clickExport = async (labelFragment) => {
  const trigger = buttons().find((b) => (b.textContent ?? '').startsWith('导出'));
  if (!trigger) throw new Error('未找到导出按钮');
  trigger.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  const item = [...container.querySelectorAll('.mt-menu-item')].find((b) => (b.textContent ?? '').includes(labelFragment));
  if (!item) throw new Error(`未找到导出项: ${labelFragment}`);
  item.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(350);
};

await clickExport('思维导图');
await clickExport('大纲');
await clickExport('画布');

if (saved.length < 3) {
  const probe = captured.probe ? await captured.probe.query('state', {}) : {};
  console.error(`[export-real] 仅产生 ${saved.length} 个导出,状态:`, JSON.stringify(probe));
  process.exit(1);
}

const outDir = process.env.DSH_MIND_TREE_OUT ?? join(here, '..', '..', 'mindtree-export');
mkdirSync(outDir, { recursive: true });
for (const item of saved) {
  const outPath = join(outDir, item.name);
  writeFileSync(outPath, item.text, 'utf8');
  console.log(`[export-real] 已写出: ${item.name} (${(item.text.length / 1024).toFixed(1)} KB)`);
}
const mindmap = saved.find((s) => s.name.endsWith('-导图.md'));
if (mindmap) {
  console.log('--- 导图版前 22 行 ---');
  console.log(mindmap.text.split('\n').slice(0, 22).join('\n'));
}
