/**
 * build.mjs — 把 Cocos 侧的 GameState.ts / AiRunner.ts（含 AiModel.ts、core/march.ts 依赖）
 * 编成 node 能直接 import 的 ESM，供 parity.mjs 使用。
 *
 * 做三件事：
 *   1. `tsc -p tsconfig.build.json` 出 ESM 到 build/（tsc 保留无扩展名的相对导入）；
 *   2. 把 build/**\/*.js 里**真实 import/export 语句**的相对导入补成 `.js`
 *      （node 的 ESM 不接受无扩展名；只按行处理 import/export，避免改到注释里的示例）；
 *   3. 把 `from 'cc'` 改写成同目录相对的 `_cc.js`，并生成 shim（sys.localStorage 用内存 Map，
 *      director.loadScene 是空函数）—— 只有 GameState.ts 会碰 'cc'。
 *
 * 不改 game/cocos 里的任何文件：所有改写都发生在 build/ 里的产物上。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const buildDir = path.join(here, 'build');
const tsc = path.join(root, 'game/node_modules/typescript/bin/tsc');

console.log('[build] tsc -p tsconfig.build.json');
execFileSync(process.execPath, [tsc, '-p', path.join(here, 'tsconfig.build.json')], { stdio: 'inherit' });

/** build/ 下所有 .js（递归） */
function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const IMPORT_LINE = /^\s*(?:import|export)\b[^'"\n]*\bfrom\s*(['"])([^'"]+)\1|^\s*import\s*\(\s*(['"])([^'"]+)\3/;

let fixed = 0;
let ccFixed = 0;
const files = walk(buildDir);
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let touched = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = IMPORT_LINE.exec(line);
    if (!m) continue;
    const spec = m[2] || m[4];
    if (spec === 'cc') {
      const rel = path.relative(path.dirname(file), path.join(buildDir, '_cc.js')).split(path.sep).join('/');
      const target = rel.startsWith('.') ? rel : './' + rel;
      lines[i] = line.split(`'cc'`).join(`'${target}'`).split(`"cc"`).join(`'${target}'`);
      touched = true;
      ccFixed += 1;
      continue;
    }
    if (!spec.startsWith('.')) continue;
    if (/\.(js|json|mjs)$/.test(spec)) continue;
    const quote = m[2] ? m[1] : m[3];
    lines[i] = line.split(`${quote}${spec}${quote}`).join(`${quote}${spec}.js${quote}`);
    touched = true;
    fixed += 1;
  }
  if (touched) fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

// 'cc' shim：只实现 GameState 用到的 sys.localStorage / director.loadScene。
const ccShim = `// 由 build.mjs 生成，勿手改：node 侧替身，只实现 GameState 用到的部分。
const memory = new Map();
export const store = memory;
export const sys = {
  localStorage: {
    getItem(key) {
      return memory.has(String(key)) ? memory.get(String(key)) : null;
    },
    setItem(key, value) {
      memory.set(String(key), String(value));
    },
    removeItem(key) {
      memory.delete(String(key));
    },
    clear() {
      memory.clear();
    },
  },
};
export const director = {
  loadScene() {},
  preloadScene() {},
  getScene() {
    return null;
  },
};
export default { sys, director };
`;
fs.writeFileSync(path.join(buildDir, '_cc.js'), ccShim, 'utf8');

console.log(`[build] 相对导入补 .js: ${fixed} 处；'cc' → _cc.js: ${ccFixed} 处；文件 ${files.length} 个`);
if (ccFixed !== 1) {
  console.error(`[build] 期望只有 1 处 'cc' 导入（GameState.ts），实际 ${ccFixed} —— 请检查`);
  process.exitCode = 1;
}
