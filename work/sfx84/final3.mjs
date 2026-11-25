// 终版分析 v3：调用图 = CALL / CALLS(按名,4参) / SYSCALL 0x310-0x314(按名,6-10参) / 物件回调(num==ThingID)
import fs from 'node:fs';

const DIS = 'F:/sanguo/export/script/magic_so.dis.txt';
const sym = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magic_so.symbols.json', 'utf8'));
const magics = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magics.json', 'utf8'));

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
  funcs.push({ idx: f.idx, name: f.name, num: f.num, argc: f.argc, off: f.off, end, line: headLine.get(f.idx) ?? 0, ins: all.filter((i) => i.addr >= f.off && i.addr < end) });
}
const byName = new Map(funcs.map((f) => [f.name, f]));
const isFn = (s) => byName.has(s);
const fnByNum = new Map(funcs.filter((f) => f.num).map((f) => [f.num, f.name]));

// ---------- THINGS.INI ----------
const txt = new TextDecoder('big5').decode(fs.readFileSync('F:/sanguo/extract/pak/THINGS.INI'));
const secs = [];
let curS = null;
for (const line of txt.split(/\r?\n/)) {
  const m = /^\[(.*)\]\s*$/.exec(line.trim());
  if (m) { curS = { name: m[1], props: {} }; secs.push(curS); continue; }
  if (!curS) continue;
  const kv = /^([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
  if (kv) curS.props[kv[1]] = kv[2];
}
const objBySeq = new Map();
for (const s of secs) if (s.props.Sequence) objBySeq.set(Number(s.props.Sequence), s);
const objSnds = (seq) => {
  const s = objBySeq.get(seq); if (!s) return [];
  const o = [];
  for (const [k, v] of Object.entries(s.props)) for (const m of v.matchAll(/\$(\w+)/g)) o.push({ field: k, snd: m[1] });
  return o;
};
const objDir = (seq) => objBySeq.get(seq)?.props.Directory ?? null;
const objsByDir = new Map();
for (const s of secs) {
  const d = s.props.Directory; if (!d) continue;
  const norm = d.trim().replace(/\\+$/, '').replace(/^\\/, '').toLowerCase();
  if (!objsByDir.has(norm)) objsByDir.set(norm, []);
  objsByDir.get(norm).push(s);
}

// ---------- 指令流 ----------
const BOUND = new Set(['CALL', 'CALLS', 'SYSCALL', 'RET', 'RETV', 'JMP', 'JZ', 'JNZ', 'WAITFOR']);
const BYNAME_ARGC = new Map([[0x310, 6], [0x311, 7], [0x312, 8], [0x313, 9], [0x314, 10]]);

function backName(ins, idx) {
  const strs = [];
  for (let k = idx - 1; k >= 0 && k >= idx - 40; k--) {
    const p = ins[k];
    if (BOUND.has(p.op)) break;
    if (p.op === 'PUSHS' && p.str) strs.push({ str: p.str, addr: p.addr, line: p.line });
  }
  if (!strs.length) return null;
  const fnStrs = strs.filter((s) => isFn(s.str));
  return fnStrs.length ? fnStrs[fnStrs.length - 1] : strs[strs.length - 1];
}

const reSnd = /^m(\d{3})snd(\d{2})$/i;
const soundSites = [];
const events = new Map();
for (const f of funcs) {
  const ev = [];
  for (let i = 0; i < f.ins.length; i++) {
    const ins = f.ins[i];
    if (ins.callee) ev.push({ kind: 'call', addr: ins.addr, callee: ins.callee, how: 'CALL' });
    if (ins.op === 'CALLS' || (ins.op === 'SYSCALL' && BYNAME_ARGC.has(ins.syscall))) {
      const nm = backName(f.ins, i);
      if (nm) ev.push({ kind: 'call', addr: ins.addr, callee: nm.str, how: ins.op === 'CALLS' ? 'CALLS' : `SYSCALL 0x${ins.syscall.toString(16)}`, line: ins.line, nameAddr: nm.addr });
    }
    if (ins.op === 'SYSCALL' && (ins.syscall === 0x301 || ins.syscall === 0x300)) {
      let name = null, nameAddr = 0, vol = null;
      for (let k = i - 1; k >= 0 && k >= i - 14; k--) {
        const p = f.ins[k];
        if (BOUND.has(p.op)) break;
        if (p.op === 'PUSHS' && p.str) { name = p.str; nameAddr = p.addr; break; }
        if (p.op === 'PUSHI' && vol === null && p.imm >= 0 && p.imm <= 255) vol = p.imm;
      }
      const sm = name ? reSnd.exec(name) : null;
      const site = { func: f.name, funcOff: f.off, funcLine: f.line, addr: ins.addr, line: ins.line, name,
        sndDir: sm ? sm[1] : null, sndIdx: sm ? sm[2] : null, syscall: ins.syscall, vol, nameAddr };
      soundSites.push(site);
      ev.push({ kind: 'snd', addr: ins.addr, site });
    }
    if (ins.op === 'PUSHI' && ins.imm != null) ev.push({ kind: 'pushi', addr: ins.addr, imm: ins.imm });
  }
  ev.sort((a, b) => a.addr - b.addr);
  events.set(f.name, ev);
}

// ---------- 逐技能遍历 ----------
function collect(root) {
  const snds = [];
  const things = new Set();
  const edges = [];
  const walk = (name, depth, path, visited) => {
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'snd') snds.push({ ...ev.site, depth, path: [...path] });
      else if (ev.kind === 'call') {
        if (!isFn(ev.callee) || /^Magic\d+$/.test(ev.callee) || visited.has(ev.callee)) continue;
        edges.push({ from: name, to: ev.callee, how: ev.how, addr: ev.addr });
        visited.add(ev.callee);
        walk(ev.callee, depth + 1, [...path, ev.callee], visited);
      } else if (ev.kind === 'pushi') {
        const v = ev.imm;
        if (!objBySeq.has(v)) continue;
        things.add(v);
        const cb = fnByNum.get(v);
        if (cb && !visited.has(cb)) {
          edges.push({ from: name, to: cb, how: `obj${v}`, addr: ev.addr });
          visited.add(cb);
          walk(cb, depth + 1, [...path, `[obj${v}]`, cb], visited);
        }
      }
    }
  };
  walk(root, 0, [root], new Set([root]));
  return { snds, things: [...things], edges };
}

const rows = [];
for (const mg of magics) {
  const { snds, things, edges } = collect(mg.fx_func);
  const scriptM = snds.filter((s) => s.sndDir);
  const scriptOther = snds.filter((s) => !s.sndDir && s.name);
  const createdM = [];
  for (const t of things) for (const s of objSnds(t)) if (reSnd.test(s.snd)) createdM.push({ snd: s.snd, seq: t, dir: objDir(t), field: s.field });
  const dirM = [];
  for (const d of mg.fx_dir ?? []) for (const o of objsByDir.get(`magic\\${d}`.toLowerCase()) ?? []) {
    const seq = Number(o.props.Sequence);
    for (const [k, v] of Object.entries(o.props)) for (const m of v.matchAll(/\$(\w+)/g)) if (reSnd.test(m[1])) dirM.push({ snd: m[1], seq, field: k, dir: d });
  }
  rows.push({
    seq: mg.SEQUENCE, name: mg.NAME, fx_func: mg.fx_func, dir: mg.fx_dir_primary, dirs: mg.fx_dir,
    scriptM: [...new Set(scriptM.map((s) => s.name))],
    scriptMdetail: scriptM.map((s) => ({ name: s.name, func: s.func, addr: s.addr, line: s.line, depth: s.depth, path: s.path })),
    scriptOther: [...new Set(scriptOther.map((s) => s.name))],
    scriptOtherDetail: scriptOther.map((s) => ({ name: s.name, func: s.func, addr: s.addr, line: s.line, syscall: s.syscall })),
    createdThing: things,
    createdM, dirM, edges,
  });
}
fs.writeFileSync('F:/sanguo/work/sfx84/final3.json', JSON.stringify({ funcs: funcs.map((f) => ({ name: f.name, num: f.num, argc: f.argc, off: f.off, line: f.line })), soundSites, rows }, null, 1));

const has = (r) => r.scriptM.length || r.dirM.length || r.createdM.length;
console.log('soundSites', soundSites.length, 'm-snd', soundSites.filter((x) => x.sndDir).length);
console.log('skills', rows.length, '有来源', rows.filter(has).length, '全无', rows.filter((r) => !has(r)).length);
console.log('\n全无:');
for (const r of rows.filter((r) => !has(r))) console.log(' ', r.seq, r.name, r.fx_func, 'dir', r.dir, 'dirs', JSON.stringify(r.dirs), 'other', JSON.stringify(r.scriptOther), 'things', JSON.stringify(r.createdThing));
console.log('\n新补上的（此前无来源现在有）:');
for (const r of rows.filter(has)) {
  if (r.scriptM.length) continue;
  console.log(' ', r.seq, r.name, 'dir', r.dir, 'dirM', JSON.stringify([...new Set(r.dirM.map((x) => x.snd))]), 'createdM', JSON.stringify([...new Set(r.createdM.map((x) => x.snd))]));
}
