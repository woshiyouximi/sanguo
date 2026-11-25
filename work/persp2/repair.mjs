// R198 事故修复 v2：battle.ts / layout.ts 被 PowerShell 5.1 的 ANSI 读写破坏成非法 UTF-8。
// 用 dist/ 里「R198 之前」的编译产物做文字 oracle（tsc 保留注释），坏区段用「前缀/后缀锚点」
// 在 oracle 里定位后用 oracle 原文替换；定位不到的先塞 @@R198FIX@@ 标记，人工再补。
// 只写 work/persp2/repair_out/。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const files = [
  { name: 'battle', src: 'game/src/core/battle.ts', oracle: 'game/dist/core/battle.js' },
  { name: 'layout', src: 'game/src/view/layout.ts', oracle: 'game/dist/view/layout.js' },
];

const MARK = '@@R198FIX@@';

function firstInvalid(buf, from = 0) {
  let i = from;
  while (i < buf.length) {
    const b = buf[i];
    if (b < 0x80) {
      i++;
      continue;
    }
    let n;
    if (b >= 0xc2 && b <= 0xdf) n = 1;
    else if (b >= 0xe0 && b <= 0xef) n = 2;
    else if (b >= 0xf0 && b <= 0xf4) n = 3;
    else return i;
    if (i + n >= buf.length) return i;
    for (let k = 1; k <= n; k++) if ((buf[i + k] & 0xc0) !== 0x80) return i;
    i += n + 1;
  }
  return -1;
}

const strict = new TextDecoder('utf-8', { fatal: true });
const loose = new TextDecoder('utf-8', { fatal: false });

function locates(oracle, prefix, suffix) {
  for (const n of [50, 35, 24, 16, 11, 7]) {
    if (prefix.length < n || suffix.length < n) continue;
    const p = prefix.slice(-n);
    const s = suffix.slice(0, n);
    const hits = [];
    let from = 0;
    for (;;) {
      const idx = oracle.indexOf(p, from);
      if (idx < 0) break;
      const idxS = oracle.indexOf(s, idx + p.length);
      if (idxS >= 0 && idxS - (idx + p.length) <= 120) hits.push(oracle.slice(idx + p.length, idxS));
      from = idx + 1;
      if (hits.length > 6) break;
    }
    const uniq = [...new Set(hits)];
    if (uniq.length === 1 && uniq[0].length > 0) return uniq[0];
  }
  return null;
}

for (const f of files) {
  let buf = readFileSync(f.src);
  const oracle = readFileSync(f.oracle, 'utf8');
  let fixed = 0;
  const unfixed = [];
  let from = 0;

  for (;;) {
    const i = firstInvalid(buf, from);
    if (i < 0) break;
    let end = i + 1;
    while (end < buf.length && ((buf[end] & 0xc0) === 0x80 || buf[end] === 0x3f)) end++;
    let ps = Math.max(0, i - 140);
    while (ps < i && (buf[ps] & 0xc0) === 0x80) ps++;
    const prefix = loose.decode(buf.subarray(ps, i));
    let ss = end;
    while (ss < buf.length && (buf[ss] & 0xc0) === 0x80) ss++;
    let suffix = loose.decode(buf.subarray(ss, Math.min(buf.length, ss + 160)));
    const cut = suffix.indexOf('\uFFFD');
    if (cut >= 0) suffix = suffix.slice(0, cut);

    const replacement = locates(oracle, prefix, suffix);
    if (replacement != null) {
      buf = Buffer.concat([buf.subarray(0, i), Buffer.from(replacement, 'utf8'), buf.subarray(ss)]);
      fixed++;
      from = i;
    } else {
      unfixed.push({ at: i, prefix: prefix.slice(-24), suffix: suffix.slice(0, 24) });
      buf = Buffer.concat([buf.subarray(0, i), Buffer.from(MARK, 'utf8'), buf.subarray(ss)]);
      from = i + MARK.length;
    }
  }

  mkdirSync('work/persp2/repair_out', { recursive: true });
  writeFileSync(`work/persp2/repair_out/${f.name}.ts`, buf);
  console.log(`${f.src}: fixed=${fixed} marker=${unfixed.length} stillInvalid=${firstInvalid(buf) >= 0 ? firstInvalid(buf) : 'none'}`);
  const uniq = [];
  for (const u of unfixed) uniq.push(`@${u.at} …${u.prefix}⟪⟫${u.suffix}…`);
  writeFileSync(`work/persp2/repair_out/${f.name}.unfixed.txt`, uniq.join('\n') + '\n');
}
