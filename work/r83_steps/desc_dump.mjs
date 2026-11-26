// R83: dump the 12 command descriptors at 0x48E5C8 (stride 0x48: jitter, accum1[8], accum2[8]).
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
  const vsize = raw.readUInt32LE(o + 8);
  const va = raw.readUInt32LE(o + 12);
  const rsize = raw.readUInt32LE(o + 16);
  const ptr = raw.readUInt32LE(o + 20);
  secs.push({ va, vsize, rsize, ptr });
}
const ib0 = ib;
function va2off(va) {
  const rva = va - ib0;
  for (const s of secs) if (s.va <= rva && rva < s.va + Math.max(s.vsize, s.rsize)) return s.ptr + (rva - s.va);
  return -1;
}
const base = 0x48e5c8;
const count = 12;
const stride = 0x48;
for (let k = 0; k < count; k++) {
  const va = base + k * stride;
  const off = va2off(va);
  const a1 = [];
  const a2 = [];
  const jit = raw.readInt32LE(off);
  for (let i = 0; i < 8; i++) a1.push(raw.readInt32LE(off + 4 + i * 4));
  for (let i = 0; i < 8; i++) a2.push(raw.readInt32LE(off + 0x24 + i * 4));
  console.log(`0x${va.toString(16).toUpperCase()}  jitter=${jit}  a1=[${a1.join(',')}]  a2=[${a2.join(',')}]`);
}
