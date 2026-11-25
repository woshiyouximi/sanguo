import { readFileSync } from 'node:fs';

const bytes = readFileSync('F:/sanguo/game/data/system_so.bin');
const u32 = (o) => bytes.readUInt32LE(o);
const symOff = u32(0x18), symCnt = u32(0x1c), strOff = u32(0x20), strCnt = u32(0x24);
const cstr = (o) => {
  const e = bytes.indexOf(0, o);
  return bytes.subarray(o, e);
};
let decoder;
try {
  decoder = new TextDecoder('big5');
  console.log('big5 decoder: ok');
} catch (err) {
  console.log('big5 decoder: FAIL', err.message);
  decoder = new TextDecoder('latin1');
}
const dec = (b) => decoder.decode(b);
console.log('symCnt', symCnt, 'strCnt', strCnt);
for (let i = 0; i < symCnt; i++) {
  const base = symOff + i * 16;
  if (i < 3 || i === 22) {
    console.log(i, dec(cstr(u32(base + 8))), 'off=0x' + u32(base).toString(16), 'argc=' + u32(base + 4), 'num=0x' + u32(base + 12).toString(16));
  }
}
const strs = [];
for (let i = 0; i < strCnt; i++) strs.push(dec(cstr(u32(strOff + i * 4))));
console.log('strings:', JSON.stringify(strs.slice(0, 40)));
