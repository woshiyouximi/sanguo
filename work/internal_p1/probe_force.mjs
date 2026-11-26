// 探针2：势力并集 / 关城 KING / garrison 超编
import fs from 'node:fs';
const D = 'F:/sanguo/data/';
const scen = JSON.parse(fs.readFileSync(D + 'scenarios.json', 'utf8'));
const gar = JSON.parse(fs.readFileSync('F:/sanguo/game/data/garrison.json', 'utf8'));

const union = [];
for (const s of scen) for (const c of s.cities) if (c.KING && !union.includes(c.KING)) union.push(c.KING);
console.log('势力并集', union.length, ':', union.join(','));
const alpha = union.filter((n) => !/^\d+$/.test(n));
const numeric = union.filter((n) => /^\d+$/.test(n));
console.log('文本势力', alpha.length, '| 数字势力', numeric.join(','));

for (const [i, s] of scen.entries()) {
  const gates = (s.cities || []).filter((c) => c.FLAGS === 2);
  const cities = (s.cities || []).filter((c) => c.FLAGS !== 2);
  console.log(`\n剧本 idx=${i} YEAR=${s.system?.YEAR} 关=${gates.length} 城=${cities.length}`);
  console.log('  关名+FLAGS+KING:', gates.slice(0, 3).map((c) => `${c.NAME}/${c.FLAGS}/${c.KING}`).join(' '));
  console.log('  城名+FLAGS:', cities.slice(0, 3).map((c) => `${c.NAME}/${c.FLAGS}`).join(' '));
}

// garrison 武將數
for (const k of Object.keys(gar)) {
  const g = gar[k];
  const rows = [];
  for (const [city, v] of Object.entries(g.cities || {})) {
    const n = (v.officers || []).length;
    const on = (v.officers || []).filter((o) => o.status === '登' || o.status === '在').length;
    if (n > 10) rows.push(`${city}:${n}(在職${on})`);
  }
  console.log(`\ngarrison[${k}] scenario=${g.scenario} 超11人城:`, rows.join(' ') || '（无）');
}
