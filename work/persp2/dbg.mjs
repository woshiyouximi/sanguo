import { readFileSync } from 'node:fs';
const oracle = readFileSync('game/dist/core/battle.js', 'utf8');
console.log('len', oracle.length);
console.log(JSON.stringify(oracle.slice(0, 320)));
console.log('has 可在:', oracle.includes('可在'), ' has 里跑:', oracle.includes('里跑'), ' has 与引擎无关:', oracle.includes('与引擎无关'));
