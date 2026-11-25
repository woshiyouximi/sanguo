// 技能音证据复核：MagicN -> 效果函数 -> (CALL / CALLS / SYSCALL 0x310-0x314 按名) 调用图
// 与 map5.mjs 的差别：
//   1. reach 用「每条路径独立 visited」，避免全局 visited 吞掉第二个分支（map5 的已知缺陷）；
//   2. 记录最短深度与完整路径，方便人工回查；
//   3. 额外输出 THINGS.INI 里每个物件 Sequence 的 $ / ! 播放点；
//   4. 额外输出「效果函数里创建了哪个 ThingID」（PUSHI 10000..42000 范围）用于把技能钉到物件。
import fs from 'node:fs';
const ROOT = 'F:/sanguo';
const DIS = ROOT + '/export/script/magic_so.dis.txt';
const SYSDIS = ROOT + '/export/script/system_so.dis.txt';
const sym = JSON.parse(fs.readFileSync(ROOT + '/game/data/magic_so.symbols.json', 'utf8'));
const magics = JSON.parse(fs.readFileSync(ROOT + '/game/data/magics.json', 'utf8'));

function parseDis(path) {
  const L = fs.readFileSync(path, 'utf8').split(/\r?\n/);
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
  return all;
}
const all = parseDis(DIS);
all.sort((a, b) => a.addr - b.addr);
const fns = sym.functions.slice().sort((a, b) => a.off - b.off);
const funcs = [];
for (let k = 0; k < fns.length; k++) {
  const f = fns[k]; const end = k + 1 < fns.length ? fns[k + 1].off : sym.codeEnd;
  funcs.push({ name: f.name, num: f.num, off: f.off, end, idx: f.idx, argc: f.argc, ins: all.filter((i) => i.addr >= f.off && i.addr < end) });
}
const byName = new Map(funcs.map((f) => [f.name, f]));
const isFn = (s) => byName.has(s);
const STOP = new Set(['JMP', 'JZ', 'JNZ', 'RET', 'RETV']);
const BYNAME = new Set([0x310, 0x311, 0x312, 0x313, 0x314]);
/** 往回扫「按名调用」的目标名：以 JMP/JZ/JNZ/RET/RETV 为界，取离调用点最远（=最先压栈）的函数名。
 *  理由：CALLS/0x310 的形态是 PUSHS name; a; b; c; d; CALLS，name 是第一个压的；参数表达式里
 *  可能嵌 rand 或别的字符串，所以不能取最近的那个 PUSHS。 */
function backName(ins, idx) {
  const cands = [];
  for (let k = idx - 1; k >= 0 && k >= idx - 60; k--) {
    const p = ins[k];
    if (STOP.has(p.op)) break;
    if (p.op === 'PUSHS' && p.str) cands.push({ s: p.str, k });
  }
  const fn = cands.filter((c) => isFn(c.s));
  return fn.length ? fn[fn.length - 1] : null;
}
const reM = /^m(\d{3})snd(\d{2})$/i;

// ---- 每个函数的事件表 ----
const events = new Map();
const sites = [];
for (const f of funcs) {
  const ev = [];
  for (let i = 0; i < f.ins.length; i++) {
    const ins = f.ins[i];
    if (ins.callee) ev.push({ kind: 'call', addr: ins.addr, callee: ins.callee, how: 'CALL', line: ins.line });
    if (ins.op === 'CALLS' || (ins.op === 'SYSCALL' && BYNAME.has(ins.syscall))) {
      const nm = backName(f.ins, i);
      if (nm) ev.push({ kind: 'call', addr: ins.addr, callee: nm.s, how: ins.op === 'CALLS' ? 'CALLS' : '0x' + ins.syscall.toString(16), line: ins.line });
    }
    if (ins.op === 'SYSCALL' && (ins.syscall === 0x301 || ins.syscall === 0x300)) {
      let name = null, vol = null;
      for (let k = i - 1; k >= 0 && k >= i - 12; k--) {
        const p = f.ins[k];
        if (['CALL', 'CALLS', 'SYSCALL', 'RET', 'RETV'].includes(p.op)) break;
        if (p.op === 'PUSHS' && p.str) { name = { s: p.str, line: p.line }; break; }
        if (p.op === 'PUSHI' && vol === null && p.imm >= 0 && p.imm <= 255) vol = p.imm;
      }
      if (!name) continue;
      const site = { func: f.name, addr: ins.addr, line: ins.line, name: name.s, nameLine: name.line, vol, syscall: ins.syscall, isM: reM.test(name.s) };
      sites.push(site);
      ev.push({ kind: 'snd', addr: ins.addr, site });
    }
  }
  ev.sort((a, b) => a.addr - b.addr);
  events.set(f.name, ev);
}
// 直接调用者索引
const callers = new Map();
for (const f of funcs) for (const ev of events.get(f.name)) if (ev.kind === 'call' && isFn(ev.callee)) {
  if (!callers.has(ev.callee)) callers.set(ev.callee, []);
  callers.get(ev.callee).push({ from: f.name, how: ev.how, addr: ev.addr, line: ev.line });
}
/** 全路径可达：返回 [{snd, depth, path, addr, line, vol, syscall, via}]，同一 site 取最短深度。 */
function reach(root, maxDepth = 8) {
  const best = new Map();
  const go = (name, depth, path) => {
    if (depth > maxDepth) return;
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'snd') {
        const key = ev.site.addr;
        const prev = best.get(key);
        if (!prev || depth < prev.depth) best.set(key, { ...ev.site, depth, path: [...path], via: path[path.length - 1] });
      } else if (ev.kind === 'call') {
        const c = ev.callee;
        if (!isFn(c) || path.includes(c) || /^Magic\d+$/.test(c)) continue;
        go(c, depth + 1, [...path, c]);
      }
    }
  };
  go(root, 0, [root]);
  return [...best.values()].sort((a, b) => a.depth - b.depth || a.addr - b.addr);
}
/** 函数里出现过的 ThingID 候选（10000..42999） */
function thingIds(f) {
  const out = [];
  for (const ins of f.ins) if (ins.op === 'PUSHI' && ins.imm >= 10000 && ins.imm <= 42999) out.push({ id: ins.imm, addr: ins.addr, line: ins.line });
  return out;
}

// ---- THINGS.INI ----
const txt = new TextDecoder('big5').decode(fs.readFileSync('F:/sanguo/extract/pak/THINGS.INI'));
const secs = []; let cur = null;
for (const line of txt.split(/\r?\n/)) {
  const m = /^\[(.*)\]\s*$/.exec(line.trim());
  if (m) { cur = { name: m[1], props: {} }; secs.push(cur); continue; }
  if (!cur) continue;
  const kv = /^([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
  if (kv) cur.props[kv[1]] = kv[2];
}
const objBySeq = new Map(secs.map((s) => [Number(s.props.Sequence), s]));
function objPlay(seq) {
  const o = objBySeq.get(seq);
  if (!o) return [];
  const out = [];
  for (const [k, v] of Object.entries(o.props)) {
    for (const g of String(v).matchAll(/\$(\w+)/g)) out.push({ kind: '$', key: k, snd: g[1], isM: reM.test(g[1]) });
    for (const g of String(v).matchAll(/!(\d+)/g)) out.push({ kind: '!', key: k, num: Number(g[1]) });
  }
  return out;
}
const fnByNum = new Map(funcs.filter((f) => f.num).map((f) => [f.num, f]));
function cbChain(num, depth = 2) {
  const f = fnByNum.get(num);
  if (!f) return { fn: null, snds: [] };
  return { fn: f.name, snds: reach(f.name, depth).map((s) => ({ snd: s.name, depth: s.depth, func: s.func, addr: s.addr, line: s.line, isM: s.isM })) };
}

// ---- 逐技能 ----
const rows = [];
for (const mg of magics) {
  const r = reach(mg.fx_func, 8);
  const direct = r.filter((s) => s.depth <= 1);
  const deep = r.filter((s) => s.depth >= 2 && s.depth <= 4);
  const deeper = r.filter((s) => s.depth > 4);
  rows.push({
    seq: mg.SEQUENCE, name: mg.NAME, dir: mg.fx_dir_primary, dirs: mg.fx_dir, fx: mg.fx_func,
    direct: direct.map((s) => ({ snd: s.name, func: s.func, addr: s.addr, line: s.line, syscall: s.syscall, vol: s.vol, isM: s.isM })),
    deep: deep.map((s) => ({ snd: s.name, depth: s.depth, func: s.func, addr: s.addr, line: s.line, isM: s.isM, path: s.path.join('>') })),
    deeper: deeper.map((s) => ({ snd: s.name, depth: s.depth, func: s.func, addr: s.addr, line: s.line, isM: s.isM, path: s.path.join('>') })),
    calls: (events.get(mg.fx_func) ?? []).filter((e) => e.kind === 'call').map((e) => `${e.callee}@${e.addr.toString(16)}(${e.how},L${e.line})`),
    things: thingIds(byName.get(mg.fx_func) ?? { ins: [] }).map((t) => t.id),
  });
}
fs.writeFileSync(ROOT + '/work/sfx_evidence/scan.json', JSON.stringify({ sites, rows }, null, 1));

// ---- 控制台摘要 ----
const pad = (s, n) => String(s).padEnd(n);
console.log('sites(m 音效调用点) = ' + sites.filter((s) => s.isM).length + ' / 全部 ' + sites.length);
console.log('--- 全部 m 音效调用点 ---');
for (const s of sites.filter((s) => s.isM).sort((a, b) => a.addr - b.addr)) {
  console.log([s.name, 'fn=' + s.func, '0x' + s.addr.toString(16), 'L' + s.line, 'sys=0x' + s.syscall.toString(16), 'vol=' + s.vol].join('  '));
}
const C = rows.filter((r) => ['004', '009', '014', '015', '022', '028', '030', '039', '044', '045', '047', '048', '055', '064', '065', '069', '072', '074', '082', '087', '090', '091', '104', '105'].includes(String(r.seq).padStart(3, '0')));
console.log('\n=== 24 条 C 级逐条 ===');
for (const r of C) {
  console.log(`\n[${String(r.seq).padStart(3, '0')}] ${r.name}  fx=${r.fx} dir=${r.dir} things=${r.things.join(',') || '-'}`);
  console.log('  calls: ' + (r.calls.join(' , ') || '-'));
  console.log('  direct: ' + (r.direct.map((s) => `${s.snd}@${s.func}(d1,L${s.line})`).join(' , ') || '-'));
  console.log('  d2-4: ' + (r.deep.map((s) => `${s.snd}@${s.func}(d${s.depth},L${s.line})`).join(' , ') || '-'));
  console.log('  d>4: ' + (r.deeper.map((s) => `${s.snd}@${s.func}(d${s.depth})`).join(' , ') || '-'));
}
