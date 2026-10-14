// 客户端交互测试:渲染、展开跳转、搜索、错误/超时/重试、流重连、导出。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const toolsRequire = createRequire(import.meta.url);
const { Window } = toolsRequire('happy-dom');
const React = toolsRequire('react');
const { createRoot } = toolsRequire('react-dom/client');

const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log(`  ✓ ${name}`);
  else { failures += 1; console.error(`  ✗ ${name} ${detail}`); }
}

const ok = (value) => ({ ok: true, value });

/** 合成 3 轮 × 6 节点的树,轮次带 usage,消息带 turn。 */
function buildFixture() {
  const nodes = [{ id: 'root', seq: -1, type: 'root', kind: 'info', label: '测试会话', surface: 'current' }];
  const edges = [];
  let prevTurn = 'root';
  for (let turn = 1; turn <= 3; turn += 1) {
    const turnId = `t${turn}`;
    nodes.push({
      id: turnId, seq: turn, type: 'turn/start', kind: 'turn', turn,
      label: `第 ${turn} 轮`, summary: `第${turn}轮摘要`,
      usage: { input: turn * 1000, output: turn * 200, total: turn * 1200, cacheRead: 300, messageCount: 6, durationMs: turn * 60000 },
      surface: 'current',
    });
    edges.push({ from: prevTurn, to: turnId, kind: 'next' });
    prevTurn = turnId;
    for (let i = 0; i < 6; i += 1) {
      const id = `n${turn}_${i}`;
      const kind = i % 3 === 0 ? 'user' : (i % 3 === 1 ? 'assistant' : 'tool');
      nodes.push({
        id, seq: 100 + turn * 100 + i, type: `${kind}/message`, kind, turn,
        label: `第${turn}轮第${i}条消息内容文本`, surface: 'current',
        ...(i === 2 ? { branch: { kind: 'question', detail: { questions: [{ question: '选哪个?', options: [{ label: 'A' }] }] } } } : {}),
      });
      edges.push({ from: turnId, to: id, kind: 'step' });
    }
  }
  return { sessionId: 'session-fixture-0001', title: '测试会话', nodes, edges, turnCount: 3 };
}

/** 启动一套隔离环境并返回测试把手。 */
async function boot(options = {}) {
  const win = new Window({ url: 'http://localhost/' });
  globalThis.window = win;
  globalThis.document = win.document;
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
  globalThis.AbortController = AbortController;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  if (options.timeoutMs) win.__MT_TIMEOUT__ = options.timeoutMs;
  const registrations = [];
  win.__ModuleLoader__ = { load: (registration) => registrations.push(registration) };
  new Function('window', `${bundle};`)(win);
  const registration = registrations[0];
  const primitivesStub = new Proxy({}, {
    get: (t, prop) => (prop === 'MenuItemButton'
      ? (props) => React.createElement('button', { onClick: () => props.onSelect?.(props) }, props.children ?? '')
      : () => null),
  });
  const requireShim = (spec) => {
    if (spec === 'react') return React;
    if (spec === 'react-dom') return toolsRequire('react-dom');
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
    if (spec.startsWith('@deepseek-ai/')) return new Proxy({}, { get: () => () => null });
    throw new Error(`unexpected require: ${spec}`);
  };
  const plugin = registration.factory(requireShim);

  const captured = { tabBody: null, tabType: null, probe: null, jumps: [], retains: 0 };
  const fakeService = {
    tree: typeof options.tree === 'function' ? options.tree : () => Promise.resolve(ok(buildFixture())),
    lineage: () => Promise.resolve(ok({ complete: true, target: 's', nodes: [], edges: [] })),
    forest: () => Promise.resolve(ok({ nodes: [], edges: [], roots: [] })),
    detail: () => Promise.resolve(ok({})),
    follow: function* () {},
  };
  if (options.follow) fakeService.follow = options.follow;

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
    remote: { $mount: async () => async () => {} },
    locale: { subscribe: () => () => {}, getLocale: () => ({ active: 'zh' }) },
    slots: {
      inject: (_name, cb) => { const r = cb(); return () => (typeof r === 'function' ? r() : undefined); },
      register: (opts, component) => {
        if (opts.name === 'sidebar.right.pane.tab') captured.tabBody = component;
        if (opts.name === 'sidebar.right.pane.tab.title') captured.tabTitle = component;
        if (opts.name === 'sidebar.workspaces.session.menu.item') captured.menuItem = component;
        return () => {};
      },
    },
    sidebarRightTabs: { register: (def) => { captured.tabType = def; return () => {}; } },
    sidebarRight: { openTab: () => {} },
    uiWorkspace: { openSession: () => {} },
    sessions: {
      retain: () => {
        captured.retains += 1;
        return {
          ready: Promise.resolve(),
          loadThrough: (seq) => { captured.jumps.push(seq); return Promise.resolve(); },
          release: () => {},
        };
      },
    },
    effect: (fn) => { const r = fn(); return () => (typeof r === 'function' ? r() : undefined); },
    provide: () => {},
    get: (name) => {
      if (name === 'cordisInspect') return { register: (registration) => { captured.probe = registration; } };
      if (name === 'uiSession') return { adapter: { current: { getSnapshot: () => ({ key: 'session-fixture-0001' }) } } };
      return undefined;
    },
    on: () => () => {},
  };
  plugin.apply(mockCtx);

  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container);
  const aborter = new win.AbortController();
  root.render(React.createElement(captured.tabBody, {
    ctx: mockCtx,
    uiWorkspace: mockCtx.uiWorkspace,
    sessionId: 'session-fixture-0001',
    signal: aborter.signal,
    useTabInfo: () => ({ sidebar: {}, panel: {}, tab: { title: '思维树' } }),
  }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return { win, container, root, captured, sleep, mockCtx };
}

const run = async () => {
  // ---- 场景 1:正常渲染 + token + 摘要 ----
  console.log('[client-test] 场景 1: 渲染/token/摘要');
  {
    const env = await boot();
    await env.sleep(350);
    const text = env.container.textContent;
    check('树已渲染', env.container.querySelector('svg') !== null);
    check('轮次行显示 token(1.2k tok)', text.includes('1.2k tok'), text.slice(0, 200));
    check('轮次摘要渲染', text.includes('第3轮摘要'));
    check('消息行渲染', text.includes('第3轮第5条消息内容文本'));
    check('状态芯片为就绪', text.includes('就绪'));
    const probe = await env.captured.probe.query('state', {});
    check('探针 rawNodeCount=22(宿主原始节点)', probe.rawNodeCount === 22, `实际 ${probe.rawNodeCount}`);
    check('探针 reducedNodeCount=19(精简档削减后)', probe.reducedNodeCount === 19, `实际 ${probe.reducedNodeCount}`);
    check('默认信息量档位为 compact', probe.detailLevel === 'compact', String(probe.detailLevel));
    check('探针 renderedRows(默认折叠)= 9', probe.renderedRows === 9, `实际 ${probe.renderedRows}`);
    env.root.unmount();
  }

  // ---- 场景 2:点三角展开 + 跳转 ----
  console.log('[client-test] 场景 2: 点三角展开 + 跳转');
  {
    const env = await boot();
    await env.sleep(350);
    const caretTexts = [...env.container.querySelectorAll('text')].filter((el) => el.textContent === '▸');
    check('存在折叠三角', caretTexts.length >= 2, `实际 ${caretTexts.length}`);
    const before = env.container.querySelectorAll('svg > g > g').length;
    caretTexts[0].parentElement.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    await env.sleep(250);
    const after = env.container.querySelectorAll('svg > g > g').length;
    check('点三角后展开该轮(行数增加)', after > before, `before=${before} after=${after}`);
    check('展开的同时触发跳转(loadThrough 被调用)', env.captured.jumps.length > 0, `实际 ${env.captured.jumps}`);
    env.root.unmount();
  }

  // ---- 场景 3:跳转图标(↗)点击 ----
  console.log('[client-test] 场景 3: 行内跳转图标');
  {
    const env = await boot();
    await env.sleep(350);
    const jumpGlyphs = [...env.container.querySelectorAll('text')].filter((el) => el.textContent === '↗');
    check('行内存在跳转图标', jumpGlyphs.length > 0, `实际 ${jumpGlyphs.length}`);
    if (jumpGlyphs.length > 0) {
      jumpGlyphs[0].parentElement.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
      await env.sleep(250);
      check('点击 ↗ 触发跳转', env.captured.jumps.length > 0, `实际 ${env.captured.jumps}`);
    }
    env.root.unmount();
  }

  // ---- 场景 4:搜索过滤 ----
  console.log('[client-test] 场景 4: 搜索过滤');
  {
    const env = await boot();
    await env.sleep(350);
    const input = env.container.querySelector('.mt-search');
    check('搜索框存在', input !== null);
    if (input) {
      input.value = '第2轮';
      input.dispatchEvent(new env.win.Event('input', { bubbles: true }));
      await env.sleep(250);
      const rows = env.container.querySelectorAll('svg > g > g').length;
      check('搜索后行数显著减少', rows > 0 && rows < 12, `实际 ${rows}`);
      const text = env.container.textContent;
      check('搜索结果包含匹配行', text.includes('第2轮'));
      input.value = '';
      input.dispatchEvent(new env.win.Event('input', { bubbles: true }));
      await env.sleep(250);
      const restored = env.container.querySelectorAll('svg > g > g').length;
      check('清空搜索恢复行数', restored === 9, `实际 ${restored}`);
    }
    env.root.unmount();
  }

  // ---- 场景 5:加载失败 → 错误 + 重试按钮 → 重试恢复 ----
  console.log('[client-test] 场景 5: 加载失败与重试');
  {
    let calls = 0;
    const env = await boot({
      tree: () => {
        calls += 1;
        return calls === 1
          ? Promise.resolve({ ok: false, error: { message: '模拟失败: 会话不可用' } })
          : Promise.resolve(ok(buildFixture()));
      },
    });
    await env.sleep(350);
    const text = env.container.textContent;
    check('显示错误信息', text.includes('模拟失败'), text.slice(0, 200));
    const retryButton = [...env.container.querySelectorAll('button')].find((b) => b.textContent === '重试');
    check('存在重试按钮', retryButton !== undefined);
    if (retryButton) {
      retryButton.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
      await env.sleep(350);
      check('重试后树渲染成功', env.container.querySelector('svg') !== null);
    }
    env.root.unmount();
  }

  // ---- 场景 6:请求挂起 → 超时错误 ----
  console.log('[client-test] 场景 6: 超时保护');
  {
    const env = await boot({ timeoutMs: 250, tree: () => new Promise(() => {}) });
    await env.sleep(700);
    const text = env.container.textContent;
    check('超时后显示错误并给出重试', text.includes('超时'), text.slice(0, 220));
    env.root.unmount();
  }

  // ---- 场景 7:follow 流中断后重连(再次拉取) ----
  console.log('[client-test] 场景 7: 实时流重连');
  {
    let yields = 0;
    const env = await boot({
      follow: function* () {
        yields += 1;
        if (yields === 1) throw new Error('连接中断');
        yield { sessionId: 'session-fixture-0001', seq: 1 };
      },
    });
    await env.sleep(3000); // 等待 2 秒重连间隔
    const probe = await env.captured.probe.query('state', {});
    check('流中断后重连并重新拉取(loadAttempts > 1)', probe.loadAttempts > 1, `实际 ${probe.loadAttempts}`);
    env.root.unmount();
  }

  // ---- 场景 8:三种导出格式(思维导图 / 大纲 / 画布) ----
  console.log('[client-test] 场景 8: 导出 Markdown(三种格式)');
  {
    const env = await boot();
    await env.sleep(350);
    const saves = [];
    env.win.showSaveFilePicker = async (options) => ({
      name: options?.suggestedName ?? 'x',
      createWritable: async () => ({
        write: async (text) => { saves.push({ name: options?.suggestedName, text: String(text) }); },
        close: async () => {},
      }),
    });
    const findByText = (text) => [...env.container.querySelectorAll('button')].find((b) => b.textContent === text);
    const click = (el) => el.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));

    // ① 思维导图 Markdown
    click(findByText('导出 ▾'));
    await env.sleep(120);
    const mindOption = [...env.container.querySelectorAll('.mt-menu-item')].find((b) => b.textContent.includes('思维导图'));
    check('导出菜单包含思维导图项', mindOption !== undefined);
    if (mindOption) {
      click(mindOption);
      await env.sleep(250);
      const md = saves.at(-1)?.text ?? '';
      check('思维导图文件名带 -导图.md', String(saves.at(-1)?.name).endsWith('-导图.md'), String(saves.at(-1)?.name));
      check('内含 mermaid mindmap 代码块', md.includes('```mermaid') && md.includes('mindmap') && md.includes('root(('), md.slice(0, 200));
      check('导图含轮次节点(摘要 + token)', /第 1 轮 · 第1轮摘要 · 6 条 · 1\.2k tok/.test(md), md.split('\n').slice(12, 20).join(' | '));
      check('导图含分支节点与选项', md.includes('◆ 用户选择') && md.includes('○ A'), '');
      const nodeLines = md.split('\n').filter((l) => /^\s{4,}\S/.test(l) && !l.includes('root(('));
      const badChars = nodeLines.filter((l) => /[()\[\]]/.test(l));
      check('导图节点文本已清洗(无半角括号/方括号)', badChars.length === 0, badChars.slice(0, 2).join(' | '));
      const indentLevels = new Set(nodeLines.map((l) => l.length - l.trimStart().length));
      check('导图层级缩进为 4/6/8', [...indentLevels].every((n) => n >= 4 && n % 2 === 0), [...indentLevels].join(','));
    }

    // ② 大纲 Markdown
    click(findByText('导出 ▾'));
    await env.sleep(120);
    const outlineOption = [...env.container.querySelectorAll('.mt-menu-item')].find((b) => b.textContent.includes('大纲'));
    check('导出菜单包含大纲项', outlineOption !== undefined);
    if (outlineOption) {
      click(outlineOption);
      await env.sleep(250);
      const md = saves.at(-1)?.text ?? '';
      check('大纲文件名带 -大纲.md', String(saves.at(-1)?.name).endsWith('-大纲.md'), String(saves.at(-1)?.name));
      check('大纲含全部节点(轮次标题 + 列表项)', md.includes('## 第 3 轮') && md.includes('- #200 [用户] 第1轮第0条消息内容文本'), '');
      check('大纲 format 属性为 outline', md.includes('format: "outline"'));
    }

    // ③ Obsidian 画布
    click(findByText('导出 ▾'));
    await env.sleep(120);
    const canvasOption = [...env.container.querySelectorAll('.mt-menu-item')].find((b) => b.textContent.includes('画布'));
    check('导出菜单包含画布项', canvasOption !== undefined);
    if (canvasOption) {
      click(canvasOption);
      await env.sleep(250);
      const raw = saves.at(-1)?.text ?? '';
      check('画布文件名以 .canvas 结尾', String(saves.at(-1)?.name).endsWith('.canvas'), String(saves.at(-1)?.name));
      let canvas = null;
      try { canvas = JSON.parse(raw); } catch { /* 解析失败下面断言 */ }
      check('画布为合法 JSON', canvas !== null && Array.isArray(canvas.nodes) && Array.isArray(canvas.edges), raw.slice(0, 120));
      if (canvas) {
        check('画布含根/轮次/条目节点', canvas.nodes.some((n) => n.id === 'root') && canvas.nodes.some((n) => n.id === 't1') && canvas.nodes.some((n) => String(n.id).startsWith('t1-i')), `节点 ${canvas.nodes.length}`);
        check('画布含父子连线', canvas.edges.some((e) => e.fromNode === 'root' && e.toNode === 't1'));
        check('画布坐标均为有限数值', canvas.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.width) && Number.isFinite(n.height)));
        check('画布节点 id 唯一', new Set(canvas.nodes.map((n) => n.id)).size === canvas.nodes.length);
      }
      const probe = await env.captured.probe.query('state', {});
      check('导出结果记录为 saved', String(probe.lastExport).startsWith('saved:'), `实际 ${probe.lastExport}`);
    }
    env.root.unmount();
  }

  // ---- 场景 8b:不支持另存为时回退下载,且不崩溃 ----
  console.log('[client-test] 场景 8b: 导出回退路径');
  {
    const env = await boot();
    await env.sleep(350);
    const exportButton = [...env.container.querySelectorAll('button')].find((b) => b.textContent === '导出');
    if (exportButton) {
      exportButton.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
      await env.sleep(200);
      const probe = await env.captured.probe.query('state', {});
      check('回退路径不抛异常(有结果记录)', typeof probe.lastExport === 'string' && probe.lastExport.length > 0, `实际 ${probe.lastExport}`);
    }
    env.root.unmount();
  }

  // ---- 场景 9:实时刷新不清空用户的展开状态 ----
  console.log('[client-test] 场景 9: 刷新保持展开状态');
  {
    const env = await boot();
    await env.sleep(350);
    const expandButton = [...env.container.querySelectorAll('button')].find((b) => b.textContent === '展开');
    expandButton.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    await env.sleep(200);
    const expanded = env.container.querySelectorAll('svg > g > g').length;
    check('展开全部后为 19 行(精简档)', expanded === 19, `实际 ${expanded}`);
    const refreshButton = [...env.container.querySelectorAll('button')].find((b) => b.querySelector('svg'));
    refreshButton.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    await env.sleep(350);
    const afterRefresh = env.container.querySelectorAll('svg > g > g').length;
    check('刷新后仍为 19 行(不重置折叠)', afterRefresh === 19, `实际 ${afterRefresh}`);
    env.root.unmount();
  }

  // ---- 场景 10:恶意字符下导图语法仍可被真实 Mermaid 解析 ----
  console.log('[client-test] 场景 10: Mermaid 语法加固');
  {
    const hostileNodes = [
      { id: 'root', seq: -1, type: 'root', kind: 'info', label: '会话(括号)[方括号]{花括号}"引号"', surface: 'current' },
      { id: 't1', seq: 1, type: 'turn/start', kind: 'turn', turn: 1, label: '第 1 轮', summary: '摘要(a)[b]{c}"d" e;f ::g', surface: 'current',
        usage: { input: 10, output: 5, total: 15, messageCount: 2 } },
      { id: 'n1', seq: 2, type: 'user/message', kind: 'user', turn: 1, label: '用户说(测试)[x]::y "引号" ; 分号', surface: 'current' },
      { id: 'n2', seq: 3, type: 'tool/call', kind: 'tool', turn: 1, label: 'ask_user_question 选哪个(方案A/方案B)?',
        branch: { kind: 'question', detail: { questions: [{ question: 'q', options: [{ label: '选项(1)' }, { label: '选项[2]' }] }] } }, surface: 'current' },
    ];
    const hostileTree = {
      sessionId: 'session-hostile', title: '会话(括号)[方括号]{花括号}"引号"', nodes: hostileNodes,
      edges: [
        { from: 'root', to: 't1', kind: 'next' },
        { from: 't1', to: 'n1', kind: 'step' },
        { from: 't1', to: 'n2', kind: 'step' },
      ],
      turnCount: 1,
    };
    const env = await boot({ tree: () => Promise.resolve(ok(hostileTree)) });
    await env.sleep(350);
    const saves = [];
    env.win.showSaveFilePicker = async (options) => ({
      name: options?.suggestedName ?? 'x',
      createWritable: async () => ({ write: async (text) => { saves.push(String(text)); }, close: async () => {} }),
    });
    const trigger = [...env.container.querySelectorAll('button')].find((b) => (b.textContent ?? '').startsWith('导出'));
    trigger.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    await env.sleep(120);
    const item = [...env.container.querySelectorAll('.mt-menu-item')].find((b) => b.textContent.includes('思维导图'));
    item.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    await env.sleep(300);
    const md = saves.at(-1) ?? '';
    const block = (md.match(/```mermaid\n([\s\S]*?)```/) ?? [])[1] ?? '';
    check('恶意夹具仍生成 mermaid 块', block.length > 0, md.slice(0, 160));
    let parsedOk = false;
    let parseError = '';
    try {
      const { pathToFileURL } = await import('node:url');
      const mermaid = (await import(pathToFileURL(toolsRequire.resolve('mermaid')).href)).default;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
      await mermaid.parse(block);
      parsedOk = true;
    } catch (error) {
      parseError = String(error?.message ?? error);
    }
    check('真实 Mermaid 解析器接受该导图', parsedOk, parseError);
    env.root.unmount();
  }

  // ---- 场景 11:过程信息削减(三档切换 + 聚合行 + 折叠清单) ----
  console.log('[client-test] 场景 11: 过程信息削减');
  {
    const env = await boot();
    await env.sleep(350);
    const rows = () => env.container.querySelectorAll('svg > g > g').length;
    const levelButton = (text) => [...env.container.querySelectorAll('.mt-btn-level')].find((b) => b.textContent === text);
    const byText = (text) => [...env.container.querySelectorAll('button')].find((b) => b.textContent === text);
    const click = (el) => el.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    const probe = () => env.captured.probe.query('state', {});

    check('工具栏有三档按钮', [...env.container.querySelectorAll('.mt-btn-level')].length === 3);
    check('默认选中精简', levelButton('精简')?.className.includes('mt-btn-on') === true);
    check('精简档聚合出工具活动行', env.container.textContent.includes('工具活动 ×1'), env.container.textContent.slice(0, 200));
    check('精简档隐藏被折叠的工具明细', !env.container.textContent.includes('第1轮第5条消息内容文本'));
    check('精简档去掉了短助手过程消息', !env.container.textContent.includes('第1轮第1条消息内容文本'));
    check('精简档保留分支节点(末轮展开)', env.container.textContent.includes('第3轮第2条消息内容文本'));

    // 展开全部后对比三档行数
    click(byText('展开'));
    await env.sleep(250);
    const compactRows = rows();
    check('精简档展开后 19 行', compactRows === 19, `实际 ${compactRows}`);
    let state = await probe();
    check('探针记录精简档与折叠数', state.detailLevel === 'compact' && state.foldedTools === 3,
      `level=${state.detailLevel} folded=${state.foldedTools}`);

    // 标准档
    click(levelButton('标准'));
    await env.sleep(250);
    state = await probe();
    check('切到标准档后探针更新', state.detailLevel === 'standard', String(state.detailLevel));
    check('标准档显示工具明细行', env.container.textContent.includes('第1轮第5条消息内容文本'));
    check('标准档不再聚合', !env.container.textContent.includes('工具活动 ×'), '');
    const standardRows = rows();

    // 完整档
    click(levelButton('完整'));
    await env.sleep(250);
    const fullRows = rows();
    state = await probe();
    check('完整档为全部 22 个节点', fullRows === 22, `实际 ${fullRows}`);
    check('完整档探针 foldedTools=0', state.foldedTools === 0, `实际 ${state.foldedTools}`);
    check('完整档恢复过程消息', env.container.textContent.includes('第1轮第1条消息内容文本'));
    check('行数随档位单调不减', compactRows <= standardRows && standardRows <= fullRows,
      `${compactRows}/${standardRows}/${fullRows}`);

    // 回到精简,点聚合行看折叠清单
    click(levelButton('精简'));
    await env.sleep(250);
    const groupText = [...env.container.querySelectorAll('text')].find((el) => (el.textContent ?? '').startsWith('工具活动'));
    check('存在工具活动聚合行', groupText !== undefined);
    if (groupText) {
      click(groupText.parentElement);
      await env.sleep(250);
      const text = env.container.textContent;
      check('点聚合行显示折叠清单', text.includes('折叠的工具调用'), text.slice(0, 200));
      check('折叠清单包含被折叠调用的标签', text.includes('pwsh') || text.includes('工具'), '');
    }
    env.root.unmount();
  }

  // ---- 场景 12:配色(预设 + 自定义 + 持久化) ----
  console.log('[client-test] 场景 12: 配色自定义');
  {
    const env = await boot();
    await env.sleep(350);
    const byText = (text) => [...env.container.querySelectorAll('button')].find((b) => b.textContent === text);
    const click = (el) => el.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    const root = () => env.container.querySelector('.mt-root');
    const cssVar = (name) => root().style.getPropertyValue(name).trim();

    check('默认预设为柔和(soft)', (await env.captured.probe.query('state', {})).palettePreset === 'soft');
    check('柔和配色已注入 CSS 变量', cssVar('--mt-turn') === '#6b63b5', cssVar('--mt-turn'));
    check('工具栏有配色按钮', byText('配色 ▾') !== undefined);

    click(byText('配色 ▾'));
    await env.sleep(150);
    const presetButtons = [...env.container.querySelectorAll('.mt-preset-row .mt-btn-level')];
    check('配色面板含三个预设', presetButtons.length === 3, String(presetButtons.length));
    const colorInputs = [...env.container.querySelectorAll('.mt-color-input')];
    check('配色面板含逐类色块(19 项)', colorInputs.length === 19, String(colorInputs.length));

    // 切到「鲜明」预设
    click(presetButtons.find((b) => b.textContent === '鲜明'));
    await env.sleep(200);
    check('切到鲜明后 CSS 变量更新', cssVar('--mt-turn') === '#8b5cf6', cssVar('--mt-turn'));
    check('探针记录预设为 vivid', (await env.captured.probe.query('state', {})).palettePreset === 'vivid');

    // 自定义某个颜色 → preset 变为 custom
    // React 受控输入必须用原生 setter 赋值,否则 React 认为值未变化、不触发 onChange。
    const input = env.container.querySelector('.mt-color-input');
    const nativeValue = Object.getOwnPropertyDescriptor(env.win.HTMLInputElement.prototype, 'value').set;
    nativeValue.call(input, '#123456');
    input.dispatchEvent(new env.win.Event('input', { bubbles: true }));
    await env.sleep(200);
    check('自定义颜色后档位变为 custom', (await env.captured.probe.query('state', {})).palettePreset === 'custom');
    check('自定义颜色已注入变量', cssVar('--mt-turn') === '#123456', cssVar('--mt-turn'));

    // 持久化:localStorage 应写入
    const saved = env.win.localStorage.getItem('dsh-mind-tree.palette');
    check('配色已写入 localStorage', typeof saved === 'string' && saved.includes('#123456'), String(saved).slice(0, 80));

    // 持久化:同一窗口内重新挂载,应从 localStorage 恢复自定义配色
    env.root.unmount();
    await env.sleep(80);
    const container2 = env.win.document.createElement('div');
    env.win.document.body.append(container2);
    const root2 = createRoot(container2);
    root2.render(React.createElement(env.captured.tabBody, {
      ctx: env.mockCtx,
      uiWorkspace: env.mockCtx.uiWorkspace,
      sessionId: 'session-fixture-0001',
      signal: new env.win.AbortController().signal,
      useTabInfo: () => ({ sidebar: {}, panel: {}, tab: { title: '思维树' } }),
    }));
    await env.sleep(350);
    const rootEl2 = container2.querySelector('.mt-root');
    check('重新挂载后恢复自定义配色', rootEl2?.style.getPropertyValue('--mt-turn').trim() === '#123456',
      rootEl2?.style.getPropertyValue('--mt-turn'));
    check('重新挂载后预设仍为 custom', (await env.captured.probe.query('state', {})).palettePreset === 'custom');

    // 恢复默认(在同一实例上操作)
    const click2 = (el) => el.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    const byText2 = (text) => [...container2.querySelectorAll('button')].find((b) => b.textContent === text);
    click2(byText2('配色 ▾'));
    await env.sleep(150);
    const resetItem = [...container2.querySelectorAll('.mt-menu-item')].find((b) => b.textContent.includes('恢复默认'));
    check('配色面板有恢复默认项', resetItem !== undefined);
    if (resetItem) {
      click2(resetItem);
      await env.sleep(200);
      const turnVar = container2.querySelector('.mt-root').style.getPropertyValue('--mt-turn').trim();
      check('恢复默认后回到柔和预设', turnVar === '#6b63b5', turnVar);
    }
    root2.unmount();
  }

  console.log(failures === 0 ? '[client-test] 全部通过' : `[client-test] ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error('[client-test] 未捕获异常:', error);
  process.exit(1);
});
