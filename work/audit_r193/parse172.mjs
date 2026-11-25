// R193 审计：解析 project/172 表格，抽取 file:line 与测试名，机械核对存在性。
// 只读：不写 game/**，输出到 work/audit_r193/。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const table = fs.readFileSync(path.join(ROOT, 'project/172_对照表刷新.md'), 'utf8');

const rows = [];
for (const line of table.split(/\r?\n/)) {
  const m = line.match(/^\| (R\d+) \|(.*)\|\s*$/);
  if (!m) continue;
  const cells = line.split('|').map(s => s.trim());
  // cells: ['', 'R1', 系统, 依据, 状态, 证据, 工时, 归属]
  rows.push({
    id: cells[1],
    system: cells[2],
    basis: cells[3],
    status: cells[4],
    evidence: cells[5],
    hours: cells[6],
    note: cells[7],
  });
}

const RESOLVE_DIRS = [
  ROOT,
  path.join(ROOT, 'game'),
  path.join(ROOT, 'game/src/core'),
  path.join(ROOT, 'game/src/view'),
  path.join(ROOT, 'game/web'),
  path.join(ROOT, 'game/tests'),
  path.join(ROOT, 'game/data'),
  path.join(ROOT, 'game/src/core/smartscript'),
];

function resolveFile(p) {
  const norm = p.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const d of RESOLVE_DIRS) {
    const full = path.join(d, norm);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  // 允许 web/ 前缀找不到时再试 game/web
  if (!norm.startsWith('game/')) {
    const full = path.join(ROOT, 'game', norm);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const report = [];
for (const r of rows) {
  const ev = r.evidence;
  // file refs with optional :line / :line-line
  const fileRe = /([A-Za-z0-9_\-./\\]+\.(?:ts|js|json|html|mjs|ps1|py))(?::(\d+)(?:-(\d+))?)?/g;
  const files = [];
  let m;
  const seen = new Set();
  while ((m = fileRe.exec(ev))) {
    const raw = m[1];
    const key = raw + ':' + (m[2] || '');
    if (seen.has(key)) continue;
    seen.add(key);
    const full = resolveFile(raw);
    if (!full) { files.push({ ref: raw, line: m[2] || null, ok: false, why: 'missing file' }); continue; }
    const text = fs.readFileSync(full, 'utf8');
    const n = text.split(/\r?\n/).length;
    const ln = m[2] ? parseInt(m[2], 10) : null;
    let lineText = null;
    let ok = true;
    let why = '';
    if (ln) {
      if (ln > n) { ok = false; why = `line ${ln} > ${n}`; }
      else lineText = text.split(/\r?\n/)[ln - 1].trim().slice(0, 120);
    }
    files.push({ ref: raw, line: ln, end: m[3] ? parseInt(m[3], 10) : null, ok, why, total: n, lineText });
  }
  // test names cited as tests/xxx.test.ts
  const tests = [];
  const tRe = /tests\/([A-Za-z0-9_]+\.test\.ts)/g;
  while ((m = tRe.exec(ev))) {
    if (!tests.includes(m[1])) tests.push(m[1]);
  }
  const testOk = tests.map(t => ({ t, ok: fs.existsSync(path.join(ROOT, 'game/tests', t)) }));
  report.push({ id: r.id, status: r.status, hours: r.hours, system: r.system, files, testOk });
}

fs.writeFileSync(path.join(ROOT, 'work/audit_r193/cites.json'), JSON.stringify(report, null, 1), 'utf8');

let bad = 0, totalRefs = 0, badTests = 0;
for (const r of report) {
  const b = r.files.filter(f => !f.ok);
  const bt = r.testOk.filter(t => !t.ok);
  totalRefs += r.files.length;
  bad += b.length;
  badTests += bt.length;
  if (b.length || bt.length) {
    console.log(`${r.id} [${r.status}] ${r.system}`);
    for (const f of b) console.log(`   FILE? ${f.ref}${f.line ? ':' + f.line : ''} — ${f.why}`);
    for (const t of bt) console.log(`   TEST? ${t.t}`);
  }
}
console.log(`\nrows=${report.length} refs=${totalRefs} badRefs=${bad} badTests=${badTests}`);
const byStatus = {};
for (const r of report) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
console.log('status:', JSON.stringify(byStatus));
const noTest = report.filter(r => r.status === '✅' && r.testOk.length === 0);
console.log('✅ rows with no cited test:', noTest.map(r => r.id).join(', ') || '(none)');
const hoursSum = report.reduce((a, r) => a + (parseFloat(r.hours) || 0), 0);
console.log('hours sum =', hoursSum);
