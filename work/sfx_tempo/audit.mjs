// 复核 043/080/102 三条 [推测] 技能音：从 magics.json 的 fx_func 出发，
// 沿 CALL / CALLS / SYSCALL 0x310-0x314 走调用图，收集 SYSCALL 0x300/0x301（播放音效）的 PUSHS 串。
// 输出：每条的完整证据链（func@addr / dis 行号 / 音效名）。
import fs from 'node:fs';

const ROOT = 'F:/sanguo';
const DIS = `${ROOT}/export/script/magic_so.dis.txt`;
const sym = JSON.parse(fs.readFileSync(`${ROOT}/game/data/magic_so.symbols.json`, 'utf8'));
const magics = JSON.parse(fs.readFileSync(`${ROOT}/game/data/magics.json`, 'utf8'));
const arr = Array.isArray(magics) ? magics : magics.magics;

const L = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);
const reIns = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;
const all = [];
for (let i = 0; i < L.length; i++) {
  const m = reIns.exec(L[i]);
  if (!m) continue;
  const ins = { addr: parseInt(m[1], 16), op: m[3], operand: m[4].trim(), line: i + 1 };
  const s = /"(.*)"/.exec(m[5]);
  if (s) ins.str = s[1];
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
  // 取**最近**的一个：CALLS/SYSCALL 的函数名参数就在它前面几条 PUSHS 里。
  // 旧脚本取 fn[fn.length-1]（最远），把 Pa 的 CALLS 认成 HoldAllDelay 而不是 CreatePa —— 080 就是这样丢的。
  return fn.length ? fn[0] : null;
}

const events = new Map(); // func -> [{kind,addr,line,...}]
const allMPush = []; // 任何函数里 PUSHS "mNNNsndNN" 的原始点
for (const f of funcs) {
  const ev = [];
  for (let i = 0; i < f.ins.length; i++) {
    const ins = f.ins[i];
    if (ins.callee && isFn(ins.callee)) ev.push({ kind: 'call', addr: ins.addr, line: ins.line, callee: ins.callee, how: 'CALL' });
    if (ins.op === 'CALLS' || (ins.op === 'SYSCALL' && BYNAME.has(ins.syscall))) {
      const nm = backName(f.ins, i);
      if (nm) ev.push({ kind: 'call', addr: ins.addr, line: ins.line, callee: nm, how: ins.op === 'CALLS' ? 'CALLS' : '0x' + ins.syscall.toString(16) });
    }
    if (ins.op === 'PUSHS' && ins.str && /^m\d{3}snd\d{2}$/i.test(ins.str)) {
      allMPush.push({ func: f.name, addr: ins.addr, line: ins.line, name: ins.str });
    }
    if (ins.op === 'SYSCALL' && (ins.syscall === 0x301 || ins.syscall === 0x300)) {
      let name = null, vol = null, nameLine = 0, nameAddr = 0;
      for (let k = i - 1; k >= 0 && k >= i - 12; k--) {
        const p = f.ins[k];
        if (['CALL', 'CALLS', 'SYSCALL', 'RET', 'RETV'].includes(p.op)) break;
        if (p.op === 'PUSHS' && p.str) { name = p.str; nameLine = p.line; nameAddr = p.addr; break; }
        if (p.op === 'PUSHI' && vol === null && p.imm >= 0 && p.imm <= 255) vol = p.imm;
      }
      if (!name) continue;
      ev.push({ kind: 'snd', addr: ins.addr, line: ins.line, name, vol, syscall: ins.syscall, nameLine, nameAddr });
    }
  }
  ev.sort((a, b) => a.addr - b.addr);
  events.set(f.name, ev);
}

// BFS：从 root 出发，记录每条 snd 的最短深度
function walk(root, maxDepth = 5) {
  const out = [];
  const seen = new Map(); // func -> minDepth
  const q = [{ name: root, depth: 0, path: [root] }];
  while (q.length) {
    const { name, depth, path } = q.shift();
    if (seen.has(name) && seen.get(name) <= depth) continue;
    seen.set(name, depth);
    const f = byName.get(name);
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'snd') out.push({ ...ev, func: name, depth, path: [...path], srcLine: f.off });
      else if (ev.kind === 'call' && depth < maxDepth && !seen.has(ev.callee)) {
        q.push({ name: ev.callee, depth: depth + 1, path: [...path, ev.callee] });
      }
    }
  }
  return out;
}

const wanted = [43, 80, 102];
const detail = {};
for (const seq of wanted) {
  const mg = arr.find((x) => x.SEQUENCE === seq);
  const sites = walk(mg.fx_func, 5);
  detail[seq] = { name: mg.NAME, fx_func: mg.fx_func, dir: mg.fx_dir_primary, dirs: mg.fx_dir, sites };
  console.log(`\n=== ${seq} ${mg.NAME}  fx_func=${mg.fx_func}  dir=${mg.fx_dir_primary} dirs=${JSON.stringify(mg.fx_dir)}`);
  if (!sites.length) console.log('  (调用图 depth<=5 内没有任何 SYSCALL 0x300/0x301 播放点)');
  for (const s of sites) {
    console.log(`  d${s.depth} ${s.path.join(' -> ')} :: ${s.name}  @0x${s.addr.toString(16)} (dis:${s.line})  [PUSHS@0x${s.nameAddr.toString(16)} dis:${s.nameLine} vol=${s.vol} sys=0x${s.syscall.toString(16)}]`);
  }
}

// 反查：所有 PUSHS "mNNNsndNN" 点，标注它所在函数能不能被 three skills 的调用图够到
console.log('\n=== 全库 m 串 PUSHS 点（仅供对照：哪些函数引用了 m032/m029/m021/m022/m001）');
for (const p of allMPush) if (/^m(032|029|021|022|001)snd/.test(p.name)) console.log(`  ${p.name}  ${p.func} @0x${p.addr.toString(16)} (dis:${p.line})`);

// THINGS.INI：目录 021/022/029/032 的 $ / ! 音效
const txt = new TextDecoder('big5').decode(fs.readFileSync(`${ROOT}/extract/pak/THINGS.INI`));
const secs = []; let cur = null;
for (const line of txt.split(/\r?\n/)) {
  const m = /^\[(.*)\]\s*$/.exec(line.trim());
  if (m) { cur = { name: m[1], line: 0, props: {} }; secs.push(cur); continue; }
  if (!cur) continue;
  const kv = /^([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
  if (kv) cur.props[kv[1]] = kv[2];
}
const fnByNum = new Map(funcs.filter((f) => f.num).map((f) => [f.num, f.name]));
const thingsOut = {};
for (const dir of ['021', '022', '029', '032']) {
  const found = [];
  for (const s of secs) {
    const d = (s.props.Directory || '').trim().toLowerCase().replace(/^\\/, '');
    if (d !== 'magic\\' + dir) continue;
    for (const [k, v] of Object.entries(s.props)) {
      for (const g of v.matchAll(/\$(\w+)/g)) found.push({ obj: s.props.Sequence, key: k, snd: g[1], via: '$' });
      for (const g of v.matchAll(/!(\d+)/g)) {
        const n = Number(g[1]); const fn = fnByNum.get(n);
        if (!fn) { found.push({ obj: s.props.Sequence, key: k, snd: `!(no fn ${n})`, via: '!' }); continue; }
        for (const x of walk(fn, 3)) found.push({ obj: s.props.Sequence, key: k, snd: x.name, via: `!${n}(${fn})->${x.func}@0x${x.addr.toString(16)}` });
      }
    }
  }
  thingsOut[dir] = found;
  console.log(`\n=== THINGS dir magic\\${dir}: ${found.length} 处`);
  for (const f of found) console.log(`  obj${f.obj}.${f.key}  ${f.snd}   <${f.via}>`);
}
fs.writeFileSync(`${ROOT}/work/sfx_tempo/audit.json`, JSON.stringify({ detail, thingsOut, allMPush }, null, 1));
