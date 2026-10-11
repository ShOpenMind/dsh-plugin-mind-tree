// 一键跑全部测试套件(供 npm test / CI 使用)。
// 纯 Node 测试失败即退出非零;依赖 DSH 解包目录的集成测试在缺失时自动跳过。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const suites = [
  { name: 'host', file: 'host-test.mjs', desc: '宿主分析引擎(合成/畸形事件、token 聚合、替换语义、工具契约)' },
  { name: 'reduce', file: 'reduce-test.mjs', desc: '过程信息削减层(三档策略、骨架保留、重新挂接)' },
  { name: 'client', file: 'client-test.mjs', desc: '客户端交互(渲染/跳转/搜索/导出/错误路径/三档切换)' },
  { name: 'mount', file: 'mount-test.mjs', desc: '完整挂载 smoke test' },
  { name: 'render', file: 'render-test.mjs', desc: 'SSR 渲染 smoke test' },
  { name: 'integration', file: 'integration-test.mjs', desc: '真实 cordis + ToolRuntime 集成(需 DSH 解包目录,缺失自动跳过)' },
];

let failed = 0;
const results = [];
for (const suite of suites) {
  const path = join(here, suite.file);
  if (!existsSync(path)) {
    results.push(`- ${suite.name}: 跳过(缺少 ${suite.file})`);
    continue;
  }
  const started = Date.now();
  const run = spawnSync(process.execPath, [path], { stdio: 'inherit', cwd: join(here, '..') });
  const ms = Date.now() - started;
  const ok = run.status === 0;
  if (!ok) failed += 1;
  results.push(`- ${suite.name}: ${ok ? '通过' : '失败'} (${ms} ms) — ${suite.desc}`);
}

console.log('\n================ 测试汇总 ================');
for (const line of results) console.log(line);
console.log(failed === 0 ? '全部套件通过 ✓' : `${failed} 个套件失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
