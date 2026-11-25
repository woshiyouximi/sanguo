// 终版分析：
// 源 A = MAGIC.SO 脚本里 SYSCALL 0x301/0x300 的字面音效名（按 fx_func 调用图先序）
// 源 B = THINGS.INI 物件动画里的 $mNNNsndNN（技能 fx_dir 目录下的物件 + 脚本里 PUSHI 创建的物件）
import fs from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const sym = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magic_so.symbols.json', 'utf8'));
const magics = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magics.json', 'utf8'));

// ---------- 1) 解析反汇编（含修正后的回扫） ----------
const L = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);
const reIns = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;
const reH = /^; func #(\d+)\s+(\S+)\s+.*@0x([0-9a-f]+)/;
const all = [];
const headLine = new Map();
for (let i = 0; i < L.length; i++) {
  const h = reH.exec(L[i]);
  if (h) headLine.set(+h[1], i + 1);
  const m = reIns.exec(L[i]);
  if (!m) continue;
  const ins = { addr: parseInt(m[1], 16), op: m[3], operand: m[4].trim(), comment: m[5], line: i + 1 };
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
  const ins = [];
  for (const i of all) if (i.addr >= f.off && i.addr < end) ins.push(i);
  funcs.push({ idx: f.idx, name: f.name, num: f.num, argc: f.argc, off: f.off, end, line: headLine.get(f.idx) ?? 0, ins });
}
const byName = new Map(funcs.map((f) => [f.name, f]));

// 音效调用点：回扫到控制流边界为止，取最近一个 PUSHS
const BOUND = new Set(['CALL', 'SYSCALL', 'RET', 'RETV', 'JMP', 'JZ', 'JNZ', 'WAITFOR', 'CALLS', 'CASE']);
const reSnd = /^m(\d{3})snd(\d{2})$/i;
const soundSites = [];
for (const f of funcs) {
  for (let i = 0; i < f.ins.length; i++) {
    const ins = f.ins[i];
    if (ins.op !== 'SYSCALL' || (ins.syscall !== 0x301 && ins.syscall !== 0x300)) continue;
    let name = null, nameAddr = 0, vol = null;
    for (let k = i - 1; k >= 0 && k >= i - 14; k--) {
      const p = f.ins[k];
      if (BOUND.has(p.op)) break;
      if (p.op === 'PUSHS' && p.str) { name = p.str; nameAddr = p.addr; break; }
      if (p.op === 'PUSHI' && vol === null && p.imm >= 0 && p.imm <= 255) vol = p.imm;
    }
    const sm = name ? reSnd.exec(name) : null;
    soundSites.push({ func: f.name, funcOff: f.off, funcLine: f.line, addr: ins.addr, line: ins.line,
      name, sndDir: sm ? sm[1] : null, sndIdx: sm ? sm[2] : null, syscall: ins.syscall, vol, nameAddr });
  }
}
console.log('soundSites', soundSites.length, 'm-snd', soundSites.filter((s) => s.sndDir).length,
  'other', soundSites.filter((s) => !s.sndDir).length);

// 事件序列（CALL 与音效点按地址排序）
const events = new Map();
for (const f of funcs) {
  const ev = [];
  for (const i of f.ins) {
    if (i.callee) ev.push({ kind: 'call', addr: i.addr, callee: i.callee });
    if (i.op === 'SYSCALL' && (i.syscall === 0x301 || i.syscall === 0x300)) {
      const site = soundSites.find((s) => s.addr === i.addr && s.func === f.name);
      if (site) ev.push({ kind: 'snd', addr: i.addr, site });
    }
    if (i.op === 'PUSHI' && i.imm != null) ev.push({ kind: 'pushi', addr: i.addr, imm: i.imm });
  }
  ev.sort((a, b) => a.addr - b.addr);
  events.set(f.name, ev);
}

function walk(root) {
  const out = [];
  const walkFn = (name, depth, path, visited) => {
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'snd') out.push({ ...ev.site, depth, path: [...path] });
      else if (ev.kind === 'call') {
        const c = ev.callee;
        if (!byName.has(c) || /^Magic\d+$/.test(c) || visited.has(c)) continue;
        visited.add(c);
        walkFn(c, depth + 1, [...path, c], visited);
      }
    }
  };
  walkFn(root, 0, [root], new Set([root]));
  return out;
}

// ---------- 2) THINGS.INI ----------
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
const objBySeq = new Map();
for (const s of secs) if (s.props.Sequence) objBySeq.set(Number(s.props.Sequence), s);
function objSnds(seq) {
  const s = objBySeq.get(seq);
  if (!s) return [];
  const out = [];
  for (const [k, v] of Object.entries(s.props)) for (const m of v.matchAll(/\$(\w+)/g)) out.push({ field: k, snd: m[1] });
  return out;
}
function objDir(seq) { const s = objBySeq.get(seq); return s?.props.Directory ?? null; }
// 目录 -> 物件
const objsByDir = new Map();
for (const s of secs) {
  const d = s.props.Directory;
  if (!d) continue;
  const norm = d.trim().replace(/\\+$/, '').replace(/^\\/, '').toLowerCase();
  if (!objsByDir.has(norm)) objsByDir.set(norm, []);
  objsByDir.get(norm).push(s);
}

// ---------- 3) 逐技能 ----------
const rows = [];
for (const mg of magics) {
  const sites = walk(mg.fx_func);
  const scriptM = sites.filter((s) => s.sndDir);
  const scriptOther = sites.filter((s) => !s.sndDir && s.name);
  // 脚本里 PUSHI 出的 ThingID（可能是 0x304/0x303 创建物件）
  const pushedThing = [];
  const walkFn2 = (name, visited) => {
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'pushi' && objBySeq.has(ev.imm) && !pushedThing.includes(ev.imm)) pushedThing.push(ev.imm);
      else if (ev.kind === 'call' && byName.has(ev.callee) && !/^Magic\d+$/.test(ev.callee) && !visited.has(ev.callee)) { visited.add(ev.callee); walkFn2(ev.callee, visited); }
    }
  };
  walkFn2(mg.fx_func, new Set([mg.fx_func]));
  const createdM = [];
  for (const t of pushedThing) for (const s of objSnds(t)) if (reSnd.test(s.snd)) createdM.push({ snd: s.snd, seq: t, dir: objDir(t), field: s.field });
  // 目录物件
  const dirM = [];
  for (const d of mg.fx_dir ?? []) {
    const key = `magic\\${d}`.toLowerCase();
    for (const o of objsByDir.get(key) ?? []) {
      const seq = Number(o.props.Sequence);
      for (const [k, v] of Object.entries(o.props)) for (const m of v.matchAll(/\$(\w+)/g)) if (reSnd.test(m[1])) dirM.push({ snd: m[1], seq, field: k, dir: d });
    }
  }
  rows.push({
    seq: mg.SEQUENCE, name: mg.NAME, fx_func: mg.fx_func, dir: mg.fx_dir_primary, dirs: mg.fx_dir,
    scriptM: [...new Set(scriptM.map((s) => s.name))],
    scriptMdetail: scriptM.map((s) => ({ name: s.name, func: s.func, addr: s.addr, line: s.line, depth: s.depth })),
    scriptOther: [...new Set(scriptOther.map((s) => s.name))],
    createdThing: pushedThing.filter((t) => objSnds(t).some((s) => reSnd.test(s.snd))),
    createdM, dirM,
  });
}
fs.writeFileSync('F:/sanguo/work/sfx84/final.json', JSON.stringify({ funcs: funcs.map((f) => ({ name: f.name, num: f.num, argc: f.argc, off: f.off, line: f.line })), soundSites, rows }, null, 1));

const has = (r) => r.scriptM.length || r.dirM.length || r.createdM.length;
console.log('skills', rows.length, '有任一来源', rows.filter(has).length, '全无', rows.filter((r) => !has(r)).length);
console.log('scriptM', rows.filter((r) => r.scriptM.length).length, 'dirM', rows.filter((r) => r.dirM.length).length, 'createdM', rows.filter((r) => r.createdM.length).length);
console.log('\n全无来源的技能:');
for (const r of rows.filter((r) => !has(r))) console.log(' ', r.seq, r.name, r.fx_func, 'dir', r.dir, 'dirs', JSON.stringify(r.dirs), 'other', JSON.stringify(r.scriptOther));
console.log('\n仅靠 dirM 补上的:');
for (const r of rows.filter((r) => !r.scriptM.length && r.dirM.length)) console.log(' ', r.seq, r.name, 'dir', r.dir, JSON.stringify([...new Set(r.dirM.map((x) => x.snd))]));
