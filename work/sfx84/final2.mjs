// 终版分析 v2：调用图含 CALL / CALLS(0x47 按名) / SYSCALL 0x310-0x314(按名 6-10 参)
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

const BOUND = new Set(['CALL', 'CALLS', 'SYSCALL', 'RET', 'RETV', 'JMP', 'JZ', 'JNZ', 'WAITFOR']);
// 按名调用的参数个数
const BYNAME_ARGC = new Map([[0x310, 6], [0x311, 7], [0x312, 8], [0x313, 9], [0x314, 10]]);
const CALLS_ARGC = 5; // name + 4

/** 从 idx 往回找「名字」PUSHS：取最深（最早）的函数名串；找不到就退化为最深的任意串 */
function backName(ins, idx, argc) {
  const strs = [];
  for (let k = idx - 1; k >= 0 && k >= idx - 40; k--) {
    const p = ins[k];
    if (BOUND.has(p.op)) break;
    if (p.op === 'PUSHS' && p.str) strs.push({ str: p.str, addr: p.addr, line: p.line });
  }
  if (!strs.length) return null;
  const fnStrs = strs.filter((s) => isFn(s.str));
  const pick = fnStrs.length ? fnStrs[fnStrs.length - 1] : strs[strs.length - 1];
  return pick;
}

// 事件：call(按名/按表) + snd + pushi
const reSnd = /^m(\d{3})snd(\d{2})$/i;
const soundSites = [];
const events = new Map();
for (const f of funcs) {
  const ev = [];
  for (let i = 0; i < f.ins.length; i++) {
    const ins = f.ins[i];
    if (ins.callee) ev.push({ kind: 'call', addr: ins.addr, callee: ins.callee, how: 'CALL' });
    if (ins.op === 'CALLS') {
      const nm = backName(f.ins, i, CALLS_ARGC);
      if (nm) ev.push({ kind: 'call', addr: ins.addr, callee: nm.str, how: 'CALLS', line: ins.line, nameAddr: nm.addr });
    }
    if (ins.op === 'SYSCALL' && BYNAME_ARGC.has(ins.syscall)) {
      const nm = backName(f.ins, i, BYNAME_ARGC.get(ins.syscall));
      if (nm) ev.push({ kind: 'call', addr: ins.addr, callee: nm.str, how: `0x${ins.syscall.toString(16)}`, line: ins.line, nameAddr: nm.addr });
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

function walk(root) {
  const out = [];
  const walkFn = (name, depth, path, visited) => {
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'snd') out.push({ ...ev.site, depth, path: [...path] });
      else if (ev.kind === 'call') {
        const c = ev.callee;
        if (!isFn(c) || /^Magic\d+$/.test(c) || visited.has(c)) continue;
        visited.add(c);
        walkFn(c, depth + 1, [...path, c], visited);
      }
    }
  };
  walkFn(root, 0, [root], new Set([root]));
  return out;
}

// THINGS
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
const objSnds = (seq) => { const s = objBySeq.get(seq); if (!s) return []; const o = []; for (const [k, v] of Object.entries(s.props)) for (const m of v.matchAll(/\$(\w+)/g)) o.push({ field: k, snd: m[1] }); return o; };
const objsByDir = new Map();
for (const s of secs) {
  const d = s.props.Directory; if (!d) continue;
  const norm = d.trim().replace(/\\+$/, '').replace(/^\\/, '').toLowerCase();
  (objsByDir.get(norm) ?? objsByDir.set(norm, []).get(norm)).push(s);
}

const rows = [];
for (const mg of magics) {
  const sites = walk(mg.fx_func);
  const scriptM = sites.filter((s) => s.sndDir);
  const scriptOther = sites.filter((s) => !s.sndDir && s.name);
  const pushedThing = [];
  const walkP = (name, visited) => {
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'pushi' && objBySeq.has(ev.imm) && !pushedThing.includes(ev.imm)) pushedThing.push(ev.imm);
      else if (ev.kind === 'call' && isFn(ev.callee) && !/^Magic\d+$/.test(ev.callee) && !visited.has(ev.callee)) { visited.add(ev.callee); walkP(ev.callee, visited); }
    }
  };
  walkP(mg.fx_func, new Set([mg.fx_func]));
  const createdM = [];
  for (const t of pushedThing) for (const s of objSnds(t)) if (reSnd.test(s.snd)) createdM.push({ snd: s.snd, seq: t, dir: objBySeq.get(t)?.props.Directory ?? null, field: s.field });
  const dirM = [];
  for (const d of mg.fx_dir ?? []) for (const o of objsByDir.get(`magic\\${d}`.toLowerCase()) ?? []) {
    const seq = Number(o.props.Sequence);
    for (const [k, v] of Object.entries(o.props)) for (const m of v.matchAll(/\$(\w+)/g)) if (reSnd.test(m[1])) dirM.push({ snd: m[1], seq, field: k, dir: d });
  }
  rows.push({ seq: mg.SEQUENCE, name: mg.NAME, fx_func: mg.fx_func, dir: mg.fx_dir_primary, dirs: mg.fx_dir,
    scriptM: [...new Set(scriptM.map((s) => s.name))],
    scriptMdetail: scriptM.map((s) => ({ name: s.name, func: s.func, addr: s.addr, line: s.line, depth: s.depth, path: s.path })),
    scriptOther: [...new Set(scriptOther.map((s) => s.name))],
    createdThing: pushedThing.filter((t) => objSnds(t).some((s) => reSnd.test(s.snd))),
    createdM, dirM });
}
fs.writeFileSync('F:/sanguo/work/sfx84/final2.json', JSON.stringify({ funcs: funcs.map((f) => ({ name: f.name, num: f.num, argc: f.argc, off: f.off, line: f.line })), soundSites, rows }, null, 1));

const has = (r) => r.scriptM.length || r.dirM.length || r.createdM.length;
console.log('soundSites', soundSites.length, 'm-snd', soundSites.filter((x) => x.sndDir).length);
console.log('skills', rows.length, '有来源', rows.filter(has).length, '全无', rows.filter((r) => !has(r)).length);
console.log('\n全无:');
for (const r of rows.filter((r) => !has(r))) console.log(' ', r.seq, r.name, r.fx_func, 'dir', r.dir, 'other', JSON.stringify(r.scriptOther));
