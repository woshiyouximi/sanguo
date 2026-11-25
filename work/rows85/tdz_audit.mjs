/**
 * R86 / P0 死档：campaign.html 的「模組層 top-level 呼叫 → 後文 let/const」TDZ 審計原型。
 * 邏輯與 tests/rows85.test.ts 裡的斷言一致（先把演算法在這裡跑通，再落成斷言）。
 *
 * 為什麼要這條：`if (gameStarted && boot.battle) settleBattleReturn();` 本來寫在 :1185（模組層），
 * 它經 openSurrenderSheet() 讀到 `let surState`（:3300 之後）→ TDZ 崩在模組求值期 →
 * 本檔後面全部不執行 → 頁面變死頁、還崩在 autosave 之前（槽快照永遠舊 ⇒ boot.battle 永遠 true）。
 * 這種 bug 的共同特徵：**模組層的呼叫** + **被呼叫鏈（深度 ≤3）讀到宣告在呼叫點之後的 let/const**。
 *
 * 用法：node work/rows85/tdz_audit.mjs [file]
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'F:/sanguo/game/web/campaign.html';
const lines = readFileSync(file, 'utf8').split(/\r?\n/);

// 1) 只收 let/const/var（function 宣告會提升，不算 TDZ 風險）
const late = new Map();
for (let i = 0; i < lines.length; i++) {
  const m = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
  if (m) late.set(m[1], i + 1);
}

// 2) 模組層函數 body（行首 0 縮進的 function，大括號配對）
const bodies = new Map();
for (let i = 0; i < lines.length; i++) {
  const m = /^(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
  if (!m) continue;
  let depth = 0, end = i;
  for (let j = i; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth === 0 && j > i) { end = j; break; }
    }
    if (depth === 0 && j > i) break;
  }
  bodies.set(m[1], lines.slice(i, end + 1).join('\n'));
}

// 3) 模組層呼叫（行首 0 縮進的行上，任何指向本檔 function 的 `名(`）
//    —— 注意 `if (cond) foo();` 這種也要抓：原 bug 就是 `if (gameStarted && boot.battle) settleBattleReturn();`
const calls = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line || /^\s/.test(line)) continue;        // 只審模組層（行首無縮進）
  if (/^(?:function|class|import|export|\/\/|\/\*|\*)/.test(line)) continue;
  for (const m of line.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!bodies.has(m[1])) continue;
    calls.push({ name: m[1], line: i + 1 });
  }
}

// 4) BFS（深度 ≤3）找「宣告在呼叫點之後」的 let/const 引用
const hits = [];
for (const c of calls) {
  const seen = new Set([c.name]);
  const queue = [c.name];
  let depth = 0;
  while (queue.length && depth < 3) {
    const next = [];
    const level = queue.splice(0, queue.length);
    for (const fn of level) {
      const body = bodies.get(fn);
      if (!body) continue;
      for (const [nm, ln] of late) {
        if (ln <= c.line) continue;
        if (new RegExp(`(^|[^\\w$.])${nm.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(body)) {
          hits.push({ callSite: `${c.line}: ${lines[c.line - 1].trim().slice(0, 72)}`, via: fn, lateRef: `${nm} (:${ln})` });
        }
      }
      for (const m of body.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
        if (bodies.has(m[2]) && !seen.has(m[2])) { seen.add(m[2]); next.push(m[2]); }
      }
    }
    queue.push(...next);
    depth++;
  }
}

console.log(`file=${file}`);
console.log(`decls(let/const)=${late.size} functions=${bodies.size} moduleCalls=${calls.length} hits=${hits.length}`);
for (const h of hits) console.log(JSON.stringify(h));
process.exitCode = hits.length ? 1 : 0;
