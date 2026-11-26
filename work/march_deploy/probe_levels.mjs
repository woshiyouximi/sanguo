import { readFileSync } from 'node:fs';

const p = 'F:/sanguo/game/cocos/assets/bundles/res/data/levels_by_scenario.json';
const d = JSON.parse(readFileSync(p, 'utf8'));
console.log('top keys:', Object.keys(d));
console.log('defaultLevel:', JSON.stringify(d.defaultLevel));
console.log('scenarios type:', Array.isArray(d.scenarios) ? 'array len ' + d.scenarios.length : typeof d.scenarios);
const s = d.scenarios?.[1];
if (s && typeof s === 'object') {
  console.log('scenario[1] keys:', Object.keys(s).slice(0, 12));
  const bucket = s.levels ?? s.officers ?? s;
  const keys = Object.keys(bucket ?? {});
  console.log('scenario[1] entry count:', keys.length);
  const pick = keys.filter((k) => k.includes('劉備') || k.includes('關羽') || k.includes('張角') || k.includes('張飛'));
  for (const k of pick) console.log('  ', k, JSON.stringify(bucket[k]));
}
