// 构建客户端 bundle:把 src/client.js 打包成 DSH 模块加载器格式(lib/client.js)。
// Copyright (c) 2026 ShOpenMind · https://github.com/ShOpenMind/dsh-plugin-mind-tree · MIT
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src', 'client.js');
const out = join(root, 'lib', 'client.js');
const PACKAGE_ID = 'dsh-plugin-mind-tree';
const AUTHOR_BANNER = `/*! dsh-plugin-mind-tree · 作者:ShOpenMind · https://github.com/ShOpenMind/dsh-plugin-mind-tree · MIT License */`;

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120'],
  write: false,
  external: ['react', 'react-dom', '@deepseek-ai/*'],
  logLevel: 'warning',
  legalComments: 'none',
});

const code = result.outputFiles[0].text;
const wrapped = `${AUTHOR_BANNER}
window.__ModuleLoader__.load({id:${JSON.stringify(PACKAGE_ID)},factory:function(require){
'use strict';
var module = { exports: {} };
var exports = module.exports;
${code}
return module.exports.default ?? module.exports;
}});
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, wrapped);
console.log(`[mind-tree] built ${out} (${(wrapped.length / 1024).toFixed(1)} KiB)`);
