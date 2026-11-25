// 把 map6.json 的 110 行表插入 game\src\core\audio_bus.ts（normalizeSfxName 之后）
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('F:/sanguo/work/sfx84/map6.json', 'utf8'));
const f = 'F:/sanguo/game/src/core/audio_bus.ts';
let src = fs.readFileSync(f, 'utf8');
if (src.includes('export const MAGIC_SFX')) { console.log('已存在，跳过'); process.exit(0); }

const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
let tbl = '';
let grd = '';
for (const r of rows) {
  const k = ('00' + r.seq).slice(-3);
  tbl += '  ' + pad(`'${k}': '${r.snd}',`, 22) + `// [${r.grade}] ${r.name} dir${r.dir}\n`;
}
grd = rows.map((r) => `'${('00' + r.seq).slice(-3)}':'${r.grade}'`).join(', ');

const block = `// ── 武将技编号 → 音效串（与 game/web/audio.js 的 MAGIC_SFX 同源）──────────
/**
 * 键 = 技能编号（data/magics.json 的 SEQUENCE，补 3 位），值 = sfx 目录里的具体文件名。
 *
 * 旧口径把键当 fx_dir_primary（特效目录号），只能做到"目录级"；现行双源证据
 * （见 project/96_技能音效映射.md、work/sfx84/map6.json）：
 *   [A]  技能自身特效脚本 depth<=1 处 \`PUSHS "mNNNsndNN" ... SYSCALL 0x301\`；
 *   [A2] depth<=4 间接调用播的音，且音效号 == 该技能 fx_dir；
 *   [C]  THINGS.INI 物件动画的 \`$mNNNsndNN\` 或 \`!nnnn\` 回调里播的音；
 *   [X]  仅按 m<fx_dir>sndNN 命名约定 + 文件存在（推测）。
 * 110/110 有串；004/033/007 三组由 [C] 裁决（脚本层无调用点，物件层有播放点）。
 */
export const MAGIC_SFX: Readonly<Record<string, string>> = {
${tbl}};

/** 上表每条的证级，写进事件日志/调试面板用（A > A2 > C > X）。 */
export const MAGIC_SFX_GRADE: Readonly<Record<string, 'A' | 'A2' | 'C' | 'X'>> = {
${grd.split(', ').reduce((acc, kv, i, a) => acc + (i % 8 === 0 ? '  ' : '') + kv + ',' + (i % 8 === 7 || i === a.length - 1 ? '\\n' : ' '), '')}};

/** 技能编号（16 / '16' / '016'）→ 音效名；未知返回空串。已是 mNNNsndNN 时原样小写返回。 */
export function magicSfxName(raw: string | number): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^m\\d{3}snd\\d{2}$/i.test(s)) return s.toLowerCase();
  const m = /^(\\d{1,3})$/.exec(s);
  if (!m) return '';
  return MAGIC_SFX[m[1].padStart(3, '0')] ?? '';
}

/** 技能编号 → 证级；未知返回 ''。 */
export function magicSfxGrade(raw: string | number): string {
  const key = String(raw ?? '').trim().replace(/^(\\d{1,3})$/, (_, d) => d.padStart(3, '0'));
  return MAGIC_SFX_GRADE[key] ?? '';
}

`;

const anchor = '/** 原作的音量是 0..255';
const i = src.indexOf(anchor);
if (i < 0) throw new Error('anchor not found');
src = src.slice(0, i) + block + src.slice(i);
fs.writeFileSync(f, src);
console.log('inserted', block.length, 'chars at', i);
