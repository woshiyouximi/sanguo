import { readFileSync } from 'node:fs';
import { SoProgram } from '../game/src/core/smartscript/so.ts';

const bin = readFileSync(new URL('../game/data/magic_so.bin', import.meta.url));
const sym = JSON.parse(readFileSync(new URL('../game/data/magic_so.symbols.json', import.meta.url), 'utf-8'));
const p = SoProgram.fromJson(new Uint8Array(bin), sym);
for (const n of [50, 51, 104, 550, 554, 605, 606, 504]) {
  const f = p.functionByNum(n);
  console.log(n, f ? [f.name, `idx=${f.idx}`, `argc=${f.argc}`].join(' ') : 'none');
}
