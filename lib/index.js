// dsh-plugin-mind-tree 宿主半区:基于 sessionQuery 的对话分支分析引擎。
// Copyright (c) 2026 ShOpenMind · https://github.com/ShOpenMind/dsh-plugin-mind-tree · MIT
// 只读服务:不写入任何会话,不发起任何模型调用。
// 另注册 mind_tree 工具,让终端/GUI 里的 agent 也能直接导出思维树(不依赖网页客户端)。
import { buildExport } from './format.js';
import { reduceGraph, DETAIL_LEVELS } from './reduce.js';

export const name = 'mindTree';
export const inject = ['sessionQuery'];

const FOLLOW_QUEUE_LIMIT = 256;
/** 工具返回内容的字符上限(超过则截断并提示改用 writeTo 写文件)。 */
const TOOL_CONTENT_LIMIT = 40000;
/** 会话查询服务中本插件依赖的方法。 */
const REQUIRED_SESSION_QUERY_METHODS = [
  'readSession', 'traceSession', 'readEvent', 'filterSessions', 'readTitle', 'readTitleSnapshots',
];
/** 导出格式 → 视图限制(血缘/森林没有轮次结构,不支持导图/画布)。 */
const TREE_ONLY_FORMATS = new Set(['mindmap', 'canvas']);

/** 宿主侧文案(与客户端一致的关键标签,保证导出一致)。 */
const HOST_LABELS = {
  kindLabel: (kind) => ({
    turn: '轮次', user: '用户', assistant: '助手', tool: '工具', result: '结果', session: '会话',
    retry: '重试', approval: '批准', goal: '目标', todo: '待办', plan: '计划', compaction: '压缩',
    team: '团队', info: '信息',
  }[kind] ?? kind),
  branchLabel: (kind) => ({
    replace: '替换分支', retry: '生成重试', question: '用户选择', approval: '批准决策',
    spawn: '派生子代理', fork: '会话分叉', todo: '任务分解', goal: '目标变化', plan: '计划模式',
    compaction: '上下文压缩', team: '团队协作', error: '出错',
  }[kind] ?? kind),
};

// 会产生子会话的"派生"工具。
const SPAWN_TOOLS = new Set(['subagent', 'subagent_fork', 'workflow', 'spawn_teammate']);
// 与分支语义直接相关的工具。
const BRANCH_TOOLS = new Map([
  ['ask_user_question', 'question'],
  ['create_goal', 'goal'],
  ['update_goal', 'goal'],
  ['todo_write', 'todo'],
  ['exit_plan_mode', 'plan'],
  ['interrupt_agent', 'spawn'],
  ['send_message', 'spawn'],
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** 折叠空白并把文本截断到 max 个字符。 */
export function squash(text, max = 240) {
  if (typeof text !== 'string') return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

/** 从消息内容块提取可读文本。 */
export function messageText(message) {
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const parts = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    switch (block.type) {
      case 'text': if (typeof block.text === 'string') parts.push(block.text); break;
      case 'reasoning': if (typeof block.text === 'string') parts.push(block.text); break;
      case 'tool-call': parts.push(`〔工具:${block.name ?? ''}〕`); break;
      case 'image': parts.push('〔图片〕'); break;
      case 'file': parts.push(`〔文件:${block.attachment?.name ?? ''}〕`); break;
      default: break;
    }
  }
  return parts.join('\n');
}

/** 尽力解析 JSON(失败返回 undefined)。 */
function tryJson(raw) {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return undefined; }
}

/** 把任意值压缩成可读摘要。 */
function summarize(value, max = 160) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return squash(value, max);
  if (typeof value !== 'object') return squash(String(value), max);
  try { return squash(JSON.stringify(value), max); } catch { return ''; }
}

/** 工具调用节点的标签。 */
function toolLabel(name, argumentsRaw) {
  const args = tryJson(argumentsRaw);
  if (name === 'ask_user_question') {
    const questions = Array.isArray(args?.questions) ? args.questions : [];
    if (questions.length > 0) {
      const q = questions[0];
      const qlabel = typeof q?.question === 'string' ? squash(q.question, 90) : '';
      const options = Array.isArray(q?.options) ? q.options.map((o) => o?.label ?? '').filter(Boolean).join(' / ') : '';
      return `提问：${qlabel}${options ? `　[${squash(options, 80)}]` : ''}`;
    }
  }
  if (SPAWN_TOOLS.has(name)) {
    if (name === 'workflow' && typeof args?.meta?.name === 'string') return `工作流：${args.meta.name}`;
    const prompt = typeof args?.prompt === 'string' ? squash(args.prompt, 100) : (typeof args?.description === 'string' ? squash(args.description, 100) : '');
    const label = prompt || args?.label || '';
    return `${name}${label ? `：${label}` : ''}`;
  }
  const quick = args?.file_path ?? args?.path ?? args?.pattern ?? args?.name ?? args?.title;
  if (typeof quick === 'string' && quick) return `${name} ${squash(quick, 100)}`;
  return name;
}

/** 问询问题的选项列表。 */
function questionOptions(argumentsRaw) {
  const args = tryJson(argumentsRaw);
  const questions = Array.isArray(args?.questions) ? args.questions : [];
  return questions.map((q) => ({
    question: typeof q?.question === 'string' ? squash(q.question, 120) : '',
    options: Array.isArray(q?.options) ? q.options.map((o) => ({
      label: typeof o?.label === 'string' ? squash(o.label, 60) : '',
      description: typeof o?.description === 'string' ? squash(o.description, 80) : undefined,
    })) : [],
    multiSelect: q?.multiSelect === true,
  }));
}

/** todo_write 的任务树。 */
function todoList(argumentsRaw) {
  const args = tryJson(argumentsRaw);
  const todos = Array.isArray(args?.todos) ? args.todos : [];
  return todos.map((t) => ({
    status: t?.status ?? 'pending',
    content: typeof t?.content === 'string' ? squash(t.content, 120) : '',
  }));
}

// ---- 轮次摘要(确定性启发式,不调用模型) ----

/** 注入型消息的开头特征(运行时上下文、系统提示等,不作为摘要来源)。 */
const INJECTED_PREFIXES = [
  'Current runtime context',
  'You are an AI agent',
  'You are a ',
  'Image "',
  'Tokens prefixed',
  '<system-reminder>',
  'The user has',
  'Note:',
  'System:',
  'Developer:',
];

/** 该文本是否像"注入的上下文"而非用户本人的请求。 */
export function looksInjected(text) {
  if (typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed === '') return true;
  for (const prefix of INJECTED_PREFIXES) if (trimmed.startsWith(prefix)) return true;
  // 长且几乎全英文的内容通常是注入的上下文。
  const chars = [...trimmed];
  if (chars.length > 60 && cjkRatio(trimmed) < 0.05) return true;
  return false;
}

/** 文本中的中日韩字符占比。 */
export function cjkRatio(text) {
  const chars = [...String(text ?? '')];
  if (chars.length === 0) return 0;
  let cjk = 0;
  for (const ch of chars) {
    const code = ch.codePointAt(0);
    if ((code >= 0x3000 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) cjk += 1;
  }
  return cjk / chars.length;
}

const POLITE_PREFIXES = [
  '我想要做一个', '我想要做个', '我想要', '我想做个', '我想做', '我希望', '我需要', '我想',
  '能不能帮我', '能不能', '可以帮我', '可以', '帮我', '请你', '请帮忙', '请', '麻烦', '你好',
  '非常不错', '太好了', '很好', '好的', '不错', '谢谢', '完美', '收到', '明白', '了解',
  '现在', '接下来', '然后', '另外', '顺便', '还有', '就是', '一个', '一款', '一件',
];

/** 去掉内容块占位标记(〔图片〕〔文件:…〕等),摘要只保留真正的文字。 */
export function summarySourceOf(text) {
  return String(text ?? '')
    .replace(/〔[^〕]*〕/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 生成 6–15 字的轮次摘要:清理 markdown/代码/链接,去掉客套前缀,取首个短句。
 * @param raw - 该轮首条真实用户消息(或回退的助手文本)。
 * @returns 摘要文本;无法提取时返回空串。
 */
export function summarizeTurn(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^[#>*\-\s]+/gm, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // 交错剥离:前导标点 → 客套前缀 → 再前导标点……直到稳定。
  const LEADING_PUNCT = /^[，,、。：:；;！!？?\s"'“”「」【】]+/;
  let changed = true;
  while (changed) {
    changed = false;
    const before = text;
    text = text.replace(LEADING_PUNCT, '').trim();
    for (const prefix of POLITE_PREFIXES) {
      if (text.startsWith(prefix) && [...text].length > [...prefix].length + 3) {
        text = text.slice(prefix.length).trim();
        break;
      }
    }
    if (text !== before) changed = true;
  }
  // 首个短句(断句前需已有至少 6 字,避免切得太碎)。
  const end = text.search(/[。！？!?；;：:，,、"“”「」]/);
  if (end >= 6) text = text.slice(0, end);
  const chars = [...text];
  if (chars.length === 0) return '';
  const MAX = 15;
  const MIN = 6;
  if (chars.length <= MAX) return text;
  let cut = MAX;
  for (let i = MAX; i >= MIN; i -= 1) {
    if ('，,、。：:；;！？!?）)】]」”'.includes(chars[i - 1])) { cut = i; break; }
  }
  return `${chars.slice(0, cut).join('')}…`;
}

/** 会话记录 → 节点 DTO。 */
function sessionNode(record, title) {
  const header = record.header ?? {};
  return {
    sessionId: String(header.id ?? record.sessionId ?? ''),
    ...(title ? { title } : {}),
    parentSessionId: header.parentSession ? String(header.parentSession) : null,
    origin: header.origin === 'subagent' ? 'subagent' : header.parentSession ? 'fork' : null,
    delegationDepth: typeof header.delegationDepth === 'number' ? header.delegationDepth : undefined,
    live: record.live === true,
    persisted: record.persisted === true,
    createdAt: typeof header.createdAt === 'number' ? header.createdAt : 0,
    ...(header.cwd ? { cwd: header.cwd } : {}),
  };
}

/** 会话血统树内的边。 */
function lineageEdge(parent, child, spawn) {
  const kind = child.origin === 'subagent' ? 'subagent' : 'fork';
  return {
    from: parent.sessionId,
    to: child.sessionId,
    kind,
    ...(spawn ? { spawnSeq: spawn.seq, spawnLabel: spawn.label } : {}),
  };
}

/** 每个"派生"工具调用与其生成的子会话的时间匹配窗口(毫秒)。 */
const SPAWN_MATCH_WINDOW_MS = 10 * 60 * 1000;
/** 单次"替换"最多逐条标记多少个旧节点;超过视为整段重写,只记录分支不逐个标记。 */
const MAX_REPLACE_TARGETS = 64;

export function apply(ctx) {
  const sq = ctx.get('sessionQuery');
  if (sq === undefined) throw new Error('mindTree: sessionQuery 服务不可用');

  // ---- 能力探测:DSH 版本变化导致服务契约缺失时,给出明确提示而不是静默失效 ----
  const warnings = [];
  const missingMethods = REQUIRED_SESSION_QUERY_METHODS.filter((method) => typeof sq[method] !== 'function');
  if (missingMethods.length > 0) {
    warnings.push(`sessionQuery 缺少方法 ${missingMethods.join(', ')}(DSH 版本可能已变化,分析功能可能不完整)`);
  }
  /** 工具注册结果:供 warnings 上报(注册失败时不再静默)。 */
  let toolState = 'pending';
  for (const warning of warnings) {
    try { (ctx.logger?.warn ?? console.warn)(`[mind-tree] ${warning}`); } catch { /* 忽略 */ }
  }

  const readTitleMap = async (ids, signal) => {
    const map = new Map();
    if (ids.length === 0) return map;
    try {
      const results = await sq.readTitleSnapshots(ids, signal);
      for (const result of results ?? []) {
        if (result?.status === 'fulfilled' && result.value?.title?.title) {
          map.set(String(result.value.session?.id ?? ''), result.value.title.title);
        }
      }
    } catch { /* 标题尽力而为 */ }
    return map;
  };

  /** 全量会话森林。 */
  const forest = async (signal) => {
    const records = (await sq.listSessions(signal)) ?? [];
    const titles = await readTitleMap(records.map((r) => r.header?.id).filter(Boolean), signal);
    const nodes = [];
    const edges = [];
    for (const record of records) {
      const node = sessionNode(record, titles.get(String(record.header?.id)));
      nodes.push(node);
      if (node.parentSessionId) edges.push(lineageEdge({ sessionId: node.parentSessionId }, node));
    }
    const ids = new Set(nodes.map((n) => n.sessionId));
    const roots = nodes.filter((n) => !n.parentSessionId || !ids.has(n.parentSessionId)).map((n) => n.sessionId);
    return { nodes, edges, roots, ...(warnings.length > 0 ? { warnings: [...warnings] } : {}) };
  };

  /** 单个会话的血统追踪。 */
  const lineage = async (sessionId, signal) => {
    const trace = await sq.traceSession(String(sessionId), signal);
    const collected = [];
    for (const ancestor of trace.ancestors ?? []) collected.push(ancestor);
    collected.push(trace.target);
    const walk = (node) => {
      collected.push(node.session);
      for (const child of node.descendants ?? []) walk(child);
    };
    for (const child of trace.descendants ?? []) walk(child);
    const titles = await readTitleMap(collected.map((r) => r.header?.id).filter(Boolean), signal);
    const nodes = collected.map((r) => sessionNode(r, titles.get(String(r.header?.id))));
    const byId = new Map(nodes.map((n) => [n.sessionId, n]));
    const edges = [];
    for (const node of nodes) {
      if (node.parentSessionId && byId.has(node.parentSessionId)) edges.push(lineageEdge(byId.get(node.parentSessionId), node));
    }
    return {
      complete: trace.complete === true,
      ...(trace.complete !== true && trace.unresolvedParentId ? { unresolvedParentId: String(trace.unresolvedParentId) } : {}),
      target: String(trace.target.header?.id ?? sessionId),
      ...(trace.complete === true && trace.root ? { root: String(trace.root.header?.id) } : {}),
      nodes,
      edges,
    };
  };

  /**
   * 纯函数:把事件日志遍历成思维树(不依赖外部服务,便于单独测试)。
   * 返回 { nodes, edges, turnCount, spawns };spawns 为带事件时间的派生(子会话)候选节点。
   */
  const analyzeEvents = (events, options = {}) => {
    const { title } = options;
    const nodes = [];
    const edges = [];
    const seqNode = new Map(); // seq -> node id
    let turnNodeId = null;
    let prevTurnNodeId = null;
    let currentTurn = null;
    let lastCallNode = new Map(); // callId -> tool node id
    const shadowed = new Set(); // 被替换(分支出上下文)的节点 id
    const turnUserText = new Map(); // turn -> 该轮首条真实用户请求文本
    const turnAssistantText = new Map(); // turn -> 该轮首条中文助手文本(回退)
    const turnUsage = new Map(); // turn -> 该轮 token 消耗聚合
    const turnTimes = new Map(); // turn -> {start, end}
    let nodeSeqCounter = 0;

    const pushNode = (node) => {
      nodeSeqCounter += 1;
      nodes.push(node);
      if (node.seq >= 0) seqNode.set(node.seq, node.id);
      return node.id;
    };
    const attachToTurn = (nodeId, seq) => {
      if (turnNodeId) edges.push({ from: turnNodeId, to: nodeId, kind: 'step' });
    };
    const addTurnUsage = (turn, usage) => {
      if (typeof turn !== 'number' || !usage || typeof usage !== 'object') return;
      const acc = turnUsage.get(turn) ?? { input: 0, output: 0, total: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, messageCount: 0 };
      acc.input += Number(usage.inputTokens) || 0;
      acc.output += Number(usage.outputTokens) || 0;
      acc.total += Number(usage.totalTokens) || 0;
      acc.cacheRead += Number(usage.cacheReadTokens) || 0;
      acc.cacheWrite += Number(usage.cacheWriteTokens) || 0;
      acc.reasoning += Number(usage.reasoningTokens) || 0;
      acc.messageCount += 1;
      turnUsage.set(turn, acc);
    };

    const rootId = pushNode({ id: 'root', seq: -1, type: 'root', kind: 'info', label: title ?? '会话', surface: 'current' });

    for (const event of events) {
      // 单事件异常绝不中断整体分析:坏事件只跳过,不影响整棵树。
      try {
        const seq = typeof event?.seq === 'number' ? event.seq : -1;
        const data = event?.data ?? {};
        switch (event?.type) {
          case 'turn/start': {
            const turn = typeof data.turn === 'number' ? data.turn : (currentTurn ?? 0) + 1;
            currentTurn = turn;
            if (typeof event.time === 'number') turnTimes.set(turn, { start: event.time });
            const id = pushNode({ id: `t${turn}`, seq, type: 'turn/start', kind: 'turn', turn, label: `第 ${turn} 轮`, surface: 'current' });
            edges.push({ from: prevTurnNodeId ?? rootId, to: id, kind: 'next' });
            prevTurnNodeId = id;
            turnNodeId = id;
            break;
          }
          case 'turn/end': {
            if (typeof event.time === 'number' && currentTurn !== null) {
              const times = turnTimes.get(currentTurn) ?? {};
              times.end = event.time;
              turnTimes.set(currentTurn, times);
            }
            if (turnNodeId && data?.reason) {
              const reason = data.reason;
              const node = nodes.find((n) => n.id === turnNodeId);
              if (node && reason?.kind === 'forked') node.branch = { kind: 'fork', detail: { reason: 'forked' } };
            }
            break;
          }
          case 'user/message':
          case 'assistant/message':
          case 'system/message':
          case 'developer/message': {
            const role = event.type.split('/')[0];
            // 助手/系统消息的 data 带 message 包装;用户消息的 data 本身就是消息。
            const message = data.message ?? data;
            let kind = role;
            if (role === 'system' || role === 'developer') kind = 'info';
            const text = messageText(message);
            const interrupted = data.interrupted === true;
            // 轮次摘要素材:该轮第一条真实用户请求(避开注入上下文与纯图片消息),回退用首条中文助手文本。
            if (currentTurn !== null && text) {
              const source = summarySourceOf(text);
              if (role === 'user' && !turnUserText.has(currentTurn) && [...source].length >= 2 && !looksInjected(source)) {
                turnUserText.set(currentTurn, source);
              } else if (role === 'assistant' && !turnAssistantText.has(currentTurn) && [...source].length >= 2 && cjkRatio(source) >= 0.3) {
                turnAssistantText.set(currentTurn, source);
              }
            }
            if (role === 'assistant') addTurnUsage(currentTurn, data.usage);
            const baseLabel = squash(text, 160) || (role === 'user' ? '用户消息' : role === 'assistant' ? '助手回复' : role);
            const node = {
              id: `n${seq}`, seq, type: event.type, kind,
              turn: currentTurn ?? undefined,
              ...(typeof data.step === 'number' ? { step: data.step } : {}),
              label: interrupted ? `〔已中断〕${baseLabel}` : baseLabel,
              ...(text ? { text: squash(text, 4000) } : {}),
              surface: 'current',
            };
            // 表面操作:replace 代表该消息替换了一段旧内容 → 旧内容成为"被替代分支"。
            if (event.surfaceOp && typeof event.surfaceOp === 'object' && event.surfaceOp.op === 'replace') {
              const start = typeof event.surfaceOp.startSeq === 'number' ? event.surfaceOp.startSeq : -1;
              const end = typeof event.surfaceOp.endSeq === 'number' ? event.surfaceOp.endSeq : start;
              // 精确目标:优先使用事件自带的 sourceEventSeqs(逐条列出被替换的旧事件),
              // 只有在缺失时才回退到 [startSeq, endSeq] 区间。
              const explicit = Array.isArray(event.sourceEventSeqs) && event.sourceEventSeqs.length > 0
                ? event.sourceEventSeqs.filter((n) => typeof n === 'number')
                : null;
              const rangeSeqs = [];
              if (start >= 0 && end >= start) {
                for (let s = start; s <= end && rangeSeqs.length <= MAX_REPLACE_TARGETS; s += 1) rangeSeqs.push(s);
              }
              const candidates = explicit ?? rangeSeqs;
              // 真实影响条数:显式列表用其长度,区间用区间宽度(不受候选数组上限影响)。
              const affected = explicit !== null
                ? explicit.length
                : (start >= 0 && end >= start ? end - start + 1 : candidates.length);
              // 整段重写(一次替换牵扯几十上百条,例如上下文压缩后的整体重写):
              // 不把大量历史节点逐个标成"已脱离上下文"(既误导又制造上千条虚线),
              // 只记录一次"重写"分支并给出影响条数。
              const wide = candidates.length > MAX_REPLACE_TARGETS;
              node.branch = wide
                ? { kind: 'replace', detail: { startSeq: start, endSeq: end, wide: true, affected } }
                : { kind: 'replace', detail: { startSeq: start, endSeq: end } };
              if (!wide) {
                for (const targetSeq of candidates) {
                  const targetId = seqNode.get(targetSeq);
                  if (targetId === undefined || targetId === node.id) continue;
                  shadowed.add(targetId);
                  edges.push({ from: targetId, to: `n${seq}`, kind: 'replaced-by' });
                }
              }
            }
            const id = pushNode(node);
          attachToTurn(id);
          // 派生来源(如基于某段旧内容改写)。
          if (Array.isArray(event.sourceEventSeqs)) {
            for (const sourceSeq of event.sourceEventSeqs) {
              const sourceId = seqNode.get(sourceSeq);
              if (sourceId && sourceId !== id) edges.push({ from: sourceId, to: id, kind: 'derived' });
            }
          }
          break;
        }
        case 'tool/call': {
          const toolName = typeof data.name === 'string' ? data.name : 'tool';
          const callId = data.callId;
          const id = pushNode({
            id: `n${seq}`, seq, type: 'tool/call', kind: 'tool',
            turn: currentTurn ?? undefined,
            ...(typeof data.step === 'number' ? { step: data.step } : {}),
            label: toolLabel(toolName, data.arguments),
            surface: 'current',
          });
          attachToTurn(id);
          if (callId !== undefined) lastCallNode.set(callId, id);
          const branchKind = BRANCH_TOOLS.get(toolName) ?? (SPAWN_TOOLS.has(toolName) ? 'spawn' : undefined);
          if (branchKind === 'question') {
            const node = nodes.find((n) => n.id === id);
            node.branch = { kind: 'question', detail: { questions: questionOptions(data.arguments) } };
          } else if (branchKind === 'todo') {
            const node = nodes.find((n) => n.id === id);
            node.branch = { kind: 'todo', detail: { todos: todoList(data.arguments) } };
          } else if (branchKind === 'spawn') {
            const node = nodes.find((n) => n.id === id);
            node.branch = { kind: 'spawn', detail: { tool: toolName, label: toolLabel(toolName, data.arguments) } };
          } else if (branchKind === 'goal' || branchKind === 'plan') {
            const node = nodes.find((n) => n.id === id);
            node.branch = { kind: branchKind, detail: { tool: toolName } };
          }
          break;
        }
        case 'tool/result': {
          const message = data.message ?? {};
          const callId = message?.toolCallId ?? data.callId;
          const text = messageText(message);
          const id = pushNode({
            id: `n${seq}`, seq, type: 'tool/result', kind: 'result',
            turn: currentTurn ?? undefined,
            label: text ? squash(text, 160) : '工具结果',
            ...(text ? { text: squash(text, 4000) } : {}),
            surface: 'current',
            error: data.error !== undefined || message?.isError === true,
          });
          const callNode = callId !== undefined ? lastCallNode.get(callId) : undefined;
          edges.push({ from: callNode ?? turnNodeId ?? rootId, to: id, kind: callNode ? 'result' : 'step' });
          break;
        }
        case 'llm/retry':
        case 'llm/retry-started': {
          const id = pushNode({
            id: `n${seq}`, seq, type: event.type, kind: 'retry',
            turn: currentTurn ?? undefined,
            label: event.type === 'llm/retry' ? '模型重试' : '开始重试',
            text: summarize(data, 400),
            surface: 'log-only',
          });
          const node = nodes.find((n) => n.id === id);
          node.branch = { kind: 'retry', detail: data };
          attachToTurn(id);
          break;
        }
        case 'approval/asked': {
          const id = pushNode({
            id: `n${seq}`, seq, type: 'approval/asked', kind: 'approval',
            turn: currentTurn ?? undefined,
            label: '等待批准',
            text: summarize(data, 400),
            surface: 'log-only',
          });
          const node = nodes.find((n) => n.id === id);
          node.branch = { kind: 'approval', detail: data };
          attachToTurn(id);
          break;
        }
        case 'approval/decided': {
          const decision = data?.outcome === 'approved' || data?.approved === true ? '已批准' : (data?.outcome === 'denied' || data?.denied === true ? '已拒绝' : '批准结果');
          const id = pushNode({
            id: `n${seq}`, seq, type: 'approval/decided', kind: 'approval',
            turn: currentTurn ?? undefined,
            label: decision,
            text: summarize(data, 400),
            surface: 'log-only',
          });
          attachToTurn(id);
          break;
        }
        case 'plan/mode': {
          const id = pushNode({
            id: `n${seq}`, seq, type: 'plan/mode', kind: 'plan',
            turn: currentTurn ?? undefined,
            label: '计划模式',
            text: summarize(data, 400),
            surface: 'log-only',
          });
          const node = nodes.find((n) => n.id === id);
          node.branch = { kind: 'plan', detail: data };
          attachToTurn(id);
          break;
        }
        case 'goal/change': {
          const op = typeof data?.operation === 'string' ? data.operation : '';
          const objective = typeof data?.goal?.objective === 'string' ? `：${squash(data.goal.objective, 120)}` : '';
          const id = pushNode({
            id: `n${seq}`, seq, type: 'goal/change', kind: 'goal',
            turn: currentTurn ?? undefined,
            label: `目标${op ? `(${op})` : '变化'}${objective}`,
            text: summarize(data, 400),
            surface: 'log-only',
          });
          const node = nodes.find((n) => n.id === id);
          node.branch = { kind: 'goal', detail: data };
          attachToTurn(id);
          break;
        }
        case 'todo/write': {
          const id = pushNode({
            id: `n${seq}`, seq, type: 'todo/write', kind: 'todo',
            turn: currentTurn ?? undefined,
            label: '任务清单',
            surface: 'log-only',
          });
          const node = nodes.find((n) => n.id === id);
          node.branch = { kind: 'todo', detail: { todos: todoList(JSON.stringify(data?.todos ? { todos: data.todos } : {})) } };
          attachToTurn(id);
          break;
        }
        case 'compaction/start':
        case 'compaction/summary':
        case 'compaction/end':
        case 'compaction/prune': {
          const id = pushNode({
            id: `n${seq}`, seq, type: event.type, kind: 'compaction',
            turn: currentTurn ?? undefined,
            label: { 'compaction/start': '压缩开始', 'compaction/summary': '压缩摘要', 'compaction/end': '压缩完成', 'compaction/prune': '压缩裁剪' }[event.type] ?? '上下文压缩',
            text: summarize(data, 400),
            surface: 'log-only',
          });
          const node = nodes.find((n) => n.id === id);
          node.branch = { kind: 'compaction' };
          if (Array.isArray(event.sourceEventSeqs)) {
            for (const sourceSeq of event.sourceEventSeqs) {
              const sourceId = seqNode.get(sourceSeq);
              if (sourceId && sourceId !== id) edges.push({ from: sourceId, to: id, kind: 'derived' });
            }
          }
          attachToTurn(id);
          break;
        }
        case 'team/task':
        case 'team/member': {
          const id = pushNode({
            id: `n${seq}`, seq, type: event.type, kind: 'team',
            turn: currentTurn ?? undefined,
            label: '团队协作',
            text: summarize(data, 400),
            surface: 'log-only',
          });
          const node = nodes.find((n) => n.id === id);
          node.branch = { kind: 'team', detail: data };
          attachToTurn(id);
          break;
        }
        default:
          // 其余事件(log-only)不生成节点。
          break;
      }
      } catch { /* 单个坏事件只跳过,不影响整体分析 */ }
    }

    // 阴影化:被 replace 覆盖的事件节点。
    for (const id of shadowed) {
      const node = nodes.find((n) => n.id === id);
      if (node && node.surface === 'current') node.surface = 'shadowed';
    }

    // 轮次摘要 + token 消耗 + 耗时。
    for (const node of nodes) {
      if (node.kind !== 'turn' || typeof node.turn !== 'number') continue;
      const source = turnUserText.get(node.turn) ?? turnAssistantText.get(node.turn);
      const summary = summarizeTurn(source);
      if (summary) node.summary = summary;
      const usage = turnUsage.get(node.turn);
      if (usage) {
        const times = turnTimes.get(node.turn);
        node.usage = {
          input: usage.input,
          output: usage.output,
          total: usage.total,
          cacheRead: usage.cacheRead,
          cacheWrite: usage.cacheWrite,
          reasoning: usage.reasoning,
          messageCount: usage.messageCount,
          ...(times?.start !== undefined && times?.end !== undefined && times.end > times.start
            ? { durationMs: times.end - times.start }
            : {}),
        };
      }
    }

    // 派生(子会话)候选:带事件时间,供调用方与子会话匹配。
    const spawns = nodes.filter((n) => n.branch?.kind === 'spawn').map((n) => {
      const event = events.find((e) => e.seq === n.seq);
      return { node: n, time: typeof event?.time === 'number' ? event.time : undefined };
    });

    const turnCount = nodes.filter((n) => n.kind === 'turn').length;
    return { nodes, edges, turnCount, spawns };
  };

  /** 会话内思维树:读取日志 + 纯函数分析 + 子会话 spawn 匹配。 */
  const tree = async (sessionId, signal) => {
    const snapshot = await sq.readSession(String(sessionId));
    const events = snapshot.events ?? [];
    let title;
    try { title = (await sq.readTitle(String(sessionId), signal))?.title; } catch { /* 尽力而为 */ }

    // 本会话的子会话(用于 spawn 匹配)。
    let children = [];
    try { children = (await sq.filterSessions([{ kind: 'parent', values: [String(sessionId)] }], signal)) ?? []; } catch { /* 尽力而为 */ }
    const childTitles = await readTitleMap(children.map((r) => r.header?.id).filter(Boolean), signal);

    const { nodes, edges, turnCount, spawns } = analyzeEvents(events, { title });

    // 子会话节点与 spawn 边:按创建时间就近匹配派生工具调用。
    const claimed = new Set();
    for (const child of children) {
      const childId = String(child.header?.id);
      const createdAt = typeof child.header?.createdAt === 'number' ? child.header.createdAt : -1;
      let best = undefined;
      let bestGap = SPAWN_MATCH_WINDOW_MS;
      for (const candidate of spawns) {
        if (claimed.has(candidate.node.id)) continue;
        if (candidate.time === undefined) continue;
        const gap = Math.abs(createdAt - candidate.time);
        if (gap < bestGap) { bestGap = gap; best = candidate; }
      }
      const childTitle = childTitles.get(childId);
      const childNode = {
        id: `c${childId}`, seq: best ? best.node.seq : -1, type: 'child-session', kind: 'session',
        label: childTitle ?? (childId.length > 8 ? childId.slice(0, 8) : childId),
        sessionId: childId,
        surface: 'current',
        origin: child.header?.origin === 'subagent' ? 'subagent' : 'fork',
      };
      nodes.push(childNode);
      if (best) {
        claimed.add(best.node.id);
        edges.push({ from: best.node.id, to: childNode.id, kind: 'spawn' });
      } else {
        const lastTurnId = [...nodes].reverse().find((n) => n.kind === 'turn')?.id ?? 'root';
        edges.push({ from: lastTurnId, to: childNode.id, kind: 'spawn' });
      }
    }

    return {
      sessionId: String(sessionId),
      ...(title ? { title } : {}),
      nodes,
      edges,
      turnCount,
      ...(warnings.length > 0 ? { warnings: [...warnings] } : {}),
    };
  };

  /** 事件详情窗口。 */
  const detail = async (sessionId, seq, before, after, signal) => {
    const window = await sq.readEvent({
      sessionId: String(sessionId),
      seq: Number(seq),
      before: clamp(Number(before) || 0, 0, 20),
      after: clamp(Number(after) || 0, 0, 20),
    }, signal);
    return {
      sessionId: String(sessionId),
      seq: Number(seq),
      startSeq: typeof window.startSeq === 'number' ? window.startSeq : Number(seq),
      endSeq: typeof window.endSeq === 'number' ? window.endSeq : Number(seq),
      inheritedEventCount: typeof window.inheritedEventCount === 'number' ? window.inheritedEventCount : 0,
      target: window.target,
      events: window.events ?? [],
    };
  };

  // ---- 实时变更流(供客户端刷新) ----
  const clients = new Set();
  let closed = false;
  const onSessionEvent = (session, event) => {
    if (closed) return;
    const sessionId = session?.id;
    if (typeof sessionId !== 'string' || !sessionId) return;
    if (!Number.isSafeInteger(event?.seq)) return;
    for (const client of [...clients]) client.push({ sessionId, seq: event.seq });
  };
  ctx.on('session/event', onSessionEvent, { global: true });
  const watch = (signal) => {
    const queue = [];
    let resolveNext;
    let ended = closed || signal?.aborted === true;
    const finish = () => {
      if (ended) return;
      ended = true;
      clients.delete(client);
      signal?.removeEventListener('abort', finish);
      queue.length = 0;
      if (resolveNext) { const r = resolveNext; resolveNext = undefined; r({ done: true }); }
    };
    const client = {
      push(frame) {
        if (ended) return;
        if (resolveNext) { const r = resolveNext; resolveNext = undefined; r({ done: false, value: frame }); }
        else if (queue.length >= FOLLOW_QUEUE_LIMIT) queue.shift();
        else queue.push(frame);
      },
      next() {
        if (queue.length) return Promise.resolve({ done: false, value: queue.shift() });
        if (ended) return Promise.resolve({ done: true });
        if (resolveNext) return Promise.reject(new Error('mindTree: 同一迭代器不可并发读取'));
        return new Promise((resolve) => { resolveNext = resolve; });
      },
      return() { finish(); return Promise.resolve({ done: true }); },
      [Symbol.asyncIterator]() { return this; },
    };
    if (!ended) {
      clients.add(client);
      signal?.addEventListener('abort', finish, { once: true });
    }
    return client;
  };
  ctx.effect(() => () => {
    closed = true;
    for (const client of [...clients]) client.return();
  }, 'mind-tree.follow');

  const service = {
    forest,
    lineage,
    tree,
    detail,
    follow: watch,
  };
  // 公开的 Cordis 服务 + 精确可见的远程协议绑定。
  service.typertRemote = Object.freeze({ service, serviceKey: 'mindTree', namespace: 'mindTree' });
  ctx.provide('mindTree', service);

  // ---- mind_tree 工具:让终端 / GUI 里的 agent 也能直接导出(不依赖网页客户端) ----
  // 注意:插件无法 import DSH 内部的 defineTool(不在可解析依赖里),
  // 因此这里提供已编译好的 JSON Schema,由 tools 服务直接使用。
  const asDisplayTree = (view, sessionId, data) => {
    if (view === 'tree') return data;
    const nodes = (data.nodes ?? []).map((node) => ({
      id: node.sessionId,
      seq: -1,
      type: 'session',
      kind: 'session',
      label: node.title ?? node.sessionId,
      surface: 'current',
      sessionId: node.sessionId,
      ...(node.origin ? { origin: node.origin } : {}),
    }));
    return {
      sessionId: view === 'forest' ? 'forest' : String(sessionId),
      ...(view === 'forest' ? { title: '全部会话森林' } : {}),
      nodes,
      edges: (data.edges ?? []).map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind })),
      turnCount: 0,
    };
  };

  if (typeof ctx.inject !== 'function') {
    toolState = 'unavailable';
    warnings.push('Cordis 上下文缺少 inject:mind_tree 工具未注册');
    return;
  }
  ctx.inject(['tools'], (scope) => {
    const tools = scope.get('tools');
    if (tools === undefined || typeof tools.register !== 'function') {
      toolState = 'unavailable';
      const message = 'mind_tree 工具未注册:tools 服务不可用';
      warnings.push(message);
      try { (ctx.logger?.warn ?? console.warn)(`[mind-tree] ${message}`); } catch { /* 忽略 */ }
      return;
    }
    try {
      scope.effect(() => tools.register({
      name: 'mind_tree',
      description: [
        '把某个会话的对话上下文分析成思维树并导出。',
        'format=mindmap:Mermaid 思维导图 Markdown(Obsidian/支持 Mermaid 的编辑器打开即见图);',
        'format=outline:全量大纲 Markdown;format=canvas:Obsidian 画布 JSON;format=json:原始数据。',
        '默认分析当前会话。强烈建议配合 writeTo 写入文件(避免大内容进入上下文);',
        '不写文件时返回内容,超过 4 万字符会被截断。',
      ].join(' '),
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', description: '目标会话 id;省略则使用当前会话。' },
          format: {
            type: 'string',
            enum: ['mindmap', 'outline', 'canvas', 'json'],
            description: '导出格式,默认 mindmap。',
          },
          view: {
            type: 'string',
            enum: ['tree', 'lineage', 'forest'],
            description: 'tree=会话思维树(默认);lineage=会话血缘;forest=全部会话森林(后两者仅支持 outline/json)。',
          },
          writeTo: {
            type: 'string',
            description: '绝对文件路径;提供后把导出内容写入该文件,只返回摘要。',
          },
          level: {
            type: 'string',
            enum: ['compact', 'standard', 'full'],
            description: '过程信息量:compact(默认,只留轮次/用户发言/分支点/工具活动合计/每轮答复)、standard(加过程文本与工具明细)、full(全量)。',
          },
        },
      },
      output: {
        // 必须是标准 JSON Schema:插件无法 import 内部的 defineTool,
        // 因此不能再使用 defineTool 的属性级 required DSL。
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['summary', 'format', 'sessionId', 'fileName', 'bytes', 'turns', 'nodes'],
          properties: {
            summary: { type: 'string', description: '给模型看的一句话结果。' },
            format: { type: 'string', description: '实际使用的导出格式。' },
            sessionId: { type: 'string', description: '来源会话 id。' },
            fileName: { type: 'string', description: '建议文件名。' },
            path: { type: 'string', description: 'writeTo 模式下的落盘路径。' },
            bytes: { type: 'integer', description: '导出内容字节数。' },
            turns: { type: 'integer', description: '轮次数。' },
            nodes: { type: 'integer', description: '节点数。' },
            truncated: { type: 'boolean', description: '内容是否被截断。' },
            content: { type: 'string', description: '导出内容(未使用 writeTo 时返回)。' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: value?.summary ?? 'mind_tree 完成' }],
      },
      async execute(args, exec) {
        const format = ['mindmap', 'outline', 'canvas', 'json'].includes(args?.format) ? args.format : 'mindmap';
        const view = ['tree', 'lineage', 'forest'].includes(args?.view) ? args.view : 'tree';
        const level = DETAIL_LEVELS.includes(args?.level) ? args.level : 'compact';
        const sessionId = typeof args?.sessionId === 'string' && args.sessionId.trim() !== ''
          ? args.sessionId.trim()
          : (exec?.agent?.id !== undefined ? String(exec.agent.id) : undefined);
        if (TREE_ONLY_FORMATS.has(format) && view !== 'tree') {
          throw new Error(`mind_tree: view=${view} 没有轮次结构,不支持 ${format};请改用 outline 或 json(或 view=tree)`);
        }
        let data;
        if (view === 'tree') {
          if (sessionId === undefined) throw new Error('mind_tree: 未提供 sessionId,且当前调用没有所属会话');
          data = await tree(sessionId);
        } else if (view === 'lineage') {
          if (sessionId === undefined) throw new Error('mind_tree: lineage 视图需要 sessionId');
          data = await lineage(sessionId);
        } else {
          data = await forest();
        }
        // 与 GUI 一致:大纲/JSON 按信息量档位削减过程信息;
        // 导图/画布本身已经是抽稀后的骨架,不再叠加削减(否则会丢掉骨架需要的节点)。
        const displayed = asDisplayTree(view, sessionId, data);
        const reduced = (format === 'outline' || format === 'json') ? reduceGraph(displayed, level) : displayed;
        const exported = buildExport(reduced, format, HOST_LABELS);
        const turns = view === 'tree' ? (data.turnCount ?? 0) : 0;
        const nodeCount = (displayed.nodes ?? []).length;
        const keptCount = (reduced?.nodes ?? []).length;
        const dropped = nodeCount - keptCount;
        const levelNote = dropped > 0 ? `,已按 ${level} 档削减 ${dropped} 个过程节点` : '';
        const writeTo = typeof args?.writeTo === 'string' ? args.writeTo.trim() : '';
        if (writeTo !== '') {
          const fs = ctx.get('fs');
          if (fs === undefined || typeof fs.resolve !== 'function' || typeof fs.writeText !== 'function') {
            throw new Error('mind_tree: 当前部署没有可用的 fs 服务,无法写文件;请省略 writeTo 直接取回内容');
          }
          const target = await fs.resolve(writeTo);
          await fs.writeText(target, exported.content);
          const displayPath = typeof fs.processPath === 'function' ? fs.processPath(target) : writeTo;
          return {
            summary: `已导出 ${exported.format} 到 ${displayPath}(${exported.content.length} 字节,${turns} 轮 / ${keptCount} 节点${levelNote})`,
            format: exported.format,
            sessionId: String(sessionId ?? 'forest'),
            fileName: exported.fileName,
            path: displayPath,
            bytes: exported.content.length,
            turns,
            nodes: keptCount,
          };
        }
        const truncated = exported.content.length > TOOL_CONTENT_LIMIT;
        const content = truncated
          ? `${exported.content.slice(0, TOOL_CONTENT_LIMIT)}\n\n…(内容超过 ${TOOL_CONTENT_LIMIT} 字符已截断;完整内容请用 writeTo 写入文件)`
          : exported.content;
        return {
          summary: `已生成 ${exported.format}(${exported.content.length} 字节,${turns} 轮 / ${keptCount} 节点${levelNote}${truncated ? ',已截断' : ''})`,
          format: exported.format,
          sessionId: String(sessionId ?? 'forest'),
          fileName: exported.fileName,
          bytes: exported.content.length,
          turns,
          nodes: keptCount,
          ...(truncated ? { truncated: true } : {}),
          content,
        };
      },
      }), 'mind-tree.tool');
      toolState = 'ready';
    } catch (error) {
      toolState = 'failed';
      const message = `mind_tree 工具注册失败: ${error?.message ?? error}`;
      warnings.push(message);
      try { (ctx.logger?.warn ?? console.warn)(`[mind-tree] ${message}`); } catch { /* 忽略 */ }
    }
  });
}
