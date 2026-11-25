// 定稿口径 v5：技能号 -> 音效名，分证据等级
//  A：技能自身特效脚本（fx_func）depth<=1 直接播的 m<NNN>sndNN
//  C：该技能 fx_dir 目录物件的 $m<NNN>sndNN（THINGS 结构证据；006 目录走 !6003 -> "arrow"）
//  B：该 fx_dir 的物件回调块（num ∈ dir*1000+0..999）depth<=2 播的 m 音
//  O：技能脚本直接播的通用音（att07 / hit01 / yell01 …）
//  X：仅有磁盘文件 m<dir>snd01（命名约定）=> 推测
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
  const f = fns[k]; const end = k + 1 < fns.length ? fns[k + 1].off : sym.codeEnd;
  funcs.push({ name: f.name, num: f.num, off: f.off, ins: all.filter((i) => i.addr >= f.off && i.addr < end) });
}
const byName = new Map(funcs.map((f) => [f.name, f]));
const isFn = (s) => byName.has(s);
const STOP = new Set(['JMP', 'JZ', 'JNZ', 'RET', 'RETV']);
const BYNAME = new Set([0x310, 0x311, 0x312, 0x313, 0x314]);
function backName(ins, idx) {
  const cands = [];
  for (let k = idx - 1; k >= 0 && k >= idx - 40; k--) {
    const p = ins[k];
    if (STOP.has(p.op)) break;
    if (p.op === 'PUSHS' && p.str) cands.push(p.str);
  }
  const fn = cands.filter(isFn);
  return fn.length ? fn[fn.length - 1] : null;
}
const reM = /^m(\d{3})snd(\d{2})$/i;
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
      const site = { func: f.name, addr: ins.addr, line: ins.line, name, vol, syscall: ins.syscall, isM: reM.test(name) };
      sites.push(site);
      ev.push({ kind: 'snd', addr: ins.addr, site });
    }
  }
  ev.sort((a, b) => a.addr - b.addr);
  events.set(f.name, ev);
}
function walk(root, maxDepth = 3) {
  const out = [];
  const go = (name, depth, path, visited) => {
    if (depth > maxDepth) return;
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'snd') out.push({ ...ev.site, depth, path: [...path] });
      else if (ev.kind === 'call') {
        const c = ev.callee;
        if (!isFn(c) || /^Magic\d+$/.test(c) || /^F\d+$/.test(c) || visited.has(c)) continue;
        visited.add(c); go(c, depth + 1, [...path, c], visited);
      }
    }
  };
  go(root, 0, [root], new Set([root]));
  return out;
}
const txt = new TextDecoder('big5').decode(fs.readFileSync('F:/sanguo/extract/pak/THINGS.INI'));
const secs = []; let cur = null;
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
function dirStruct(dir) {
  const out = [];
  const objs = objsByDir.get('magic\\' + dir) ?? [];
  for (const o of objs) {
    const seq = Number(o.props.Sequence);
    for (const [k, v] of Object.entries(o.props)) for (const g of v.matchAll(/\$(\w+)/g)) out.push({ snd: g[1], isM: reM.test(g[1]), via: `obj${seq}.${k} $` });
  }
  for (const o of objs) {
    const seq = Number(o.props.Sequence);
    for (const [k, v] of Object.entries(o.props)) for (const g of v.matchAll(/!(\d+)/g)) {
      const n = Number(g[1]); const fn = fnByNum.get(n);
      if (!fn) continue;
      for (const s of walk(fn, 2)) out.push({ snd: s.name, isM: reM.test(s.name), via: `obj${seq}.${k} !${n}(${fn})->${s.func}` });
    }
  }
  return out;
}
function dirBlock(dir) {
  const lo = Number(dir) * 1000, hi = lo + 999;
  const out = [];
  for (const f of funcs) {
    if (!f.num || f.num < lo || f.num > hi || /^Magic\d+$/.test(f.name)) continue;
    for (const s of walk(f.name, 2)) if (reM.test(s.name)) out.push({ snd: s.name, via: `${f.name}#${f.num}->${s.func}`, depth: s.depth });
  }
  return out;
}
const disk = new Set(fs.readdirSync('F:/sanguo/game/web/assets/audio/sfx').filter((f) => /^m\d{3}snd\d{2}\.mp3$/.test(f)).map((f) => f.replace(/\.mp3$/, '')));
const rows = [];
for (const mg of magics) {
  const A = walk(mg.fx_func, 3).filter((s) => s.depth <= 1).sort((a, b) => a.depth - b.depth || a.addr - b.addr);
  const Am = A.filter((s) => s.isM);
  const Ao = A.filter((s) => !s.isM);
  const C = dirStruct(mg.fx_dir_primary);
  const Cm = C.filter((x) => x.isM);
  const B = dirBlock(mg.fx_dir_primary);
  let snd = '', grade = 'none', via = '';
  if (Am.length) { snd = Am[0].name; grade = 'A'; via = `${Am[0].func}@0x${Am[0].addr.toString(16)}`; }
  else if (Cm.length) { snd = Cm[0].snd; grade = 'C'; via = Cm[0].via; }
  else if (B.length) { snd = B[0].snd; grade = 'B'; via = B[0].via; }
  else if (C.length) { snd = C[0].snd; grade = 'C'; via = C[0].via; }
  else if (Ao.length) { snd = Ao[0].name; grade = 'O'; via = `${Ao[0].func}@0x${Ao[0].addr.toString(16)}`; }
  else {
    const cand = 'm' + mg.fx_dir_primary + 'snd01';
    const list = [...disk].filter((x) => x.startsWith('m' + mg.fx_dir_primary + 'snd')).sort();
    if (disk.has(cand)) { snd = cand; grade = 'X'; via = '磁盘命名约定'; }
    else if (list.length) { snd = list[0]; grade = 'X'; via = '磁盘命名约定(无 snd01)'; }
  }
  rows.push({ seq: mg.SEQUENCE, name: mg.NAME, func: mg.fx_func, dir: mg.fx_dir_primary, dirs: mg.fx_dir,
    snd, grade, via, deep: [...new Set(walk(mg.fx_func, 4).map((s) => s.name))], A: A.map((s) => `${s.name}@${s.func}d${s.depth}`), C: [...new Set(C.map((x) => x.snd + '<' + x.via + '>'))],
    B: [...new Set(B.map((x) => x.snd + '<' + x.via + '>'))], all: [...new Set([...A.map((s) => s.name), ...C.map((x) => x.snd), ...B.map((x) => x.snd)])] });
}
fs.writeFileSync('F:/sanguo/work/sfx84/map5.json', JSON.stringify(rows, null, 1));
const cnt = {}; for (const r of rows) cnt[r.grade] = (cnt[r.grade] ?? 0) + 1;
console.log('等级统计', JSON.stringify(cnt), ' 有音效', rows.filter((r) => r.snd).length, '/', rows.length);
for (const r of rows) console.log([String(r.seq).padStart(3, '0'), r.name.padEnd(6, '　'), 'dir' + r.dir, r.func.padEnd(18), r.grade, (r.snd || '-').padEnd(12), r.via.padEnd(46), 'A=' + (r.A[0] ?? '-')].join(' | '));
