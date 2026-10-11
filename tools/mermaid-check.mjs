// 用真实 Mermaid 解析器校验导出的 mindmap 语法(避免 Obsidian 里出现报错块)。
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const toolsRequire = createRequire(import.meta.url);
const { Window } = toolsRequire('happy-dom');

// Mermaid 需要 DOM
const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
globalThis.DOMPurify = undefined;

const mermaid = (await import(pathToFileURL(toolsRequire.resolve('mermaid')).href)).default;
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

const args = process.argv.slice(2);
const files = args.length > 0
  ? args
  : [join(here, '..', '..', 'mindtree-export', 'mindmap-check.md')];

let failures = 0;
for (const file of files) {
  if (!existsSync(file)) { console.log(`[mermaid-check] 跳过(不存在): ${file}`); continue; }
  const text = readFileSync(file, 'utf8');
  const blocks = [...text.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  console.log(`[mermaid-check] ${file}: 找到 ${blocks.length} 个 mermaid 块`);
  for (const [index, block] of blocks.entries()) {
    try {
      await mermaid.parse(block);
      console.log(`  ✓ 第 ${index + 1} 块语法有效(${block.split('\n').length} 行,首行 ${block.trim().split('\n')[0]})`);
    } catch (error) {
      failures += 1;
      console.error(`  ✗ 第 ${index + 1} 块语法错误: ${error?.message ?? error}`);
      console.error('    前 5 行:', block.split('\n').slice(0, 5).join(' / '));
    }
  }
}
console.log(failures === 0 ? '[mermaid-check] 全部通过' : `[mermaid-check] ${failures} 个块失败`);
process.exit(failures === 0 ? 0 : 1);
