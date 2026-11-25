import { createWorld, step, cast } from './dist/core/battle.js';
import { readFileSync } from 'node:fs';
const d = (p) => JSON.parse(readFileSync('data/' + p, 'utf8'));
const data = { scenarios: d('scenarios.json'), generals: d('generals.json'), magics: d('magics.json'), wises: d('wises.json'), troops: d('troops.json'), formations: d('formations.json'), terrains: d('terrains.json'), items: d('items.json'), garrison: d('garrison.json') };
const g = (n) => { const r = data.generals.find((x) => x.NAME === n); return { name: n, str: r.STR, int: r.INT, level: 20 }; };
const w = createWorld({ data, seed: 7, a: { general: g('關羽'), soldiers: 100, troop: 2, formation: 0, morale: 60 }, b: { general: g('張角'), soldiers: 100, troop: 10, formation: 3, morale: 60 } });
for (let i = 0; i < 60; i++) step(w);
const m = data.magics.find((x) => x.SEQUENCE === 95);
console.log('skill', m.SEQUENCE, m.NAME, 'script', m.SCRIPT, 'MP', m.MP);
const r = cast(w, 'A', m.SEQUENCE, 37, 6);
console.log('cast ok', r.ok, 'reason', r.reason, 'killed@0', r.killed, 'sessions', (w.sessions || []).length);
let total = 0; const per = [];
for (let i = 0; i < 300; i++) { const b = w.stats.spellKillsA || 0; step(w); const df = (w.stats.spellKillsA || 0) - b; per.push(df); total += df; }
console.log('per-frame(60):', per.slice(0, 60).join(''));
console.log('kills in 300f:', total, 'sessions left', (w.sessions || []).length);
