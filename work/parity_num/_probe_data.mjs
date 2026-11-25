/** 数据层对拍：web game/data/ vs Cocos bundle res/data/（同名 JSON 是否等价） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const A = path.join(ROOT, 'game', 'data');
const B = path.join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'data');

const files = fs.readdirSync(A).filter((f) => f.endsWith('.json')).sort();
const deepEqual = (x, y) => JSON.stringify(x) === JSON.stringify(y);

for (const f of files) {
  const pa = path.join(A, f);
  const pb = path.join(B, f);
  if (!fs.existsSync(pb)) { console.log(`${f}: Cocos 侧缺文件`); continue; }
  const ja = JSON.parse(fs.readFileSync(pa, 'utf8'));
  const jb = JSON.parse(fs.readFileSync(pb, 'utf8'));
  const la = Array.isArray(ja) ? ja.length : Object.keys(ja).length;
  const lb = Array.isArray(jb) ? jb.length : Object.keys(jb).length;
  if (deepEqual(ja, jb)) { console.log(`${f}: 一致（${la} 项）`); continue; }
  console.log(`${f}: **不一致** web ${la} 项 / cocos ${lb} 项`);
  if (Array.isArray(ja) && Array.isArray(jb)) {
    let first = null;
    const n = Math.min(ja.length, jb.length);
    for (let i = 0; i < n; i += 1) {
      if (!deepEqual(ja[i], jb[i])) { first = i; break; }
    }
    if (first !== null) {
      const ka = Object.keys(ja[first]);
      const kb = Object.keys(jb[first]);
      const lost = ka.filter((k) => !kb.includes(k));
      const added = kb.filter((k) => !ka.includes(k));
      const changed = ka.filter((k) => kb.includes(k) && !deepEqual(ja[first][k], jb[first][k]));
      console.log(`   首个不同项 [${first}] name=${ja[first].NAME ?? ja[first].name ?? '?'}`);
      console.log(`   Cocos 缺字段(${lost.length}): ${lost.slice(0, 12).join(',')}`);
      console.log(`   Cocos 多字段: ${added.slice(0, 8).join(',') || '(无)'}`);
      console.log(`   值不同字段: ${changed.slice(0, 8).join(',') || '(无)'}`);
    }
    // 数值字段是否至少一致：抽 NAME->{STR,INT,POPULATION,DEFENSE,BaseEXP}
    const pick = (o) => ({ STR: o.STR ?? o.str, INT: o.INT ?? o.int, BaseEXP: o.BaseEXP, POPULATION: o.POPULATION, DEFENSE: o.DEFENSE, MONEY: o.MONEY });
    let numDiff = 0; let name = null;
    for (let i = 0; i < n; i += 1) {
      const a = pick(ja[i]); const b = pick(jb[i]);
      if (!deepEqual(a, b)) { numDiff += 1; if (!name) name = ja[i].NAME ?? ja[i].name ?? `[${i}]`; }
    }
    console.log(`   数值字段（STR/INT/BaseEXP/POPULATION/DEFENSE/MONEY）不同的项：${numDiff} / ${n}${name ? `，例 ${name}` : ''}`);
  }
}
