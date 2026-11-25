// dump_range.mjs <file> <startLine> <endLine>  — print dis lines in [start,end] (1-based, inclusive)
import fs from 'node:fs';
const [file, a, b] = process.argv.slice(2);
const L = fs.readFileSync(file, 'utf8').split(/\r?\n/);
for (let i = +a; i <= Math.min(+b, L.length); i++) console.log(String(i).padStart(6) + '  ' + L[i - 1].replace(/\s+; /, ' ; '));
