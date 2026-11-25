// 用「最近 PUSHS 胜出」的 CALLS 解析重跑全表，和 project/96 的现行表对照，看修 backName 是否影响其它技能。
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
function backName(ins, idx, mode) {
  const cands = [];
  for (let k = idx - 1; k >= 0 && k >= idx - 40; k--) {
    const p = ins[k];
    if (STOP.has(p.op)) break;
    if (p.op === 'PUSHS' && p.str) cands.push(p.str);
  }
  const fn = cands.filter(isFn);
  if (!fn.length) return null;
  return mode === 'last' ? fn[fn.length - 1] : fn[0];
}
function build(mode) {
  const events = new Map();
  for (const f of funcs) {
    const ev = [];
    for (let i = 0; i < f.ins.length; i++) {
      const ins = f.ins[i];
      if (ins.callee && isFn(ins.callee)) ev.push({ kind: 'call', addr: ins.addr, callee: ins.callee });
      if (ins.op === 'CALLS' || (ins.op === 'SYSCALL' && BYNAME.has(ins.syscall))) {
        const nm = backName(f.ins, i, mode);
        if (nm) ev.push({ kind: 'call', addr: ins.addr, callee: nm });
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
        ev.push({ kind: 'snd', addr: ins.addr, line: ins.line, name, vol, syscall: ins.syscall });
      }
    }
    ev.sort((a, b) => a.addr - b.addr);
    events.set(f.name, ev);
  }
  return events;
}
function walk(events, root, maxDepth = 4) {
  const out = [];
  const seen = new Map();
  const q = [{ name: root, depth: 0, path: [root] }];
  while (q.length) {
    const { name, depth, path } = q.shift();
    if (seen.has(name) && seen.get(name) <= depth) continue;
    seen.set(name, depth);
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'snd') out.push({ ...ev, func: name, depth, path: [...path] });
      else if (ev.kind === 'call' && depth < maxDepth && !seen.has(ev.callee)) q.push({ name: ev.callee, depth: depth + 1, path: [...path, ev.callee] });
    }
  }
  return out.sort((a, b) => a.depth - b.depth || a.addr - b.addr);
}
// 现行表：从 audio_bus.ts 里抠出 110 条（只取 MAGIC_SFX 那一段，否则 MAGIC_SFX_GRADE 的 '001':'A' 会把值覆盖掉）
const busSrc = fs.readFileSync(`${ROOT}/game/src/core/audio_bus.ts`, 'utf8');
const sfxBlock = /export const MAGIC_SFX\b[^=]*=\s*\{([\s\S]*?)\n\};/.exec(busSrc);
if (!sfxBlock) throw new Error('audio_bus.ts 里找不到 MAGIC_SFX');
const cur = new Map();
for (const m of sfxBlock[1].matchAll(/^\s*'(\d{3})':\s*'([^']+)'/gm)) cur.set(Number(m[1]), m[2]);
const evNear = build('near');
const evLast = build('last');
const reM = /^m\d{3}snd\d{2}$/i;
let diffNear = [], diffLast = [], noSnd = [];
for (const mg of arr) {
  const seq = mg.SEQUENCE;
  const nSites = walk(evNear, mg.fx_func, 4);
  const lSites = walk(evLast, mg.fx_func, 4);
  const nm = nSites.filter((s) => reM.test(s.name));
  const lm = lSites.filter((s) => reM.test(s.name));
  const cand = cur.get(seq);
  if (!cand) continue;
  const inNear = nm.some((s) => s.name === cand);
  const inLast = lm.some((s) => s.name === cand);
  if (!inNear) diffNear.push({ seq, cand, top: nm.slice(0, 4).map((s) => `${s.name}@${s.func}d${s.depth}`) });
  if (!inLast) diffLast.push({ seq, cand, top: lm.slice(0, 4).map((s) => `${s.name}@${s.func}d${s.depth}`) });
  if (!nm.length) noSnd.push(seq);
}
console.log('现行 110 条中：near-解析能解释的 =', 110 - diffNear.length, ' last-解析能解释的 =', 110 - diffLast.length);
console.log('\n== near 解析解释不了的（这些技的音效来自 THINGS 物件或通用音） ==');
for (const d of diffNear) console.log(` ${String(d.seq).padStart(3, '0')} cur=${d.cand.padEnd(12)} deep=[${d.top.join(', ')}]`);
console.log('\n== last 解析解释不了的 ==', diffLast.map((d) => d.seq).join(','));
console.log('\n== 调用图里完全没有 m 串的 ==', noSnd.join(','));
// 三条裁决
for (const seq of [43, 80, 102]) {
  const mg = arr.find((x) => x.SEQUENCE === seq);
  const nm = walk(evNear, mg.fx_func, 4).filter((s) => reM.test(s.name));
  console.log(`\n[${seq}] ${mg.NAME} fx_func=${mg.fx_func} dirs=${JSON.stringify(mg.fx_dir)} 现行=${cur.get(seq)}`);
  for (const s of nm) console.log(`   d${s.depth} ${s.path.join(' > ')} :: ${s.name} @0x${s.addr.toString(16)} dis:${s.line}`);
}
