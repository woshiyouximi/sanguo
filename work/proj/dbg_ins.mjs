import { readFileSync } from 'node:fs';
const L = readFileSync('F:/sanguo/export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
const I = /^([0-9A-F]{6})\s+([0-9A-F]{8,})\s+(\w+)\s*(.*?)\s*;\s*(.*)$/;
let n = 0;
for (const l of L) if (I.test(l)) n++;
console.log('ins matched', n, 'of', L.length);
console.log(JSON.stringify(I.exec('006E4C  0600000010000000 PUSHI     16                             ; ')));
console.log(JSON.stringify(I.exec('0069A0  0700000036000000 PUSHS     54                             ; "magic\\000\\*"')));
