// work/parity_num/_diffcore.mjs — 只读探针：归一化后逐行 diff 两端 core/*.ts
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:\\sanguo';
const WEB = path.join(ROOT, 'game', 'src', 'core');
const COC = path.join(ROOT, 'game', 'cocos', 'assets', 'scripts', 'core');

function norm(p) {
  let t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  // 去掉 import 路径上的 .ts 后缀（Cocos 不带）
  t = t.replace(/(\bfrom\s+')(\.\.?\/[^']*?)\.ts(')/g, '$1$2$3');
  return t.split('\n');
}

function lcsDiff(A, B) {
  // 简易 LCS（O(n*m) 太大就用 Myers 简化版：这里用线性空间近似——直接 hash 区间）
  const n = A.length;
  const m = B.length;
  // 先剥掉公共前缀/后缀
  let p = 0;
  while (p < n && p < m && A[p] === B[p]) p++;
  let s = 0;
  while (s < n - p && s < m - p && A[n - 1 - s] === B[m - 1 - s]) s++;
  const a2 = A.slice(p, n - s);
  const b2 = B.slice(p, m - s);
  const N = a2.length;
  const M = b2.length;
  const dp = Array.from({ length: N + 1 }, () => new Int32Array(M + 1));
  for (let i = N - 1; i >= 0; i--) {
    for (let j = M - 1; j >= 0; j--) {
      dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < N && j < M) {
    if (a2[i] === b2[j]) { ops.push(['=', p + i + 1, p + j + 1, a2[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', p + i + 1, 0, a2[i]]); i++; }
    else { ops.push(['+', 0, p + j + 1, b2[j]]); j++; }
  }
  while (i < N) { ops.push(['-', p + i + 1, 0, a2[i]]); i++; }
  while (j < M) { ops.push(['+', 0, p + j + 1, b2[j]]); j++; }
  return { prefix: p, suffix: s, ops };
}

/** core 根 + core/smartscript/ 子目录都要扫（K1/K2/K3/K7a-d 全落在 smartscript/runtime.ts） */
const files = [
  ...fs.readdirSync(WEB).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).sort(),
  ...fs.readdirSync(path.join(WEB, 'smartscript')).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).sort()
    .map((f) => `smartscript/${f}`),
];
const report = [];
for (const f of files) {
  const cp = path.join(COC, f);
  if (!fs.existsSync(cp)) { report.push({ f, status: 'COCOS_MISSING' }); continue; }
  const A = norm(path.join(WEB, f));
  const B = norm(cp);
  const { prefix, suffix, ops } = lcsDiff(A, B);
  const add = ops.filter((o) => o[0] === '+').length;
  const del = ops.filter((o) => o[0] === '-').length;
  report.push({ f, status: add + del === 0 ? 'SAME' : 'DIFF', webLines: A.length, cocosLines: B.length, add, del, commonHead: prefix, commonTail: suffix, ops });
}

const out = [];
out.push('# core/*.ts 归一化（仅去 import 的 .ts 后缀）后逐行 diff');
out.push('');
out.push('| 文件 | 状态 | web 行 | cocos 行 | + | - | 首个差异行(web) |');
out.push('|---|---|---|---|---|---|---|');
for (const r of report) {
  const firstWeb = r.ops && r.ops.find((o) => o[0] !== '=')?.at(1);
  out.push(`| ${r.f} | ${r.status} | ${r.webLines ?? '-'} | ${r.cocosLines ?? '-'} | ${r.add ?? '-'} | ${r.del ?? '-'} | ${firstWeb ?? '-'} |`);
}
out.push('');

for (const r of report) {
  if (r.status === 'SAME') continue;
  out.push(`## ${r.f}  (${r.status})`);
  out.push('');
  if (r.status === 'COCOS_MISSING') { out.push('Cocos 侧无此文件'); out.push(''); continue; }
  // 分组输出 diff hunk，只打印非 = 行，带 3 行上下文
  let printed = 0;
  const ops = r.ops;
  let lastShown = -10;
  for (let k = 0; k < ops.length; k++) {
    if (ops[k][0] === '=') continue;
    if (printed > 400) { out.push('… 省略'); break; }
    // hunk 起止
    let e = k;
    while (e < ops.length && ops[e][0] !== '=') e++;
    // 前 2 行上下文
    const ctxBefore = ops.slice(Math.max(0, k - 2), k).filter((o) => o[0] === '=');
    for (const c of ctxBefore) out.push(`  ${String(c[1]).padStart(5)} ${c[3]}`);
    for (let t = k; t < e; t++) {
      const o = ops[t];
      if (o[0] === '-') out.push(`- ${String(o[1]).padStart(5)} ${o[3]}`);
      else out.push(`+ ${String(o[2]).padStart(5)} ${o[3]}`);
      printed++;
    }
    const ctxAfter = ops.slice(e, e + 2).filter((o) => o[0] === '=');
    for (const c of ctxAfter) out.push(`  ${String(c[1]).padStart(5)} ${c[3]}`);
    out.push('  ──');
    k = e - 1;
  }
  out.push('');
}

fs.writeFileSync(path.join(ROOT, 'work', 'parity_num', '_core_diff.md'), out.join('\n'), 'utf8');
console.log(out.slice(0, 40).join('\n'));
console.log('...');
console.log('written work/parity_num/_core_diff.md');
