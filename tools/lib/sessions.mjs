// 本地诊断脚本共用的会话日志读取层。
// DSH 会话日志布局:<sessions>/<工作区标识>/<会话 id>/session.v4.jsonl[.zstd]
// 会话目录可通过 DSH_SESSIONS_DIR 覆盖(默认 ~/.dsh/sessions)。
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

export const SESSIONS_DIR = process.env.DSH_SESSIONS_DIR ?? join(homedir(), '.dsh', 'sessions');

/** 多帧 zstd 解压:DSH 的会话文件由多个 zstd 帧拼接而成,流式解压器只吃第一帧。 */
export function zstdAll(bytes) {
  const starts = [0];
  for (let i = 1; i < bytes.length - 3; i += 1) {
    if (bytes[i] === 0x28 && bytes[i + 1] === 0xb5 && bytes[i + 2] === 0x2f && bytes[i + 3] === 0xfd) starts.push(i);
  }
  const parts = [];
  for (let k = 0; k < starts.length; k += 1) {
    const end = k + 1 < starts.length ? starts[k + 1] : bytes.length;
    try { parts.push(zstdDecompressSync(bytes.subarray(starts[k], end)).toString('utf8')); } catch { /* 假魔数,跳过 */ }
  }
  return parts.join('');
}

/** 列举所有会话(递归一层工作区目录)。 */
export function listSessionDirs() {
  const found = [];
  if (!existsSync(SESSIONS_DIR)) return found;
  for (const workspace of readdirSync(SESSIONS_DIR, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue;
    const workspaceDir = join(SESSIONS_DIR, workspace.name);
    let sessionDirs;
    try { sessionDirs = readdirSync(workspaceDir, { withFileTypes: true }); } catch { continue; }
    for (const session of sessionDirs) {
      if (!session.isDirectory()) continue;
      const dir = join(workspaceDir, session.name);
      const compressed = join(dir, 'session.v4.jsonl.zstd');
      const plain = join(dir, 'session.v4.jsonl');
      if (existsSync(compressed)) found.push({ id: session.name, dir, file: compressed, workspace: workspace.name });
      else if (existsSync(plain)) found.push({ id: session.name, dir, file: plain, workspace: workspace.name });
    }
  }
  return found;
}

/** 读取一个会话的头部与事件;失败返回 undefined。 */
export function loadLog(entry) {
  try {
    const bytes = readFileSync(entry.file);
    const text = entry.file.endsWith('.zstd') ? zstdAll(bytes) : bytes.toString('utf8');
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) return undefined;
    return { header: JSON.parse(lines[0]), events: lines.slice(1).map((line) => JSON.parse(line)) };
  } catch { return undefined; }
}

/** 载入全部会话(带事件数),按事件数降序。 */
export function loadAllSessions() {
  return listSessionDirs()
    .map((entry) => ({ ...entry, log: loadLog(entry) }))
    .filter((entry) => entry.log !== undefined && entry.log.header !== undefined)
    .sort((a, b) => b.log.events.length - a.log.events.length);
}

/** 选取目标会话:给定 id 优先,否则取事件最多的一个。 */
export function pickSession(requestedId) {
  const all = loadAllSessions();
  if (requestedId) return all.find((entry) => entry.id === requestedId);
  return all[0];
}
