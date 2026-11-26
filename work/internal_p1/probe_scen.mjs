// 探针：scenarios.json 的剧本年 / 势力表 / FLAGS / garrison 武將數
import fs from 'node:fs';
const D = 'F:/sanguo/data/';
const scen = JSON.parse(fs.readFileSync(D + 'scenarios.json', 'utf8'));
const sys = JSON.parse(fs.readFileSync(D + 'sango_system.json', 'utf8'));
const gar = JSON.parse(fs.readFileSync('F:/sanguo/game/data/garrison.json', 'utf8'));

const list = Array.isArray(scen) ? scen : (scen.scenarios || Object.values(scen));
console.log('scen root type', Array.isArray(scen) ? 'array' : typeof scen, 'len', list.length);
const sysKeys = Object.keys(sys).filter((k) => /Times/i.test(k));
console.log('system keys Times:', sysKeys.join(','));
for (const k of sysKeys) console.log('  ', k, '=>', JSON.stringify(sys[k]).slice(0, 200));

list.forEach((s, i) => {
  const cities = s.cities || [];
  const kings = [];
  for (const c of cities) if (c.KING && !kings.includes(c.KING)) kings.push(c.KING);
  const flags = {};
  for (const c of cities) flags[c.FLAGS] = (flags[c.FLAGS] || 0) + 1;
  console.log(`\n== 剧本${i + 1} name=${s.name || s.system?.NAME || '?'} YEAR=${s.system?.YEAR} cities=${cities.length} kings=${kings.length}`);
  console.log('   KING:', kings.join(','));
  console.log('   FLAGS dist:', JSON.stringify(flags));
  console.log('   city keys:', Object.keys(cities[0] || {}).join(','));
  const noKing = cities.filter((c) => !c.KING).map((c) => c.NAME);
  if (noKing.length) console.log('   无主城:', noKing.join(','));
});

// garrison officer counts
const gkeys = Object.keys(gar);
console.log('\ngarrison keys', gkeys.length, gkeys.slice(0, 3));
const sample = gar[gkeys[0]];
console.log('garrison entry type', Array.isArray(sample) ? 'array' : typeof sample, JSON.stringify(sample).slice(0, 300));
