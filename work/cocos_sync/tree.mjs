#!/usr/bin/env node
/**
 * 生成 `work/cocos_sync/tree.txt`：Cocos 工程的文件树（报告 §1 的证据）。
 *
 * 口径：
 *   - `assets/` **全量**逐文件列出（工程里真正要提交的东西）；
 *   - `library/`、`temp/` 是编辑器缓存（可达数万文件），只给「文件数 / 字节」一行；
 *   - 根目录文件、`settings/`、`profiles/`、`reference/` 全列。
 *
 * 为什么不用 PowerShell 的 tree：它对中文目录名的对齐会错位，而且无法排除缓存目录。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo/game/cocos';
const OUT = 'F:/sanguo/work/cocos_sync/tree.txt';

function listDir(dir, prefix, lines, summaryOnly) {
  const ents = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  ents.forEach((ent, i) => {
    const last = i === ents.length - 1;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (summaryOnly.includes(ent.name) && path.dirname(full) === ROOT) {
        const files = countFiles(full);
        lines.push(`${prefix}${last ? '└─ ' : '├─ '}${ent.name}/  [缓存目录：${files.n} 文件 / ${files.b} B，未展开]`);
        return;
      }
      lines.push(`${prefix}${last ? '└─ ' : '├─ '}${ent.name}/`);
      listDir(full, `${prefix}${last ? '   ' : '│  '}`, lines, summaryOnly);
    } else {
      const size = fs.statSync(full).size;
      lines.push(`${prefix}${last ? '└─ ' : '├─ '}${ent.name}  ${size} B`);
    }
  });
}

function countFiles(dir) {
  let n = 0;
  let b = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const sub = countFiles(full);
      n += sub.n;
      b += sub.b;
    } else {
      n += 1;
      b += fs.statSync(full).size;
    }
  }
  return { n, b };
}

const lines = [];
lines.push(`Cocos 工程树  root=${ROOT}`);
lines.push(`generated=${new Date().toISOString()}`);
lines.push('说明：assets/ 全量展开；library/ temp/ 是 Creator 缓存，只给计数。');
lines.push('');
listDir(ROOT, '', lines, ['library', 'temp', 'local', 'build']);

let out = lines.join('\n');
// 顺带统计几个关键数字，写进报告时直接用
const bundle = countFiles(`${ROOT}/assets/bundles`);
const scripts = countFiles(`${ROOT}/assets/scripts`);
out += `\n\n[bundles] ${bundle.n} 文件 / ${bundle.b} B\n[scripts] ${scripts.n} 文件 / ${scripts.b} B\n`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${out}\n`, 'utf8');
console.log(`tree.txt: ${lines.length} 行 → ${OUT}`);
console.log(`bundles ${bundle.n} 文件 / ${bundle.b} B; scripts ${scripts.n} 文件 / ${scripts.b} B`);
