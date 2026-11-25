// q.mjs <regexSource> [file] — print matching dis lines with the enclosing function name
import fs from 'node:fs';
const src = process.argv[2];
const file = process.argv[3] || 'export/script/magic_so.dis.txt';
const re = new RegExp(src);
const L = fs.readFileSync(file, 'utf8').split(/\r?\n/);
let fn = '';
L.forEach((l, i) => {
  if (/func #\d+/.test(l)) fn = (l.match(/func #\d+\s+(\S+)/) || [])[1] || '';
  if (re.test(l)) console.log('L' + (i + 1) + '  [' + fn + ']  ' + l.replace(/\s+/g, ' ').slice(0, 120));
});
