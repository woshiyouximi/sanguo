// 定稿口径 v4：
//  A = 技能自身 fx_func 的调用图（CALL / CALLS / 0x310-0x314 按名），不含物件回调；取最小深度音效
//  B = 该技能 fx_dir 的「物件回调块」音效：num ∈ [dir*1000, dir*1000+999] 的函数（排除 MagicN / F*）调用图 depth<=2
//  C = 该 dir 的物件动画 $ 音效 / !nnnn 回调音效（THINGS 结构证据）
//  D = 仅有文件（m<dir>snd01 存在）=> 推测
import fs from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const sym = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magic_so.symbols.json', 'utf8'));
const magics = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magics.json', 'utf8'));

const L = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);
const reIns = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;
const all = [];
for (let i = 0; i < L.length; i++) {
  const m = reIns.exec(L[i]);
  if (!m) continue;
  const ins = { addr: parseInt(m[1], 16), op: m[3], operand: m[4].trim(), line: i + 1 };
  const s = /"(.*)"/.exec(m[5]);
  if (ins.op === 'PUSHS' && s) ins.str = s[1];
  if (ins.op === 'PUSHI') ins.imm = Number(ins.operand);
  if (ins.op === 'CALL') ins.callee = ins.operand;
  if (ins.op === 'SYSCALL') { const mm = /^0x([0-9a-f]+)/i.exec(ins.operand); if (mm) ins.syscall = parseInt(mm[1], 16); }
  all.push(ins);
}
all.sort((a, b) => a.addr - b.addr);

const fns = sym.functions.slice().sort((a, b) => a.off - b.off);
const funcs = [];
for (let k = 0; k < fns.length; k++) {
  const f = fns[k];
  const end = k + 1 < fns.length ? fns[k + 1].off : sym.codeEnd;
  funcs.push({ name: f.name, num: f.num, off: f.off, ins: all.filter((i) => i.addr >= f.off && i.addr < end) });
}
const byName = new Map(funcs.map((f) => [f.name, f]));
const isFn = (s) => byName.has(s);
const isMagicN = (s) => /^Magic\d+$/.test(s);
const isEngine = (s) => /^F\d+$/.test(s);

// 按名调用的参数个数 -> 名字是「最先压栈」的串；只遇控制流才截断
const STOP = new Set(['JMP', 'JZ', 'JNZ', 'RET', 'RETV']);
const BYNAME = new Set([0x310, 0x311, 0x312, 0x313, 0x314]);
function backName(ins, idx) {
  const cands = [];
  for (let k = idx - 1; k >= 0 && k >= idx - 40; k--) {
    const p = ins[k];
    if (STOP.has(p.op)) break;
    if (p.op === 'PUSHS' && p.str) cands.push(p.str);
  }
  if (!cands.length) return null;
  const fn = cands.filter(isFn);
  return fn.length ? fn[fn.length - 1] : null; // 只认函数名，取最早那个
}

const reSnd = /^m(\d{3})snd(\d{2})$/i;
const sites = [];
const events = new Map();
for (const f of funcs) {
  const ev = [];
  for (let i = 0; i < f.ins.length; i++) {
    const ins = f.ins[i];
    if (ins.callee) ev.push({ kind: 'call', addr: ins.addr, callee: ins.callee, how: 'CALL' });
    if (ins.op === 'CALLS' || (ins.op === 'SYSCALL' && BYNAME.has(ins.syscall))) {
      const nm = backName(f.ins, i);
      if (nm) ev.push({ kind: 'call', addr: ins.addr, callee: nm, how: ins.op === 'CALLS' ? 'CALLS' : '0x' + ins.syscall.toString(16) });
    }
    if (ins.op === 'SYSCALL' && (ins.syscall === 0x301 || ins.syscall === 0x300)) {
      let name = null, vol = null;
      for (let k = i - 1; k >= 0 && k >= i - 12; k--) {
        const p = f.ins[k];
        if (['CALL', 'CALLS', 'SYSCALL', 'RET', 'RETV'].includes(p.op)) break;
        if (p.op === 'PUSHS' && p.str) { name = p.str; break; }
        if (p.op === 'PUSHI' && vol === null && p.imm >= 0 && p.imm <= 255) vol = p.imm;
      }
      if (!name) continue;
      const sm = reSnd.exec(name);
      const site = { func: f.name, addr: ins.addr, line: ins.line, name, vol, dir: sm ? sm[1] : null, idx: sm ? sm[2] : null, syscall: ins.syscall };
      sites.push(site);
      ev.push({ kind: 'snd', addr: ins.addr, site });
    }
  }
  ev.sort((a, b) => a.addr - b.addr);
  events.set(f.name, ev);
}

function walk(root, maxDepth = 99, skipEngine = true) {
  const out = [];
  const go = (name, depth, path, visited) => {
    if (depth > maxDepth) return;
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'snd') out.push({ ...ev.site, depth, path: [...path] });
      else if (ev.kind === 'call') {
        const c = ev.callee;
        if (!isFn(c) || isMagicN(c) || (skipEngine && isEngine(c)) || visited.has(c)) continue;
        visited.add(c);
        go(c, depth + 1, [...path, c], visited);
      }
    }
  };
  go(root, 0, [root], new Set([root]));
  return out;
}

// THINGS
const txt = new TextDecoder('big5').decode(fs.readFileSync('F:/sanguo/extract/pak/THINGS.INI'));
const secs = [];
let cur = null;
for (const line of txt.split(/\r?\n/)) {
  const m = /^\[(.*)\]\s*$/.exec(line.trim());
  if (m) { cur = { name: m[1], props: {} }; secs.push(cur); continue; }
  if (!cur) continue;
  const kv = /^([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
  if (kv) cur.props[kv[1]] = kv[2];
}
const objsByDir = new Map();
for (const s of secs) {
  const d = (s.props.Directory || '').trim().toLowerCase().replace(/^\\/, '');
  if (!d) continue;
  if (!objsByDir.has(d)) objsByDir.set(d, []);
  objsByDir.get(d).push(s);
}
const fnByNum = new Map(funcs.filter((f) => f.num).map((f) => [f.num, f.name]));
// 该目录物件的结构证据：$ 音效 + !nnnn 回调音效
function dirStruct(dir) {
  const out = [];
  for (const o of objsByDir.get('magic\\' + dir) ?? []) {
    const seq = Number(o.props.Sequence);
    for (const [k, v] of Object.entries(o.props)) for (const m of v.matchAll(/\$(\w+)/g)) out.push({ snd: m[1], via: `obj${seq}.${k}`, seq });
  }
  for (const o of objsByDir.get('magic\\' + dir) ?? []) {
    const seq = Number(o.props.Sequence);
    for (const [k, v] of Object.entries(o.props)) for (const m of v.matchAll(/!(\d+)/g)) {
      const n = Number(m[1]);
      const fn = fnByNum.get(n);
      if (!fn) continue;
      for (const s of walk(fn, 2)) out.push({ snd: s.name, via: `!${n}(${fn})@obj${seq}.${k}` });
    }
  }
  return out;
}
// 该目录的「回调块」音效：num ∈ [dir*1000, dir*1000+999]
function dirBlock(dir) {
  const lo = Number(dir) * 1000, hi = lo + 999;
  const out = [];
  for (const f of funcs) {
    if (!f.num || f.num < lo || f.num > hi) continue;
    for (const s of walk(f.name, 2)) out.push({ snd: s.name, via: `${f.name}#${f.num}` });
  }
  return out;
}

const disk = new Set(fs.readdirSync('F:/sanguo/game/web/assets/audio/sfx').filter((f) => /^m\d{3}snd\d{2}\.mp3$/.test(f)).map((f) => f.replace(/\.mp3$/, '')));

const rows = [];
for (const mg of magics) {
  const A = walk(mg.fx_func, 2).filter((s) => s.depth <= 1).sort((a, b) => a.depth - b.depth || a.addr - b.addr);
  const B = dirBlock(mg.fx_dir_primary);
  const C = dirStruct(mg.fx_dir_primary);
  const pick = A[0] || B[0] || C[0] || null;
  let grade = 'none';
  if (A.length) grade = 'A';
  else if (B.length) grade = 'B';
  else if (C.length) grade = 'C';
  let snd = pick ? pick.snd : '';
  if (!snd) {
    const cand = 'm' + mg.fx_dir_primary + 'snd01';
    if (disk.has(cand)) { snd = cand; grade = 'D'; }
    else { const any = [...disk].filter((x) => x.startsWith('m' + mg.fx_dir_primary + 'snd')).sort(); if (any.length) { snd = any[0]; grade = 'D'; } }
  }
  if (!snd && !disk.has('m' + mg.fx_dir_primary + 'snd01')) grade = 'none';
  rows.push({ seq: mg.SEQUENCE, name: mg.NAME, func: mg.fx_func, dir: mg.fx_dir_primary, dirs: mg.fx_dir,
    A: A.map((s) => ({ name: s.name, func: s.func, depth: s.depth, addr: s.addr, path: s.path })),
    B: [...new Set(B.map((x) => x.snd + '<' + x.via + '>'))],
    C: [...new Set(C.map((x) => x.snd + '<' + x.via + '>'))],
    snd, grade });
}
fs.writeFileSync('F:/sanguo/work/sfx84/map4.json', JSON.stringify(rows, null, 1));
const cnt = {};
for (const r of rows) cnt[r.grade] = (cnt[r.grade] ?? 0) + 1;
console.log('等级统计', JSON.stringify(cnt));
for (const r of rows) console.log([String(r.seq).padStart(3, '0'), r.name.padEnd(6, '　'), 'dir' + r.dir, r.func.padEnd(20),
  r.grade.padEnd(4), (r.snd || '-').padEnd(12), 'A=' + (r.A[0] ? r.A[0].name + '@' + r.A[0].func + 'd' + r.A[0].depth : '-'),
  'B=' + (r.B[0] ?? '-'), 'C=' + (r.C[0] ?? '-')].join(' | '));
