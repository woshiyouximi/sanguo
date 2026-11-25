// resolve.mjs — proof-grade resolver: skill script -> called Create* fn -> ThingID (THINGS Sequence)
// -> THINGS object animation `$mNNNsndNN`.  Also collects m-sound PUSHS+SYSCALL sites in the call graph.
// usage: node work/sfx_evidence/resolve.mjs   (writes work/sfx_evidence/resolve.json, prints C rows)
import fs from 'node:fs';

const DIS = 'export/script/magic_so.dis.txt';
const L = fs.readFileSync(DIS, 'utf8').split(/\r?\n/);
const THINGS = JSON.parse(fs.readFileSync('work/sfx_evidence/things.json', 'utf8'));
const SCAN = JSON.parse(fs.readFileSync('work/sfx_evidence/scan.json', 'utf8'));

const instrRe = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;
const funcs = new Map();          // name -> {name,off,argc,line,instrs,edges}
const byName = new Map();
const order = [];

for (let i = 0; i < L.length; i++) {
  if (!/^; -{6,}/.test(L[i])) continue;
  const h = L[i + 1];
  if (!h || !h.includes('func #') || !/\sid=0x/.test(h)) continue;
  const m = h.match(/func #(\d+)\s+(\S+)\s+id=(0x[0-9A-Fa-f]+)\s+argc=(\d+)\s+@(0x[0-9A-Fa-f]+)/);
  if (!m) continue;
  const f = { idx: +m[1], name: m[2], id: m[3], argc: +m[4], off: parseInt(m[5], 16), line: i + 2, instrs: [], edges: [] };
  let j = i + 3;                                   // layout: banner / header / banner / instrs
  while (j < L.length && !/^; -{6,}/.test(L[j])) {
    const t = L[j].match(instrRe);
    if (t) f.instrs.push({ ln: j + 1, addr: parseInt(t[1], 16), op: t[3], arg: t[4], com: t[5] });
    j++;
  }
  funcs.set(f.name, f); order.push(f);
}

// call edges: CALLS / SYSCALL 0x310..0x314  -> pushed name (farthest PUSHS of the same statement)
const CF = /^(JMP|JZ|JNZ|CASE|RET|RETV|WAIT|WAITFOR)$/;
for (const f of order) {
  for (let k = 0; k < f.instrs.length; k++) {
    const ins = f.instrs[k];
    if (ins.op === 'CALL') {                       // direct address call: target is the operand
      const t = ins.arg.trim();
      if (funcs.has(t)) f.edges.push({ to: t, ln: ins.ln, addr: ins.addr, op: 'CALL' });
      continue;
    }
    const isCall = ins.op === 'CALLS' || (ins.op === 'SYSCALL' && /^0x31[0-4]/.test(ins.arg));
    if (!isCall) continue;
    let name = null;
    for (let b = k - 1; b >= 0 && b > k - 40; b--) {
      const p = f.instrs[b];
      if (p.op.startsWith('L') && /^L[0-9A-F]+:/.test(p.op)) break;
      if (CF.test(p.op)) break;
      if (p.op === 'PUSHS') {
        const s = (p.com.match(/"([^"]+)"/) || [])[1]; if (!s) continue;
        name = s;                                    // keep scanning: the earliest PUSHS wins
        if (funcs.has(s)) break;                     // and if it is a known function, take it now
      }
    }
    if (name && funcs.has(name)) f.edges.push({ to: name, ln: ins.ln, addr: ins.addr, op: ins.op });
  }
}

// m-sound sites: PUSHS "m*" + SYSCALL 0x300/0x301
for (const f of order) {
  for (let k = 0; k < f.instrs.length; k++) {
    const ins = f.instrs[k];
    if (ins.op !== 'SYSCALL' || !/^0x30[01]/.test(ins.arg)) continue;
    for (let b = k - 1; b >= 0 && b > k - 14; b--) {
      const p = f.instrs[b];
      if (p.op === 'PUSHS') {
        const s = (p.com.match(/"([^"]+)"/) || [])[1];
        if (s) f.snd = (f.snd || []).concat([{ snd: s, ln: ins.ln, addr: ins.addr, pushLn: p.ln }]);
        break;
      }
    }
  }
}

const thingsBySeq = THINGS;
const rowOut = [];
for (const r of SCAN.rows) {
  const start = r.fx;
  if (!funcs.has(start)) { rowOut.push({ ...r, error: 'no fx func' }); continue; }
  const hits = [];   // {seq, name, dir, sounds, depth, path, line}
  const snds = [];    // {snd, func, depth, path, line}
  const seen = new Set();
  const q = [{ name: start, depth: 0, path: [start] }];
  while (q.length) {
    const cur = q.shift();
    if (cur.depth > 5) continue;
    const key = cur.name + '@' + cur.depth;
    if (seen.has(key)) continue;
    seen.add(key);
    const f = funcs.get(cur.name);
    if (!f) continue;
    for (const ins of f.instrs) {
      if (ins.op === 'PUSHI') {
        const v = parseInt(ins.arg, 10);
        const t = thingsBySeq[v];
        if (t && v >= 10000 && /^\\magic/i.test(t.dir)) hits.push({ seq: v, name: t.name, dir: t.dir, sounds: t.sounds, cbs: t.cbs, depth: cur.depth, path: cur.path.join('>'), line: ins.ln });
      }
    }
    for (const s of f.snd || []) snds.push({ snd: s.snd, func: cur.name, depth: cur.depth, path: cur.path.join('>'), line: s.ln });
    for (const e of f.edges) q.push({ name: e.to, depth: cur.depth + 1, path: cur.path.concat(e.to) });
  }
  rowOut.push({ seq: r.seq, name: r.name, dir: r.dir, dirs: r.dirs, fx: r.fx, hits, snds, direct: r.direct, deep: r.deep, calls: r.calls });
}

fs.writeFileSync('work/sfx_evidence/resolve.json', JSON.stringify(rowOut, null, 0));

const C = [4, 9, 14, 15, 22, 28, 30, 39, 44, 45, 47, 48, 55, 64, 65, 69, 72, 74, 82, 87, 90, 91, 104, 105];
for (const n of C) {
  const r = rowOut.find(x => x.seq === n);
  console.log('=== ' + String(n).padStart(3, '0') + ' ' + r.name + ' (dir ' + r.dirs.join('/') + ') fx=' + r.fx);
  const uniq = new Map();
  for (const h of r.hits) {
    const k = h.seq + '@d' + h.depth;
    if (!uniq.has(k)) uniq.set(k, h);
  }
  for (const h of uniq.values()) {
    console.log('   thing ' + h.seq + ' ' + h.name + ' ' + h.dir + ' $' + h.sounds.join(',$') + (h.cbs.length ? ' !' + h.cbs.join(',!') : '') + '  d' + h.depth + ' ' + h.path + '  L' + h.line);
  }
  if (!uniq.size) console.log('   (no ThingID pushed in depth<=5 call graph)');
  const s2 = r.snds.filter(s => /^m\d/.test(s.snd));
  for (const s of s2.slice(0, 6)) console.log('   snd ' + s.snd + ' d' + s.depth + ' ' + s.path + ' L' + s.line);
}
console.log('\nfuncs', funcs.size, 'rows', rowOut.length);
