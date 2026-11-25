import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = 'F:/sanguo/game/src/core';
const DST = 'F:/sanguo/game/cocos/assets/scripts/core';

function walk(root) {
  const out = [];
  const v = (d) => {
    for (const n of readdirSync(d).sort()) {
      const f = join(d, n);
      if (statSync(f).isDirectory()) v(f);
      else if (n.endsWith('.ts') && !n.endsWith('.d.ts')) out.push(relative(root, f).split('\\').join('/'));
    }
  };
  v(root);
  return out;
}

const strip = (t) => t
  .replace(/(\bfrom\s+')(\.\.?\/[^']*?)\.ts(')/g, '$1$2$3')
  .replace(/(\bimport\s+')(\.\.?\/[^']*?)\.ts(')/g, '$1$2$3')
  .replace(/\r\n/g, '\n');

for (const f of walk(SRC)) {
  const s = strip(readFileSync(join(SRC, f), 'utf8'));
  const d = join(DST, f);
  if (!existsSync(d)) { console.log('MISSING      ' + f); continue; }
  const c = readFileSync(d, 'utf8').replace(/\r\n/g, '\n');
  const sl = s.split('\n');
  const cl = c.split('\n');
  let diff = 0;
  for (let i = 0; i < Math.max(sl.length, cl.length); i += 1) if (sl[i] !== cl[i]) diff += 1;
  console.log(`${diff ? 'DIFF ' : 'SAME '} ${f.padEnd(26)} web=${sl.length}L cocos=${cl.length}L lineDiff=${diff}`);
}

console.log('\n--- KEEP anchor hits in web source ---');
const K = [
  ['K1', 'smartscript/runtime.ts', ["const DATA_URL = new URL('../../../data/', import.meta.url);"]],
  ['K2', 'smartscript/runtime.ts', ["import { callSystemSo, emitBrightness, emitFlash, emitSfx } from '../audio_bus';"]],
  ['K3', 'smartscript/runtime.ts', [
    '    this.soundsEmitted++;',
    '    emitSfx({',
    '      name,',
    '      volume,',
    '      unit,',
    "      source: unit === undefined ? 'syscall:0x301' : 'syscall:0x300',",
    '      clock: this.clockValue,',
    '    });',
  ]],
  ['K4', 'unlock.ts', ['  return [...out].sort((a, b) => a - b);']],
  ['K5', 'wises.ts', [
    'export function parseWiseSkill(general: General): Array<[number, number]> {',
    '  const raw = general.WISESKILL;',
    '  if (!Array.isArray(raw)) return [];',
    '  const out: Array<[number, number]> = [];',
    '  for (const row of raw as unknown[]) {',
  ]],
  ['K6', 'wises.ts', ['  return [...best.values()].sort((a, b) => a.learn - b.learn).map((v) => v.seq);']],
];
for (const [id, f, lines] of K) {
  const t = readFileSync(join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
  const a = lines.join('\n');
  console.log(`${id} ${f} hits=${t.split(a).length - 1}`);
}
