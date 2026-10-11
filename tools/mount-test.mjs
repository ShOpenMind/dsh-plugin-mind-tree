// 完整挂载测试:用 happy-dom 真实跑 React effects,复现"页签为空"。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const toolsRequire = createRequire(import.meta.url);
const { Window } = toolsRequire('happy-dom');

// ---- happy-dom 全局环境 ----
const happyWindow = new Window({ url: 'http://localhost/' });
globalThis.window = happyWindow;
globalThis.document = happyWindow.document;
Object.defineProperty(globalThis, 'navigator', { value: happyWindow.navigator, configurable: true });
globalThis.AbortController = AbortController;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const registrations = [];
window.__ModuleLoader__ = { load(registration) { registrations.push(registration); } };

const bundlePath = join(here, '..', 'lib', 'client.js');
const bundle = readFileSync(bundlePath, 'utf8');
new Function('window', `${bundle};`)(window);

const registration = registrations[0];
const React = toolsRequire('react');
const { createRoot } = toolsRequire('react-dom/client');

// ---- require 垫片 ----
const primitivesStub = new Proxy({}, { get: (t, prop) => {
  if (prop === 'MenuItemButton') return (props) => React.createElement('button', { onClick: () => props.onSelect?.(props) }, props.children ?? '');
  return () => null;
} });
const requireShim = (spec) => {
  if (spec === 'react') return React;
  if (spec === 'react-dom') return toolsRequire('react-dom');
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
  if (spec.startsWith('@deepseek-ai/')) return new Proxy({}, { get: () => () => null });
  throw new Error(`unexpected require: ${spec}`);
};
const plugin = registration.factory(requireShim);

// ---- 远程服务桩(真实的 {ok, value} 信封 + 较大规模的树) ----
const pending = [];
const buildFixture = () => {
  const nodes = [{ id: 'root', seq: -1, type: 'root', kind: 'info', label: '测试会话', surface: 'current' }];
  const edges = [];
  let prevTurn = 'root';
  for (let turn = 1; turn <= 3; turn += 1) {
    const turnId = `t${turn}`;
    nodes.push({
      id: turnId, seq: turn, type: 'turn/start', kind: 'turn', turn,
      label: `第 ${turn} 轮`, summary: `测试摘要${turn}`, surface: 'current',
    });
    edges.push({ from: prevTurn, to: turnId, kind: 'next' });
    prevTurn = turnId;
    for (let i = 0; i < 20; i += 1) {
      const id = `n${turn}_${i}`;
      const kind = i % 3 === 0 ? 'user' : (i % 3 === 1 ? 'assistant' : 'tool');
      nodes.push({
        id, seq: 100 + turn * 100 + i, type: `${kind}/message`, kind, turn,
        label: `第 ${turn} 轮的第 ${i} 个节点标签文本内容`, surface: 'current',
        ...(i === 5 ? { branch: { kind: 'question', detail: { questions: [{ question: '选哪个?', options: [{ label: 'A' }, { label: 'B' }] }] } } } : {}),
      });
      edges.push({ from: turnId, to: id, kind: 'step' });
    }
  }
  return { sessionId: 'session-fixture-0001', title: '测试会话', nodes, edges, turnCount: 3 };
};
const fakeService = {
  tree: async () => new Promise((resolve) => pending.push(() => resolve({ ok: true, value: buildFixture() }))),
  lineage: async () => ({ ok: true, value: { complete: true, target: 's', nodes: [], edges: [] } }),
  forest: async () => ({ ok: true, value: { nodes: [], edges: [], roots: [] } }),
  detail: async () => ({ ok: true, value: {} }),
  follow: async function* () { yield { sessionId: 'other', seq: 1 }; },
};

// ---- 模拟 ctx ----
const captured = {};
let capturedProbe = null;
let remoteMountCalls = 0;
let namespaceRequests = 0;
const mockCtx = {
  inject: (deps, cb) => {
    namespaceRequests += 1;
    const scope = {
      remote: { mindTree: fakeService },
      effect: () => () => {},
      get: () => undefined,
    };
    const result = cb(scope);
    return { dispose: () => {}, then: (fn) => Promise.resolve(result).then(fn) };
  },
  remote: {
    $mount: async () => { remoteMountCalls += 1; return async () => {}; },
  },
  locale: {
    subscribe: () => () => {},
    getLocale: () => ({ id: 'zh-CN' }),
  },
  slots: {
    inject: (_name, cb) => { const r = cb(); return () => (typeof r === 'function' ? r() : undefined); },
    register: (options, component) => {
      if (options.name === 'sidebar.right.pane.tab') captured.tabBody = component;
      if (options.name === 'sidebar.right.pane.tab.title') captured.tabTitle = component;
      if (options.name === 'sidebar.workspaces.session.menu.item') captured.menuItem = component;
      return () => {};
    },
  },
  sidebarRightTabs: {
    register: (def) => { captured.tabType = def; return () => {}; },
  },
  sidebarRight: { openTab: (...a) => { captured.lastOpenTab = a; }, openRightbar: (...a) => { captured.lastOpenRightbar = a; } },
  uiWorkspace: { openSession: (...a) => { captured.lastOpenSession = a; } },
  sessions: { retain: () => ({ ready: Promise.resolve(), release: () => {}, loadThrough: () => {} }) },
  effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
  provide: () => {},
  get: (name) => (name === 'cordisInspect' ? { register: (registration) => { capturedProbe = registration; } } : undefined),
  on: () => () => {},
};

plugin.apply(mockCtx);
console.log('[mount-test] apply 完成, 注册: 标签类型:', !!captured.tabType, '主体:', !!captured.tabBody, '标题:', !!captured.tabTitle);

// ---- 挂载主体,运行 effects ----
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message ?? e.error)));
process.on('unhandledRejection', (r) => errors.push(`unhandledRejection: ${String(r?.message ?? r)}`));

const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);
const aborter = new AbortController();
root.render(React.createElement(captured.tabBody, {
  ctx: mockCtx,
  uiWorkspace: mockCtx.uiWorkspace,
  sessionId: 'session-fixture-0001',
  signal: aborter.signal,
  useTabInfo: () => ({ sidebar: {}, panel: {}, tab: { title: '思维树' } }),
}));

// 让 effects 与微任务跑几轮
await new Promise((r) => setTimeout(r, 400));
console.log('[mount-test] remote mount 次数:', remoteMountCalls, '命名空间请求:', namespaceRequests);
console.log('[mount-test] DOM 内容长度:', container.innerHTML.length);
console.log('[mount-test] DOM 前 400 字符:', container.innerHTML.slice(0, 400).replace(/\n/g, ' '));
// 释放挂起的 tree 调用
for (const resolve of pending.splice(0)) resolve();
await new Promise((r) => setTimeout(r, 400));
const rows = container.querySelectorAll('svg > g > g');
console.log('[mount-test] 数据到达后 DOM 长度:', container.innerHTML.length);
console.log('[mount-test] 渲染行数(默认折叠):', rows.length);
console.log('[mount-test] 轮次摘要是否渲染:', container.textContent.includes('测试摘要3'));
if (capturedProbe) {
  try {
    const state = await capturedProbe.query('state', {});
    console.log('[mount-test] 探针状态:', JSON.stringify(state));
  } catch (error) {
    console.log('[mount-test] 探针失败:', String(error));
  }
}

// 点击"展开全部"后应渲染全部 64 行
const buttons = [...container.querySelectorAll('button')];
const expandButton = buttons.find((b) => (b.textContent ?? '').includes('展开全部'));
if (expandButton) {
  expandButton.dispatchEvent(new happyWindow.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  console.log('[mount-test] 展开全部后渲染行数:', container.querySelectorAll('svg > g > g').length);
} else {
  console.log('[mount-test] 未找到展开全部按钮');
}
console.log('[mount-test] 数据到达后 DOM 前 300 字符:', container.innerHTML.slice(0, 300).replace(/\n/g, ' '));
console.log('[mount-test] 错误:', errors.length ? errors : '无');
root.unmount();

// ---- 渲染菜单项与标题 ----
if (captured.menuItem) {
  const menuContainer = document.createElement('div');
  document.body.append(menuContainer);
  const menuRoot = createRoot(menuContainer);
  menuRoot.render(React.createElement(captured.menuItem, {
    sessionId: 'session-fixture-0001',
    displayTitle: '测试会话',
    useMenuOpenState: () => [false, () => {}],
    useShortcuts: () => () => [],
    openMindTreeFor: () => {},
  }));
  await new Promise((r) => setTimeout(r, 100));
  console.log('[mount-test] 菜单项 DOM:', menuContainer.innerHTML.slice(0, 200).replace(/\n/g, ' '));
  menuRoot.unmount();
}
if (captured.tabTitle) {
  const titleContainer = document.createElement('div');
  document.body.append(titleContainer);
  const titleRoot = createRoot(titleContainer);
  titleRoot.render(React.createElement(captured.tabTitle, { useTabInfo: () => ({ tab: { title: '思维树' } }), locale: mockCtx.locale }));
  await new Promise((r) => setTimeout(r, 100));
  console.log('[mount-test] 标题 DOM:', titleContainer.innerHTML.slice(0, 200).replace(/\n/g, ' '));
  titleRoot.unmount();
}
console.log('[mount-test] 完成');
