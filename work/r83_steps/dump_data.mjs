// R83: dump raw bytes / parsed words from Sango2.exe by virtual address.
// usage: node dump_data.mjs 0x48E560 0x48E5C8 [i32|i16|i8|hex]
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
  const name = raw.subarray(o, o + 8).toString('latin1').replace(/\0.*$/, '');
  const vsize = raw.readUInt32LE(o + 8);
  const va = raw.readUInt32LE(o + 12);
  const rsize = raw.readUInt32LE(o + 16);
  const ptr = raw.readUInt32LE(o + 20);
  secs.push({ name, va, vsize, rsize, ptr });
}
function va2off(va) {
  const rva = va - ib;
  for (const s of secs) if (s.va <= rva && rva < s.va + Math.max(s.vsize, s.rsize)) return s.ptr + (rva - s.va);
  return -1;
}
const lo = parseInt(process.argv[2], 16);
const hi = parseInt(process.argv[3], 16);
const mode = process.argv[4] ?? 'hex';
const off = va2off(lo);
if (off < 0) {
  console.log('bad va');
  process.exit(1);
}
const buf = raw.subarray(off, va2off(hi) >= 0 ? va2off(hi) : off + (hi - lo));
if (mode === 'hex') {
  for (let i = 0; i < buf.length; i += 16) {
    const chunk = buf.subarray(i, i + 16);
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`${(lo + i).toString(16).toUpperCase().padStart(8, '0')}  ${hex}`);
  }
} else if (mode === 'i32') {
  for (let i = 0; i + 4 <= buf.length; i += 4) {
    console.log(`${(lo + i).toString(16).toUpperCase().padStart(8, '0')}  ${buf.readInt32LE(i)}`);
  }
} else if (mode === 'i16') {
  for (let i = 0; i + 2 <= buf.length; i += 2) {
    console.log(`${(lo + i).toString(16).toUpperCase().padStart(8, '0')}  ${buf.readInt16LE(i)}`);
  }
} else if (mode === 'i8') {
  for (let i = 0; i < buf.length; i++) console.log(`${(lo + i).toString(16).toUpperCase().padStart(8, '0')}  ${buf.readInt8(i)}`);
}
