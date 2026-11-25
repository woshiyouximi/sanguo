// 临时把 0x10C 换回旧实现，验证两个红（神鬼亂舞 / 地泉衝）是否与 R171 的 0x10C 改动有关。
// 用法：node work/summon7/toggle10c.mjs old|new
import fs from 'node:fs';

const p = 'F:/sanguo/game/src/core/smartscript/syscalls.ts';
const mode = process.argv[2];
let t = fs.readFileSync(p, 'utf8');

const NEW = 'return r(ctx.aliveCount?.(a(0)) ?? 0);';
const OLD = 'return r(ctx.unitSide(a(0)));';

if (mode === 'old') {
  if (!t.includes(NEW)) throw new Error('new form not found');
  t = t.replace(NEW, OLD);
} else {
  if (!t.includes(OLD)) throw new Error('old form not found');
  t = t.replace(OLD, NEW);
}
fs.writeFileSync(p, t, 'utf8');
console.log('0x10C ->', mode);
