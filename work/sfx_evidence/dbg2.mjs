import fs from 'node:fs';
const L = fs.readFileSync('export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
// show raw lines around the banner/header of RushCart (header at some line)
const hi = L.findIndex(l => /func #\d+\s+RushCart\s+id=/.test(l));
for (let i = hi - 2; i <= hi + 3; i++) console.log(i + 1, JSON.stringify(L[i]));
console.log('--- Magic67 header');
const mi = L.findIndex(l => /func #\d+\s+Magic67\s+id=/.test(l));
for (let i = mi - 2; i <= mi + 6; i++) console.log(i + 1, JSON.stringify(L[i]));
