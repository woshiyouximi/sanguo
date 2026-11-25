// R83 数据探针：只读 game/data/*.json，打印条数/维度，供 80 行对照表复核。
// 用法：cd F:\sanguo && node work\audit83\probe_data.mjs
import fs from 'node:fs';
import path from 'node:path';

const D = path.resolve('game/data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const arr = (v) => (Array.isArray(v) ? v : Object.values(v ?? {}));

const sc = arr(read('scenarios.json'));
console.log('scenarios', sc.length);
for (const s of sc) {
  const cities = arr(s.cities);
  const gates = cities.filter((c) => Number(c.RATE) === 0 || Number(c.POPULATION) === 0);
  console.log(
    `  id=${s.id} kings=${arr(s.kings).length} cities=${cities.length} gates=${gates.length} paths=${arr(s.paths).length}`,
  );
}
const paths = arr(sc[0].paths);
console.log('  path Length=30000 sentinels:', paths.filter((p) => Number(p.Length) >= 30000).length);
console.log('  path Length min/max:', Math.min(...paths.map((p) => Number(p.Length))), Math.max(...paths.map((p) => Number(p.Length))));

const gen = arr(read('generals.json'));
console.log('generals', gen.length, 'hasLEVEL', gen.some((g) => 'LEVEL' in g));

const items = arr(read('items.json'));
console.log('items', items.length, 'ONLYONE', items.filter((i) => i.Attrib === 'ONLYONE').length, 'rate<=0', items.filter((i) => Number(i.Rate) <= 0).length);

const magics = arr(read('magics.json'));
console.log('magics', magics.length, 'withACTIVE', magics.filter((m) => m.ACTIVE !== undefined && m.ACTIVE !== '').length, 'sampleACTIVE', JSON.stringify(magics[0]?.ACTIVE));

const wises = arr(read('wises.json'));
console.log('wises', wises.length);

const terr = arr(read('terrains.json'));
console.log('terrains', terr.length, 'vsLen', terr[0]?.vs?.length ?? 'n/a');

const form = read('formations.json');
const m = form.matrix ?? form.MATRIX;
console.log('formations matrix rows', m?.length, 'cols', m?.[0]?.length);
if (m) console.log('  last row', JSON.stringify(m[m.length - 1]).slice(0, 120));

console.log('data dir files', fs.readdirSync(D).length, fs.readdirSync(D).join(','));
