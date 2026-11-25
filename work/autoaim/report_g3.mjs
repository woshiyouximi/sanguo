// 逐技分类：g3（引擎目标句柄）在脚本里到底是「没读 / 读了丢掉 / 读了并用于分支」。
// 输出 work/autoaim/g3_classes.md，供 project/139_武将技自动目标.md 引用。
import fs from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const STATS = 'F:/sanguo/work/autoaim/dis_stats.txt';
const lines = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);

const funcs = [];
const headerRe = /^; func #(\d+)\s+(\S+)\s+id=(\S+)\s+argc=(\d+)\s+@(\S+)/;
for (let i = 0; i < lines.length; i++) {
  const m = headerRe.exec(lines[i]);
  if (m) {
    if (funcs.length) funcs[funcs.length - 1].to = i;
    funcs.push({ idx: +m[1], name: m[2], argc: +m[4], addr: m[5], from: i, to: lines.length });
  }
}
const opRe = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+(\S+)\s*(.*?)\s*;/;
const byName = new Map();
for (const f of funcs) {
  f.ops = [];
  for (let i = f.from + 1; i < f.to; i++) {
    if (lines[i].startsWith('; func #')) break;
    const m = opRe.exec(lines[i]);
    if (!m) continue;
    f.ops.push({ pc: m[1], op: m[3], args: (m[4] || '').trim(), line: i + 1 });
  }
  if (!byName.has(f.name)) byName.set(f.name, f); // 同名函数取第一个
}

// 与 trace_g3.mjs 同款判定：LDG 3 -> STL locN 之后是否真的回读
function classify(f) {
  const hits = [];
  for (let i = 0; i < f.ops.length; i++) {
    const o = f.ops[i];
    if (o.op !== 'LDG' || !/^3\b/.test(o.args)) continue;
    const next = f.ops[i + 1];
    if (!next) { hits.push({ line: o.line, kind: 'dead' }); continue; }
    if (next.op === 'STL' || next.op === 'STG') {
      const slot = next.args.split(',')[0].trim();
      // 严格版：从 STL 往后扫，先遇到同一 slot 的另一次写入 => 这个值死了（槽被复用）；
      // 先遇到 LDSL/LDSG 同一 slot => 真的回读。
      let usedAt = [];
      for (let j = i + 2; j < f.ops.length; j++) {
        const p = f.ops[j];
        const pSlot = p.args.split(',')[0].trim();
        if ((p.op === 'STL' || p.op === 'STG') && pSlot === slot) break; // 槽被覆盖
        if ((p.op === 'LDSL' || p.op === 'LDSG') && pSlot === slot) { usedAt.push(p.line); break; }
      }
      hits.push({ line: o.line, kind: usedAt.length ? 'used' : 'dead', slot, usedAt });
    } else {
      hits.push({ line: o.line, kind: 'used', how: next.op }); // 直接进比较/参数
    }
  }
  return hits;
}

// dis_stats.txt 末段：每技能一行 `104 神鬼亂舞         Magic105   4  6    2    0    0    4  DemonDancing`
// 列 = seq, 名, MagicN, g3, g5, s100, s111, s112, s113, 脚本函数
const rows = [];
const skillRe = /^\s*(\d+)\s+(\S+)\s+(Magic\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*$/;
let inSkillSection = false;
for (const raw of fs.readFileSync(STATS, 'utf8').split(/\r?\n/)) {
  if (raw.includes('110 条武将技')) { inSkillSection = true; continue; }
  if (!inSkillSection) continue;
  const m = skillRe.exec(raw);
  if (!m) continue;
  rows.push({ seq: +m[1], name: m[2], magic: m[3], g3: +m[4], fn: m[10] });
}

const out = ['# g3（引擎目标句柄）在 MAGIC.SO 各技能里的使用分类', '',
  '判定：`LDG 3` 之后若存进 `STL locN` 而全函数再没 `LDSL locN` = **读了丢掉**（对结果无影响）；',
  '直接作为 `SYSCALL`/比较指令的操作数，或存进 loc 后又回读 = **真正消费**。', ''];
const used = [], dead = [], zero = [], missing = [];
for (const r of rows) {
  const f = byName.get(r.fn);
  if (!f) { missing.push(r); continue; }
  const hits = classify(f);
  if (hits.length === 0) { zero.push(r); continue; }
  if (hits.some((h) => h.kind === 'used')) used.push({ ...r, hits });
  else dead.push({ ...r, hits });
}
const fmt = (r) => `| ${r.seq} | ${r.name} | ${r.magic} | ${r.g3} | ${r.fn} | ${r.hits.map((h) => `dis:${h.line}${h.kind === 'used' ? (h.how ? '→' + h.how : '→' + (h.usedAt || []).join(',')) : '（丢弃）'}`).join('<br>')} |`;
out.push(`## A. 真正消费 g3 的技能（${used.length} 条：落点会经 g3 影响这些技）`, '',
  '| seq | 技能 | 脚本函数 | LDG3 | 函数 | 消费点 |', '|---|---|---|---|---|---|', ...used.map(fmt), '');
out.push(`## B. 读了但立刻丢掉的技能（${dead.length} 条：落点对这些技完全无影响）`, '',
  '| seq | 技能 | 脚本函数 | LDG3 | 函数 | 死读点 |', '|---|---|---|---|---|---|', ...dead.map(fmt), '');
out.push(`## C. 完全不读 g3 的技能（${zero.length} 条）`, '',
  zero.map((r) => `${r.seq} ${r.name}(${r.magic}/${r.fn})`).join('、'), '');
if (missing.length) out.push('', `## 缺函数映射 ${missing.length} 条`, missing.map((r) => `${r.seq} ${r.name} -> ${r.fn}`).join('、'));
out.push('', `合计 ${rows.length} 条技能：消费 ${used.length} / 死读 ${dead.length} / 不读 ${zero.length} / 缺 ${missing.length}`);

fs.writeFileSync('F:/sanguo/work/autoaim/g3_classes.md', out.join('\n') + '\n', 'utf8');
console.log(`skills=${rows.length} used=${used.length} dead=${dead.length} zero=${zero.length} missing=${missing.length}`);
console.log('used seq:', used.map((r) => r.seq).join(','));
