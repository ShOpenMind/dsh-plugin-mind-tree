// 严格反射清单,由 DSH Typert 加载器校验。
import { PACKAGE, NAMESPACE, FOREST_DESCRIPTOR, LINEAGE_DESCRIPTOR, TREE_DESCRIPTOR, DETAIL_DESCRIPTOR, FOLLOW_DESCRIPTOR } from './remote.js';

export const TYPERT = {
  package: PACKAGE,
  face: 'host',
  schemas: [],
  invocations: [FOREST_DESCRIPTOR, LINEAGE_DESCRIPTOR, TREE_DESCRIPTOR, DETAIL_DESCRIPTOR, FOLLOW_DESCRIPTOR],
  model: {
    services: [{
      key: NAMESPACE,
      exportName: 'MindTreeService',
      description: '只读的对话分支分析服务:遍历会话事件日志,识别分支节点(替换、重试、提问、批准、派生、目标、待办、计划、压缩),并提供会话血统(派生/子代理)追踪与思维树数据。不写入会话,不发起模型调用。',
      summary: '对话上下文分支节点与思维树分析',
      tags: ['mind-map', 'tree', 'session', 'branch'],
      members: [
        { kind: 'method', name: 'forest', signature: 'forest(signal?: AbortSignal): Promise<ForestView>' },
        { kind: 'method', name: 'lineage', signature: 'lineage(sessionId: string, signal?: AbortSignal): Promise<LineageView>' },
        { kind: 'method', name: 'tree', signature: 'tree(sessionId: string, signal?: AbortSignal): Promise<ThoughtTree>' },
        { kind: 'method', name: 'detail', signature: 'detail(sessionId: string, seq: number, before: number, after: number, signal?: AbortSignal): Promise<EventWindow>' },
        { kind: 'method', name: 'follow', signature: 'follow(signal?: AbortSignal): AsyncIterable<FollowFrame>' },
      ],
      types: [],
    }],
    events: [],
    objects: [],
  },
};
export default TYPERT;
