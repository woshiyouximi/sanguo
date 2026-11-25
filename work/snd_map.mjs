// work/snd_map.mjs — 技能音覆盖率核对（只读 data/ 与 assets/，不写游戏代码）
// 规则（原作 MAGIC.SO）：技能音 = m<3位特效目录号>snd<2位>
//   主选 mNNNsnd01；若该目录没有 snd01，退回目录内编号最小的 sndNN（记为 fallback）
// 输出 work/snd_map.json + 可粘进 audio.js 的静态表
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const SFX = path.join(ROOT, 'game/web/assets/audio/sfx');
const magics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/magics.json'), 'utf8'));
const files = new Set(fs.readdirSync(SFX).map((f) => f.replace(/\.mp3$/i, '').toLowerCase()));

const dirOf = (m) => {
  const p = String(m.fx_dir_primary || (Array.isArray(m.fx_dir) ? m.fx_dir[0] : '') || '');
  return /^\d{3}$/.test(p) ? p : '';
};
const sndsIn = (dir) => {
  const out = [];
  for (let i = 1; i <= 9; i++) {
    const n = `m${dir}snd0${i}`;
    if (files.has(n)) out.push(n);
  }
  return out;
};

const rows = [];
const map = {};            // dir -> 实际文件名（去重后用于 audio.js 静态表）
const byDir = new Map();   // dir -> 引用它的技能序号
let exact = 0, fallback = 0, miss = 0, noDir = 0;

for (const m of magics) {
  const dir = dirOf(m);
  const snds = dir ? sndsIn(dir) : [];
  let file = '', how = 'miss';
  if (!dir) { noDir++; how = 'no-dir'; }
  else if (snds.includes(`m${dir}snd01`)) { file = `m${dir}snd01`; how = 'snd01'; exact++; }
  else if (snds.length) { file = snds[0]; how = 'fallback'; fallback++; }
  else miss++;
  if (file && !map[dir]) map[dir] = file;
  if (dir) { if (!byDir.has(dir)) byDir.set(dir, []); byDir.get(dir).push(m.SEQUENCE); }
  rows.push({ seq: m.SEQUENCE, name: m.NAME, dir, snds, file, how });
}

const covered = exact + fallback;
const distinctDirs = new Set(rows.filter((r) => r.dir).map((r) => r.dir)).size;
const mappedDirs = Object.keys(map).length;

// 审计里的 20 个"原作都不引用"的目录，标出来便于解释覆盖率上限
const unused = [...files].filter((f) => /^m\d{3}snd\d{2}$/.test(f) && !rows.some((r) => r.snds.includes(f))).sort();

const out = {
  generatedAt: new Date().toISOString(),
  source: 'data/magics.json fx_dir_primary + game/web/assets/audio/sfx/',
  rule: 'm<fx_dir_primary>snd01，缺 snd01 时退回目录内最小编号 sndNN',
  total: magics.length,
  covered, exact, fallback, miss, noDir,
  coverage: +(covered / magics.length * 100).toFixed(1),
  distinctDirs, mappedDirs, unusedSfx: unused,
  map,
  rows,
};
fs.writeFileSync(path.join(ROOT, 'work/snd_map.json'), JSON.stringify(out, null, 1));

console.log(`magics=${magics.length} covered=${covered} (${out.coverage}%) exact=${exact} fallback=${fallback} miss=${miss} noDir=${noDir}`);
console.log(`dirs referenced=${distinctDirs} mapped=${mappedDirs} unusedSfx=${unused.length}`);
console.log('miss:', rows.filter((r) => r.how === 'miss' || r.how === 'no-dir').map((r) => `${r.seq}:${r.name}:${r.dir || '-'}`).join(', '));
console.log('JS TABLE:');
console.log(JSON.stringify(map));
