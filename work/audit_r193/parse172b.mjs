// 修好 json/js 顺序 + 省略目录时按 basename 搜索；同时建「守护索引」：每个测试文件的用例标题。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const table = fs.readFileSync(path.join(ROOT, 'project/172_对照表刷新.md'), 'utf8');

const rows = [];
for (const line of table.split(/\r?\n/)) {
  if (!/^\| R\d+ \|/.test(line)) continue;
  const c = line.split('|').map(s => s.trim());
  rows.push({ id: c[1], system: c[2], basis: c[3], status: c[4], evidence: c[5], hours: c[6], note: c[7] });
}

// basename index of the whole repo (limited to likely dirs)
const INDEX = new Map();
const SKIP = new Set(['node_modules', '.git', 'dist', 'cocos-build', 'cocos-build-local', 'webfix86_tmp', 'extract', 'export', 'cloud']);
function walk(dir, depth = 0) {
  if (depth > 8) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, depth + 1);
    else {
      const b = e.name;
      if (!INDEX.has(b)) INDEX.set(b, []);
      INDEX.get(b).push(full);
    }
  }
}
walk(ROOT);

function resolveFile(p) {
  const norm = p.replace(/\\/g, '/').replace(/^\.\//, '');
  const direct = [ROOT, path.join(ROOT, 'game'), path.join(ROOT, 'game/src/core'), path.join(ROOT, 'game/src/view'), path.join(ROOT, 'game/web'), path.join(ROOT, 'game/tests'), path.join(ROOT, 'game/data')]
    .map(d => path.join(d, norm)).find(f => fs.existsSync(f));
  if (direct) return { full: direct, how: 'path' };
  const base = path.basename(norm);
  const cands = INDEX.get(base) || [];
  if (cands.length) return { full: cands[0], how: 'basename', n: cands.length };
  return null;
}

const FILE_RE = /([A-Za-z0-9_\-./\\]+\.(?:json|test\.ts|ts|js|mjs|html|ps1|py))(?::(\d+)(?:-(\d+))?)?/g;

const report = [];
for (const r of rows) {
  const files = [];
  const seen = new Set();
  let m;
  FILE_RE.lastIndex = 0;
  while ((m = FILE_RE.exec(r.evidence))) {
    const raw = m[1];
    const key = raw + ':' + (m[2] || '');
    if (seen.has(key)) continue;
    seen.add(key);
    const res = resolveFile(raw);
    if (!res) { files.push({ ref: raw, line: m[2] || null, ok: false, why: 'no such file' }); continue; }
    const text = fs.readFileSync(res.full, 'utf8');
    const lines = text.split(/\r?\n/);
    const ln = m[2] ? parseInt(m[2], 10) : null;
    let ok = true, why = res.how === 'basename' ? `(basename→${path.relative(ROOT, res.full).replace(/\\/g, '/')}${res.n > 1 ? ' +' + (res.n - 1) : ''})` : '';
    let lineText = null;
    if (ln) {
      if (ln > lines.length) { ok = false; why += ` line ${ln} > ${lines.length}`; }
      else lineText = lines[ln - 1].trim().slice(0, 110);
    }
    files.push({ ref: raw, line: ln, ok, why, total: lines.length, lineText });
  }
  const tests = [];
  const tRe = /tests\/([A-Za-z0-9_]+\.test\.ts)/g;
  while ((m = tRe.exec(r.evidence))) if (!tests.includes(m[1])) tests.push(m[1]);
  report.push({ ...r, files, tests: tests.map(t => ({ t, ok: fs.existsSync(path.join(ROOT, 'game/tests', t)) })) });
}
fs.writeFileSync(path.join(ROOT, 'work/audit_r193/cites.json'), JSON.stringify(report, null, 1), 'utf8');

let bad = 0, totalRefs = 0;
for (const r of report) {
  const b = r.files.filter(f => !f.ok);
  totalRefs += r.files.length;
  bad += b.length;
  if (b.length) {
    console.log(`${r.id} [${r.status}] ${r.system}`);
    for (const f of b) console.log(`   FILE? ${f.ref}${f.line ? ':' + f.line : ''} — ${f.why}`);
  }
}
console.log(`\nrows=${report.length} fileRefs=${totalRefs} bad=${bad}`);
const noTest = report.filter(r => r.status === '✅' && r.tests.length === 0);
console.log('✅ without cited test:', noTest.map(r => r.id).join(', '));

// 守护索引
const out = [];
for (const f of fs.readdirSync(path.join(ROOT, 'game/tests')).filter(f => f.endsWith('.test.ts'))) {
  const text = fs.readFileSync(path.join(ROOT, 'game/tests', f), 'utf8');
  const titles = [];
  const re = /\b(?:test|it)\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let mm;
  while ((mm = re.exec(text))) titles.push(mm[2].replace(/\\n/g, ' ').slice(0, 100));
  out.push({ file: f, n: titles.length, titles });
}
fs.writeFileSync(path.join(ROOT, 'work/audit_r193/guards.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('guard files:', out.length, 'titles total:', out.reduce((a, x) => a + x.n, 0));
