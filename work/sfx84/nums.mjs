import fs from 'node:fs';
const sym = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magic_so.symbols.json', 'utf8'));
const withNum = sym.functions.filter((f) => f.num);
console.log('num != 0 的函数:', withNum.length);
for (const f of withNum) console.log('  num=', f.num, f.name, '@0x' + f.off.toString(16), 'idx', f.idx);
// id 非 0 的（MAGIC.INI Script 号）
const DIS = fs.readFileSync('F:/sanguo/export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
const ids = [];
for (const line of DIS) {
  const m = /^; func #(\d+)\s+(\S+)\s+id=0x([0-9a-f]+)\s+argc=(-?\d+)\s+@0x([0-9a-f]+)/.exec(line);
  if (m && m[3] !== '0') ids.push({ idx: +m[1], name: m[2], id: parseInt(m[3], 16), off: parseInt(m[5], 16) });
}
console.log('\nid != 0 的函数:', ids.length);
console.log(ids.slice(0, 8).map((i) => `${i.name}#${i.id}`).join(' '), '…');
console.log('\n6003/6004/7003/7004/7005/33002/18002/42002/99 出现在 id/num 里?');
for (const want of [6003, 6004, 7003, 7004, 7005, 33002, 18002, 42002, 99]) {
  const byNum = withNum.filter((f) => f.num === want).map((f) => f.name);
  const byId = ids.filter((i) => i.id === want).map((i) => i.name);
  console.log(' ', want, 'num→', JSON.stringify(byNum), 'id→', JSON.stringify(byId));
}
// system_so 是否有 6003
const sys = fs.readFileSync('F:/sanguo/export/script/system_so.dis.txt', 'utf8').split(/\r?\n/);
const sysFns = [];
for (const line of sys) {
  const m = /^; func #(\d+)\s+(\S+)\s+id=0x([0-9a-f]+)\s+argc=(-?\d+)\s+@0x([0-9a-f]+)/.exec(line);
  if (m) sysFns.push({ name: m[2], id: parseInt(m[3], 16), off: parseInt(m[5], 16) });
}
console.log('\nSYSTEM.SO 函数数', sysFns.length, '前 20:', sysFns.slice(0, 20).map((f) => `${f.name}#${f.id}`).join(' '));
console.log('SYSTEM.SO 里 id=6003/6004:', JSON.stringify(sysFns.filter((f) => f.id === 6003 || f.id === 6004)));
