// R148 后续：把 map6.json 里 24 条由 [C] 升到 [A2] 的证级与 via（调用链）补上。
// 证据链见 project/148_技能音证据表.md、work/sfx_evidence/magic_sfx_evidence.csv。
// 只改 grade/via 两个字段，其余（snd/deep/A/B/C/all）原样保留。
// 用法：node work/sfx_evidence/map6_upgrade.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'F:/sanguo/work/sfx84/map6.json';
const rows = JSON.parse(readFileSync(P, 'utf8'));

// seq -> 链尾（via = `MagicN → ...`，函数名后带地址；格式同 project/113 的「调用链：`Magic43` → `Sparkle` → `CreateSparkle`」）
const tail = {
  4: 'ArrowSupport(0xB22C) → ProduceArrowSoldier(0xACA8) → AddSoldierRight/Left(0xABCC/0xAC48) → obj16001/16002(!6003/!6004) → FlyArrowLU/RU(0x9EF0/0xA07C) → "arrow"',
  15: 'ArrowSupport(0xB22C) → ProduceArrowSoldier(0xACA8) → AddSoldierRight/Left(0xABCC/0xAC48) → obj16001/16002(!6003/!6004) → FlyArrowLU/RU(0x9EF0/0xA07C) → "arrow"',
  30: 'ArrowSupport(0xB22C) → ProduceArrowSoldier(0xACA8) → AddSoldierRight/Left(0xABCC/0xAC48) → obj16001/16002(!6003/!6004) → FlyArrowLU/RU(0x9EF0/0xA07C) → "arrow"',
  45: 'ArrowSupport(0xB22C) → ProduceArrowSoldier(0xACA8) → AddSoldierRight/Left(0xABCC/0xAC48) → obj16001/16002(!6003/!6004) → FlyArrowLU/RU(0x9EF0/0xA07C) → "arrow"',
  72: 'ArrowSupport(0xB22C) → ProduceArrowSoldier(0xACA8) → AddSoldierRight/Left(0xABCC/0xAC48) → obj16001/16002(!6003/!6004) → FlyArrowLU/RU(0x9EF0/0xA07C) → "arrow"',
  87: 'ArrowSupport(0xB22C) → ProduceArrowSoldier(0xACA8) → AddSoldierRight/Left(0xABCC/0xAC48) → obj16001/16002(!6003/!6004) → FlyArrowLU/RU(0x9EF0/0xA07C) → "arrow"',
  9: 'Thunder(0x8DCC) → PUSHI 15010(L5362) → obj15010.Wait $m005snd02',
  14: 'Thunder(0x8DCC) → PUSHI 15010(L5362) → obj15010.Wait $m005snd02',
  22: 'Thunder(0x8DCC) → PUSHI 15010(L5362) → obj15010.Wait $m005snd02',
  28: 'Thunder(0x8DCC) → PUSHI 15010(L5362) → obj15010.Wait $m005snd02',
  39: 'Thunder(0x8DCC) → PUSHI 15010(L5362) → obj15010.Wait $m005snd02',
  47: 'ConvexStone(0x10D68) → PUSHI 20001(L9728) → obj20001.Wait $m010snd01',
  55: 'ConvexStone(0x10D68) → PUSHI 20001(L9728) → obj20001.Wait $m010snd01',
  64: 'ConvexStone(0x10D68) → PUSHI 20001(L9728) → obj20001.Wait $m010snd01',
  48: 'StoneEmitter(0xDF2C) → ProduceStoneEmitter(0xCBD8) → PUSHI 17002(L7381) → obj17002.Wait $m007snd01',
  91: 'StoneEmitter(0xDF2C) → ProduceStoneEmitter(0xCBD8) → PUSHI 17002(L7381) → obj17002.Wait $m007snd01',
  105: 'StoneEmitter(0xDF2C) → ProduceStoneEmitter(0xCBD8) → PUSHI 17002(L7381) → obj17002.Wait $m007snd01',
  65: 'RushCart(0x7288) → PUSHI 14001(L4317) → obj14001.Wait $m004snd01',
  82: 'RushCart(0x7288) → PUSHI 14001(L4317) → obj14001.Wait $m004snd01',
  104: 'DemonDancing(0x14DE8) → PUSHI 14001(L12169) → obj14001.Wait $m004snd01',
  69: 'FireWork(0x2BD3C) → ProduceCannonEmitter(0x2BC44) → PUSHI 43001/43005(L24877/L24869) → !33002=ShootCannon(0x2B4A4) → PUSHI 43002(L24593) → obj43002.Wait $m033snd01',
  74: 'FireWork(0x2BD3C) → ProduceCannonEmitter(0x2BC44) → PUSHI 43001/43005(L24877/L24869) → !33002=ShootCannon(0x2B4A4) → PUSHI 43002(L24593) → obj43002.Wait $m033snd01',
  90: 'FireWork(0x2BD3C) → ProduceCannonEmitter(0x2BC44) → PUSHI 43001/43005(L24877/L24869) → !33002=ShootCannon(0x2B4A4) → PUSHI 43002(L24593) → obj43002.Wait $m033snd01',
  44: 'FinalX1(0x36310) → XCallDragon(0x33DBC) → Xsc3603(0x3387C) → PUSHI 28012(L29346/L29385) → obj28012(!42002=Xsc3604 0x33B5C) → m018snd03(L29512)',
};

let n = 0;
const changed = [];
for (const r of rows) {
  if (!(r.seq in tail)) continue;
  const before = `${r.grade} | ${r.via}`;
  r.grade = 'A2';
  r.via = `${r.func} → ${tail[r.seq]}`;
  changed.push(`${String(r.seq).padStart(3, '0')} ${r.name}: ${before}  =>  A2 | ${r.via}`);
  n++;
}
if (n !== 24) throw new Error('expected 24 rows, got ' + n);

const raw = readFileSync(P, 'utf8');
const out = JSON.stringify(rows, null, 1) + (raw.endsWith('\n') ? '\n' : '');
writeFileSync(P, out, 'utf8');

const cnt = {};
for (const r of rows) cnt[r.grade] = (cnt[r.grade] || 0) + 1;
console.log('updated', n, 'rows; grade counts', JSON.stringify(cnt));
console.log(changed.join('\n'));
