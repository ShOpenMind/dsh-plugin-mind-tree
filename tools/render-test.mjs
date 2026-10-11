// 离线渲染测试:在 Node 中模拟模块加载器,渲染思维树组件,定位渲染崩溃。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const toolsRequire = createRequire(import.meta.url);
const React = toolsRequire('react');
const { renderToStaticMarkup } = toolsRequire('react-dom/server');

// ---- document 垫片(apply 注入样式时需要) ----
const fakeStyle = { dataset: {}, textContent: '', remove() {} };
const fakeHead = { append(child) { globalThis.__lastStyle = child; } };
globalThis.document = {
  createElement: (tag) => (tag === 'style' ? { ...fakeStyle } : {}),
  head: fakeHead,
};

// ---- 捕获客户端 bundle 的模块注册 ----
// 说明:客户端在浏览器里使用 window.setTimeout/setInterval(自动展开、跳转重试循环),
// 因此这里的 window 垫片必须提供计时器 API,否则 apply 阶段会因缺少 setInterval 崩溃。
const registrations = [];
globalThis.window = {
  __ModuleLoader__: {
    load(registration) { registrations.push(registration); },
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  addEventListener: () => {},
  removeEventListener: () => {},
  document: globalThis.document,
};

const bundlePath = join(here, '..', 'lib', 'client.js');
const bundle = readFileSync(bundlePath, 'utf8');
const factory = new Function('window', `${bundle}; return undefined;`); // 仅执行注册
factory(globalThis.window);

if (registrations.length !== 1) {
  console.error(`[render-test] 预期 1 个模块注册,实际 ${registrations.length}`);
  process.exit(1);
}
const registration = registrations[0];
console.log(`[render-test] 模块 id: ${registration.id}`);

// ---- 模拟 require ----
const fakeRemote = {
  $mount: async () => async () => {},
};
const primitivesStub = new Proxy({}, { get: (t, prop) => {
  if (prop === 'MenuItemButton') return (props) => React.createElement('button', { onClick: () => props.onSelect?.(props) }, props.children ?? '');
  return () => null;
} });

const requireShim = (spec) => {
  if (spec === 'react') return React;
  if (spec === 'react-dom') return toolsRequire('react-dom');
  if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
  if (spec.startsWith('@deepseek-ai/')) return new Proxy({}, { get: () => () => null });
  throw new Error(`[render-test] 未预期的 require: ${spec}`);
};

const exportsValue = registration.factory(requireShim);
const plugin = exportsValue && exportsValue.default ? exportsValue.default : exportsValue;
if (!plugin || typeof plugin.apply !== 'function') {
  console.error('[render-test] 工厂没有返回插件对象');
  process.exit(1);
}
console.log(`[render-test] 插件 inject: ${JSON.stringify(plugin.inject)}`);

// ---- 模拟 ctx 并捕获注册的组件 ----
const captured = { tabBody: null, tabTitle: null, menuItem: null };
const fakeSession = {
  id: 'session-test', seq: 1, sessionId: 'session-test', time: Date.now(),
  kind: 'turn', type: 'turn/start', label: '第 1 轮', surface: 'current',
};
const fakeService = {
  tree: async () => ({ sessionId: 'session-test', title: '测试', nodes: [
    { id: 'root', seq: -1, type: 'root', kind: 'info', label: '测试', surface: 'current' },
    fakeSession,
  ], edges: [{ from: 'root', to: fakeSession.id, kind: 'next' }], turnCount: 1 }),
  lineage: async () => ({ complete: true, target: 's', nodes: [], edges: [] }),
  forest: async () => ({ nodes: [], edges: [], roots: [] }),
  detail: async () => ({}),
  follow: async function* () {},
};

const mockCtx = {
  inject: (deps, cb) => {
    const scope = {
      remote: { mindTree: fakeService },
      effect: () => () => {},
      get: () => undefined,
    };
    const result = cb(scope);
    return { dispose: () => {}, then: (fn) => Promise.resolve(result).then(fn) };
  },
  remote: fakeRemote,
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
    register: () => () => {},
  },
  sidebarRight: { openTab: () => {}, openRightbar: () => {} },
  uiWorkspace: { openSession: () => {} },
  sessions: { retain: () => ({ ready: Promise.resolve(), release: () => {}, loadThrough: () => {} }) },
  effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
  provide: () => {},
  get: () => undefined,
  on: () => () => {},
};

try {
  plugin.apply(mockCtx);
  console.log('[render-test] apply 完成');
} catch (error) {
  console.error('[render-test] apply 崩溃:', error);
  process.exit(1);
}

// ---- 渲染各组件 ----
const sessionId = 'session-fixture-0001';
const aborter = new AbortController();

function renderSafe(name, component, props) {
  try {
    const markup = renderToStaticMarkup(React.createElement(component, props));
    console.log(`[render-test] ${name} 渲染成功 (${markup.length} 字符)`);
    console.log(markup.slice(0, 300).replace(/\n/g, ' '));
    console.log('…');
  } catch (error) {
    console.error(`[render-test] ${name} 渲染崩溃:`);
    console.error(error && error.stack ? error.stack : error);
  }
}

renderSafe('思维树主体', captured.tabBody, {
  ctx: mockCtx,
  uiWorkspace: mockCtx.uiWorkspace,
  sessionId,
  signal: aborter.signal,
  useTabInfo: () => ({ sidebar: {}, panel: {}, tab: { title: '思维树' } }),
});

renderSafe('思维树标题', captured.tabTitle, {
  locale: mockCtx.locale,
  useTabInfo: () => ({ sidebar: {}, panel: {}, tab: { title: '思维树' } }),
});

renderSafe('会话菜单项', captured.menuItem, {
  sessionId,
  displayTitle: '测试会话',
  useMenuOpenState: () => [false, () => {}],
  useShortcuts: () => () => [],
});

console.log('[render-test] 完成');
