/** 数据层细查：formations 7 vs 4 / scenarios.cities 差异字段 / meta */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const A = path.join(ROOT, 'game', 'data');
const B = path.join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'data');
const load = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));

const fa = load(A, 'formations.json');
const fb = load(B, 'formations.json');
console.log('formations web keys:', Array.isArray(fa) ? `array ${fa.length}` : Object.keys(fa).join(','));
console.log('formations coc keys:', Array.isArray(fb) ? `array ${fb.length}` : Object.keys(fb).join(','));
if (!Array.isArray(fa)) {
  for (const k of Object.keys(fa)) {
    if (!(k in fb)) { console.log(`  web 独有 ${k}: ${JSON.stringify(fa[k]).slice(0, 120)}`); continue; }
    console.log(`  ${k}: ${JSON.stringify(fa[k]) === JSON.stringify(fb[k]) ? '一致' : '不同'}  web=${JSON.stringify(fa[k]).slice(0, 90)}  coc=${JSON.stringify(fb[k]).slice(0, 90)}`);
  }
}

const sa = load(A, 'scenarios.json');
const sb = load(B, 'scenarios.json');
console.log('\nscenarios[0] keys web:', Object.keys(sa[0]).join(','));
console.log('scenarios[0] keys coc:', Object.keys(sb[0]).join(','));
const ca = sa[0].cities;
const cb = sb[0].cities;
console.log('cities len', ca.length, cb.length);
const ks = new Set();
for (const c of [...ca, ...cb]) Object.keys(c).forEach((k) => ks.add(k));
const fields = [...ks];
const counts = new Map();
for (let i = 0; i < Math.min(ca.length, cb.length); i += 1) {
  for (const k of fields) {
    if (JSON.stringify(ca[i][k]) !== JSON.stringify(cb[i][k])) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
}
console.log('cities 逐城逐字段不同计数:', [...counts.entries()].map(([k, v]) => `${k}×${v}`).join(' ') || '(无)');
const sample = ca[0];
console.log('样例城 web:', JSON.stringify(sample).slice(0, 300));
console.log('样例城 coc:', JSON.stringify(cb[0]).slice(0, 300));

const ma = load(A, 'meta.json');
const mb = load(B, 'meta.json');
console.log('\nmeta web:', JSON.stringify(ma));
console.log('meta coc:', JSON.stringify(mb));
