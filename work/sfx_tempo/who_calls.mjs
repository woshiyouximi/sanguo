// 谁调用 Ice / FireRing？把「CALL 点所在函数」映射回技能，验证 1.1b 表格里的"谁在这个 dir 里播音"。
import fs from 'node:fs';
const ROOT = 'F:/sanguo';
const DIS = `${ROOT}/export/script/magic_so.dis.txt`;
const sym = JSON.parse(fs.readFileSync(`${ROOT}/game/data/magic_so.symbols.json`, 'utf8'));
const magics = JSON.parse(fs.readFileSync(`${ROOT}/game/data/magics.json`, 'utf8'));
const arr = Array.isArray(magics) ? magics : magics.magics;
const fns = sym.functions.slice().sort((a, b) => a.off - b.off);
function fnAt(addr) {
  let lo = 0, hi = fns.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fns[mid].off <= addr) { best = fns[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return best ? best.name : '?';
}
const byFn = new Map();
for (const m of arr) {
  const k = m.fx_func;
  if (!byFn.has(k)) byFn.set(k, []);
  byFn.get(k).push(`${m.SEQUENCE} ${m.NAME}`);
}
const L = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);
for (const target of ['Ice', 'FireRing']) {
  console.log(`\n=== CALL ${target} 的调用点`);
  const callers = new Set();
  for (let i = 0; i < L.length; i++) {
    if (!new RegExp(`CALL\\s+${target}\\b`).test(L[i])) continue;
    const m = /^([0-9A-F]{6})/.exec(L[i].trim());
    if (!m) continue;
    const who = fnAt(parseInt(m[1], 16));
    callers.add(who);
    const skills = byFn.get(who) ?? [];
    console.log(`  ${L[i].trim().slice(0, 22)}  在 ${who}  技能: ${skills.join(' | ') || '(非 MagicN)'}`);
  }
  console.log(`  ⇒ 直接调用者集合: ${[...callers].join(', ')}`);
}
