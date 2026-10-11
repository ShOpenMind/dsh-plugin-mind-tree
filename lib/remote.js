// dsh-plugin-mind-tree 远程契约:主机(host)与网页客户端(client)之间唯一的数据面。
// 本文件同时被宿主加载器(经 ./typert)与客户端构建工具(打包进 lib/client.js)引用,
// 因此只依赖 zod,不依赖任何 DSH 实现代码。
import z from 'zod';

export const PACKAGE = 'dsh-plugin-mind-tree';
export const NAMESPACE = 'mindTree';

export const MindNodeSchema = z.object({
  sessionId: z.string(),
  title: z.string().optional(),
  parentSessionId: z.string().nullable().optional(),
  origin: z.string().nullable().optional(),
  delegationDepth: z.number().optional(),
  live: z.boolean(),
  persisted: z.boolean(),
  createdAt: z.number(),
  cwd: z.string().optional(),
});

export const MindEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.string(),
  spawnSeq: z.number().optional(),
  spawnLabel: z.string().optional(),
});

export const ForestViewSchema = z.object({
  nodes: z.array(MindNodeSchema),
  edges: z.array(MindEdgeSchema),
  roots: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
});

export const LineageViewSchema = z.object({
  complete: z.boolean(),
  unresolvedParentId: z.string().optional(),
  target: z.string(),
  root: z.string().optional(),
  nodes: z.array(MindNodeSchema),
  edges: z.array(MindEdgeSchema),
});

export const BranchNodeSchema = z.object({
  id: z.string(),
  seq: z.number(),
  type: z.string(),
  kind: z.string(),
  turn: z.number().optional(),
  step: z.number().optional(),
  label: z.string(),
  summary: z.string().optional(), // 轮次摘要(约 6–15 字)
  text: z.string().optional(),
  usage: z
    .object({
      input: z.number(),
      output: z.number(),
      total: z.number(),
      cacheRead: z.number().optional(),
      cacheWrite: z.number().optional(),
      reasoning: z.number().optional(),
      messageCount: z.number().optional(),
      durationMs: z.number().optional(),
    })
    .optional(), // 轮次 token 消耗聚合
  surface: z.string(),
  branch: z
    .object({
      kind: z.string(),
      detail: z.unknown().optional(),
    })
    .optional(),
  sessionId: z.string().optional(),
  origin: z.string().optional(),
  error: z.boolean().optional(),
});

export const BranchEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.string(),
});

export const ThoughtTreeSchema = z.object({
  sessionId: z.string(),
  title: z.string().optional(),
  nodes: z.array(BranchNodeSchema),
  edges: z.array(BranchEdgeSchema),
  turnCount: z.number(),
  warnings: z.array(z.string()).optional(),
});

export const EventWindowSchema = z.object({
  sessionId: z.string(),
  seq: z.number(),
  startSeq: z.number(),
  endSeq: z.number(),
  inheritedEventCount: z.number(),
  target: z.unknown(),
  events: z.array(z.unknown()),
});

export const FollowFrameSchema = z.object({
  sessionId: z.string(),
  seq: z.number(),
});

export const FOREST_DESCRIPTOR = {
  id: `${PACKAGE}#mindTree/forest`,
  service: NAMESPACE,
  namespace: NAMESPACE,
  method: 'forest',
  invocation: { kind: 'direct' },
  parameters: [],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: `${PACKAGE}#ForestView`, create: () => ForestViewSchema },
};

export const LINEAGE_DESCRIPTOR = {
  id: `${PACKAGE}#mindTree/lineage`,
  service: NAMESPACE,
  namespace: NAMESPACE,
  method: 'lineage',
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: `${PACKAGE}#SessionId`, create: () => z.string() } },
  ],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: `${PACKAGE}#LineageView`, create: () => LineageViewSchema },
};

export const TREE_DESCRIPTOR = {
  id: `${PACKAGE}#mindTree/tree`,
  service: NAMESPACE,
  namespace: NAMESPACE,
  method: 'tree',
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: `${PACKAGE}#SessionId`, create: () => z.string() } },
  ],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: `${PACKAGE}#ThoughtTree`, create: () => ThoughtTreeSchema },
};

export const DETAIL_DESCRIPTOR = {
  id: `${PACKAGE}#mindTree/detail`,
  service: NAMESPACE,
  namespace: NAMESPACE,
  method: 'detail',
  invocation: { kind: 'direct' },
  parameters: [
    { name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: `${PACKAGE}#SessionId`, create: () => z.string() } },
    { name: 'seq', wire: 'seq', source: 'json', codec: { mode: 'strict', typeSymbol: `${PACKAGE}#Seq`, create: () => z.number() } },
    { name: 'before', wire: 'before', source: 'json', codec: { mode: 'strict', typeSymbol: `${PACKAGE}#Seq`, create: () => z.number() } },
    { name: 'after', wire: 'after', source: 'json', codec: { mode: 'strict', typeSymbol: `${PACKAGE}#Seq`, create: () => z.number() } },
  ],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: `${PACKAGE}#EventWindow`, create: () => EventWindowSchema },
};

export const FOLLOW_DESCRIPTOR = {
  id: `${PACKAGE}#mindTree/follow`,
  service: NAMESPACE,
  namespace: NAMESPACE,
  method: 'follow',
  mode: 'stream',
  invocation: { kind: 'direct' },
  parameters: [],
  cancellation: { parameter: 'signal' },
  result: { mode: 'strict', typeSymbol: `${PACKAGE}#FollowFrame`, create: () => FollowFrameSchema },
};

export const TYPERT_REMOTE = {
  package: PACKAGE,
  descriptors: [FOREST_DESCRIPTOR, LINEAGE_DESCRIPTOR, TREE_DESCRIPTOR, DETAIL_DESCRIPTOR, FOLLOW_DESCRIPTOR],
};