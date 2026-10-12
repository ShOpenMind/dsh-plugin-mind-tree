// 共享格式化层:把思维树数据渲染成 Mermaid 思维导图 / 大纲 Markdown / Obsidian 画布 JSON。
// 宿主半区(工具导出)与客户端半区(右键导出)都使用本模块,保证两边格式完全一致。
// 只依赖纯 JS,不引用任何 DSH 实现代码。
// Copyright (c) 2026 ShOpenMind · https://github.com/ShOpenMind/dsh-plugin-mind-tree · MIT

/** 作者署名:出现在导出的 YAML 属性与页脚中。 */
export const AUTHOR_NAME = 'ShOpenMind';
export const AUTHOR_URL = 'https://github.com/ShOpenMind/dsh-plugin-mind-tree';

/** 折叠空白并截断到 max 个字符。 */
export function squash(text, max = 240) {
  if (typeof text !== 'string') return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  if (chars.length <= max) return flat;
  return `${chars.slice(0, max - 1).join('')}…`;
}

/** 截断到指定字符数(用于 SVG/画布布局估算)。 */
export function clampChars(text, max) {
  const chars = [...String(text ?? '')];
  return chars.length > max ? `${chars.slice(0, Math.max(1, max - 1)).join('')}…` : chars.join('');
}

/** token 数量格式化:1200 → 1.2k,1500000 → 1.5M。 */
export function fmtTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

/** 文件名安全化。 */
export function safeFileName(title, fallback = 'mind-tree') {
  return String(title ?? '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || fallback;
}

/** YAML 标量转义(始终加引号)。 */
export function yamlScalar(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ---------------- 层级(与客户端渲染逻辑一致的 "next 即同级主干" 规则) ----------------

/** 构建层级:step/result/spawn 为父子,"next" 链展开为同级主干。 */
export function buildHierarchy(tree) {
  const byId = new Map();
  for (const node of tree?.nodes ?? []) byId.set(node.id, node);
  const children = new Map();
  const secondary = new Map();
  const parentOf = new Map();
  const nextOf = new Map();
  const nextTargets = new Set();
  for (const edge of tree?.edges ?? []) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    if (edge.kind === 'replaced-by' || edge.kind === 'derived') {
      secondary.set(`${edge.from}->${edge.to}`, edge);
      continue;
    }
    if (edge.kind === 'next') {
      nextOf.set(edge.from, edge.to);
      nextTargets.add(edge.to);
      continue;
    }
    if (!children.has(edge.from)) children.set(edge.from, []);
    children.get(edge.from).push(edge);
    parentOf.set(edge.to, edge.from);
  }
  const pushChild = (parentId, childId) => {
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push({ from: parentId, to: childId, kind: 'next' });
    parentOf.set(childId, parentId);
  };
  const chained = new Set();
  for (const head of [...nextOf.keys()].filter((id) => !nextTargets.has(id))) {
    const base = parentOf.get(head) ?? head;
    let cursor = nextOf.get(head);
    while (cursor !== undefined && !chained.has(cursor) && cursor !== head) {
      chained.add(cursor);
      pushChild(base, cursor);
      cursor = nextOf.get(cursor);
    }
  }
  for (const node of tree?.nodes ?? []) if (!children.has(node.id)) children.set(node.id, []);
  const roots = (tree?.nodes ?? []).filter((n) => !parentOf.has(n.id)).map((n) => n.id);
  return { byId, children, roots, secondary, parentOf };
}

/** 深度优先展平(全展开),返回行列表 [{ node, depth }]。 */
export function flattenTree(tree) {
  const { byId, children, roots } = buildHierarchy(tree);
  const rows = [];
  const seen = new Set();
  const walk = (id, depth) => {
    if (seen.has(id)) return;
    const node = byId.get(id);
    if (node === undefined) return;
    seen.add(id);
    rows.push({ node, depth });
    for (const edge of children.get(id) ?? []) walk(edge.to, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  for (const node of tree?.nodes ?? []) if (!seen.has(node.id)) walk(node.id, 0);
  return rows;
}

// ---------------- 导图模型(抽稀为"决策骨架") ----------------

const STATE_BRANCHES = new Set(['todo', 'goal', 'plan', 'compaction', 'approval', 'team', 'retry', 'fork', 'replace', 'error']);
const INJECTED_LABEL_PREFIXES = [
  '[model changed', 'background job ', 'Current runtime context', 'You are an AI agent',
  'The user ', 'Tokens prefixed', '<system-reminder>', 'Image "', '【', 'Note:', 'System:',
];

/** 注入型"用户消息"(模型切换、后台任务通知、运行时上下文)不算用户真实发言。 */
export function isInjectedLabel(label) {
  const text = String(label ?? '').trim();
  if (text === '') return true;
  return INJECTED_LABEL_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/**
 * 抽取导图模型:轮次 + 分支点 + 用户真实发言 + 子会话;
 * 状态型分支(重复的 todo/goal 等)每轮只保留最后一次。
 * @param tree - 思维树数据 { sessionId, title, nodes, edges }
 * @param options - { branchLabel: (kind) => string, maxUsersPerTurn?: number }
 */
export function buildMindmapModel(tree, options = {}) {
  const branchLabel = options.branchLabel ?? ((kind) => kind);
  const maxUsers = options.maxUsersPerTurn ?? 6;
  const { byId, children } = buildHierarchy(tree);
  const turns = (tree?.nodes ?? []).filter((n) => n.kind === 'turn');
  const model = { title: tree?.title ?? tree?.sessionId ?? '思维树', sessionId: tree?.sessionId, turns: [] };
  for (const turn of turns) {
    const kids = (children.get(turn.id) ?? []).map((edge) => byId.get(edge.to)).filter(Boolean);
    const users = kids.filter((n) => n.kind === 'user' && !isInjectedLabel(n.label));
    const branches = kids.filter((n) => n.branch);
    const sessions = kids.filter((n) => n.kind === 'session');
    const others = kids.length - users.length - branches.length - sessions.length;
    const keptBranches = [];
    const lastStateIndex = new Map();
    branches.forEach((branch, index) => {
      const kind = branch.branch?.kind ?? 'branch';
      if (STATE_BRANCHES.has(kind)) lastStateIndex.set(kind, index);
      else keptBranches.push({ branch, index });
    });
    for (const [kind, index] of lastStateIndex) keptBranches.push({ branch: branches[index], index });
    keptBranches.sort((a, b) => a.index - b.index);
    const items = [];
    for (const user of users.slice(0, maxUsers)) items.push({ kind: 'user', text: user.label });
    if (users.length > maxUsers) items.push({ kind: 'more', text: `…另有 ${users.length - maxUsers} 条用户消息` });
    for (const entry of keptBranches) {
      const branch = entry.branch;
      const options2 = (branch.branch?.detail?.questions?.[0]?.options ?? [])
        .map((option) => option.label).filter(Boolean).slice(0, 4);
      items.push({ kind: 'branch', text: `${branchLabel(branch.branch.kind)}：${branch.label}`, options: options2 });
    }
    for (const child of sessions) items.push({ kind: 'session', text: `子会话：${child.label}` });
    if (others > 0) items.push({ kind: 'more', text: `…另有 ${others} 条过程消息` });
    model.turns.push({ turn, items });
  }
  return model;
}

/** Mermaid 文本清洗:结构字符转全角,避免破坏 mindmap 语法。 */
export function mermaidText(text, max = 44) {
  let out = String(text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...out];
  if (chars.length > max) out = `${chars.slice(0, max - 1).join('')}…`;
  return out
    .replace(/\(/g, '（').replace(/\)/g, '）')
    .replace(/\[/g, '【').replace(/\]/g, '】')
    .replace(/\{/g, '｛').replace(/\}/g, '｝')
    .replace(/"/g, '”').replace(/`/g, '')
    .replace(/::/g, ':')
    .replace(/;/g, ',');
}

// ---------------- 三种导出格式 ----------------

function frontmatterLines(tree, format) {
  const turns = (tree?.nodes ?? []).filter((n) => n.kind === 'turn');
  const title = tree?.title ?? tree?.sessionId ?? '思维树';
  return [
    '---',
    `title: ${yamlScalar(`思维树 · ${title}`)}`,
    `session: ${yamlScalar(tree?.sessionId ?? '')}`,
    `turns: ${turns.length}`,
    `nodes: ${(tree?.nodes ?? []).length}`,
    `exported: ${new Date().toISOString()}`,
    `format: ${yamlScalar(format)}`,
    `author: ${yamlScalar(AUTHOR_NAME)}`,
    'tags:',
    '  - dsh',
    '  - mind-tree',
    '---',
    '',
  ];
}

/** ① Mermaid 思维导图 Markdown:Obsidian 打开即见图(零插件)。 */
export function buildMindmapMarkdown(tree, options = {}) {
  const branchLabel = options.branchLabel ?? ((kind) => kind);
  const model = buildMindmapModel(tree, { branchLabel, maxUsersPerTurn: options.maxUsersPerTurn });
  const title = model.title;
  const lines = frontmatterLines(tree, 'mindmap');
  lines.push(`# 思维树: ${title}`);
  lines.push('');
  lines.push('```mermaid');
  lines.push('mindmap');
  lines.push(`  root((${mermaidText(title, 30)}))`);
  for (const { turn, items } of model.turns) {
    const stat = turn.usage
      ? ` · ${turn.usage.messageCount ?? 0} 条 · ${fmtTokens(turn.usage.total || turn.usage.input + turn.usage.output)} tok`
      : '';
    lines.push(`    ${mermaidText(`第 ${turn.turn ?? '?'} 轮 · ${turn.summary ?? '（无摘要）'}${stat}`, 46)}`);
    for (const item of items) {
      const prefix = item.kind === 'branch' ? '◆ ' : (item.kind === 'session' ? '↳ ' : '');
      lines.push(`      ${mermaidText(`${prefix}${item.text}`, 44)}`);
      for (const option of item.options ?? []) lines.push(`        ${mermaidText(`○ ${option}`, 30)}`);
    }
  }
  lines.push('```');
  lines.push('');
  const keyCount = model.turns.reduce((sum, t) => sum + t.items.length, 0);
  lines.push(`> 导图仅含轮次、分支点、用户消息与子会话（共 ${keyCount} 个关键节点)。`);
  lines.push(`> 完整过程（${(tree?.nodes ?? []).length} 个节点)请用大纲 Markdown,或配合 Markmap / Markmind 插件阅读。`);
  lines.push('>');
  lines.push(`> 由 dsh-plugin-mind-tree 生成 · 作者:${AUTHOR_NAME} · ${AUTHOR_URL}`);
  lines.push('');
  return lines.join('\n');
}

/** ② 大纲 Markdown:全量节点,YAML 属性 + 轮次标题 + 嵌套列表。 */
export function buildOutlineMarkdown(tree, options = {}) {
  const branchLabel = options.branchLabel ?? ((kind) => kind);
  const kindLabel = options.kindLabel ?? ((kind) => kind);
  const title = tree?.title ?? tree?.sessionId ?? '思维树';
  const lines = frontmatterLines(tree, 'outline');
  lines.push(`# 思维树: ${title}`);
  lines.push('');
  for (const row of flattenTree(tree)) {
    const node = row.node;
    if (node.kind === 'turn') {
      const usage = node.usage;
      const tokens = usage ? fmtTokens(usage.total || usage.input + usage.output) : '';
      const stat = usage ? ` · ${usage.messageCount ?? 0} 条${tokens ? ` · ${tokens} tok` : ''}` : '';
      const summary = node.summary ? ` · ${node.summary}` : '';
      lines.push('');
      lines.push(`## 第 ${node.turn ?? '?'} 轮${summary}${stat}`);
      continue;
    }
    if (node.id === 'root') continue;
    const depth = Math.max(0, row.depth - 2);
    const indent = '  '.repeat(depth);
    const seqPart = node.seq >= 0 ? `#${node.seq} ` : '';
    const mark = node.branch ? ` 〔分支:${branchLabel(node.branch.kind)}〕` : '';
    const surf = node.surface === 'shadowed' ? ' 〔已脱离上下文〕' : '';
    lines.push(`${indent}- ${seqPart}[${kindLabel(node.kind)}] ${node.label}${mark}${surf}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`> 由 dsh-plugin-mind-tree 生成 · 作者:${AUTHOR_NAME} · ${AUTHOR_URL}`);
  return lines.join('\n');
}

/** ③ Obsidian 原生画布 JSON:可拖拽/编辑的真思维导图(零插件)。 */
export function buildCanvasJson(tree, options = {}) {
  const branchLabel = options.branchLabel ?? ((kind) => kind);
  const model = buildMindmapModel(tree, { branchLabel, maxUsersPerTurn: options.maxUsersPerTurn });
  const COL = { turn: '6', branch: '2', user: '5', session: '3', more: '4' };
  const canvasNodes = [];
  const canvasEdges = [];
  const rowH = 78;
  const blockGap = 36;
  let cursorY = 0;
  const blocks = [];
  for (const entry of model.turns) {
    const blockHeight = Math.max(96, entry.items.length * rowH);
    blocks.push({ ...entry, top: cursorY, height: blockHeight });
    cursorY += blockHeight + blockGap;
  }
  const totalHeight = Math.max(200, cursorY);
  const totalNodes = (tree?.nodes ?? []).length;
  const rootId = 'root';
  canvasNodes.push({
    id: rootId, type: 'text',
    text: `# ${model.title}\n\n${model.turns.length} 轮 · ${totalNodes} 节点`,
    x: -420, y: totalHeight / 2 - 60, width: 320, height: 120, color: '1',
  });
  for (const block of blocks) {
    const turnY = block.top + block.height / 2 - 45;
    const usage = block.turn.usage;
    const stat = usage
      ? `\n${usage.messageCount ?? 0} 条 · ${fmtTokens(usage.total || usage.input + usage.output)} tok`
      : '';
    canvasNodes.push({
      id: block.turn.id, type: 'text',
      text: `## 第 ${block.turn.turn ?? '?'} 轮 · ${block.turn.summary ?? ''}${stat}`,
      x: -20, y: turnY, width: 340, height: 96, color: COL.turn,
    });
    canvasEdges.push({ id: `e-root-${block.turn.id}`, fromNode: rootId, fromSide: 'right', toNode: block.turn.id, toSide: 'left' });
    block.items.forEach((item, index) => {
      const itemId = `${block.turn.id}-i${index}`;
      canvasNodes.push({
        id: itemId, type: 'text',
        text: item.kind === 'branch' ? `◆ ${item.text}` : item.text,
        x: 400, y: block.top + index * rowH, width: 360, height: 64,
        color: COL[item.kind] ?? '5',
      });
      canvasEdges.push({
        id: `e-${itemId}`, fromNode: block.turn.id, fromSide: 'right', toNode: itemId, toSide: 'left',
        ...(item.kind === 'branch' ? { label: '分支' } : {}),
      });
      (item.options ?? []).forEach((option, optionIndex) => {
        const optionId = `${itemId}-o${optionIndex}`;
        canvasNodes.push({
          id: optionId, type: 'text', text: `○ ${option}`,
          x: 800, y: block.top + index * rowH + optionIndex * 56, width: 260, height: 48, color: '6',
        });
        canvasEdges.push({ id: `e-${optionId}`, fromNode: itemId, fromSide: 'right', toNode: optionId, toSide: 'left' });
      });
    });
  }
  return JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, 2);
}

/** 原始 JSON(供程序化消费)。 */
export function buildRawJson(tree) {
  return JSON.stringify(tree, null, 2);
}

/** 各格式的文件名 / MIME / 描述。 */
export const EXPORT_FORMATS = {
  mindmap: { extension: '.md', suffix: '-导图.md', mime: 'text/markdown', description: 'Markdown(思维导图)' },
  outline: { extension: '.md', suffix: '-大纲.md', mime: 'text/markdown', description: 'Markdown(大纲)' },
  canvas: { extension: '.canvas', suffix: '.canvas', mime: 'application/json', description: 'Obsidian Canvas' },
  json: { extension: '.json', suffix: '.json', mime: 'application/json', description: 'JSON' },
};

/**
 * 按格式生成导出内容。
 * @param tree - 思维树数据。
 * @param format - mindmap | outline | canvas | json。
 * @param options - { branchLabel, kindLabel }
 * @returns { fileName, mime, description, content }
 */
export function buildExport(tree, format, options = {}) {
  const spec = EXPORT_FORMATS[format] ?? EXPORT_FORMATS.mindmap;
  const base = safeFileName(tree?.title ?? tree?.sessionId);
  let content;
  if (format === 'outline') content = buildOutlineMarkdown(tree, options);
  else if (format === 'canvas') content = buildCanvasJson(tree, options);
  else if (format === 'json') content = buildRawJson(tree);
  else content = buildMindmapMarkdown(tree, options);
  return {
    format: EXPORT_FORMATS[format] ? format : 'mindmap',
    fileName: `${base}${spec.suffix}`,
    mime: spec.mime,
    description: spec.description,
    content,
  };
}
