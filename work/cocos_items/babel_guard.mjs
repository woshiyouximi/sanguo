/**
 * Babel 降级守卫：Cocos Creator 的 Babel（plugin-transform-spread loose 模式）会把
 *   [...它]        → [].concat(它)
 *   for (x of a ?? b) → 坏掉的 helper
 * 而 `[].concat(Map.values())` 不會攤平 iterator，只會得到「一個 iterator 的一元陣列」。
 * 2026-11-25 的線上建置就是這樣把物品頁弄成「共 1 件」的（ItemsModel.allItems），
 * 本腳本把這類寫法在原始碼層面擋住，避免只靠 tsc/headless（兩者都跑原生 spread，
 * 抓不到 Creator 的降級）而復發。
 *
 * 用法：node babel_guard.mjs          掃 ItemsModel.ts / ItemsPanel.ts
 *      node babel_guard.mjs a.ts b.ts 掃指定檔
 * 退出碼：0 = 乾淨，1 = 有違規。
 */
import { readFileSync } from 'node:fs';

const SCRIPTS = 'F:/sanguo/game/cocos/assets/scripts/';
const DEFAULT_TARGETS = [`${SCRIPTS}ItemsModel.ts`, `${SCRIPTS}ItemsPanel.ts`];
const targets = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_TARGETS;

/** 去掉 // 行注释与 /* *\/ 块注释，避免把说明文字里的示例当成代码。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

const problems = [];

for (const file of targets) {
  const raw = readFileSync(file, 'utf8');
  const clean = stripComments(raw);
  const lines = clean.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const where = `${file}:${i + 1}`;

    // 1) 数组展开：本仓库这两个文件一律用 Array.from / .slice()，禁止 [...x]。
    if (/\[\.\.\./.test(line)) {
      problems.push(`${where}  数组展开 [...x]（Creator Babel 会降成 [].concat(x)）→ 改用 Array.from(x) 或 x.slice()`);
    }

    // 2) 逻辑式当 for-of 头：?? / || / 三元 / ?. 都会让 Babel 生成坏 helper。
    const forOf = line.match(/for\s*\(\s*(?:const|let|var)\s+[^)]*?\s+of\s+([^)]*)/);
    if (forOf && /(\?\?|\|\||\?\.|[^?]\?[^?.])/.test(forOf[1])) {
      problems.push(`${where}  for-of 头里有逻辑表达式（${forOf[1].trim()}）→ 先赋给局部变量再遍历`);
    }
  }
}

if (problems.length > 0) {
  console.log('--- babel_guard: 发现违规 ---');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\n共 ${problems.length} 处，退出码 1`);
  process.exit(1);
}

console.log(`babel_guard: ${targets.length} 个文件干净（无 [...x]、无逻辑式 for-of 头）`);
