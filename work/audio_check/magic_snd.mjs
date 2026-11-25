/**
 * 音频层体检 · 第 4 步：从原作字节码反汇编取"每个武将技会播哪些音效文件"。
 *
 * 证据：export/script/magic_so.dis.txt（MAGIC.SO 完整反汇编，463 函数）。
 *   `0x301(name, vol)` = 音效(name,音量)，name 是字符串表里的资源名：
 *   - m%03dsnd%02d（武将技专用音）
 *   - 也可能是普通名（arrow / hit01 / rush01 / yell03 …）
 * 关键：snd 串不在 MagicN 本体，而在它调用的特效回调里（HalfMoon / BigThunder / ShootObject…），
 * 所以按 CALL 图 + 按名调用（0x310..0x314）做可达性，得 技能 → 音效集合。
 *
 * 判定"是音效名"的口径：名字（小写、去扩展名）能在 game/web/assets/audio/sfx/ 里找到同名 .mp3。
 * 这样表里出现的每个名字都是真能播的文件，不会把 SHP/函数名误判成声音。
 *
 * 产物：work/audio_check/magic_snd.json
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const ROOT = 'F:\\sanguo';
const DIS = `${ROOT}\\export\\script\\magic_so.dis.txt`;
const MAGICS = `${ROOT}\\game\\data\\magics.json`;
const SFXDIR = `${ROOT}\\game\\web\\assets\\audio\\sfx`;
const OUT = `${ROOT}\\work\\audio_check\\magic_snd.json`;

const sfxSet = new Set(readdirSync(SFXDIR).filter((f) => /\.mp3$/i.test(f)).map((f) => f.replace(/\.mp3$/i, '').toLowerCase()));

const lines = readFileSync(DIS, 'utf8').split(/\r?\n/);
const funcs = [];
let cur = null;
for (const ln of lines) {
  const h = /^; func #(\d+)\s+(\S+)/.exec(ln);
  if (h) {
    cur = { idx: Number(h[1]), name: h[2], calls: [], strings: [], sfx: [], syscalls: {} };
    funcs.push(cur);
    continue;
  }
  if (!cur) continue;
  const s = /PUSHS\s+\d+\s+;\s+"([^"]*)"/.exec(ln);
  if (s) {
    cur.strings.push(s[1]);
    const k = s[1].toLowerCase();
    if (sfxSet.has(k)) cur.sfx.push(k);
    continue;
  }
  const c = /\bCALL\s+(\S+)/.exec(ln);
  if (c) { cur.calls.push(c[1]); continue; }
  const sc = /SYSCALL\s+0x([0-9A-Fa-f]+)/.exec(ln);
  if (sc) { const k = sc[1].toUpperCase(); cur.syscalls[k] = (cur.syscalls[k] || 0) + 1; }
}

const byName = new Map(funcs.map((f) => [f.name, f]));
const NAME_CALL_OPS = new Set(['310', '311', '312', '313', '314']);
for (const f of funcs) {
  if (!Object.keys(f.syscalls).some((k) => NAME_CALL_OPS.has(k))) continue;
  for (const s of f.strings) {
    const t = byName.get(s);
    if (t && t !== f) f.calls.push(t.name);
  }
}

function collect(rootName) {
  const seenFn = new Set();
  const out = [];
  const seen = new Set();
  const via = {};
  const stack = [rootName];
  while (stack.length) {
    const n = stack.pop();
    if (seenFn.has(n)) continue;
    seenFn.add(n);
    const f = byName.get(n);
    if (!f) continue;
    for (const s of f.sfx) if (!seen.has(s)) { seen.add(s); out.push(s); via[s] = n; }
    for (let i = f.calls.length - 1; i >= 0; i--) stack.push(f.calls[i]);
  }
  return { sfx: out, via, reached: seenFn.size };
}

const magicsRaw = JSON.parse(readFileSync(MAGICS, 'utf8'));
const magics = Array.isArray(magicsRaw) ? magicsRaw : (magicsRaw.list || Object.values(magicsRaw));

const rows = [];
for (const m of magics) {
  const fnName = String(m.fx_func);
  const r = collect(fnName);
  const dir = String(m.fx_dir_primary);
  const expect = `m${dir}snd01`;
  rows.push({
    seq: m.SEQUENCE, name: m.NAME, func: fnName, dir,
    expect,
    hasSnd01: r.sfx.includes(expect),
    sfx: r.sfx, via: Object.fromEntries(r.sfx.map((s) => [s, r.via[s]])),
    reachedFns: r.reached,
  });
}

const dirSummary = {};
for (const r of rows) {
  const d = r.dir;
  dirSummary[d] = dirSummary[d] || { magics: 0, hasSnd01: 0, sfx: {} };
  dirSummary[d].magics++;
  if (r.hasSnd01) dirSummary[d].hasSnd01++;
  for (const s of r.sfx) dirSummary[d].sfx[s] = (dirSummary[d].sfx[s] || 0) + 1;
}

writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), funcCount: funcs.length, sfxFiles: sfxSet.size, rows, dirSummary }, null, 1), 'utf8');

const withSfx = rows.filter((r) => r.sfx.length);
console.log('技能', rows.length, '| 能追到音效的', withSfx.length, '| 追不到的', rows.length - withSfx.length);
console.log('含 m<dir>snd01 的：', rows.filter((r) => r.hasSnd01).length);
console.log('');
console.log('=== 追不到任何音效的技能 ===');
for (const r of rows.filter((x) => !x.sfx.length)) console.log(` ${String(r.seq).padStart(3)} ${r.name} (dir ${r.dir}, ${r.func})`);
console.log('');
console.log('=== 不含 m<dir>snd01 但能追到音效的技能 ===');
for (const r of rows.filter((x) => x.sfx.length && !x.hasSnd01)) console.log(` ${String(r.seq).padStart(3)} ${r.name} (dir ${r.dir}) → ${r.sfx.join(', ')}`);
console.log('');
console.log('=== dir 汇总 ===');
for (const d of Object.keys(dirSummary).sort()) {
  const s = dirSummary[d];
  console.log(` ${d} | 技能 ${String(s.magics).padStart(2)} | 含 snd01 ${s.hasSnd01} | 出现: ${Object.entries(s.sfx).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '×' + v).join(' ')}`);
}
