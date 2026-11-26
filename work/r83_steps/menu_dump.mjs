// R83: dump the 33x6 second-level army command tables.
//  - strings: 0x48F94C .. 0x490294, 198 entries x 12 bytes (GBK, NUL padded)
//  - pointer table: 0x48EB60, 198 dwords (menu display descriptor pointers)
//  - exec table:    0x48EE78, 198 dwords (handler entry points)
import { readFileSync } from 'node:fs';

const EXE = 'C:/Users/liutian/Downloads/sgqyzzwb_146364/三国群英传2 修正版 1.05+/Sango2.exe';
const raw = readFileSync(EXE);
const pe = raw.readUInt32LE(0x3c);
const nsec = raw.readUInt16LE(pe + 6);
const optsz = raw.readUInt16LE(pe + 20);
const ib = raw.readUInt32LE(pe + 24 + 28);
const secs = [];
let so = pe + 24 + optsz;
for (let i = 0; i < nsec; i++) {
  const o = so + i * 40;
  secs.push({
    va: raw.readUInt32LE(o + 12),
    vsize: raw.readUInt32LE(o + 8),
    rsize: raw.readUInt32LE(o + 16),
    ptr: raw.readUInt32LE(o + 20),
  });
}
function va2off(va) {
  const rva = va - ib;
  for (const s of secs) if (s.va <= rva && rva < s.va + Math.max(s.vsize, s.rsize)) return s.ptr + (rva - s.va);
  return -1;
}
const dec = new TextDecoder('gbk');
const STR = 0x48f94c;
const PTR = 0x48eb60;
const EXE_T = 0x48ee78;
const N = 33 * 6;

const strings = [];
for (let k = 0; k < N; k++) {
  const off = va2off(STR + k * 12);
  const b = raw.subarray(off, off + 12);
  const end = b.indexOf(0);
  strings.push(dec.decode(b.subarray(0, end < 0 ? 12 : end)));
}
console.log('== 33 x 6 strings (0x48F94C) ==');
for (let g = 0; g < 33; g++) {
  const row = strings.slice(g * 6, g * 6 + 6).map((s, i) => `${i}:${s}`);
  console.log(`g${String(g).padStart(2, '0')}  ${row.join(' | ')}`);
}
const slot45 = [4, 5].map((slot) => {
  const set = new Set();
  for (let g = 0; g < 33; g++) set.add(strings[g * 6 + slot]);
  return [...set];
});
console.log('slot4 distinct =', JSON.stringify(slot45[0]));
console.log('slot5 distinct =', JSON.stringify(slot45[1]));

const ptrs = [];
const execs = [];
for (let k = 0; k < N; k++) {
  ptrs.push(raw.readUInt32LE(va2off(PTR + k * 4)));
  execs.push(raw.readUInt32LE(va2off(EXE_T + k * 4)));
}
const tally = (arr) => {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
console.log('== exec table 0x48EE78: distinct targets ==');
for (const [va, n] of tally(execs)) console.log(`  0x${va.toString(16).toUpperCase()}  x${n}`);
console.log('== pointer table 0x48EB60: distinct x%d ==', tally(ptrs).length);
for (const [va, n] of tally(ptrs).slice(0, 12)) console.log(`  0x${va.toString(16).toUpperCase()}  x${n}`);
console.log('== per-group exec rows ==');
for (let g = 0; g < 33; g++) {
  console.log(`g${String(g).padStart(2, '0')}  ` + execs.slice(g * 6, g * 6 + 6).map((v) => v.toString(16).toUpperCase()).join(' '));
}
